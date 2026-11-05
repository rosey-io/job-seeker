# JobSync network capture implementation

Upstream baseline: Gsync/jobsync `8c20325c35dbf203334a270cef5aef446f06a774` (MIT).
Destination: rosey-io/job-seeker. Upstream history and licence are retained.

## Verified source facts

- Next.js 15, React 19, Prisma 6, PostgreSQL; Node 20+ documented.
- Contact already represents a person, including current company, shared employment, notes and job links. Company and Job already exist.
- Task and Activity exist; neither originally links directly to a person or company-level opportunity.
- MCP uses hashed, expiring bearer tokens with scopes. Capture reuses the hash/generation infrastructure and token table, with a separate capture scope and extension-origin binding.
- Full backups already use versioned manifest.json + data.json inside a ZIP, ownership scoping, reference remapping and restore transactions.
- MCP job/question/resume writes exist. Employment, relationship and contact-capture writes were absent.

## Added map

- `src/lib/capture/schema.ts`: version 1 validation, canonical identities and conflict checks.
- `src/lib/capture/save.ts`: one ownership-checked transaction for person/job capture, employment, opportunity links, relationships, next actions and conversations. An account-level PostgreSQL advisory lock serializes capture writes; request IDs protect retries.
- `src/app/api/capture`: authenticated API, scoped token pairing/revocation and network CSV exports.
- `src/app/dashboard/network`: workspace, due actions, people/search, opportunity context, relationships, manual capture, JSON/CSV input and extension pairing.
- `extension/capture`: independent Manifest V3 implementation; user-triggered active-tab extraction only.
- `prisma/migrations/20261106000000_network_capture`: additive migration extending existing Contact/Task/Activity and adding missing concepts.
- `src/lib/backup`: additional models and nullable references participate in the existing export/restore pipeline.

No Twenty, JobGrab or LinkedIn automation code was copied. The extension adds no external dependencies. Existing dependency licences remain governed by upstream packages; retaining upstream does not change those obligations. Optional Gemini/MCP relationship tools have not been implemented and are not required by capture.

## Limits and remaining work

This is a reviewable implementation awaiting full runtime validation, not a claim that the complete brief is accepted. Live LinkedIn/SEEK extraction and a real Chrome pairing flow require a user browser. Visible employment history is explicitly not auto-parsed: structured employment paste works at the save layer, and selected-text capture retains the text as notes for manual review. Existing factual conflicts are rejected for review; employment/relationship conflicts currently need manual reconciliation. Role verification and opportunity stage editing need richer UI. CSV rows without profile URLs are skipped for manual review, so names alone cannot silently merge. A real Teal export is needed before adding a migration adapter. Unknown CSV columns remain in the preview, but are not imported into app fields. There is no multi-hop relationship graph visualizer yet.

The initial baseline suite could not complete while Prisma native engine downloads were blocked. A network draft now requests binaries.prisma.sh; saving a draft does not apply it. See JOBSYNC_NETWORK.md for commands and current validation results.
