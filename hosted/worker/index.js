// PersonalPaper hosted environment.
// One Worker: registry (public reads), outputs (authenticated writes), pages and feeds (public reads).
// Storage is D1, bound as env.DB. Schema in hosted/schema.sql.

import { marked } from "marked";
import { ImageResponse, loadGoogleFont } from "workers-og";

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method;

    try {
      // Registry, public reads
      if (method === "GET" && path === "/registry/index.json") return registryIndex(env);
      let m;
      if (method === "GET" && (m = path.match(/^\/registry\/([a-z0-9-]+)\/versions$/))) return registryVersions(env, m[1]);
      if (method === "GET" && (m = path.match(/^\/registry\/([a-z0-9-]+)\.json$/))) return registryGet(env, m[1]);

      // Outputs and admin, authenticated writes
      if (path.startsWith("/api/")) {
        if (!["POST", "PATCH"].includes(method)) return notFound();
        const isFlag = method === "POST" && /^\/api\/candidates\/\d+\/flag$/.test(path);
        const ok = (await authorized(request, env)) || (isFlag && (await ownerCookieValid(request, env)));
        if (!ok) return json({ error: "unauthorized" }, 401);
        const body = await request.json().catch(() => null);
        if (!body) return json({ error: "body must be JSON" }, 400);
        if (method === "POST" && (m = path.match(/^\/api\/topics\/([a-z0-9-]+)$/))) return putTopic(env, m[1], body);
        if (method === "POST" && path === "/api/runs") return postRun(env, body);
        if (method === "PATCH" && (m = path.match(/^\/api\/runs\/([^/]+)$/))) return patchRun(env, decodeURIComponent(m[1]), body);
        if (method === "POST" && path === "/api/stories") return postStories(env, body);
        if (method === "POST" && path === "/api/editions") return postEdition(env, body);
        if (method === "POST" && path === "/api/direction") return postDirection(env, body);
        if (method === "POST" && (m = path.match(/^\/api\/direction\/(\d+)\/handled$/))) return handledDirection(env, Number(m[1]), body);
        if (method === "POST" && path === "/api/candidates") return postCandidates(env, body);
        if (method === "POST" && (m = path.match(/^\/api\/candidates\/(\d+)\/flag$/))) return flagCandidate(env, Number(m[1]), body);
        if (method === "POST" && (m = path.match(/^\/api\/candidates\/(\d+)\/flag-handled$/))) return flagHandled(env, Number(m[1]), body);
        return notFound();
      }

      // Pages and feeds, public reads
      if (method !== "GET" && method !== "HEAD") return notFound();
      if (path === "/owner") return ownerLink(request, env, url);
      if (path === "/") return listingPage(env);
      if (path === "/about") return aboutPage();
      if ((m = path.match(/^\/([a-z0-9-]+)\/archive\.json$/))) return archiveJson(env, m[1], url);
      if ((m = path.match(/^\/([a-z0-9-]+)\/direction\.json$/))) return directionJson(env, m[1], url);
      if ((m = path.match(/^\/([a-z0-9-]+)\/runs\.json$/))) return runsJson(env, m[1]);
      if ((m = path.match(/^\/([a-z0-9-]+)\/archive$/))) return archivePage(env, m[1]);
      if ((m = path.match(/^\/([a-z0-9-]+)\/flags\.json$/))) return flagsJson(env, m[1], url);
      if ((m = path.match(/^\/([a-z0-9-]+)\/(\d{4}-\d{2}-\d{2})\/cuts\.json$/))) return cutsJson(env, m[1], m[2]);
      if ((m = path.match(/^\/([a-z0-9-]+)\/(\d{4}-\d{2}-\d{2})\/cuts$/))) return cutsPage(env, m[1], m[2]);
      if ((m = path.match(/^\/([a-z0-9-]+)\/(\d{4}-\d{2}-\d{2})\/card\.png$/))) return cardPng(request, env, m[1], m[2]);
      if ((m = path.match(/^\/([a-z0-9-]+)\/(\d{4}-\d{2}-\d{2})$/))) return editionPage(env, m[1], m[2]);
      if ((m = path.match(/^\/([a-z0-9-]+)$/))) return editionPage(env, m[1], null);
      return notFound();
    } catch (err) {
      console.error(err);
      return json({ error: "internal", detail: String(err?.message || err) }, 500);
    }
  },
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function authorized(request, env) {
  const expected = env.WRITE_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!given) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function sameSecret(given, expected) {
  if (!given || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(given)), crypto.subtle.digest("SHA-256", enc.encode(expected))]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0; for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
function cookieValue(request, name) {
  const c = request.headers.get("cookie") || "";
  const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}
// The owner cookie: set once per device by visiting /owner?k=<OWNER_KEY>. Lets that browser flag candidates with one click.
async function ownerCookieValid(request, env) {
  return sameSecret(cookieValue(request, "pp_owner"), env.OWNER_KEY);
}
async function ownerLink(request, env, url) {
  const k = url.searchParams.get("k") || "";
  if (!(await sameSecret(k, env.OWNER_KEY))) return html(page("PersonalPaper", `<h1>Not a valid owner link</h1><p class="meta"><a href="/">PersonalPaper</a></p>`), 403);
  const to = url.searchParams.get("to") || "/";
  const headers = new Headers({ location: to.startsWith("/") ? to : "/" });
  headers.append("set-cookie", `pp_owner=${encodeURIComponent(k)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
  return new Response(null, { status: 302, headers });
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

async function registryIndex(env) {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, p.visibility, p.maintainer, p.description, p.current_version AS version, p.updated_at,
            (SELECT MAX(date) FROM editions e WHERE e.topic_id = p.id) AS latest_edition,
            (SELECT status FROM runs r WHERE r.topic_id = p.id ORDER BY started_at DESC LIMIT 1) AS last_run_status,
            (SELECT started_at FROM runs r WHERE r.topic_id = p.id ORDER BY started_at DESC LIMIT 1) AS last_run_at
     FROM topics p WHERE p.visibility = 'public' ORDER BY p.name`
  ).all();
  return json({ topics: results });
}

async function registryGet(env, id) {
  const row = await env.DB.prepare(
    `SELECT p.id, p.name, p.visibility, p.maintainer, p.description, p.current_version AS version,
            v.definition, v.created_at AS version_created_at
     FROM topics p JOIN topic_versions v ON v.topic_id = p.id AND v.version = p.current_version
     WHERE p.id = ? AND p.visibility = 'public'`
  ).bind(id).first();
  if (!row) return notFound();
  return json({
    id: row.id, name: row.name, visibility: row.visibility, maintainer: row.maintainer,
    description: row.description, version: row.version, version_created_at: row.version_created_at,
    definition: JSON.parse(row.definition),
  });
}

async function registryVersions(env, id) {
  const { results } = await env.DB.prepare(
    `SELECT v.version, v.note, v.created_at FROM topic_versions v
     JOIN topics p ON p.id = v.topic_id AND p.visibility = 'public'
     WHERE v.topic_id = ? ORDER BY v.version DESC`
  ).bind(id).all();
  if (!results.length) return notFound();
  return json({ id, versions: results });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function putTopic(env, id, body) {
  const def = body.definition;
  if (!def || def.id !== id) return json({ error: "definition.id must match path" }, 400);
  const definition = JSON.stringify(def);
  const latest = await env.DB.prepare(
    `SELECT version, definition FROM topic_versions WHERE topic_id = ? ORDER BY version DESC LIMIT 1`
  ).bind(id).first();
  if (latest && latest.definition === definition) return json({ id, version: latest.version, changed: false });
  const version = (latest?.version || 0) + 1;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO topics (id, name, visibility, maintainer, description, current_version)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, visibility = excluded.visibility,
         maintainer = excluded.maintainer, description = excluded.description,
         current_version = excluded.current_version, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
    ).bind(id, def.name || id, def.visibility || "public", def.maintainer || null, def.description || "", version),
    env.DB.prepare(
      `INSERT INTO topic_versions (topic_id, version, definition, note) VALUES (?, ?, ?, ?)`
    ).bind(id, version, definition, body.note || null),
  ]);
  return json({ id, version, changed: true }, 201);
}

async function postRun(env, b) {
  for (const k of ["id", "topic_id", "topic_version", "started_at"]) if (b[k] == null) return json({ error: `missing ${k}` }, 400);
  await env.DB.prepare(
    `INSERT INTO runs (id, topic_id, topic_version, started_at, status) VALUES (?, ?, ?, ?, 'running')
     ON CONFLICT(id) DO UPDATE SET started_at = excluded.started_at`
  ).bind(b.id, b.topic_id, b.topic_version, b.started_at).run();
  return json({ id: b.id }, 201);
}

async function patchRun(env, id, b) {
  const status = b.status || "ok";
  if (!["running", "ok", "degraded", "failed"].includes(status)) return json({ error: "bad status" }, 400);
  const r = await env.DB.prepare(
    `UPDATE runs SET ended_at = COALESCE(?, ended_at), status = ?, log = COALESCE(?, log), cost_usd = COALESCE(?, cost_usd) WHERE id = ?`
  ).bind(b.ended_at || null, status, b.log != null ? JSON.stringify(b.log) : null, b.cost_usd ?? null, id).run();
  if (!r.meta.changes) return notFound();
  return json({ id, status });
}

async function postStories(env, b) {
  const stories = Array.isArray(b.stories) ? b.stories : [];
  if (!stories.length) return json({ error: "stories[] required" }, 400);
  const required = ["id", "topic_id", "run_id", "subtopic", "headline", "url", "surfaced_by", "coverage", "newsworthiness", "relevance", "summary", "basis"];
  for (const s of stories) for (const k of required) if (s[k] == null) return json({ error: `story ${s.id || "?"} missing ${k}` }, 400);
  const stmt = env.DB.prepare(
    `INSERT INTO stories (id, topic_id, run_id, subtopic, headline, url, published_at, surfaced_by, coverage,
       newsworthiness, relevance, summary, why_it_matters, basis, directed, related, image_url, image_credit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET subtopic = excluded.subtopic, headline = excluded.headline, url = excluded.url,
       published_at = excluded.published_at, surfaced_by = excluded.surfaced_by, coverage = excluded.coverage,
       newsworthiness = excluded.newsworthiness, relevance = excluded.relevance, summary = excluded.summary,
       why_it_matters = excluded.why_it_matters, basis = excluded.basis, directed = excluded.directed, related = excluded.related,
       image_url = excluded.image_url, image_credit = excluded.image_credit`
  );
  const results = await env.DB.batch(stories.map((s) => stmt.bind(
    s.id, s.topic_id, s.run_id, s.subtopic, s.headline, s.url, s.published_at || null, s.surfaced_by,
    JSON.stringify(s.coverage), Number(s.newsworthiness), Number(s.relevance), s.summary, s.why_it_matters || null,
    s.basis, s.directed ? 1 : 0, s.related ? JSON.stringify(s.related) : null,
    s.image?.url || s.image_url || null, s.image?.credit || s.image_credit || null
  )));
  const written = results.reduce((n, r) => n + (r.meta.changes || 0), 0);
  return json({ received: stories.length, written }, 201);
}

async function postEdition(env, b) {
  for (const k of ["topic_id", "date", "run_id", "body_md"]) if (b[k] == null) return json({ error: `missing ${k}` }, 400);
  await env.DB.prepare(
    `INSERT INTO editions (topic_id, date, run_id, today, body_md, closing) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(topic_id, date) DO UPDATE SET run_id = excluded.run_id, today = excluded.today,
       body_md = excluded.body_md, closing = excluded.closing, created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  ).bind(b.topic_id, b.date, b.run_id, b.today ? JSON.stringify(b.today) : null, b.body_md, b.closing || null).run();
  return json({ topic_id: b.topic_id, date: b.date, url: `/${b.topic_id}/${b.date}` }, 201);
}

async function postDirection(env, b) {
  if (!b.topic_id || !b.action || !b.payload) return json({ error: "topic_id, action, payload required" }, 400);
  const r = await env.DB.prepare(`INSERT INTO direction (topic_id, action, payload) VALUES (?, ?, ?)`)
    .bind(b.topic_id, b.action, typeof b.payload === "string" ? b.payload : JSON.stringify(b.payload)).run();
  return json({ id: r.meta.last_row_id }, 201);
}

async function handledDirection(env, id, b) {
  const r = await env.DB.prepare(
    `UPDATE direction SET handled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), result = ? WHERE id = ?`
  ).bind(b.result || null, id).run();
  if (!r.meta.changes) return notFound();
  return json({ id, handled: true });
}

// ---------------------------------------------------------------------------
// Candidates: the evaluation record
// ---------------------------------------------------------------------------

const STAGES = ["kept", "not-kept", "not-shortlisted", "deprioritized", "repeat", "collapsed"];

async function postCandidates(env, b) {
  const rows = Array.isArray(b.candidates) ? b.candidates : [];
  if (!rows.length) return json({ error: "candidates[] required" }, 400);
  for (const c of rows) {
    for (const k of ["topic_id", "run_id", "ref", "title", "stage"]) if (c[k] == null) return json({ error: `candidate ${c.ref || "?"} missing ${k}` }, 400);
    if (!STAGES.includes(c.stage)) return json({ error: `candidate ${c.ref} bad stage ${c.stage}` }, 400);
  }
  const stmt = env.DB.prepare(
    `INSERT INTO candidates (topic_id, run_id, ref, title, url, source, published_at, subtopic, stage, reason, collapsed_into, story_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id, ref) DO UPDATE SET title = excluded.title, url = excluded.url, source = excluded.source,
       published_at = excluded.published_at, subtopic = excluded.subtopic, stage = excluded.stage, reason = excluded.reason,
       collapsed_into = excluded.collapsed_into, story_id = excluded.story_id`
  );
  // D1 batches are limited in size; chunk.
  let written = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const res = await env.DB.batch(chunk.map((c) => stmt.bind(
      c.topic_id, c.run_id, c.ref, c.title, c.url || null, c.source || null, c.published_at || null, c.subtopic || null,
      c.stage, c.reason || null, c.collapsed_into || null, c.story_id || null
    )));
    written += res.reduce((n, r) => n + (r.meta.changes || 0), 0);
  }
  return json({ received: rows.length, written }, 201);
}

async function flagCandidate(env, id, b) {
  const on = b.flag !== false;
  const stmt = env.DB.prepare(
    on ? `UPDATE candidates SET flagged_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), flag_note = ?, flag_handled_at = NULL, flag_result = NULL WHERE id = ?`
       : `UPDATE candidates SET flagged_at = NULL, flag_note = NULL, flag_handled_at = NULL, flag_result = NULL WHERE id = ?`
  );
  const r = await (on ? stmt.bind(b.note || null, id) : stmt.bind(id)).run();
  if (!r.meta.changes) return notFound();
  return json({ id, flagged: on });
}

async function flagHandled(env, id, b) {
  const r = await env.DB.prepare(
    `UPDATE candidates SET flag_handled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), flag_result = ? WHERE id = ? AND flagged_at IS NOT NULL`
  ).bind(b.result || null, id).run();
  if (!r.meta.changes) return notFound();
  return json({ id, handled: true });
}

async function runIdsForDate(env, topic, date) {
  const { results } = await env.DB.prepare(`SELECT id FROM runs WHERE topic_id = ? AND substr(started_at, 1, 10) = ? ORDER BY started_at`).bind(topic, date).all();
  return results.map((r) => r.id);
}
function inList(ids) { return ids.map(() => "?").join(","); }

async function cutsJson(env, topic, date) {
  const runs = await runIdsForDate(env, topic, date);
  if (!runs.length) return notFound();
  const { results } = await env.DB.prepare(
    `SELECT id, run_id, ref, title, url, source, published_at, subtopic, stage, reason, collapsed_into, story_id, flagged_at, flag_note, flag_handled_at, flag_result
     FROM candidates WHERE run_id IN (${inList(runs)}) ORDER BY stage, subtopic, id`
  ).bind(...runs).all();
  return json({ topic, date, run_ids: runs, candidates: results });
}

async function flagsJson(env, topic, url) {
  const unhandled = url.searchParams.get("unhandled") === "1";
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.run_id, c.ref, c.title, c.url, c.source, c.published_at, c.subtopic, c.stage, c.reason, c.flagged_at, c.flag_note, c.flag_handled_at, c.flag_result,
            (SELECT date FROM editions e WHERE e.run_id = c.run_id) AS edition_date
     FROM candidates c WHERE c.topic_id = ? AND c.flagged_at IS NOT NULL ${unhandled ? "AND c.flag_handled_at IS NULL" : ""}
     ORDER BY c.flagged_at DESC`
  ).bind(topic).all();
  return json({ topic, flags: results });
}

async function cutsPage(env, topic, date) {
  const p = await env.DB.prepare(`SELECT id, name FROM topics WHERE id = ? AND visibility = 'public'`).bind(topic).first();
  if (!p) return notFound();
  const runs = await runIdsForDate(env, topic, date);
  if (!runs.length) return html(page(`${p.name} · cuts`, `<p class="meta"><a href="/${p.id}">latest</a></p><h1>No edition for ${esc(date)}</h1>`), 404);
  const { results } = await env.DB.prepare(
    `SELECT id, run_id, ref, title, url, source, published_at, subtopic, stage, reason, collapsed_into, story_id, flagged_at, flag_note
     FROM candidates WHERE run_id IN (${inList(runs)}) ORDER BY subtopic, id`
  ).bind(...runs).all();
  // Per-source tally: fetched, duplicates of another feed, kept, and kept with this source as the sole surfacer.
  const byRef = Object.fromEntries(results.map((c) => [c.ref, c]));
  const collapsedInto = new Map();
  for (const c of results) if (c.collapsed_into) (collapsedInto.get(c.collapsed_into) || collapsedInto.set(c.collapsed_into, []).get(c.collapsed_into)).push(c);
  const tally = new Map();
  for (const c of results) {
    const src = c.source || "unknown";
    const t = tally.get(src) || tally.set(src, { source: src, total: 0, duplicates: 0, kept: 0, sole: 0 }).get(src);
    t.total++;
    if (c.stage === "collapsed") t.duplicates++;
    if (c.stage === "kept") {
      t.kept++;
      const pub = (x) => String(x || "").split(" / ")[0];
      const others = (collapsedInto.get(c.ref) || []).filter((d) => pub(d.source) !== pub(c.source));
      if (!others.length) t.sole++;
    }
  }
  const sources = [...tally.values()].sort((a, b) => b.kept - a.kept || b.total - a.total);
  const sourcesBlock = sources.length ? `<section class="sources"><h2>Sources <span class="count">${sources.length}</span></h2>
    <div class="scrollx"><table><thead><tr><th>Source</th><th>Items</th><th>Duplicates</th><th>Kept</th><th>Sole source</th></tr></thead><tbody>
    ${sources.map((t) => `<tr><td>${esc(t.source)}</td><td>${t.total}</td><td>${t.duplicates}</td><td>${t.kept}</td><td>${t.sole}</td></tr>`).join("")}</tbody></table></div>
    <p class="meta">Duplicates: items the same as another feed's item. Sole source: kept stories no other publisher surfaced.</p></section>` : "";
  const labels = { kept: "Kept", "not-kept": "Read, not kept", "not-shortlisted": "Not shortlisted", deprioritized: "Deprioritized", repeat: "Repeats", collapsed: "Collapsed into another candidate" };
  const order = ["not-kept", "not-shortlisted", "deprioritized", "repeat", "collapsed", "kept"];
  const groups = Object.fromEntries(order.map((s) => [s, results.filter((c) => c.stage === s)]));
  const row = (c) => `<li class="cut${c.flagged_at ? " flagged" : ""}" data-id="${c.id}">
      <div class="cut-main"><span class="cut-title">${c.url ? `<a href="${esc(c.url)}">${esc(c.title)}</a>` : esc(c.title)}</span>
        <span class="meta">${esc(c.source || "")}${c.published_at ? ` · ${esc(String(c.published_at).slice(0, 10))}` : ""}${c.subtopic ? ` · ${esc(c.subtopic)}` : ""}</span>
        ${c.reason ? `<span class="reason">${esc(c.reason)}${c.collapsed_into ? ` (${esc(c.collapsed_into)})` : ""}</span>` : ""}</div>
      <button class="flag" type="button" aria-pressed="${c.flagged_at ? "true" : "false"}">${c.flagged_at ? "flagged" : "flag"}</button>
    </li>`;
  const sections = order.filter((s) => groups[s].length).map((s) =>
    `<section><h2>${labels[s]} <span class="count">${groups[s].length}</span></h2><ul class="cuts">${groups[s].map(row).join("")}</ul></section>`).join("");
  const body = `
    <p class="meta"><a href="/${p.id}/${date}">edition</a> · <a href="/${p.id}">latest</a> · <a href="/${p.id}/archive">archive</a></p>
    <header class="masthead"><h1>${esc(p.name)}</h1><p class="date">Cuts · ${esc(date)} · ${results.length} candidates${runs.length > 1 ? ` · ${runs.length} runs` : ""}</p></header>
    <p class="lede">Every candidate the editor considered for this edition, by the stage it left at. Flag anything you would have run; the editor reads flags at the start of its next run.</p>
    <p id="flagmsg" class="meta" hidden>This browser is not signed in as the owner. Open your owner link once on this device, then flag again.</p>
    ${sections || "<p>No candidate record for this edition.</p>"}
    ${sourcesBlock}
    <script>
    (function(){
      var msg=document.getElementById('flagmsg');
      document.querySelectorAll('button.flag').forEach(function(b){
        b.addEventListener('click', function(){
          var li=b.closest('li'), id=li.getAttribute('data-id'), on = b.getAttribute('aria-pressed')!=='true';
          var note = '';
          if (on) { var n = prompt('Why should this have run? (optional)'); if (n === null) return; note = n; }
          b.disabled=true;
          fetch('/api/candidates/'+id+'/flag',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({flag:on,note:note})})
            .then(function(r){ if(r.status===401){ msg.hidden=false; msg.scrollIntoView({block:'center'}); throw new Error('not signed in'); } if(!r.ok) throw new Error('HTTP '+r.status); msg.hidden=true; b.setAttribute('aria-pressed', on?'true':'false'); b.textContent = on?'flagged':'flag'; li.classList.toggle('flagged', on); })
            .catch(function(e){ if(e.message!=='not signed in') alert('Flag failed: '+e.message); })
            .then(function(){ b.disabled=false; });
        });
      });
    })();
    </script>`;
  return html(page(`${p.name} · cuts · ${date}`, body));
}

// ---------------------------------------------------------------------------
// Public JSON reads
// ---------------------------------------------------------------------------

async function archiveJson(env, topic, url) {
  const days = Math.min(Math.max(Number(url.searchParams.get("days") || 14), 1), 365);
  const { results } = await env.DB.prepare(
    `SELECT s.* FROM stories s JOIN topics p ON p.id = s.topic_id AND p.visibility = 'public'
     WHERE s.topic_id = ? AND s.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
     ORDER BY s.created_at DESC`
  ).bind(topic, `-${days} days`).all();
  return json({ topic, days, stories: results.map(parseStory) });
}

async function directionJson(env, topic, url) {
  const unhandled = url.searchParams.get("unhandled") === "1";
  const { results } = await env.DB.prepare(
    `SELECT * FROM direction WHERE topic_id = ? ${unhandled ? "AND handled_at IS NULL" : ""} ORDER BY created_at ASC`
  ).bind(topic).all();
  return json({ topic, direction: results });
}

async function runsJson(env, topic) {
  const { results } = await env.DB.prepare(
    `SELECT id, topic_version, started_at, ended_at, status, cost_usd, log FROM runs WHERE topic_id = ? ORDER BY started_at DESC LIMIT 30`
  ).bind(topic).all();
  return json({ topic, runs: results.map((r) => ({ ...r, log: r.log ? JSON.parse(r.log) : null })) });
}

function parseStory(s) {
  return { ...s, coverage: safeJson(s.coverage), related: safeJson(s.related), directed: !!s.directed };
}
function safeJson(t) { try { return t ? JSON.parse(t) : null; } catch { return t; } }

// ---------------------------------------------------------------------------
// Pages and feed
// ---------------------------------------------------------------------------

// The site header shared by the home page and the About page: the brand on the left, the nav on the right.
function siteHeader(here) {
  const brand = `<h1 class="brand"><svg class="mark" viewBox="8 8 48 48" aria-hidden="true"><rect x="8" y="8" width="48" height="6"/><rect x="8" y="19" width="13" height="37"/><rect x="25.5" y="19" width="13" height="37"/><rect x="43" y="19" width="13" height="21"/></svg>personal<b>paper</b></h1>`;
  const nav = here === "about" ? `<a href="/">Home</a>` : `<a href="/about">About</a>`;
  return `<div class="sitehead">${here === "about" ? `<a href="/" class="brandlink">${brand}</a>` : brand}<p class="meta nav">${nav}</p></div>`;
}

function aboutPage() {
  const body = `${siteHeader("about")}
    <div class="prose">
    <p>I was tired of my attention being hijacked by infinite scroll.</p>
    <p>Personal Paper is my attempt to reclaim my attention and become more intentional about my news consumption.</p>
    <p>There are two ways you can use this:</p>
    <ol>
      <li>Read the topics that are posted here. Topics are updated at 5:05 am and 5:05 pm ET (America/New_York GMT-5, or GMT-4 during daylight saving time), each as often as its definition's cadence says: twice a day for most, once a day for some.</li>
      <li>Roll your own and follow news about any topic. Do that by asking your favorite LLM to set it up: <a href="https://github.com/ptrcksmth/personal-paper">github.com/ptrcksmth/personal-paper</a>.</li>
    </ol>
    <p>If you roll your own:</p>
    <ul>
      <li>You define a topic and how frequently you want to read about it</li>
      <li>You tell the system which sources to check (or ask it to recommend some)</li>
      <li>When it runs, it will check those sources and look for other coverage of the stories it finds</li>
      <li>It will make editorial decisions based on your interests and the extent of coverage of a story</li>
      <li>Every time it runs, it creates an edition with updated coverage of your topic</li>
      <li>You can publish your topics here on personalpaper.org or host them anywhere you\u2019d like</li>
    </ul>
    </div>`;
  return html(page("About · PersonalPaper", body, {
    title: "About PersonalPaper",
    description: "An attempt to reclaim attention from infinite scroll: topics updated daily, or roll your own with the open-source editor.",
    url: "https://personalpaper.org/about",
  }));
}

async function listingPage(env) {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, p.description, p.maintainer, p.current_version,
            (SELECT MAX(date) FROM editions e WHERE e.topic_id = p.id) AS latest,
            (SELECT status FROM runs r WHERE r.topic_id = p.id ORDER BY started_at DESC LIMIT 1) AS status,
            (SELECT started_at FROM runs r WHERE r.topic_id = p.id ORDER BY started_at DESC LIMIT 1) AS last_run
     FROM topics p WHERE p.visibility = 'public' ORDER BY p.name`
  ).all();
  const items = results.map((p) => `
    <li class="topic">
      <h2><a href="/${p.id}">${esc(p.name)}</a></h2>
      <p>${esc(p.description)}</p>
      <p class="meta">${p.latest ? `Latest edition <a href="/${p.id}/${p.latest}">${p.latest}</a>` : "No editions yet"}
        · ${p.status ? `last run ${esc(p.status)} at ${esc(p.last_run)}` : "no runs yet"}
        · definition v${p.current_version} · <a href="/${p.id}/archive">archive</a> · <a href="/registry/${p.id}.json">registry</a></p>
    </li>`).join("");
  return html(page("PersonalPaper", `${siteHeader("home")}<p class="lede p">Public topics and their daily editions.</p><ul class="topics">${items || "<li>No public topics.</li>"}</ul>`));
}

async function editionPage(env, topic, date) {
  const p = await env.DB.prepare(`SELECT id, name, current_version FROM topics WHERE id = ? AND visibility = 'public'`).bind(topic).first();
  if (!p) return notFound();
  const e = date
    ? await env.DB.prepare(`SELECT * FROM editions WHERE topic_id = ? AND date = ?`).bind(topic, date).first()
    : await env.DB.prepare(`SELECT * FROM editions WHERE topic_id = ? ORDER BY date DESC LIMIT 1`).bind(topic).first();
  if (!e) return html(page(p.name, `<p class="meta"><a href="/">PersonalPaper</a></p><h1>${esc(p.name)}</h1><p>No edition yet.</p>`), 404);
  const [nav, def, st] = await Promise.all([
    env.DB.prepare(`SELECT (SELECT MAX(date) FROM editions WHERE topic_id = ?1 AND date < ?2) AS prev, (SELECT MIN(date) FROM editions WHERE topic_id = ?1 AND date > ?2) AS next`).bind(topic, e.date).first(),
    env.DB.prepare(`SELECT definition FROM topic_versions WHERE topic_id = ? ORDER BY version ASC`).bind(topic).all(),
    env.DB.prepare(`SELECT s.*, r.started_at AS run_started_at FROM stories s JOIN runs r ON r.id = s.run_id
                    WHERE s.topic_id = ?1 AND substr(r.started_at, 1, 10) = ?2
                    ORDER BY s.newsworthiness DESC, s.created_at ASC`).bind(topic, e.date).all(),
  ]);
  // Names from every version, the newest winning, so an edition filed under a retired subtopic keeps its heading.
  const subtopicName = Object.assign({}, ...def.results.map((v) => Object.fromEntries(((safeJson(v.definition) || {}).subtopics || []).map((c) => [c.id, c.name]))));
  const stories = st.results.map(parseStory);
  // The latest run is the edition; earlier runs the same day are history, shown collapsed per section.
  const latestRun = e.run_id;
  const isLatest = (s) => s.run_id === latestRun;
  const runCount = new Set(stories.map((s) => s.run_id)).size;
  // Subtopic order: as the agent ordered the markdown body (## headings), then any subtopic it did not mention.
  const bodyOrder = [...String(e.body_md || "").matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  const nameToId = Object.fromEntries(Object.entries(subtopicName).map(([id, n]) => [n, id]));
  const subtopicsInBody = bodyOrder.map((n) => nameToId[n]).filter(Boolean);
  const allSubtopics = [...new Set([...subtopicsInBody, ...stories.map((s) => s.subtopic)])];
  const groups = allSubtopics.map((id) => ({ id, name: subtopicName[id] || id, stories: stories.filter((s) => s.subtopic === id) })).filter((g) => g.stories.length);
  const byId = Object.fromEntries(stories.map((s) => [s.id, s]));
  const firstSentence = (t) => { const m = String(t || "").match(/^.*?[.!?](?=\s|$)/); return m ? m[0] : String(t || ""); };
  const publisherOf = (s) => { const c = (s.coverage || []).find((x) => x.url === s.url); return (c?.publisher || s.surfaced_by || "").replace(/\s*\(via [^)]*\)/, ""); };
  const fmtDate = (d) => d ? new Date(String(d).slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "";
  const metaLine = (s) => `<span class="meta">${esc(publisherOf(s))}${s.published_at ? ` · ${esc(fmtDate(s.published_at))}` : ""}${s.basis === "headline-only" ? ' · <span class="badge">headline only</span>' : ""}${s.directed ? ' · <span class="badge">directed</span>' : ""}</span>`;
  const readMore = (s) => {
    const cov = (s.coverage || []).filter((c) => c && c.url);
    if (!cov.some((c) => c.url === s.url)) cov.unshift({ publisher: publisherOf(s), url: s.url });
    const list = [...cov.filter((c) => c.url === s.url), ...cov.filter((c) => c.url !== s.url)];
    return `<div class="more"><p class="more-h">Read more</p><ul>${list.map((c) => `<li><a href="${esc(c.url)}">${esc(c.publisher || "Source")}: ${esc(c.title || s.headline)}</a>${c.paywalled ? ' <span class="badge">subscriber</span>' : ""}</li>`).join("")}</ul></div>`;
  };
  const sid = (s) => "s-" + slugify(s.id);
  const topList = (safeJson(e.today) || []).map((t) => typeof t === "string" ? { headline: t } : t);
  const top = topList.length ? `<section class="top"><h2>Top stories</h2><ol>${topList.map((t) => {
      const s = t.story_id && byId[t.story_id] ? byId[t.story_id] : stories.find((x) => x.headline === t.headline);
      const h = esc(t.headline || s?.headline || "");
      return `<li>${s ? `<a href="#${sid(s)}">${h}</a><span class="kicker">${esc(subtopicName[s.subtopic] || s.subtopic)}</span><span class="lede">${esc(firstSentence(s.summary))}</span>` : h}</li>`;
    }).join("")}</ol></section>` : "";
  const storyHtml = (s) => `
      <details class="story" id="${sid(s)}"><summary class="${s.image_url ? "hasimg" : ""}">${s.image_url ? `<img src="${esc(s.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.remove('hasimg');this.remove()">` : ""}<span class="h">${esc(s.headline)}</span><span class="l">${esc(firstSentence(s.summary))}</span></summary>
      <div class="body">${metaLine(s)}${s.image_url && s.image_credit ? `<span class="meta"> · photo: ${esc(s.image_credit)}</span>` : ""}<p>${esc(s.summary)}</p>${s.why_it_matters ? `<p class="why"><b>Why it matters:</b> ${esc(s.why_it_matters)}</p>` : ""}${readMore(s)}</div></details>`;
  const sections = groups.map((g) => {
    const now = runCount > 1 ? g.stories.filter(isLatest) : g.stories;
    const earlier = runCount > 1 ? g.stories.filter((s) => !isLatest(s)) : [];
    const countLabel = `${g.stories.length} ${g.stories.length === 1 ? "story" : "stories"}`;
    const earlierBlock = earlier.length ? `<details class="earlier"><summary>Earlier today <span class="count">${earlier.length}</span></summary>${earlier.map(storyHtml).join("")}</details>` : "";
    return `<section class="subtopic-section"><h2 class="subtopic" id="subtopic-${g.id}"><span>${esc(g.name)}</span><span class="count">${countLabel}</span></h2>${now.map(storyHtml).join("")}${earlierBlock}</section>`;
  }).join("");
  const closing = e.closing ? `<section class="closing"><h2>From the desk</h2>${marked.parse(e.closing)}</section>` : "";
  const navLinks = (withCuts) => [
    nav.prev ? `<a href="/${topic}/${nav.prev}">← ${nav.prev}</a>` : "",
    `<a href="/${topic}">latest</a>`,
    nav.next ? `<a href="/${topic}/${nav.next}">${nav.next} →</a>` : "",
    withCuts ? `<a href="/${topic}/${e.date}/cuts">cuts</a>` : "", `<a href="/${topic}/archive">archive</a>`, `<a href="/">all topics</a>`,
  ].filter(Boolean).join(" · ");
  const topLinks = navLinks(false), bottomLinks = navLinks(true);
  const longDate = new Date(e.date + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const topStories = topList.map((t) => (t.story_id && byId[t.story_id]) || stories.find((x) => x.headline === t.headline)).filter(Boolean);
  const share = {
    title: `${p.name} · ${longDate}`,
    description: topList.map((t, i) => `${i + 1}. ${t.headline || ""}`).join("  "),
    url: `https://personalpaper.org/${topic}/${e.date}`,
    image: `https://personalpaper.org/${topic}/${e.date}/card.png?v=${Date.parse(e.created_at) || 0}`,
  };
  return html(page(`${p.name} · ${e.date}`,
    `<div class="topbar"><p class="meta nav">${topLinks}</p><a href="/" class="wordmark"><svg class="mark" viewBox="8 8 48 48" aria-hidden="true"><rect x="8" y="8" width="48" height="6"/><rect x="8" y="19" width="13" height="37"/><rect x="25.5" y="19" width="13" height="37"/><rect x="43" y="19" width="13" height="21"/></svg>personal<b>paper</b></a></div><header class="masthead"><h1>${esc(p.name)}</h1><p class="date">${esc(longDate)}</p></header>
     ${top}${sections}${closing}<p class="meta nav">${bottomLinks}</p>`, share));
}

// The share card: masthead, date, and the three top headlines drawn into a 1200x630 PNG.
async function cardPng(request, env, topic, date) {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;
  const p = await env.DB.prepare(`SELECT id, name FROM topics WHERE id = ? AND visibility = 'public'`).bind(topic).first();
  if (!p) return notFound();
  const e = await env.DB.prepare(`SELECT date, today FROM editions WHERE topic_id = ? AND date = ?`).bind(topic, date).first();
  if (!e) return notFound();
  const heads = (safeJson(e.today) || []).map((t) => (typeof t === "string" ? t : t.headline || "")).filter(Boolean).slice(0, 3).map((h) => String(h).replace(/[<>&]/g, ""));
  const longDate = new Date(e.date + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const text = `personalpaper.org${p.name}${longDate}${heads.join("")}0123456789.,:;'’“”"-–—()&$%!?`;
  const [bold, regular, slab] = await Promise.all([
    loadGoogleFont({ family: "Lexend", weight: 700, text }),
    loadGoogleFont({ family: "Lexend", weight: 400, text }),
    loadGoogleFont({ family: "Zilla Slab", weight: 700, text: "personalpaper" }),
  ]);
  const size = heads.reduce((n, h) => n + h.length, 0) > 190 ? 30 : 34;
  const item = (h, i) => `<div style="display:flex;align-items:flex-start;margin-top:18px">
      <div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:20px;background:#1e1c19;color:#f6f4ef;font-size:22px;font-weight:700;margin-right:18px;flex-shrink:0">${i + 1}</div>
      <div style="display:flex;font-size:${size}px;line-height:1.25;font-weight:700;color:#1e1c19">${h}</div></div>`;
  const html = `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:#f6f4ef;padding:52px 60px 44px;font-family:Lexend">
    <div style="display:flex;align-items:center;font-family:'Zilla Slab';font-size:28px;font-weight:700;color:#1e1c19;line-height:1"><div style="display:flex;position:relative;width:26px;height:26px;margin-right:8px;margin-bottom:1px"><div style="display:flex;position:absolute;left:0;top:0;width:26px;height:3.25px;background:#8a2a1b"></div><div style="display:flex;position:absolute;left:0;top:5.96px;width:7.04px;height:20.04px;background:#8a2a1b"></div><div style="display:flex;position:absolute;left:9.48px;top:5.96px;width:7.04px;height:20.04px;background:#8a2a1b"></div><div style="display:flex;position:absolute;left:18.96px;top:5.96px;width:7.04px;height:11.4px;background:#8a2a1b"></div></div><span>personal</span><span style="color:#8a2a1b">paper</span></div>
    <div style="display:flex;align-items:baseline;margin-top:6px"><div style="display:flex;font-size:46px;font-weight:700;color:#1e1c19">${esc(p.name)}</div><div style="display:flex;font-size:24px;color:#6b665d;margin-left:22px;font-weight:400">${esc(longDate)}</div></div>
    <div style="display:flex;height:3px;background:#1e1c19;margin-top:16px"></div>
    <div style="display:flex;flex-direction:column;margin-top:12px">${heads.map(item).join("")}</div>
    <div style="display:flex;margin-top:auto;font-size:20px;color:#6b665d;font-weight:400">personalpaper.org</div>
  </div>`;
  const res = new ImageResponse(html, { width: 1200, height: 630, format: "png", fonts: [
    { name: "Lexend", data: bold, weight: 700, style: "normal" }, { name: "Lexend", data: regular, weight: 400, style: "normal" },
    { name: "Zilla Slab", data: slab, weight: 700, style: "normal" },
  ] });
  const out = new Response(res.body, { status: 200, headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
  await cache.put(request, out.clone());
  return out;
}

async function archivePage(env, topic) {
  const p = await env.DB.prepare(`SELECT id, name FROM topics WHERE id = ? AND visibility = 'public'`).bind(topic).first();
  if (!p) return notFound();
  const { results } = await env.DB.prepare(
    `SELECT e.date, e.today, e.created_at, r.status,
            (SELECT COUNT(*) FROM stories s JOIN runs r2 ON r2.id = s.run_id WHERE s.topic_id = e.topic_id AND substr(r2.started_at, 1, 10) = e.date) AS story_count
     FROM editions e LEFT JOIN runs r ON r.id = e.run_id
     WHERE e.topic_id = ? ORDER BY e.date DESC`
  ).bind(topic).all();
  const items = results.map((e) => {
    const top = safeJson(e.today);
    const heads = Array.isArray(top) ? top.map((t) => esc(typeof t === "string" ? t : t.headline || "")).filter(Boolean) : [];
    return `<li class="topic"><h2><a href="/${p.id}/${e.date}">${esc(e.date)}</a></h2>
      <p class="meta">${e.story_count} stories${e.status ? ` · run ${esc(e.status)}` : ""}</p>
      ${heads.length ? `<ul class="heads">${heads.map((h) => `<li>${h}</li>`).join("")}</ul>` : ""}</li>`;
  }).join("");
  return html(page(`${p.name} · archive`,
    `<p class="meta"><a href="/${p.id}">latest</a> · <a href="/">all topics</a></p>
     <header class="masthead"><h1>${esc(p.name)}</h1><p class="date">Archive · ${results.length} edition${results.length === 1 ? "" : "s"}</p></header>
     <ul class="topics">${items || "<li>No editions yet.</li>"}</ul>`));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function page(title, body, share) {
  const og = share ? `
<meta property="og:type" content="article"><meta property="og:site_name" content="PersonalPaper">
<meta property="og:title" content="${esc(share.title)}"><meta property="og:description" content="${esc(share.description)}">
<meta property="og:url" content="${esc(share.url)}">${share.image ? `<meta property="og:image" content="${esc(share.image)}">` : ""}
<meta name="twitter:card" content="${share.image ? "summary_large_image" : "summary"}"><meta name="twitter:title" content="${esc(share.title)}"><meta name="twitter:description" content="${esc(share.description)}">${share.image ? `<meta name="twitter:image" content="${esc(share.image)}">` : ""}
<meta name="description" content="${esc(share.description)}">` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>${og}
<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#f6f4ef" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#151517" media="(prefers-color-scheme: dark)">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;700&family=Zilla+Slab:wght@700&display=swap">
<style>
:root{--bg:#f6f4ef;--panel:#fdfcfa;--stripe:#ece8e0;--fg:#1e1c19;--muted:#6b665d;--line:#d9d4cb;--accent:#8a2a1b;--accent-soft:#f1e3df;--ui:"Lexend",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#151517;--panel:#1d1d20;--stripe:#232327;--fg:#e8e5df;--muted:#9d978e;--line:#2f2e32;--accent:#e07a5f;--accent-soft:#3a2420}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--ui);font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased}
main{max-width:44rem;margin:0 auto;padding:1.2rem 1rem 5rem}
a{color:inherit} h1{font-size:1.5rem;line-height:1.2;margin:.2rem 0;font-weight:700}
h2{font-size:1rem;margin:1.8rem 0 .4rem;font-weight:700}
.meta,.date{color:var(--muted);font-size:14px} .meta a{color:var(--accent);text-decoration:none} .nav{margin:.2rem 0}
.masthead{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;flex-wrap:wrap;border-bottom:2px solid var(--fg);padding-bottom:.5rem;margin-bottom:1rem}
.topbar{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:.6rem} .topbar .nav{margin:0}
.wordmark,.brand{font-family:"Zilla Slab",Georgia,serif;font-weight:700;color:var(--fg);white-space:nowrap} .wordmark b,.brand b{color:var(--accent);font-weight:inherit}
.wordmark{font-size:20px;line-height:1.3;text-decoration:none} .brand{letter-spacing:-.01em}
.mark{width:.9em;height:.9em;vertical-align:baseline;position:relative;top:.2em;margin-right:.3em;fill:var(--accent)}
.badge{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);border:1px solid var(--line);border-radius:4px;padding:1px 6px;vertical-align:middle}
.kicker{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-top:.15rem}
.lede{display:block;color:var(--muted);font-size:.95em;line-height:1.45;margin-top:.1rem}
.top{margin:1rem 0 1.4rem;border:1px solid var(--line);border-left:4px solid var(--accent);background:var(--panel);border-radius:0 8px 8px 0;padding:.7rem 1rem .4rem}
.top h2{margin:0 0 .3rem;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.top ol{margin:0;padding:0;list-style:none;counter-reset:top}
.top li{counter-increment:top;position:relative;padding:.65rem 0 .65rem 2rem;border-top:1px solid var(--line)}
.top li:first-child{border-top:0}
.top li::before{content:counter(top);position:absolute;left:0;top:.6rem;width:1.5rem;height:1.5rem;border-radius:50%;background:var(--fg);color:var(--bg);font-size:13px;font-weight:700;display:grid;place-items:center}
.top li a{font-weight:700;text-decoration:none;line-height:1.3;display:block}
.count{color:var(--muted);font-weight:400;font-size:13px}
.subtopic-section{margin-top:2.4rem}
h2.subtopic{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);font-weight:700;margin:0 0 .3rem;padding-top:.5rem;border-top:2px solid var(--fg);display:flex;justify-content:space-between;align-items:baseline}
details.story{border-top:1px solid var(--line)} details.story:last-child{border-bottom:1px solid var(--line)}
details.story summary{list-style:none;cursor:pointer;display:grid;gap:.15rem .8rem;padding:.7rem .2rem .7rem 0;align-items:start}
details.story summary.hasimg{grid-template-columns:64px 1fr} details.story summary img{width:64px;height:64px;object-fit:cover;border-radius:6px;grid-row:1/span 2;background:var(--accent-soft)}
details.story summary::-webkit-details-marker{display:none}
details.story summary .h{font-weight:700;line-height:1.3} details.story summary .l{color:var(--muted);font-size:.95em;line-height:1.45}
details.story[open] summary .l{display:none} details.story[open] summary .h{color:var(--accent)}
details.story .body{padding:0 0 1rem}
details.earlier{border-top:1px solid var(--line);margin-top:.2rem} details.earlier>summary{list-style:none;cursor:pointer;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:.55rem 0} details.earlier>summary::-webkit-details-marker{display:none} details.earlier>summary::before{content:"▸ ";} details.earlier[open]>summary::before{content:"▾ ";} details.earlier details.story{margin-left:.6rem} details.story .body p{margin:.35rem 0 .5rem} .why{color:var(--muted)}
.more{margin-top:.6rem;padding-top:.5rem;border-top:1px solid var(--line)} .more-h{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 .3rem!important} .more ul{list-style:none;margin:0;padding:0} .more li{margin:.25rem 0;font-size:15px;line-height:1.4} .more a{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
.closing{margin-top:2.5rem;border-top:1px solid var(--line);padding-top:.5rem;color:var(--muted);font-size:15px} .closing h2{color:var(--fg)}
.lede.p{color:var(--muted)} .topics{list-style:none;padding:0} .topic{border-top:1px solid var(--line);padding:1rem 0}
.sitehead{display:flex;justify-content:space-between;align-items:center;gap:1rem} .sitehead .nav{margin:0} .brandlink{text-decoration:none}
.prose{margin-top:1.4rem} .prose p,.prose li{margin:.6rem 0} .prose ol,.prose ul{padding-left:1.4rem} .prose a{color:var(--accent)}
.heads{margin:.2rem 0 0;padding-left:1.2rem;color:var(--muted);font-size:.95rem}
.cuts{list-style:none;padding:0;margin:0} .cut{display:flex;gap:.8rem;align-items:flex-start;border-top:1px solid var(--line);padding:.6rem 0} .cut-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:.15rem} .cut-title{line-height:1.3} .reason{font-size:14px;color:var(--muted)}
button.flag{font:inherit;font-size:14px;padding:.35rem .7rem;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--fg);cursor:pointer;flex:none;min-height:36px} button.flag[aria-pressed=true]{background:var(--fg);color:var(--bg);border-color:var(--fg)} .flagged .cut-title{font-weight:700}
.tokenbox{display:none}
.sources{margin:1rem 0 1.5rem} .scrollx{overflow-x:auto} .sources table{border-collapse:collapse;width:100%;font-size:14px} .sources th,.sources td{text-align:left;padding:.35rem .6rem;border-bottom:1px solid var(--line)} .sources td:nth-child(n+2),.sources th:nth-child(n+2){text-align:right;font-variant-numeric:tabular-nums}
a:focus-visible,summary:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style></head><body><main>${body}</main></body></html>`;
}
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": status === 200 ? "public, max-age=60" : "no-store" } });
}
function html(markup, status = 200) {
  return new Response(markup, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" } });
}
function notFound() { return json({ error: "not found" }, 404); }
