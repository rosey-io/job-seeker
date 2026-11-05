import { auth } from "@/auth";
import { NextResponse } from "next/server";
import JSZip from "jszip";
import Papa from "papaparse";
import { collectBackupData } from "@/lib/backup/export";

export async function GET() {
  const userId = (await auth())?.user?.id;
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const data = await collectBackupData(userId);
  const zip = new JSZip();
  for (const model of ["Contact", "Company", "Opportunity", "ContactEmployment", "PersonRelationship", "OpportunityContact", "Task", "Activity", "CaptureEvent"] as const) {
    zip.file(`${model}.csv`, Papa.unparse<Record<string, unknown>>(data[model] as Record<string, unknown>[], { escapeFormulae: true }));
  }
  zip.file("README.txt", "Network CSV exports v1. ID columns are stable references within this export. CSV is for inspection and external use; use Settings full JSON backup ZIP for restore. Passwords and API tokens are excluded.\n");
  return new NextResponse(new Uint8Array(await zip.generateAsync({ type: "nodebuffer" })), { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="jobsync-network-csv.zip"', "Cache-Control": "no-store" } });
}
