#!/usr/bin/env bash
set -euo pipefail
task_repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$task_repo_root"
npm ci --no-audit --no-fund
npx prisma generate
# Secrets are generated locally, never committed, logged or copied to settings.
node <<'JS'
const fs = require('fs');
const { randomBytes } = require('crypto');
if (!fs.existsSync('.env')) fs.writeFileSync('.env', [
  'DATABASE_URL=postgresql://jobsync:jobsync@127.0.0.1:5432/jobsync',
  `AUTH_SECRET=${randomBytes(32).toString('hex')}`,
  `ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`,
  'NEXTAUTH_URL=http://localhost:3737', 'AUTH_TRUST_HOST=true', 'TZ=Australia/Melbourne',
].join('\n') + '\n', { mode: 0o600, flag: 'wx' });
JS
# This is a dedicated local development database, with no public port.
local_docker() {
  if [ -f /etc/codex/network-policy.json ]; then
    env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock "$@"
  else
    docker "$@"
  fi
}
if local_docker container inspect job-seeker-db >/dev/null 2>&1; then
  local_docker start job-seeker-db >/dev/null
else
  local_docker run -d --name job-seeker-db -e POSTGRES_USER=jobsync -e POSTGRES_PASSWORD=jobsync -e POSTGRES_DB=jobsync -p 127.0.0.1:5432:5432 -v job-seeker-pgdata:/var/lib/postgresql pgvector/pgvector:pg18@sha256:c29f30688a9ad961691bdf0ec1650717cc132a5814619d80f80463d6e4c42e47 >/dev/null
fi
for attempt in $(seq 1 30); do
  if local_docker exec job-seeker-db pg_isready -U jobsync -d jobsync >/dev/null 2>&1; then break; fi
  if [ "$attempt" -eq 30 ]; then echo 'Postgres did not become ready' >&2; exit 1; fi
  sleep 1
done
npx prisma migrate deploy
