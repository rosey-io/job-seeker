import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { CaptureSchema, CaptureError, canonicalProfileUrl, canonicalJobUrl, mergeFacts } from "./schema";

type Tx = Prisma.TransactionClient;
const slug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
async function company(tx: Tx, userId: string, label: string) {
  return tx.company.upsert({ where: { value_createdBy: { value: slug(label), createdBy: userId } }, create: { label, value: slug(label), createdBy: userId }, update: {} });
}
async function location(tx: Tx, userId: string, label?: string) {
  if (!label) return undefined;
  return (await tx.location.upsert({ where: { value_createdBy: { value: slug(label), createdBy: userId } }, create: { label, value: slug(label), createdBy: userId }, update: {} })).id;
}
async function owned(tx: Tx, userId: string, contactId?: string, opportunityId?: string) {
  if (contactId && !await tx.contact.findFirst({ where: { id: contactId, createdBy: userId } })) throw new CaptureError("Person not found", 404);
  if (opportunityId && !await tx.opportunity.findFirst({ where: { id: opportunityId, userId } })) throw new CaptureError("Opportunity not found", 404);
}
export async function saveCapture(userId: string, raw: unknown) {
  const input = CaptureSchema.parse(raw);
  const payloadHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  // Serialize writes per account: canonical deduplication and request retry are atomic,
  // including legacy contacts whose URLs were not canonicalized at creation.
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))::text`;
    const previous = await tx.captureEvent.findUnique({ where: { userId_requestId: { userId, requestId: input.requestId } } });
    if (previous) {
      if (previous.payloadHash !== payloadHash) throw new CaptureError("This request ID belongs to another capture", 409);
      return JSON.parse(previous.result);
    }
    const r = input.record;
    let id: string;
    let state = "created";
    if (r.kind === "person") {
      for (const opportunityId of r.opportunityIds) await owned(tx, userId, undefined, opportunityId);
      const canonical = r.profileUrl ? canonicalProfileUrl(r.profileUrl) : undefined;
      const candidates = canonical ? (await tx.contact.findMany({ where: { createdBy: userId, OR: [{ canonicalProfileUrl: canonical }, { linkedinUrl: { not: null } }] } })).filter(c => {
        if (c.canonicalProfileUrl === canonical) return true;
        try { return canonicalProfileUrl(c.linkedinUrl!) === canonical; } catch { return false; }
      }) : [];
      if (candidates.length > 1) throw new CaptureError("Multiple existing contacts match this URL; resolve them before capture", 409);
      const existing = candidates[0];
      const companyId = r.company ? (await company(tx, userId, r.company)).id : undefined;
      const locationId = await location(tx, userId, r.location);
      const facts = { name: r.name, title: r.headline, companyId, locationId, email: r.email };
      const data = existing ? mergeFacts(existing, facts, input.confirmFields) : facts;
      const person = existing ? await tx.contact.update({ where: { id: existing.id }, data: {
        ...data, canonicalProfileUrl: canonical, lastVerifiedAt: new Date(input.source.capturedAt),
        // Append new notes without replacing existing authored content.
        ...(r.notes && !existing.notes?.includes(r.notes) ? { notes: [existing.notes, r.notes].filter(Boolean).join("\n\n") } : {}),
      } }) : await tx.contact.create({ data: {
        ...data, name: r.name, createdBy: userId, linkedinUrl: canonical, canonicalProfileUrl: canonical,
        notes: r.notes, relationshipStrength: r.relationshipStrength, tags: JSON.stringify(r.tags ?? []), lastVerifiedAt: new Date(input.source.capturedAt),
      } });
      id = person.id; state = existing ? "updated" : "created";
      for (const opportunityId of r.opportunityIds) await tx.opportunityContact.upsert({ where: { opportunityId_contactId_role: { opportunityId, contactId: id, role: r.role } }, create: { opportunityId, contactId: id, role: r.role }, update: {} });
      for (const e of r.employment) {
        const employer = await company(tx, userId, e.company);
        const key = { contactId: id, companyId: employer.id, role: e.role };
        const old = await tx.contactEmployment.findUnique({ where: { contactId_companyId_role: key } });
        if (old && ((e.startDate && old.startDate && e.startDate !== old.startDate) || (e.endDate && old.endDate && e.endDate !== old.endDate) || (e.current !== undefined && e.current !== old.current))) throw new CaptureError("Employment conflicts with existing history; review in JobSync", 409);
        await tx.contactEmployment.upsert({ where: { contactId_companyId_role: key }, create: { ...key, startDate: e.startDate, endDate: e.endDate, current: e.current ?? false, source: input.source.url, capturedAt: new Date(input.source.capturedAt) }, update: { ...(e.startDate ? { startDate: e.startDate } : {}), ...(e.endDate ? { endDate: e.endDate } : {}) } });
      }
    } else if (r.kind === "job") {
      const url = canonicalJobUrl(r.url);
      const existing = (await tx.job.findMany({ where: { userId, jobUrl: { not: null } } })).find(j => { try { return canonicalJobUrl(j.jobUrl!) === url; } catch { return false; } });
      const employer = await company(tx, userId, r.company);
      const title = await tx.jobTitle.upsert({ where: { value_createdBy: { value: slug(r.title), createdBy: userId } }, create: { label: r.title, value: slug(r.title), createdBy: userId }, update: {} });
      const facts = { companyId: employer.id, description: r.description, salaryRange: r.salary, locationId: await location(tx, userId, r.location) };
      const updates = existing ? mergeFacts(existing, facts, input.confirmFields) : facts;
      if (existing && existing.jobTitleId !== title.id && !input.confirmFields.includes("title")) throw new CaptureError("Review changed job title", 409, { conflicts: { title: { current: existing.jobTitleId, incoming: r.title } } });
      const status = await tx.jobStatus.upsert({ where: { value: "saved" }, create: { value: "saved", label: "Saved" }, update: {} });
      const job = existing ? await tx.job.update({ where: { id: existing.id }, data: { ...updates, jobTitleId: title.id } }) : await tx.job.create({ data: { ...facts, userId, jobUrl: url, jobTitleId: title.id, companyId: employer.id, statusId: status.id, jobType: "Unknown", description: r.description, createdAt: new Date(), createdVia: "capture" } });
      id = job.id; state = existing ? "updated" : "created";
      if (!await tx.opportunity.findFirst({ where: { userId, jobId: id } })) await tx.opportunity.create({ data: { userId, companyId: employer.id, jobId: id, title: r.title, source: url } });
    } else if (r.kind === "opportunity") {
      id = (await tx.opportunity.create({ data: { userId, companyId: (await company(tx, userId, r.company)).id, title: r.title, priority: r.priority, fitNotes: r.fitNotes } })).id;
    } else if (r.kind === "relationship") {
      await owned(tx, userId, r.fromId); await owned(tx, userId, r.toId);
      if (r.fromId === r.toId) throw new CaptureError("Choose two different people");
      const key = { fromId: r.fromId, toId: r.toId, type: r.type };
      const existing = await tx.personRelationship.findUnique({ where: { fromId_toId_type: key } });
      if (existing && existing.status !== r.status) throw new CaptureError("A relationship already exists with another verification status", 409);
      id = (await tx.personRelationship.upsert({ where: { fromId_toId_type: key }, create: { ...key, status: r.status, evidence: r.evidence, notes: r.notes, verifiedAt: r.status === "confirmed" ? new Date() : null }, update: {} })).id;
      state = existing ? "updated" : "created";
    } else if (r.kind === "action") {
      await owned(tx, userId, r.contactId, r.opportunityId);
      if (r.id) {
        const result = await tx.task.updateMany({ where: { id: r.id, userId }, data: { title: r.title, status: r.status, dueDate: r.dueDate ? new Date(r.dueDate) : undefined } });
        if (!result.count) throw new CaptureError("Action not found", 404);
        id = r.id; state = "updated";
      } else id = (await tx.task.create({ data: { userId, title: r.title, contactId: r.contactId, opportunityId: r.opportunityId, dueDate: r.dueDate ? new Date(r.dueDate) : undefined, status: r.status } })).id;
    } else {
      await owned(tx, userId, r.contactId, r.opportunityId);
      const type = await tx.activityType.upsert({ where: { value_createdBy: { value: "networking", createdBy: userId } }, create: { label: "Networking", value: "networking", createdBy: userId }, update: {} });
      id = (await tx.activity.create({ data: { userId, activityName: r.title, startTime: new Date(r.date), activityTypeId: type.id, contactId: r.contactId, opportunityId: r.opportunityId, channel: r.channel, description: r.notes, outcome: r.outcome } })).id;
    }
    const result = { id, state, kind: r.kind, recordUrl: r.kind === "job" ? `/dashboard/myjobs/${id}` : `/dashboard/network#${r.kind}-${id}` };
    await tx.captureEvent.create({ data: { userId, requestId: input.requestId, payloadHash, sourceUrl: input.source.url, method: input.source.method, capturedAt: new Date(input.source.capturedAt), warnings: JSON.stringify(input.source.warnings), result: JSON.stringify(result) } });
    return result;
  }, { timeout: 20000 });
}
