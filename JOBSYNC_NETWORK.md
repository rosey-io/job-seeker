# Run JobSync with network capture

This project extends JobSync rather than replacing it. Ordinary tracking, capture, imports and backups need no AI API key.

## Cloud development

Use the existing `/workspace/job-seeker` checkout; each cloud task is already isolated. Do not create a worktree unless the user requests one.

Requirements: Node 20+ (this machine has Node 24), npm, a working local Docker daemon, and PostgreSQL. HTTPS package downloads use the inherited proxy/CA and keep verification enabled. Allow `binaries.prisma.sh` in addition to the package-manager network preset.

```sh
cd /workspace/job-seeker
bash scripts/cloud-setup.sh
npm run dev
```

The setup script uses npm's frozen lockfile install, generates Prisma, preserves any existing `.env`, otherwise generates local secrets without printing them, starts a PostgreSQL 18/pgvector container named `job-seeker-db`, and deploys migrations. The database binds only to loopback. Its persistent data is in Docker volume `job-seeker-pgdata`; never remove that volume to troubleshoot startup. Development database credentials in the script are local fixtures, not production credentials. Do not expose this database publicly.

Open the app using your normal local/browser access, register with JobSync's existing sign-up flow, then select **Network**. Create a company opportunity before linking a captured person. Use the existing Settings backup/restore controls for the complete JSON backup ZIP; the new network import page also offers linked CSV exports.

Processes do not survive environment publication/restoration. Restart the database and app as described in saved startup instructions. Keep `.env` stable: changing ENCRYPTION_KEY prevents decrypting previously stored provider keys.

## Extension installation and pairing

1. In Chrome/Chromium, open Extensions, enable Developer mode, choose Load unpacked, and select `extension/capture`. This folder is directly installable; it has no build step. The separately supplied ZIP contains the same files for unpacking.
2. Open the extension popup and copy its `chrome-extension://...` origin.
3. In JobSync → Network → Extension, create a scoped token for that exact origin. Copy it directly into extension Connection settings. Do not paste it into chat, URLs, screenshots or logs. Hide the one-time display afterwards.
4. Set the JobSync base URL. Local development permits HTTP localhost/127.0.0.1; remote access requires HTTPS. Grant access to that server's host when Chrome prompts.
5. Visit a visible LinkedIn profile, click Capture visible page, review fields and the explicitly shown opportunity, then Save. Use Capture selected text when parsing fails. Capture a LinkedIn job only after its selected panel has loaded. The SEEK adapter is also present, with fixture coverage only.
6. Success appears only after the API confirms a saved record. Connection failures retain the draft and request ID. If facts conflict, existing data is kept; review the error and use the JobSync capture/import page to accept changed facts.

The token is hashed on the server, expires after 90 days, and is stored locally by the extension (never synced). Protect the browser profile. Pairing the same extension again rotates its token; Revoke all capture tokens in JobSync invalidates capture credentials. Updating an unpacked extension: reload it from the Extensions page, then reopen the popup. An extension ID may change if you relocate the folder; pair the new origin if needed.

The extension only inspects a user-selected active page or selected text. No background crawling, cookies, LinkedIn credentials, messaging or submissions. Its optional host permission is requested only for the configured JobSync API host; extraction uses activeTab. Browser host grants cover that host's ports, while API calls use only the saved exact base origin.

## Imports, deduplication and recovery

- `samples/person-capture.v1.json` documents the versioned input envelope; use a new UUID for each new capture, and retain the same envelope/UUID when retrying a failed request. Optional fields can be omitted. Employment dates may remain absent; current is optional.
- Canonical LinkedIn /in/ URLs identify people. Tracking parameters and trailing slashes are removed. Legacy contacts are checked too; multiple legacy matches fail for manual reconciliation. Names alone do not merge.
- LinkedIn jobs use currentJobId or the /jobs/view/ ID. Other job URLs have common tracking parameters removed. Re-capture fills blanks and requires explicit confirmation before replacing conflicting facts. User notes remain, and distinct new notes are appended.
- CSV import previews headings and lets you remap columns. Missing email is fine. Rows without a profile URL are reported as skipped for manual review; malformed/conflicting rows produce errors. Re-imported canonical profiles do not duplicate contacts. This is not a complete work-history or second-degree-connections import.
- `samples/network-backup-v2` contains a fictional linked manifest/data example; its packaged ZIP is for a separate test account only. It is schema-validated, but a real database restore round trip is still pending.
- Full backups use format version 2 (version 1 imports remain accepted, and older apps reject the new format rather than silently dropping relationships) and contain a versioned manifest and structured JSON, relationships, notes, actions and provenance. Existing backup facilities carry resume attachments where available and mark missing files. Passwords and tokens are excluded. Restore remaps references safely; historical capture request IDs are renewed so old responses cannot replay stale record IDs.
- Use full JSON backups for restore; network CSV ZIPs carry stable ID reference columns for external use. Store exports securely because they contain personal notes.
- Teal imports and optional Gemini/MCP integrations remain pending. Do not assume the Gemini Chrome companion supports custom MCP apps.

## Validation

Executed in this machine:

- Locked dependency installation: passed (862 packages).
- Lint: passed. Extension JavaScript and setup shell syntax checks passed.
- Capture fixture/merge/CSV/backup-reference checks plus updated backup ordering and clear-data checks: 32 passed.
- Capture authorization: 5 passed (anonymous, cross-site, missing scope, wrong extension origin and CORS).
- Affected capture and backup suites: 86 passed across 9 test files, including legacy-format acceptance and new-format rejection by version checks.
- PostgreSQL migration: upstream baseline + additive migration + linked sample rows passed in an isolated schema; transaction rolled back afterwards.

Blocked, not passed:

- Prisma native engine generation: download/checksum destination returns HTTP 403 under the active network policy. Verification was never disabled. `binaries.prisma.sh` is saved in the environment draft but must be applied through environment settings.
- Full typecheck, application startup, authenticated save flow and full database export/restore remain unvalidated until generation succeeds. The existing suite was interrupted after generation-related import failures; no full-suite pass is claimed.
- Live browser extraction and pairing were not performed.

After applying network settings, run:

```sh
bash scripts/cloud-setup.sh
npx tsc --noEmit
npm run lint
npm test -- --maxWorkers=2
BACKUP_TEST_DATABASE_URL=postgresql://jobsync:jobsync@127.0.0.1:5432/jobsync npx vitest run __tests__/captureRoundTrip.spec.ts __tests__/backupRoundTrip.spec.ts --maxWorkers=2
npm run dev
```

The opt-in database tests create isolated schemas; they do not wipe your app data. Their actual run is still outstanding. Required functional checks after startup: sign up/sign in, create opportunity, pair extension, save the same person twice, disconnect/retry, review changed facts, add a follow-up, export and restore the linked examples into a separate account. Fixture tests alone do not establish live LinkedIn compatibility.
