#!/usr/bin/env node
// Fetch a topic's agenda feeds and write the candidate list.
//
// Usage: node agent/tools/fetch_feeds.mjs <topic-id> [--host https://personalpaper.org] [--out out/candidates.json]
//        [--date YYYY-MM-DD] [--definition file.json]
// --date is the edition date the date tokens use (default today, UTC); --definition reads a local
// definition in place of the registry's, for testing.
//
// Dated feeds (v2.1.3): a feed URL may carry tokens from the edition date: {yyyy}, {yyyy-N} (N years
// earlier), {mm}, {dd}. Such a feed is read whole; its window does not apply, since the URL chose the
// date. A feed marked "page": true is an HTML page: its items are the headings that link to articles
// on the page's own host, following its next-page link (rel="next", a "next" class, or /page/N/) up to three pages. Page items carry no date or
// description, and collapse with other items by link only (their titles can repeat). A dated feed
// that answers 404 has nothing for that date and counts as empty.
//
// Reads the topic definition from the hosted environment's registry, fetches every feed in
// agenda_sources, keeps items published within each source's window_hours, collapses exact
// duplicates (same link, or same title) across feeds, and writes:
//   out/candidates.json   items grouped by feed; duplicates carry duplicate_of; counts and failures
//   out/collapsed.json    the duplicates, ready to go into the candidate record as stage "collapsed"
// Deterministic: no model, no judgment. Exit code 0 even when some feeds fail.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

// Cloud sandboxes route egress through a proxy that Node's fetch ignores unless told. If a proxy is
// configured and Node has not been pointed at it, re-run this script with the proxy and the CA bundle set.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const ca = process.env.NODE_EXTRA_CA_CERTS || process.env.SSL_CERT_FILE || process.env.CURL_CA_BUNDLE ||
    ["/root/.ccr/ca-bundle.crt", "/etc/ssl/certs/ca-certificates.crt", "/etc/ssl/cert.pem", "/etc/pki/tls/certs/ca-bundle.crt"].find((f) => existsSync(f));
  const env = { ...process.env, NODE_USE_ENV_PROXY: "1", ...(ca ? { NODE_EXTRA_CA_CERTS: ca } : {}) };
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env });
  process.exit(r.status ?? 1);
}

import { dirname } from "node:path";

const args = process.argv.slice(2);
const topicId = args.find((a) => !a.startsWith("--"));
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const host = (process.env.PP_HOST || opt("--host", "https://personalpaper.org")).replace(/\/$/, "");
const out = opt("--out", "out/candidates.json");
const editionDate = opt("--date", new Date().toISOString().slice(0, 10));
const localDefinition = opt("--definition", "");
if (!topicId) { console.error("usage: fetch_feeds.mjs <topic-id> [--host H] [--out F]"); process.exit(2); }

const UA = "PersonalPaper/2.1 (+https://personalpaper.org)";

function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ").trim();
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
}
function parseItems(xml) {
  const items = [];
  // RSS 2.0 <item>; Atom <entry> as a fallback.
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    let link = tag(b, "link");
    if (!link) { const m = b.match(/<link[^>]*href="([^"]+)"/i); link = m ? m[1] : ""; }
    const pub = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date");
    const title = tag(b, "title");
    const description = tag(b, "description") || tag(b, "summary") || tag(b, "content");
    const categories = (b.match(/<category[^>]*>([\s\S]*?)<\/category>/gi) || []).map((c) => decode(c)).filter(Boolean);
    const creator = tag(b, "dc:creator") || tag(b, "author");
    items.push({ title, link, published: pub ? new Date(pub).toISOString() : null, description, categories, creator });
  }
  return items;
}

async function fetchFeed(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8" }, signal: ctrl.signal });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const xml = await res.text();
    return { items: parseItems(xml) };
  } catch (e) {
    return { error: String(e?.cause?.code || e?.name || e?.message || e) };
  } finally { clearTimeout(t); }
}

// Fill a feed URL's date tokens from the edition date. Returns the URL and whether it carried any.
function fillDate(url) {
  const [y, m, d] = editionDate.split("-");
  let dated = false;
  const filled = url.replace(/\{(yyyy(?:-(\d+))?|mm|dd)\}/g, (_, k, n) => {
    dated = true;
    return k === "mm" ? m : k === "dd" ? d : String(Number(y) - Number(n || 0));
  });
  return { url: filled, dated };
}

// An HTML index page read as a feed: the headings that link to articles on the same host.
const PAGE_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
async function fetchPage(url) {
  const items = [], seen = new Set();
  let next = url;
  for (let page = 0; next && page < 3; page++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    let html;
    try {
      const res = await fetch(next, { headers: { "user-agent": PAGE_UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", "accept-language": "en-US,en;q=0.9" }, redirect: "follow", signal: ctrl.signal });
      if (!res.ok) { if (page === 0) return { error: `HTTP ${res.status}` }; break; }
      html = await res.text();
    } catch (e) {
      if (page === 0) return { error: String(e?.cause?.code || e?.name || e?.message || e) };
      break;
    } finally { clearTimeout(t); }
    const origin = new URL(next).origin;
    const entry = [...html.matchAll(/<h[1-3][^>]*class="[^"]*entry-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    const any = entry.length ? entry : [...html.matchAll(/<h[1-3][^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    for (const [, href, text] of any) {
      let link; try { link = new URL(decode(href), next).href; } catch { continue; }
      if (!link.startsWith(origin) || seen.has(link)) continue;
      seen.add(link);
      items.push({ title: decode(text).trim(), link, published: null, description: "", categories: [], creator: null, from_page: true });
    }
    const n = html.match(/<link[^>]*rel="next"[^>]*href="([^"]+)"/) || html.match(/<a[^>]*class="[^"]*next[^"]*"[^>]*href="([^"]+)"/) ||
      html.match(new RegExp(`<a[^>]*href="([^"]*/page/${page + 2}/?)"`));
    next = n ? new URL(decode(n[1]), next).href : null;
  }
  return { items };
}

let topic;
if (localDefinition) {
  topic = { version: "local", definition: JSON.parse(readFileSync(localDefinition, "utf8")) };
} else {
  const reg = await fetch(`${host}/registry/${topicId}.json`, { headers: { "user-agent": UA } });
  if (!reg.ok) { console.error(`registry: HTTP ${reg.status} for ${topicId}`); process.exit(1); }
  topic = await reg.json();
}
const def = topic.definition;
const now = Date.now();

const feeds = [];
const failures = [];
let total = 0, kept = 0;
for (const source of def.agenda_sources || []) {
  const windowMs = (source.window_hours || 48) * 3600 * 1000;
  for (const feed of source.feeds || []) {
    const { url, dated } = fillDate(feed.url);
    let r = feed.page ? await fetchPage(url) : await fetchFeed(url);
    // A dated archive with nothing on that date answers 404: an empty feed, not a failure.
    if (dated && r.error === "HTTP 404") r = { items: [] };
    if (r.error) { failures.push({ publisher: source.publisher, feed: feed.name, url, error: r.error }); feeds.push({ publisher: source.publisher, feed: feed.name, url, role: source.role || "agenda", error: r.error, items: [] }); continue; }
    total += r.items.length;
    const inWindow = dated ? r.items : r.items.filter((it) => !it.published || now - Date.parse(it.published) <= windowMs);
    kept += inWindow.length;
    feeds.push({
      publisher: source.publisher, feed: feed.name, url, role: source.role || "agenda", dated, page: !!feed.page,
      agenda_only_digest: !!feed.agenda_only_digest,
      fetched: r.items.length, in_window: inWindow.length,
      items: inWindow.map((it, i) => ({ ref: `${slug(source.publisher)}:${slug(feed.name)}:${i}`, ...it })),
    });
  }
}

function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function normTitle(t) { return String(t || "").toLowerCase().replace(/\s*[|–—-]\s*(bbc news|the guardian|npr|al jazeera|wsj|financial times)\s*$/i, "").replace(/[^a-z0-9]+/g, " ").trim(); }
function normLink(u) { try { const x = new URL(u); x.search = ""; x.hash = ""; return (x.origin + x.pathname).replace(/\/$/, "").toLowerCase(); } catch { return String(u || "").toLowerCase(); } }

// Collapse exact duplicates across feeds. The canonical item is an agenda-role item if any, else the
// earliest published. Returns the number collapsed; marks duplicates in place with duplicate_of.
function collapse(feeds) {
  const all = [];
  for (const f of feeds) for (const it of f.items) all.push({ it, f });
  const byKey = new Map();
  for (const { it, f } of all) {
    for (const key of it.from_page ? [`l:${normLink(it.link)}`] : [`l:${normLink(it.link)}`, `t:${normTitle(it.title)}`]) {
      if (key.length < 8) continue;
      (byKey.get(key) || byKey.set(key, []).get(key)).push({ it, f });
    }
  }
  let n = 0;
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const live = group.filter((g) => !g.it.duplicate_of);
    if (live.length < 2) continue;
    live.sort((a, b) => (a.f.role === "agenda" ? 0 : 1) - (b.f.role === "agenda" ? 0 : 1) || String(a.it.published || "").localeCompare(String(b.it.published || "")));
    const canon = live[0];
    for (const g of live.slice(1)) { g.it.duplicate_of = canon.it.ref; g.it.duplicate_reason = `same item in ${canon.f.publisher} / ${canon.f.feed}`; n++; }
  }
  return n;
}

const collapsed = collapse(feeds);
const unique = kept - collapsed;
const perFeed = feeds.map((f) => ({ source: `${f.publisher} / ${f.feed}`, role: f.role, in_window: f.in_window || 0, duplicates: f.items.filter((i) => i.duplicate_of).length }));
const result = {
  topic: topicId, topic_version: topic.version, host, edition_date: editionDate, fetched_at: new Date(now).toISOString(),
  counts: { feeds: feeds.length, failed: failures.length, items_fetched: total, items_in_window: kept, collapsed, unique },
  per_feed: perFeed, failures, feeds,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 2));
const collapsedList = [];
for (const f of feeds) for (const it of f.items) if (it.duplicate_of) collapsedList.push({
  ref: it.ref, title: it.title, url: it.link, source: `${f.publisher} / ${f.feed}`, published_at: it.published,
  stage: "collapsed", reason: it.duplicate_reason, collapsed_into: it.duplicate_of,
});
writeFileSync(out.replace(/candidates\.json$/, "collapsed.json"), JSON.stringify({ collapsed: collapsedList }, null, 2));
console.log(`${topicId} v${topic.version}: ${feeds.length} feeds, ${failures.length} failed, ${total} items fetched, ${kept} in window, ${collapsed} collapsed as duplicates, ${unique} unique -> ${out}`);
for (const pf of perFeed) console.log(`  ${pf.role.padEnd(6)} ${pf.source.padEnd(36)} in_window=${String(pf.in_window).padStart(3)} duplicates=${pf.duplicates}`);
for (const f of failures) console.log(`  FAILED ${f.publisher} / ${f.feed}: ${f.error}`);
