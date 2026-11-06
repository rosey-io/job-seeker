import "server-only";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { CONTACT_ROLES, JOB_SOURCES, JOB_STAGES, JOB_STATUSES } from "@/lib/constants";

export async function getLocalUser() {
  // Serialized and atomic: simultaneous first-page requests cannot create
  // multiple accounts or leave a partially seeded local workspace.
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('jobsync-local-user'))::text`;
    const configured = process.env.JOBSYNC_LOCAL_USER_ID;
    const users = await tx.user.findMany({
      where: configured ? { id: configured } : {}, take: 2,
      select: { id: true, name: true, email: true },
    });
    if (users.length === 1) return users[0];
    if (configured) throw new Error("JOBSYNC_LOCAL_USER_ID does not identify an existing account.");
    if (users.length > 1) throw new Error("More than one account exists. Set JOBSYNC_LOCAL_USER_ID in .env to choose your workspace before enabling no-login mode.");
    const user = await tx.user.create({ data: {
      name: "My workspace", email: "local@jobsync.invalid",
      // No known password is introduced by local mode.
      password: await bcrypt.hash(randomBytes(32).toString("base64url"), 10),
    }, select: { id: true, name: true, email: true } });
    await tx.jobSource.createMany({ data: JOB_SOURCES.map(s => ({ ...s, createdBy: user.id })) });
    await tx.contactRole.createMany({ data: CONTACT_ROLES.map(s => ({ ...s, createdBy: user.id })) });
    for (const status of JOB_STATUSES) await tx.jobStatus.upsert({ where: { value: status.value }, update: {}, create: status });
    const statuses = await tx.jobStatus.findMany({ select: { id: true, value: true } });
    const statusIds = new Map(statuses.map(s => [s.value, s.id]));
    await tx.jobStageType.createMany({ data: JOB_STAGES.map(s => ({ label: s.label, value: s.value, sortOrder: s.sortOrder, statusId: statusIds.get(s.status)!, createdBy: user.id })) });
    return user;
  }, { timeout: 15000 });
}
