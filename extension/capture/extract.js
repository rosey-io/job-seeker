/* Independent visible-DOM adapters. No cookies, background crawling or network extraction. */
export function extractVisible(mode = "auto") {
  const visible = el => {
    if (!el || el.closest('[hidden], [aria-hidden="true"]')) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  };
  const text = (selector, root = document) => [...root.querySelectorAll(selector)].find(visible)?.textContent?.trim() || "";
  const warnings = [];
  const source = { url: location.href, capturedAt: new Date().toISOString(), method: "selected-text", warnings };
  const selection = window.getSelection()?.toString().trim().slice(0, 100000) || "";
  const generic = () => ({ version: 1, source, record: { kind: "person", name: "", notes: selection, opportunityIds: [], employment: [] }, warnings });
  if (mode === "selection") { warnings.push("Selected text needs manual field review. Employment history was not parsed."); return generic(); }
  if (/(^|\.)linkedin\.com$/.test(location.hostname) && /^\/in\//.test(location.pathname)) {
    source.method = "linkedin-profile";
    const name = text("main h1");
    if (!name) { warnings.push("Profile heading unavailable. Select visible text and enter a name."); return generic(); }
    warnings.push("Employment history was not extracted. Capture the visible experience text separately or use structured paste; no full-history claim is made.");
    return { version: 1, source, record: { kind: "person", name, headline: text("main .text-body-medium.break-words"), location: text("main .text-body-small.inline.t-black--light.break-words"), company: text('main button[aria-label^="Current company:"] span[aria-hidden="true"]') || text("main .pv-text-details__right-panel-item-text"), profileUrl: `https://www.linkedin.com${location.pathname.match(/^\/in\/[^/]+/)[0]}`, opportunityIds: [], employment: [] }, warnings };
  }
  const linkedIn = /(^|\.)linkedin\.com$/.test(location.hostname) && location.pathname.startsWith("/jobs");
  const selectedId = new URL(location.href).searchParams.get("currentJobId") || location.pathname.match(/\/jobs\/view\/(\d+)/)?.[1];
  let structured;
  for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const raw = JSON.parse(el.textContent);
      const entries = Array.isArray(raw) ? raw : raw["@graph"] || [raw];
      const found = entries.find(e => e["@type"] === "JobPosting");
      if (found) { structured = found; break; }
    } catch { /* Ignore malformed metadata; fall back to a visible adapter. */ }
  }
  if (structured && (!linkedIn || (selectedId && String(structured.url || structured.identifier?.value || "").includes(selectedId)))) {
    source.method = "structured-job";
    // Strip markup without constructing elements that could load remote resources.
    const description = String(structured.description || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    return { version: 1, source, record: { kind: "job", title: structured.title || "", company: structured.hiringOrganization?.name || "", description, location: structured.jobLocation?.address?.addressLocality || "", url: linkedIn ? `https://www.linkedin.com/jobs/view/${selectedId}` : structured.url || location.href, sourceId: String(structured.identifier?.value || "") }, warnings };
  }
  if (linkedIn) {
    const pane = [...document.querySelectorAll('.jobs-search__job-details--container, .job-view-layout, .jobs-details')].find(visible);
    const headingLink = pane?.querySelector('h1 a[href*="/jobs/view/"], .job-details-jobs-unified-top-card__job-title a[href*="/jobs/view/"]');
    const paneId = headingLink?.getAttribute("href")?.match(/\/jobs\/view\/(\d+)/)?.[1];
    // Fail closed during split-pane navigation: a title without matching job ID
    // can belong to the role that was selected a moment ago.
    if (!selectedId || !pane || paneId !== selectedId) { warnings.push("Could not verify that the visible job panel matches the selected job. Wait for it to load or use selected text."); return generic(); }
    source.method = "linkedin-job";
    return { version: 1, source, record: { kind: "job", title: text("h1, .job-details-jobs-unified-top-card__job-title", pane), company: text(".job-details-jobs-unified-top-card__company-name", pane), description: text(".jobs-description__content, #job-details", pane), location: text(".job-details-jobs-unified-top-card__primary-description-container", pane), url: `https://www.linkedin.com/jobs/view/${selectedId}`, sourceId: selectedId }, warnings };
  }
  if (/(^|\.)seek\.com\.au$/.test(location.hostname) && /\/job\/\d+/.test(location.pathname)) {
    source.method = "seek-job";
    return { version: 1, source, record: { kind: "job", title: text('[data-automation="job-detail-title"]'), company: text('[data-automation="advertiser-name"]'), location: text('[data-automation="job-detail-location"]'), salary: text('[data-automation="job-detail-salary"]'), description: text('[data-automation="jobAdDetails"]'), url: location.origin + location.pathname, sourceId: location.pathname.match(/\/job\/(\d+)/)[1] }, warnings };
  }
  warnings.push("No supported adapter found. Select text on the page, capture again, and review the fields manually.");
  return generic();
}
