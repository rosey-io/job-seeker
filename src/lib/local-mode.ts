// Edge-compatible policy shared by middleware and server-side authentication.
export function localModeEnabled() {
  return process.env.NODE_ENV === "development" && process.env.JOBSYNC_LOCAL_MODE === "true";
}
export function isLoopbackRequest(headers: Pick<Headers, "get">) {
  const host = headers.get("host");
  if (!host || headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    const url = new URL(`http://${host}`);
    if (url.host !== host.toLowerCase() || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return false;
    const origin = headers.get("origin");
    if (origin) {
      const source = new URL(origin);
      if (!["http:", "https:"].includes(source.protocol) || source.host !== url.host) return false;
    }
    return true;
  } catch { return false; }
}
