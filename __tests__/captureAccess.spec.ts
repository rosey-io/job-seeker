import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/mcp/auth", () => ({ resolveMcpToken: vi.fn() }));
vi.mock("@/lib/db", () => ({ default: { mcpAccessToken: { findFirst: vi.fn() } } }));
import { auth } from "@/auth";
import { resolveMcpToken } from "@/lib/mcp/auth";
import db from "@/lib/db";
import { captureAccess, corsHeaders, sameOrigin } from "@/lib/capture/access";
const origin = "chrome-extension://" + "a".repeat(32);
const req = (headers: Record<string, string> = {}) => new Request("http://localhost:3737/api/capture", { headers });
beforeEach(() => { vi.mocked(auth).mockResolvedValue(null as never); vi.mocked(db.mcpAccessToken.findFirst).mockResolvedValue(null); });
describe("capture authorization", () => {
  it("rejects an anonymous write", async () => expect(captureAccess(req())).rejects.toMatchObject({ status: 401 }));
  it("rejects a cross-site session request even when signed in", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "owner" } } as never);
    await expect(captureAccess(req({ origin: "https://other.example" }))).rejects.toMatchObject({ status: 403 });
  });
  it("requires capture scope, not an existing job-write token", async () => {
    vi.mocked(resolveMcpToken).mockResolvedValue({ ok: true, userId: "owner", tokenName: "Agent", scopes: ["jobs:write"] });
    await expect(captureAccess(req({ authorization: "Bearer test" }))).rejects.toMatchObject({ status: 403 });
  });
  it("binds the token to the paired extension origin", async () => {
    vi.mocked(resolveMcpToken).mockResolvedValue({ ok: true, userId: "owner", tokenName: "Capture", scopes: ["capture:write", `origin:${origin}`] });
    await expect(captureAccess(req({ authorization: "Bearer test", origin }))).resolves.toBe("owner");
    await expect(captureAccess(req({ authorization: "Bearer test", origin: "chrome-extension://" + "b".repeat(32) }))).rejects.toMatchObject({ status: 403 });
  });
  it("never grants wildcard or ordinary website CORS", async () => {
    expect(await corsHeaders(req({ origin: "https://evil.example" }))).toEqual({});
    expect(await corsHeaders(req({ origin }))).toEqual({});
    vi.mocked(db.mcpAccessToken.findFirst).mockResolvedValue({ id: "paired" } as never);
    expect(await corsHeaders(req({ origin }))).toMatchObject({ "Access-Control-Allow-Origin": origin });
  });
});

afterEach(() => vi.unstubAllEnvs());
describe("development browser origins", () => {
  it.each(["localhost", "127.0.0.1"])("accepts the actual %s browser origin when Next rewrites its internal URL", async host => {
    vi.stubEnv("NODE_ENV", "development");
    vi.mocked(auth).mockResolvedValue({ user: { id: "owner" } } as never);
    const internalHost = host === "localhost" ? "127.0.0.1" : "localhost";
    const request = new Request(`http://${internalHost}:3737/api/capture`, { headers: { host: `${host}:3737`, origin: `http://${host}:3737` } });
    expect(sameOrigin(request)).toBe(true);
    await expect(captureAccess(request)).resolves.toBe("owner");
  });
  it("rejects genuinely cross-origin local requests", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(sameOrigin(new Request("http://127.0.0.1:3737/api/capture", { headers: { host: "127.0.0.1:3737", origin: "http://localhost:3737" } }))).toBe(false);
    expect(sameOrigin(new Request("http://127.0.0.1:3737/api/capture", { headers: { host: "localhost:3738", origin: "http://localhost:3738" } }))).toBe(false);
    expect(sameOrigin(new Request("http://127.0.0.1:3737/api/capture", { headers: { host: "localhost:3737", origin: "https://localhost:3737" } }))).toBe(false);
  });
  it("requires a loopback Host and rejects cross-site browser requests", () => {
    vi.stubEnv("NODE_ENV", "development");
    const rejected: Record<string, string>[] = [
      { host: "evil.example:3737", origin: "http://evil.example:3737" },
      { origin: "http://localhost:3737" },
      { host: "localhost:3737", origin: "http://localhost:3737", "sec-fetch-site": "cross-site" },
      { host: "localhost:3737", origin: "null" },
    ];
    for (const headers of rejected) expect(sameOrigin(new Request("http://127.0.0.1:3737/api/capture", { headers }))).toBe(false);
  });
  it("does not relax the origin check in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sameOrigin(new Request("http://127.0.0.1:3737/api/capture", { headers: { host: "localhost:3737", origin: "http://localhost:3737" } }))).toBe(false);
  });
});
