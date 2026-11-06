import { isLoopbackRequest } from "@/lib/local-mode";
import { auth } from "@/auth";
import db from "@/lib/db";
import { resolveMcpToken } from "@/lib/mcp/auth";
import { CaptureError } from "./schema";

export const extensionOrigin = (value: string) => /^chrome-extension:\/\/[a-p]{32}$/.test(value);
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const url = new URL(req.url);
  if (origin === url.origin) return true;
  // Next's development Request URL can use localhost internally even when
  // the browser connected to 127.0.0.1 (and vice versa). The actual Host must
  // still match the browser Origin; this does not permit cross-origin tabs.
  if (process.env.NODE_ENV !== "development" || !isLoopbackRequest(req.headers)) return false;
  try {
    const browser = new URL(origin);
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      && browser.protocol === url.protocol && browser.port === url.port;
  } catch { return false; }
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
