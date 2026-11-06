#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const mode = process.argv[2];
if (!["enable", "disable"].includes(mode)) throw new Error("Use enable or disable");
const file = path.resolve(__dirname, "..", ".env");
if (!fs.existsSync(file)) throw new Error("Run bash scripts/cloud-setup.sh first.");
const setting = `JOBSYNC_LOCAL_MODE=${mode === "enable" ? "true" : "false"}`;
const original = fs.readFileSync(file, "utf8");
const content = /^JOBSYNC_LOCAL_MODE=.*$/m.test(original)
  ? original.replace(/^JOBSYNC_LOCAL_MODE=.*$/gm, setting)
  : original.replace(/\n?$/, "\n") + setting + "\n";
fs.writeFileSync(file, content, { mode: 0o600 });
console.log(mode === "enable"
  ? "No-login mode enabled for local development. Restart with npm run dev. Your existing workspace is retained; an empty database gets a local workspace automatically."
  : "Login enabled. Restart with npm run dev. Your workspace and data are retained.");
