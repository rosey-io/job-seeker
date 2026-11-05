import { z } from "zod";

const text = (n = 2000) => z.string().trim().max(n);
export function canonicalProfileUrl(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || !/^(www\.)?linkedin\.com$/i.test(url.hostname) || !/^\/in\/[^/]+\/?$/i.test(url.pathname) || url.username || url.password) {
    throw new Error("Use a LinkedIn /in/ profile URL");
  }
  return `https://www.linkedin.com${url.pathname.replace(/\/$/, "").toLowerCase()}`;
}
export function canonicalJobUrl(value: string): string {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Use an HTTP(S) source URL");
  if (/(^|\.)linkedin\.com$/i.test(url.hostname)) {
    const id = url.searchParams.get("currentJobId") ?? url.pathname.match(/\/jobs\/view\/(\d+)/)?.[1];
    if (id) return `https://www.linkedin.com/jobs/view/${id}`;
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|trk|trackingId|refId|ref$)/i.test(key)) url.searchParams.delete(key);
  url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString();
}
const httpUrl = text(2000).refine(v => { try { canonicalJobUrl(v); return true; } catch { return false; } }, "Use an HTTP(S) URL");
const profile = text(2000).refine(v => { try { canonicalProfileUrl(v); return true; } catch { return false; } }, "Use a LinkedIn /in/ URL");
const employment = z.object({ company: text(200).min(1), role: text(200).default(""), startDate: text(20).optional(), endDate: text(20).optional(), current: z.boolean().optional() }).strict();
const person = z.object({
  kind: z.literal("person"), name: text(120).min(1), profileUrl: profile.optional(), headline: text(300).optional(),
  company: text(200).optional(), location: text(200).optional(), email: z.email().optional(), notes: text(10000).optional(),
  relationshipStrength: z.enum(["unknown", "acquaintance", "colleague", "close"]).optional(), tags: z.array(text(80)).max(50).optional(),
  opportunityIds: z.array(text(100).min(1)).max(50).default([]), role: z.enum(["contact", "recruiter", "hiring-manager", "referrer"]).default("contact"),
  employment: z.array(employment).max(100).default([]),
}).strict();
const job = z.object({ kind: z.literal("job"), title: text(200).min(1), company: text(200).min(1), url: httpUrl, description: text(100000).default(""), location: text(200).optional(), salary: text(200).optional(), sourceId: text(200).optional() }).strict();
const opportunity = z.object({ kind: z.literal("opportunity"), title: text(200).min(1), company: text(200).min(1), priority: z.number().int().min(1).max(5).default(3), fitNotes: text(10000).optional() }).strict();
const relationship = z.object({ kind: z.literal("relationship"), fromId: text(100).min(1), toId: text(100).min(1), type: text(120).min(1), status: z.enum(["suggested", "confirmed"]), evidence: text(4000).optional(), notes: text(10000).optional() }).strict();
const action = z.object({ kind: z.literal("action"), title: text(300).min(1), contactId: text(100).optional(), opportunityId: text(100).optional(), dueDate: z.iso.datetime().optional(), status: z.enum(["in-progress", "completed", "awaiting-response"]).default("in-progress"), id: text(100).optional() }).strict();
const activity = z.object({ kind: z.literal("activity"), title: text(300).min(1), contactId: text(100).optional(), opportunityId: text(100).optional(), date: z.iso.datetime(), channel: text(100).default("conversation"), notes: text(10000).optional(), outcome: text(2000).optional() }).strict();
export const CaptureSchema = z.object({
  version: z.literal(1), requestId: z.uuid(), source: z.object({ url: httpUrl, method: z.enum(["linkedin-profile", "linkedin-job", "seek-job", "structured-job", "selected-text", "paste", "csv", "manual"]), capturedAt: z.iso.datetime(), warnings: z.array(text(500)).max(100).default([]) }).strict(),
  record: z.discriminatedUnion("kind", [person, job, opportunity, relationship, action, activity]),
  // Explicit acknowledgement of individual factual conflicts after a 409 preview.
  confirmFields: z.array(z.enum(["name", "title", "companyId", "locationId", "email", "description", "salaryRange"])).max(10).default([]),
}).strict();
export type CaptureInput = z.infer<typeof CaptureSchema>;
export class CaptureError extends Error {
  constructor(message: string, public status = 400, public details?: unknown) { super(message); }
}
export function mergeFacts(current: Record<string, unknown>, incoming: Record<string, unknown>, confirmed: string[]) {
  const updates: Record<string, string> = {};
  const conflicts: Record<string, { current: unknown; incoming: string }> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value !== "string" || !value.trim() || current[key] === value) continue;
    if (current[key] && !confirmed.includes(key)) conflicts[key] = { current: current[key], incoming: value };
    else updates[key] = value;
  }
  if (Object.keys(conflicts).length) throw new CaptureError("Review conflicting facts before updating", 409, { conflicts });
  return updates;
}
