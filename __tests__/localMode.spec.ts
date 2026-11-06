import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn(), headers: vi.fn() }));
vi.mock("next-auth", () => ({ default: () => ({ auth: mocks.session, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }) }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/local-user", () => ({ getLocalUser: mocks.user }));
vi.mock("@/lib/db", () => ({ default: {} }));
import { auth } from "@/auth";
import { authConfig } from "@/auth.config";
import { localModeEnabled, isLoopbackRequest } from "@/lib/local-mode";
const requestHeaders = (host = "localhost:3737", extra = {}) => new Headers({ host, ...extra });
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("JOBSYNC_LOCAL_MODE", "false");
  mocks.session.mockResolvedValue(null); mocks.headers.mockResolvedValue(requestHeaders());
  mocks.user.mockResolvedValue({ id: "existing-user", name: "Elliott", email: "owner@example.test" });
});
afterEach(() => vi.unstubAllEnvs());
describe("local mode policy", () => {
  it("is off by default and cannot bypass production authentication", () => {
    expect(localModeEnabled()).toBe(false);
    vi.stubEnv("JOBSYNC_LOCAL_MODE", "true"); expect(localModeEnabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "production"); expect(localModeEnabled()).toBe(false);
  });
  it("allows loopback hosts and matching local origins", () => {
    expect(isLoopbackRequest(requestHeaders())).toBe(true);
    expect(isLoopbackRequest(requestHeaders("127.0.0.1:3737", { origin: "http://127.0.0.1:3737" }))).toBe(true);
    expect(isLoopbackRequest(requestHeaders("[::1]:3737"))).toBe(true);
  });
  it("rejects LAN hosts, lookalikes, malformed hosts and cross-site requests", () => {
    for (const host of ["192.168.1.129:3737", "localhost.example.test", "localhost:3737/path", "evil@localhost:3737"]) expect(isLoopbackRequest(requestHeaders(host))).toBe(false);
    expect(isLoopbackRequest(requestHeaders("localhost:3737", { origin: "https://evil.example" }))).toBe(false);
    expect(isLoopbackRequest(requestHeaders("localhost:3737", { origin: "http://localhost:8080" }))).toBe(false);
    expect(isLoopbackRequest(requestHeaders("localhost:3737", { "sec-fetch-site": "cross-site" }))).toBe(false);
  });
});
describe("local server sessions", () => {
  it("preserves normal authentication when the option is off", async () => {
    await expect(auth()).resolves.toBeNull(); expect(mocks.user).not.toHaveBeenCalled();
  });
  it("opens the selected workspace without a session cookie", async () => {
    vi.stubEnv("JOBSYNC_LOCAL_MODE", "true");
    expect((await auth())?.user.id).toBe("existing-user"); expect(mocks.session).not.toHaveBeenCalled();
  });
  it("does not resolve a workspace for non-local or cross-site requests", async () => {
    vi.stubEnv("JOBSYNC_LOCAL_MODE", "true"); mocks.headers.mockResolvedValue(requestHeaders("192.168.1.129:3737"));
    await expect(auth()).resolves.toBeNull(); expect(mocks.user).not.toHaveBeenCalled();
  });
  it("does not let middleware open LAN access when local mode is enabled", () => {
    vi.stubEnv("JOBSYNC_LOCAL_MODE", "true");
    const run = (host: string) => authConfig.callbacks.authorized({ auth: null, request: { nextUrl: new URL("http://localhost:3737/dashboard"), headers: requestHeaders(host) } } as never);
    expect(run("localhost:3737")).toBe(true); expect(run("192.168.1.129:3737")).toBe(false);
  });
});
