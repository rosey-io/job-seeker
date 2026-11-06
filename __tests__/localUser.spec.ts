import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const mocks = vi.hoisted(() => {
  const tx = { $queryRaw: vi.fn(), user: { findMany: vi.fn(), create: vi.fn() }, jobSource: { createMany: vi.fn() }, contactRole: { createMany: vi.fn() }, jobStatus: { upsert: vi.fn(), findMany: vi.fn() }, jobStageType: { createMany: vi.fn() } };
  return { tx, transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx)) };
});
vi.mock("@/lib/db", () => ({ default: { $transaction: mocks.transaction } }));
import { getLocalUser } from "@/lib/local-user";
import { JOB_STATUSES, JOB_STAGES, CONTACT_ROLES } from "@/lib/constants";
beforeEach(() => { vi.stubEnv("JOBSYNC_LOCAL_USER_ID", ""); mocks.tx.user.findMany.mockResolvedValue([]); mocks.tx.user.create.mockResolvedValue({ id: "new-user", name: "My workspace", email: "local@jobsync.invalid" }); mocks.tx.jobStatus.findMany.mockResolvedValue(JOB_STATUSES.map(s => ({ id: s.value, value: s.value }))); });
afterEach(() => vi.unstubAllEnvs());
describe("local workspace selection", () => {
  it("reuses a sole existing account without replacing its data", async () => {
    mocks.tx.user.findMany.mockResolvedValue([{ id: "existing", name: "Elliott", email: "owner@example.test" }]);
    expect((await getLocalUser()).id).toBe("existing"); expect(mocks.tx.user.create).not.toHaveBeenCalled();
  });
  it("requires explicit selection when multiple accounts exist", async () => {
    mocks.tx.user.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    await expect(getLocalUser()).rejects.toThrow("JOBSYNC_LOCAL_USER_ID"); expect(mocks.tx.user.create).not.toHaveBeenCalled();
  });
  it("validates a configured user instead of silently creating another account", async () => {
    vi.stubEnv("JOBSYNC_LOCAL_USER_ID", "missing");
    await expect(getLocalUser()).rejects.toThrow("does not identify"); expect(mocks.tx.user.create).not.toHaveBeenCalled();
  });
  it("seeds a new workspace with contact roles and job stages and no known password", async () => {
    await getLocalUser();
    const password = mocks.tx.user.create.mock.calls[0][0].data.password;
    expect(password).toMatch(/^\$2[ab]\$/);
    expect(mocks.tx.contactRole.createMany.mock.calls[0][0].data).toHaveLength(CONTACT_ROLES.length);
    expect(mocks.tx.jobStageType.createMany.mock.calls[0][0].data).toHaveLength(JOB_STAGES.length);
    expect(mocks.tx.$queryRaw).toHaveBeenCalled();
  });
});
