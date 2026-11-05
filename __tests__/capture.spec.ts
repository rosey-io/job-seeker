import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { CaptureSchema, canonicalProfileUrl, canonicalJobUrl, mergeFacts } from "@/lib/capture/schema";
import { previewConnectionsCSV } from "@/lib/capture/csv";
import { extractVisible } from "../extension/capture/extract.js";
import { BackupDataSchema } from "@/lib/backup/schema";
import { buildCreateData, IdMap } from "@/lib/backup/idmap";

const fixture = (name: string) => { document.body.innerHTML = readFileSync(`__tests__/fixtures/capture/${name}.html`, "utf8"); };
afterEach(() => vi.unstubAllGlobals());
describe("capture identities and review", () => {
  it("normalizes profile tracking, casing and trailing slashes", () => expect(canonicalProfileUrl("http://linkedin.com/in/Alex/?trk=abc#about")).toBe("https://www.linkedin.com/in/alex"));
  it("rejects lookalike domains and non-profile paths", () => {
    for (const url of ["https://linkedin.com.evil.test/in/alex", "https://linkedin.com/company/example", "https://user@linkedin.com/in/alex"]) expect(() => canonicalProfileUrl(url)).toThrow();
  });
  it("uses currentJobId for split-pane URLs", () => expect(canonicalJobUrl("https://www.linkedin.com/jobs/search/?currentJobId=987&trk=abc")).toBe("https://www.linkedin.com/jobs/view/987"));
  it("preserves populated data when incoming facts are blank", () => expect(mergeFacts({ title: "Good title", notes: "User notes" }, { title: "" }, [])).toEqual({}));
  it("requires explicit confirmation for a factual change", () => {
    expect(() => mergeFacts({ title: "Old" }, { title: "New" }, [])).toThrow("Review conflicting");
    expect(mergeFacts({ title: "Old" }, { title: "New" }, ["title"])).toEqual({ title: "New" });
  });
  it("rejects version drift and unknown input fields", () => {
    expect(CaptureSchema.safeParse({ version: 2 }).success).toBe(false);
    expect(CaptureSchema.safeParse({ version: 1, token: "not-a-schema-field" }).success).toBe(false);
  });
});
describe("visible adapter fixtures — not live site verification", () => {
  it("extracts a profile and labels missing history", () => {
    fixture("linkedin-profile"); vi.stubGlobal("location", new URL("https://www.linkedin.com/in/alex/?trk=abc"));
    const result = extractVisible();
    expect(result.record).toMatchObject({ name: "Alex Example", headline: "Engineering leader", company: "Example Labs", employment: [] });
    expect(result.source.warnings.join()).toContain("not extracted");
    expect(JSON.stringify(result)).not.toContain("send your token");
  });
  it("accepts only the panel matching the selected job", () => {
    fixture("linkedin-job"); vi.stubGlobal("location", new URL("https://www.linkedin.com/jobs/search/?currentJobId=12345"));
    expect(extractVisible().record).toMatchObject({ kind: "job", title: "Platform Engineer", url: "https://www.linkedin.com/jobs/view/12345" });
    vi.stubGlobal("location", new URL("https://www.linkedin.com/jobs/search/?currentJobId=99999"));
    expect(extractVisible().record.kind).toBe("person");
    expect(extractVisible().warnings.join()).toContain("matches the selected job");
  });
  it("extracts a SEEK fixture without network requests", () => {
    fixture("seek-job"); vi.stubGlobal("location", new URL("https://www.seek.com.au/job/12345?tracking=abc"));
    expect(extractVisible().record).toMatchObject({ kind: "job", title: "Platform Engineer", salary: "$140k–$170k" });
  });
  it("never falls back to collecting unrelated whole-page text", () => {
    document.body.innerHTML = "Unrelated private content"; vi.stubGlobal("location", new URL("https://example.test"));
    expect(extractVisible("selection").record).toMatchObject({ notes: "" });
  });
});
describe("connections import", () => {
  it("handles preambles, missing email and explicit remapping", () => {
    const csv = 'Notes:\nExported connections only\nFirst Name,Last Name,URL,Company,Position\nAlex,Example,https://linkedin.com/in/alex,Example Labs,Engineer';
    const preview = previewConnectionsCSV(csv);
    expect(preview.errors).toEqual([]);
    expect(preview.rows[0].record).toMatchObject({ name: "Alex Example", email: undefined, company: "Example Labs" });
    const changed = previewConnectionsCSV('Given,Surname,Profile\nAlex,Example,https://linkedin.com/in/alex', { firstName: "Given", lastName: "Surname", profileUrl: "Profile" });
    expect(changed.rows[0].record.name).toBe("Alex Example");
  });
});
describe("backup relationship integrity", () => {
  it("validates the supplied linked backup fixture", () => {
    const data = BackupDataSchema.parse(JSON.parse(readFileSync("samples/network-backup-v2/data.json", "utf8")));
    expect(data.PersonRelationship[0].fromId).toBe(data.Contact[0].id);
    expect(data.OpportunityContact[0].opportunityId).toBe(data.Opportunity[0].id);
    expect(data.Task[0].contactId).toBe(data.Contact[0].id);
  });
  it("rewrites every new linked ID and preserves notes", () => {
    const map = new IdMap();
    for (const id of ["person-a", "person-b", "opportunity", "company", "relationship", "link", "task", "event"]) map.set(id, `restored-${id}`);
    const relation = buildCreateData("PersonRelationship", { id: "relationship", fromId: "person-a", toId: "person-b", notes: "Alex confirmed knowing Casey" }, map, "target-user");
    expect(relation).toMatchObject({ fromId: "restored-person-a", toId: "restored-person-b", notes: "Alex confirmed knowing Casey" });
    const link = buildCreateData("OpportunityContact", { id: "link", contactId: "person-b", opportunityId: "opportunity" }, map, "target-user");
    expect(link).toMatchObject({ contactId: "restored-person-b", opportunityId: "restored-opportunity" });
    const task = buildCreateData("Task", { id: "task", contactId: "person-a", opportunityId: "opportunity" }, map, "target-user");
    expect(task).toMatchObject({ userId: "target-user", contactId: "restored-person-a", opportunityId: "restored-opportunity" });
    const event = buildCreateData("CaptureEvent", { id: "event", result: JSON.stringify({ id: "person-a", kind: "person" }) }, map, "target-user");
    expect(JSON.parse(String(event.result)).id).toBe("restored-person-a");
  });
  it("continues accepting backups made before network models existed", () => {
    const data = BackupDataSchema.parse({});
    expect(data.PersonRelationship).toEqual([]); expect(data.Opportunity).toEqual([]);
  });
});
