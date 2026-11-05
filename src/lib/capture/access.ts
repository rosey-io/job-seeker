import { auth } from "@/auth";
import db from "@/lib/db";
import { resolveMcpToken } from "@/lib/mcp/auth";
import { CaptureError } from "./schema";

export const extensionOrigin = (value: string) => /^chrome-extension:\/\/[a-p]{32}$/.test(value);
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}
export async function captureAccess(req: Request) {
  if (req.headers.has("authorization")) {
    const result = await resolveMcpToken(req);
    if (!result.ok) throw new CaptureError(result.error, result.status);
    if (!result.scopes.includes("capture:write")) throw new CaptureError("Capture permission required", 403);
    const origin = req.headers.get("origin");
    if (origin && (!extensionOrigin(origin) || !result.scopes.includes(`origin:${origin}`))) throw new CaptureError("Extension is not paired with this token", 403);
    return result.userId;
  }
  if (!sameOrigin(req)) throw new CaptureError("Cross-origin session writes are not allowed", 403);
  const session = await auth();
  if (!session?.user?.id) throw new CaptureError("Sign in to JobSync", 401);
  return session.user.id;
}
export async function corsHeaders(req: Request): Promise<Record<string, string>> {
  const origin = req.headers.get("origin");
  if (!origin || !extensionOrigin(origin)) return {};
  const paired = await db.mcpAccessToken.findFirst({ where: { scopes: { contains: `origin:${origin}` }, expiresAt: { gt: new Date() } } });
  return paired ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Vary": "Origin" } : {};
}
