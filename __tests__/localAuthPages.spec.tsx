import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), redirect: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/auth/AuthCard", () => ({ default: () => <form><label>Password<input type="password" /></label></form> }));
import Signin from "@/app/(auth)/signin/page";
import Signup from "@/app/(auth)/signup/page";
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("JOBSYNC_LOCAL_MODE", "true");
  mocks.auth.mockResolvedValue(null); mocks.redirect.mockImplementation(() => { throw new Error("redirected"); });
});
afterEach(() => vi.unstubAllEnvs());
describe("local auth page entry points", () => {
  it.each([Signin, Signup])("never renders a password form in local mode", async Page => {
    render(await Page());
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open workspace" })).toHaveAttribute("href", "/dashboard");
  });
  it.each([Signin, Signup])("redirects an available local workspace immediately", async Page => {
    mocks.auth.mockResolvedValue({ user: { id: "local" } });
    await expect(Page()).rejects.toThrow("redirected");
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });
  it.each([Signin, Signup])("keeps normal login available when local mode is off", async Page => {
    vi.stubEnv("JOBSYNC_LOCAL_MODE", "false");
    render(await Page());
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });
});
