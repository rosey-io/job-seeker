import { extractVisible } from "./extract.js";
const $ = id => document.getElementById(id);
const status = text => { $("status").textContent = text; };
let settings = {};
let draft;
let busy = false;
const origin = `chrome-extension://${chrome.runtime.id}`;
const permissionPattern = base => { const u = new URL(base); return `${u.protocol}//${u.hostname}/*`; };
$("origin").textContent = `Pair this origin in JobSync → Network → Extension: ${origin}`;
await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
settings = await chrome.storage.local.get(["base", "token", "draft", "lastOpportunity"]);
$("base").value = settings.base || "http://localhost:3737";
$("token").value = settings.token || "";
function baseURL(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error("Use an HTTPS origin, or HTTP localhost for development");
  return url.origin;
}
async function api(path, body) {
  if (!settings.base || !settings.token) throw new Error("Pair the extension in Connection settings first");
  const res = await fetch(`${settings.base}${path}`, { method: body ? "POST" : "GET", credentials: "omit", headers: { Authorization: `Bearer ${settings.token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  const result = await res.json();
  if (!res.ok) {
    if (result.details?.conflicts) throw new Error(`${result.error}. Existing data was kept. Review in JobSync.\n${JSON.stringify(result.details.conflicts, null, 2)}`);
    throw new Error(result.error || `Server returned ${res.status}`);
  }
  return result;
}
$("connect").onclick = async () => {
  try {
    const base = baseURL($("base").value);
    if (!await chrome.permissions.request({ origins: [permissionPattern(base)] })) throw new Error("Origin access was not granted");
    if (!$("token").value.trim()) throw new Error("Enter a pairing token");
    // Remove a previously authorized API origin when switching servers.
    if (settings.base && settings.base !== base) await chrome.permissions.remove({ origins: [permissionPattern(settings.base)] });
    settings = { ...settings, base, token: $("token").value.trim() };
    await chrome.storage.local.set({ base, token: settings.token });
    await opportunities(); status("Connected. Capture a page to begin.");
  } catch (e) { status(e.message); }
};
$("forget").onclick = async () => { await chrome.storage.local.remove("token"); settings.token = ""; $("token").value = ""; status("Local token removed. Revoke it in JobSync to invalidate all copies."); };
async function opportunities() {
  const data = await api("/api/capture");
  $("opportunity").replaceChildren(new Option("None", ""));
  for (const o of data.opportunities) $("opportunity").add(new Option(`${o.company.label} · ${o.title}`, o.id));
  if (settings.lastOpportunity && data.opportunities.some(o => o.id === settings.lastOpportunity)) $("opportunity").value = settings.lastOpportunity;
}
function show() {
  if (!draft) return;
  const r = draft.record;
  $("kind").value = r.kind; $("name").value = r.name || r.title || ""; $("company").value = r.company || "";
  $("headline").value = r.headline || ""; $("location").value = r.location || ""; $("url").value = r.profileUrl || r.url || ""; $("notes").value = r.notes || r.description || "";
  $("warnings").replaceChildren(...draft.source.warnings.map(w => { const li = document.createElement("li"); li.textContent = w; return li; }));
}
async function capture(mode) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractVisible, args: [mode] });
    draft = { version: 1, requestId: crypto.randomUUID(), source: result.source, record: result.record };
    show(); await chrome.storage.local.set({ draft }); $("record").hidden = true;
    status("Review the visible fields, then Save. Nothing has been sent yet.");
  } catch (e) { status(`Cannot capture this tab: ${e.message}. Select text on a regular web page and try again.`); }
}
$("capture").onclick = () => capture("auto"); $("selection").onclick = () => capture("selection");
function editedRecord() {
  const get = id => $(id).value.trim();
  if (get("kind") === "person") return { kind: "person", name: get("name"), ...(get("url") ? { profileUrl: get("url") } : {}), headline: get("headline"), company: get("company"), location: get("location"), notes: get("notes"), opportunityIds: get("opportunity") ? [get("opportunity")] : [], role: get("role"), employment: draft?.record.kind === "person" ? draft.record.employment || [] : [] };
  return { kind: "job", title: get("name"), company: get("company"), url: get("url"), description: get("notes"), location: get("location"), ...(draft?.record.salary ? { salary: draft.record.salary } : {}) };
}
$("preview").addEventListener("input", async () => {
  if (!draft) return;
  const next = editedRecord();
  if (JSON.stringify(next) !== JSON.stringify(draft.record)) draft = { ...draft, requestId: crypto.randomUUID(), record: next };
  await chrome.storage.local.set({ draft });
});
$("preview").onsubmit = async e => {
  e.preventDefault(); if (busy) return;
  busy = true; $("save").disabled = true; $("record").hidden = true;
  try {
    if (!draft) throw new Error("Capture a visible page or selected text first");
    const record = editedRecord();
    if (JSON.stringify(record) !== JSON.stringify(draft.record)) draft = { ...draft, requestId: crypto.randomUUID(), record };
    await chrome.storage.local.set({ draft, lastOpportunity: $("opportunity").value });
    const result = await api("/api/capture", draft);
    if (!result.id || !result.recordUrl?.startsWith("/dashboard/")) throw new Error("Server did not confirm a saved record");
    status(result.state === "created" ? "Saved to JobSync" : "Updated in JobSync");
    $("record").href = settings.base + result.recordUrl; $("record").hidden = false;
    // Retain the exact request ID after success: repeated Save is also safe.
  } catch (e) { status(`Not saved: ${e.message}\nYour draft is retained. Retry after fixing the connection or reviewing the data.`); }
  finally { busy = false; $("save").disabled = false; }
};
if (settings.draft) { draft = settings.draft; show(); status("Restored your previous draft. Capture again to use the current page."); }
if (settings.base && settings.token) opportunities().catch(e => status(`Could not load opportunities: ${e.message}. Your draft is retained.`));
