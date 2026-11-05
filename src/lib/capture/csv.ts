import Papa from "papaparse";

export function previewConnectionsCSV(text: string, mapping?: Record<string, string>) {
  // LinkedIn exports may start with a Notes preamble before the real CSV header.
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const start = lines.findIndex(l => /first.?name/i.test(l) && /last.?name/i.test(l));
  const parsed = Papa.parse<Record<string, string>>((start >= 0 ? lines.slice(start) : lines).join("\n"), { header: true, skipEmptyLines: true });
  const fields = parsed.meta.fields ?? [];
  const auto = (pattern: RegExp) => fields.find(f => pattern.test(f)) ?? "";
  const columns = mapping ?? { firstName: auto(/^first.?name$/i), lastName: auto(/^last.?name$/i), profileUrl: auto(/^(url|profile.?url|linkedin.?url)$/i), email: auto(/^email/i), company: auto(/^company$/i), headline: auto(/^(position|headline|title)$/i) };
  return { fields, columns, errors: parsed.errors.map(e => ({ row: e.row, message: e.message })), rows: parsed.data.map((row, index) => {
    const get = (key: string) => row[columns[key]]?.trim() || undefined;
    return { row: index + 1, record: { kind: "person" as const, name: [get("firstName"), get("lastName")].filter(Boolean).join(" "), profileUrl: get("profileUrl"), email: get("email"), company: get("company"), headline: get("headline") }, original: row };
  }) };
}
