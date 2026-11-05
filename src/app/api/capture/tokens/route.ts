import { NextResponse } from "next/server";
import { auth } from "@/auth";
import db from "@/lib/db";
import { generateToken } from "@/lib/mcp/tokens";
import { extensionOrigin, sameOrigin } from "@/lib/capture/access";

async function user(req: Request) {
  if (!sameOrigin(req)) return null;
  return (await auth())?.user?.id;
}
export async function POST(req: Request) {
  const userId = await user(req);
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  let origin: string;
  try { origin = (await req.json()).extensionOrigin; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!extensionOrigin(origin)) return NextResponse.json({ error: "Enter the chrome-extension:// origin shown by the extension" }, { status: 400 });
  const token = generateToken();
  const name = `Capture ${origin.slice(-32)}`;
  await db.mcpAccessToken.upsert({ where: { userId_name: { userId, name } }, create: { userId, name, tokenHash: token.hash, tokenPrefix: token.prefix, scopes: JSON.stringify(["capture:write", `origin:${origin}`]), expiresAt: new Date(Date.now() + 90 * 86400000) }, update: { tokenHash: token.hash, tokenPrefix: token.prefix, scopes: JSON.stringify(["capture:write", `origin:${origin}`]), expiresAt: new Date(Date.now() + 90 * 86400000) } });
  return NextResponse.json({ token: token.plaintext, expiresInDays: 90 }, { headers: { "Cache-Control": "no-store" } });
}
export async function DELETE(req: Request) {
  const userId = await user(req);
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  await db.mcpAccessToken.deleteMany({ where: { userId, name: { startsWith: "Capture " } } });
  return NextResponse.json({ revoked: true });
}
