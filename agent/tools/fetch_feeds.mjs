#!/usr/bin/env node
// Fetch a profile's agenda feeds and write the candidate list.
//
// Usage: node agent/tools/fetch_feeds.mjs <profile-id> [--host https://personalpaper.org] [--out out/candidates.json]
//
// Reads the profile definition from the hosted environment's registry, fetches every feed in
// agenda_sources, keeps items published within each source's window_hours, and writes one JSON
// file: items grouped by feed, with counts and failures. Deterministic: no model, no judgment.
// Exit code 0 even when some feeds fail; failures are in the output for the run log.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = process.argv.slice(2);
const profileId = args.find((a) => !a.startsWith("--"));
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const host = (process.env.PP_HOST || opt("--host", "https://personalpaper.org")).replace(/\/$/, "");
const out = opt("--out", "out/candidates.json");
if (!profileId) { console.error("usage: fetch_feeds.mjs <profile-id> [--host H] [--out F]"); process.exit(2); }

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

const reg = await fetch(`${host}/registry/${profileId}.json`, { headers: { "user-agent": UA } });
if (!reg.ok) { console.error(`registry: HTTP ${reg.status} for ${profileId}`); process.exit(1); }
const profile = await reg.json();
const def = profile.definition;
const now = Date.now();

const feeds = [];
const failures = [];
let total = 0, kept = 0;
for (const source of def.agenda_sources || []) {
  const windowMs = (source.window_hours || 48) * 3600 * 1000;
  for (const feed of source.feeds || []) {
    const r = await fetchFeed(feed.url);
    if (r.error) { failures.push({ publisher: source.publisher, feed: feed.name, url: feed.url, error: r.error }); feeds.push({ publisher: source.publisher, feed: feed.name, url: feed.url, error: r.error, items: [] }); continue; }
    total += r.items.length;
    const inWindow = r.items.filter((it) => !it.published || now - Date.parse(it.published) <= windowMs);
    kept += inWindow.length;
    feeds.push({
      publisher: source.publisher, feed: feed.name, url: feed.url,
      agenda_only_digest: !!feed.agenda_only_digest,
      fetched: r.items.length, in_window: inWindow.length,
      items: inWindow.map((it, i) => ({ ref: `${slug(source.publisher)}:${slug(feed.name)}:${i}`, ...it })),
    });
  }
}

function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

const result = {
  profile: profileId, profile_version: profile.version, host, fetched_at: new Date(now).toISOString(),
  counts: { feeds: feeds.length, failed: failures.length, items_fetched: total, items_in_window: kept },
  failures, feeds,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(`${profileId} v${profile.version}: ${feeds.length} feeds, ${failures.length} failed, ${total} items fetched, ${kept} in window -> ${out}`);
for (const f of failures) console.log(`  FAILED ${f.publisher} / ${f.feed}: ${f.error}`);
