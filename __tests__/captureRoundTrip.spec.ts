// @vitest-environment node
// Opt-in integration check: use an isolated schema in BACKUP_TEST_DATABASE_URL.
import { randomUUID } from "crypto";
import { dropTestSchema, seedAccount } from "./helpers/backupTestDb";
import { saveCapture } from "@/lib/capture/save";
import { buildBackupZip } from "@/lib/backup/export";
import { importBackup } from "@/lib/backup/import";
const ctx = await vi.hoisted(async () => {
  const h = await import("./helpers/backupTestDb");
  const db = h.makeTestDb(); if (db) h.pushSchema(db.url); return db;
});
vi.mock("@/lib/db", async () => {
  if (!ctx) return { default: {} };
  const { PrismaClient } = await import("@prisma/client");
  return { default: new PrismaClient({ datasources: { db: { url: ctx.url } } }) };
});
vi.mock("@/lib/scheduler", () => ({ syncSchedulerState: vi.fn() }));
import db from "@/lib/db";
const source = { url: "https://www.linkedin.com/in/alex", method: "paste", capturedAt: "2026-11-06T00:00:00.000Z", warnings: ["Fixture data only"] };
const envelope = (record: unknown, requestId = randomUUID()) => ({ version: 1, requestId, source, record });
afterAll(async () => { if (ctx) { await dropTestSchema(db, ctx.schema); await db.$disconnect(); } });
describe.skipIf(!ctx)("capture with real PostgreSQL and full backup restore", () => {
  it("deduplicates retries, protects notes and ownership, and restores linked records", async () => {
    const owner = await seedAccount(db, `capture-${randomUUID()}@example.test`);
    const target = await seedAccount(db, `restore-${randomUUID()}@example.test`);
    const opportunity = await saveCapture(owner, envelope({ kind: "opportunity", company: "Example Labs", title: "Platform leadership", priority: 5 }));
    const input = envelope({ kind: "person", name: "Alex Example", profileUrl: "https://linkedin.com/in/Alex/?trk=x", notes: "Known former colleague", opportunityIds: [opportunity.id], employment: [{ company: "Example Labs", role: "Engineer", current: false }] });
    const first = await saveCapture(owner, input);
    expect(await saveCapture(owner, input)).toEqual(first);
    const second = await saveCapture(owner, envelope({ kind: "person", name: "Alex Example", profileUrl: "https://www.linkedin.com/in/alex", headline: "", opportunityIds: [opportunity.id] }));
    expect(second.id).toBe(first.id);
    expect(await db.contact.count({ where: { createdBy: owner } })).toBe(1);
    expect((await db.contact.findUniqueOrThrow({ where: { id: first.id } })).notes).toBe("Known former colleague");
    await expect(saveCapture(target, envelope({ kind: "person", name: "Intruder", opportunityIds: [opportunity.id] }))).rejects.toMatchObject({ status: 404 });
    const casey = await saveCapture(owner, envelope({ kind: "person", name: "Casey Example", profileUrl: "https://linkedin.com/in/casey", opportunityIds: [opportunity.id], role: "hiring-manager" }));
    await saveCapture(owner, envelope({ kind: "relationship", fromId: first.id, toId: casey.id, type: "knows", status: "confirmed", evidence: "Alex confirmed", notes: "Introduction requested" }));
    await saveCapture(owner, envelope({ kind: "action", title: "Ask Alex for introduction", contactId: first.id, opportunityId: opportunity.id, dueDate: "2026-11-07T00:00:00.000Z" }));
    const exported = await buildBackupZip(owner, "source@example.test");
    await importBackup(exported.buffer, target, "target@example.test", false);
    const restored = await db.personRelationship.findFirstOrThrow({ where: { from: { createdBy: target } }, include: { from: true, to: true } });
    expect(restored.from.notes).toBe("Known former colleague");
    expect(restored.to.name).toBe("Casey Example");
    expect(restored.notes).toBe("Introduction requested");
    const task = await db.task.findFirstOrThrow({ where: { userId: target }, include: { contact: true, opportunity: true } });
    expect(task.contact?.name).toBe("Alex Example"); expect(task.opportunity?.title).toBe("Platform leadership");
  }, 120000);
});
