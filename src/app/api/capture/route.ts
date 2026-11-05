import { NextResponse } from "next/server";
import { ZodError } from "zod";
import db from "@/lib/db";
import { captureAccess, corsHeaders } from "@/lib/capture/access";
import { CaptureError } from "@/lib/capture/schema";
import { saveCapture } from "@/lib/capture/save";

export const runtime = "nodejs";
export async function OPTIONS(req: Request) {
  const headers = await corsHeaders(req);
  return new Response(null, { status: "Access-Control-Allow-Origin" in headers ? 204 : 403, headers });
}
async function handle(req: Request, write: boolean) {
  const headers = { ...await corsHeaders(req), "Cache-Control": "no-store" };
  try {
    const userId = await captureAccess(req);
    if (write) {
      const text = await req.text();
      if (text.length > 250000) throw new CaptureError("Capture is too large", 413);
      let body: unknown;
      try { body = JSON.parse(text); } catch { throw new CaptureError("Invalid JSON"); }
      return NextResponse.json(await saveCapture(userId, body), { headers });
    }
    const [people, opportunities, relationships, tasks, activities] = await Promise.all([
      db.contact.findMany({ where: { createdBy: userId }, include: { Company: true, Location: true, employment: { include: { company: true } }, opportunityLinks: true }, orderBy: { name: "asc" } }),
      db.opportunity.findMany({ where: { userId }, include: { company: true, people: { include: { contact: true } } }, orderBy: { priority: "desc" } }),
      db.personRelationship.findMany({ where: { from: { createdBy: userId }, to: { createdBy: userId } }, include: { from: true, to: true } }),
      db.task.findMany({ where: { userId, status: { not: "completed" } }, include: { contact: true, opportunity: true }, orderBy: { dueDate: "asc" } }),
      db.activity.findMany({ where: { userId, OR: [{ contactId: { not: null } }, { opportunityId: { not: null } }] }, orderBy: { startTime: "desc" }, take: 100 }),
    ]);
    return NextResponse.json({ people, opportunities, relationships, tasks, activities }, { headers });
  } catch (e) {
    if (e instanceof CaptureError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status, headers });
    if (e instanceof ZodError) return NextResponse.json({ error: "Capture validation failed", issues: e.issues }, { status: 400, headers });
    return NextResponse.json({ error: "Capture could not be saved. Your draft is safe; retry when the server is available." }, { status: 500, headers });
  }
}
export const POST = (req: Request) => handle(req, true);
export const GET = (req: Request) => handle(req, false);
