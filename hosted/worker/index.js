// PersonalPaper hosted environment.
// One Worker: registry (public reads), outputs (authenticated writes), pages and feeds (public reads).
// Storage is D1, bound as env.DB. Schema in hosted/schema.sql.

import { marked, Marked } from "marked";

// Headings get stable ids so a table of contents can link to them.
function slugify(s) {
  return String(s).toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}
function renderWithToc(md) {
  const toc = [];
  const seen = new Map();
  const renderer = {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      let id = slugify(text) || "section";
      const n = (seen.get(id) || 0) + 1; seen.set(id, n); if (n > 1) id = `${id}-${n}`;
      if (depth === 2) toc.push({ id, text, stories: [] });
      else if (depth === 3 && toc.length) toc[toc.length - 1].stories.push({ id, text });
      return `<h${depth} id="${id}">${text}</h${depth}>\n`;
    },
  };
  const m = new Marked({ renderer });
  const html = m.parse(md);
  return { html, toc };
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
        if (!(await authorized(request, env))) return json({ error: "unauthorized" }, 401);
        const body = await request.json().catch(() => null);
        if (!body) return json({ error: "body must be JSON" }, 400);
        if (method === "POST" && (m = path.match(/^\/api\/profiles\/([a-z0-9-]+)$/))) return putProfile(env, m[1], body);
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
      if (path === "/") return listingPage(env);
      if ((m = path.match(/^\/([a-z0-9-]+)\/archive\.json$/))) return archiveJson(env, m[1], url);
      if ((m = path.match(/^\/([a-z0-9-]+)\/direction\.json$/))) return directionJson(env, m[1], url);
      if ((m = path.match(/^\/([a-z0-9-]+)\/runs\.json$/))) return runsJson(env, m[1]);
      if ((m = path.match(/^\/([a-z0-9-]+)\/archive$/))) return archivePage(env, m[1]);
      if ((m = path.match(/^\/([a-z0-9-]+)\/flags\.json$/))) return flagsJson(env, m[1], url);
      if ((m = path.match(/^\/([a-z0-9-]+)\/(\d{4}-\d{2}-\d{2})\/cuts\.json$/))) return cutsJson(env, m[1], m[2]);
      if ((m = path.match(/^\/([a-z0-9-]+)\/(\d{4}-\d{2}-\d{2})\/cuts$/))) return cutsPage(env, m[1], m[2]);
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

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

async function registryIndex(env) {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, p.visibility, p.maintainer, p.description, p.current_version AS version, p.updated_at,
            (SELECT MAX(date) FROM editions e WHERE e.profile_id = p.id) AS latest_edition,
            (SELECT status FROM runs r WHERE r.profile_id = p.id ORDER BY started_at DESC LIMIT 1) AS last_run_status,
            (SELECT started_at FROM runs r WHERE r.profile_id = p.id ORDER BY started_at DESC LIMIT 1) AS last_run_at
     FROM profiles p WHERE p.visibility = 'public' ORDER BY p.name`
  ).all();
  return json({ profiles: results });
}

async function registryGet(env, id) {
  const row = await env.DB.prepare(
    `SELECT p.id, p.name, p.visibility, p.maintainer, p.description, p.current_version AS version,
            v.definition, v.created_at AS version_created_at
     FROM profiles p JOIN profile_versions v ON v.profile_id = p.id AND v.version = p.current_version
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
    `SELECT v.version, v.note, v.created_at FROM profile_versions v
     JOIN profiles p ON p.id = v.profile_id AND p.visibility = 'public'
     WHERE v.profile_id = ? ORDER BY v.version DESC`
  ).bind(id).all();
  if (!results.length) return notFound();
  return json({ id, versions: results });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function putProfile(env, id, body) {
  const def = body.definition;
  if (!def || def.id !== id) return json({ error: "definition.id must match path" }, 400);
  const definition = JSON.stringify(def);
  const latest = await env.DB.prepare(
    `SELECT version, definition FROM profile_versions WHERE profile_id = ? ORDER BY version DESC LIMIT 1`
  ).bind(id).first();
  if (latest && latest.definition === definition) return json({ id, version: latest.version, changed: false });
  const version = (latest?.version || 0) + 1;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO profiles (id, name, visibility, maintainer, description, current_version)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, visibility = excluded.visibility,
         maintainer = excluded.maintainer, description = excluded.description,
         current_version = excluded.current_version, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
    ).bind(id, def.name || id, def.visibility || "public", def.maintainer || null, def.description || "", version),
    env.DB.prepare(
      `INSERT INTO profile_versions (profile_id, version, definition, note) VALUES (?, ?, ?, ?)`
    ).bind(id, version, definition, body.note || null),
  ]);
  return json({ id, version, changed: true }, 201);
}

async function postRun(env, b) {
  for (const k of ["id", "profile_id", "profile_version", "started_at"]) if (b[k] == null) return json({ error: `missing ${k}` }, 400);
  await env.DB.prepare(
    `INSERT INTO runs (id, profile_id, profile_version, started_at, status) VALUES (?, ?, ?, ?, 'running')
     ON CONFLICT(id) DO UPDATE SET started_at = excluded.started_at`
  ).bind(b.id, b.profile_id, b.profile_version, b.started_at).run();
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
  const required = ["id", "profile_id", "run_id", "category", "headline", "url", "surfaced_by", "coverage", "newsworthiness", "relevance", "summary", "basis"];
  for (const s of stories) for (const k of required) if (s[k] == null) return json({ error: `story ${s.id || "?"} missing ${k}` }, 400);
  const stmt = env.DB.prepare(
    `INSERT OR IGNORE INTO stories (id, profile_id, run_id, category, headline, url, published_at, surfaced_by, coverage,
       newsworthiness, relevance, summary, why_it_matters, basis, directed, related)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const results = await env.DB.batch(stories.map((s) => stmt.bind(
    s.id, s.profile_id, s.run_id, s.category, s.headline, s.url, s.published_at || null, s.surfaced_by,
    JSON.stringify(s.coverage), Number(s.newsworthiness), Number(s.relevance), s.summary, s.why_it_matters || null,
    s.basis, s.directed ? 1 : 0, s.related ? JSON.stringify(s.related) : null
  )));
  const inserted = results.reduce((n, r) => n + (r.meta.changes || 0), 0);
  return json({ received: stories.length, inserted, ignored: stories.length - inserted }, 201);
}

async function postEdition(env, b) {
  for (const k of ["profile_id", "date", "run_id", "body_md"]) if (b[k] == null) return json({ error: `missing ${k}` }, 400);
  await env.DB.prepare(
    `INSERT INTO editions (profile_id, date, run_id, today, body_md, closing) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(profile_id, date) DO UPDATE SET run_id = excluded.run_id, today = excluded.today,
       body_md = excluded.body_md, closing = excluded.closing, created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  ).bind(b.profile_id, b.date, b.run_id, b.today ? JSON.stringify(b.today) : null, b.body_md, b.closing || null).run();
  return json({ profile_id: b.profile_id, date: b.date, url: `/${b.profile_id}/${b.date}` }, 201);
}

async function postDirection(env, b) {
  if (!b.profile_id || !b.action || !b.payload) return json({ error: "profile_id, action, payload required" }, 400);
  const r = await env.DB.prepare(`INSERT INTO direction (profile_id, action, payload) VALUES (?, ?, ?)`)
    .bind(b.profile_id, b.action, typeof b.payload === "string" ? b.payload : JSON.stringify(b.payload)).run();
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
    for (const k of ["profile_id", "run_id", "ref", "title", "stage"]) if (c[k] == null) return json({ error: `candidate ${c.ref || "?"} missing ${k}` }, 400);
    if (!STAGES.includes(c.stage)) return json({ error: `candidate ${c.ref} bad stage ${c.stage}` }, 400);
  }
  const stmt = env.DB.prepare(
    `INSERT INTO candidates (profile_id, run_id, ref, title, url, source, published_at, category, stage, reason, collapsed_into, story_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id, ref) DO UPDATE SET title = excluded.title, url = excluded.url, source = excluded.source,
       published_at = excluded.published_at, category = excluded.category, stage = excluded.stage, reason = excluded.reason,
       collapsed_into = excluded.collapsed_into, story_id = excluded.story_id`
  );
  // D1 batches are limited in size; chunk.
  let written = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const res = await env.DB.batch(chunk.map((c) => stmt.bind(
      c.profile_id, c.run_id, c.ref, c.title, c.url || null, c.source || null, c.published_at || null, c.category || null,
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

async function runIdForEdition(env, profile, date) {
  const e = await env.DB.prepare(`SELECT run_id FROM editions WHERE profile_id = ? AND date = ?`).bind(profile, date).first();
  return e?.run_id || null;
}

async function cutsJson(env, profile, date) {
  const run = await runIdForEdition(env, profile, date);
  if (!run) return notFound();
  const { results } = await env.DB.prepare(
    `SELECT id, ref, title, url, source, published_at, category, stage, reason, collapsed_into, story_id, flagged_at, flag_note, flag_handled_at, flag_result
     FROM candidates WHERE run_id = ? ORDER BY stage, category, id`
  ).bind(run).all();
  return json({ profile, date, run_id: run, candidates: results });
}

async function flagsJson(env, profile, url) {
  const unhandled = url.searchParams.get("unhandled") === "1";
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.run_id, c.ref, c.title, c.url, c.source, c.published_at, c.category, c.stage, c.reason, c.flagged_at, c.flag_note, c.flag_handled_at, c.flag_result,
            (SELECT date FROM editions e WHERE e.run_id = c.run_id) AS edition_date
     FROM candidates c WHERE c.profile_id = ? AND c.flagged_at IS NOT NULL ${unhandled ? "AND c.flag_handled_at IS NULL" : ""}
     ORDER BY c.flagged_at DESC`
  ).bind(profile).all();
  return json({ profile, flags: results });
}

async function cutsPage(env, profile, date) {
  const p = await env.DB.prepare(`SELECT id, name FROM profiles WHERE id = ? AND visibility = 'public'`).bind(profile).first();
  if (!p) return notFound();
  const run = await runIdForEdition(env, profile, date);
  if (!run) return html(page(`${p.name} · cuts`, `<p class="meta"><a href="/${p.id}">latest</a></p><h1>No edition for ${esc(date)}</h1>`), 404);
  const { results } = await env.DB.prepare(
    `SELECT id, ref, title, url, source, published_at, category, stage, reason, collapsed_into, story_id, flagged_at, flag_note
     FROM candidates WHERE run_id = ? ORDER BY category, id`
  ).bind(run).all();
  const labels = { kept: "Kept", "not-kept": "Read, not kept", "not-shortlisted": "Not shortlisted", deprioritized: "Deprioritized", repeat: "Repeats", collapsed: "Collapsed into another candidate" };
  const order = ["not-kept", "not-shortlisted", "deprioritized", "repeat", "collapsed", "kept"];
  const groups = Object.fromEntries(order.map((s) => [s, results.filter((c) => c.stage === s)]));
  const row = (c) => `<li class="cut${c.flagged_at ? " flagged" : ""}" data-id="${c.id}">
      <div class="cut-main"><span class="cut-title">${c.url ? `<a href="${esc(c.url)}">${esc(c.title)}</a>` : esc(c.title)}</span>
        <span class="meta">${esc(c.source || "")}${c.published_at ? ` · ${esc(String(c.published_at).slice(0, 10))}` : ""}${c.category ? ` · ${esc(c.category)}` : ""}</span>
        ${c.reason ? `<span class="reason">${esc(c.reason)}${c.collapsed_into ? ` (${esc(c.collapsed_into)})` : ""}</span>` : ""}</div>
      <button class="flag" type="button" aria-pressed="${c.flagged_at ? "true" : "false"}">${c.flagged_at ? "flagged" : "flag"}</button>
    </li>`;
  const sections = order.filter((s) => groups[s].length).map((s) =>
    `<section><h2>${labels[s]} <span class="count">${groups[s].length}</span></h2><ul class="cuts">${groups[s].map(row).join("")}</ul></section>`).join("");
  const body = `
    <p class="meta"><a href="/${p.id}/${date}">edition</a> · <a href="/${p.id}">latest</a> · <a href="/${p.id}/archive">archive</a></p>
    <header class="masthead"><h1>${esc(p.name)}</h1><p class="date">Cuts · ${esc(date)} · ${results.length} candidates</p></header>
    <p class="lede">Every candidate the editor considered for this edition, by the stage it left at. Flag anything you would have run; the editor reads flags at the start of its next run.</p>
    <details class="tokenbox"><summary>Flagging needs the write token (stored only in this browser)</summary>
      <input id="tok" type="password" placeholder="paste token" autocomplete="off"> <button id="savetok" type="button">save</button> <span id="tokstate" class="meta"></span></details>
    ${sections || "<p>No candidate record for this edition.</p>"}
    <script>
    (function(){
      var K='pp_write_token';
      function tok(){ try { return localStorage.getItem(K)||''; } catch(e){ return ''; } }
      function state(){ var s=document.getElementById('tokstate'); if(s) s.textContent = tok() ? 'token saved' : 'no token'; }
      var sv=document.getElementById('savetok'); if(sv) sv.addEventListener('click', function(){ try { localStorage.setItem(K, document.getElementById('tok').value.trim()); } catch(e){} state(); });
      state();
      document.querySelectorAll('button.flag').forEach(function(b){
        b.addEventListener('click', function(){
          var li=b.closest('li'), id=li.getAttribute('data-id'), on = b.getAttribute('aria-pressed')!=='true';
          var t=tok(); if(!t){ alert('Save the write token first (open the box above).'); return; }
          var note = on ? (prompt('Why should this have run? (optional)')||'') : '';
          if (on && note===null) return;
          b.disabled=true;
          fetch('/api/candidates/'+id+'/flag',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+t},body:JSON.stringify({flag:on,note:note})})
            .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); b.setAttribute('aria-pressed', on?'true':'false'); b.textContent = on?'flagged':'flag'; li.classList.toggle('flagged', on); })
            .catch(function(e){ alert('Flag failed: '+e.message); })
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

async function archiveJson(env, profile, url) {
  const days = Math.min(Math.max(Number(url.searchParams.get("days") || 14), 1), 365);
  const { results } = await env.DB.prepare(
    `SELECT s.* FROM stories s JOIN profiles p ON p.id = s.profile_id AND p.visibility = 'public'
     WHERE s.profile_id = ? AND s.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
     ORDER BY s.created_at DESC`
  ).bind(profile, `-${days} days`).all();
  return json({ profile, days, stories: results.map(parseStory) });
}

async function directionJson(env, profile, url) {
  const unhandled = url.searchParams.get("unhandled") === "1";
  const { results } = await env.DB.prepare(
    `SELECT * FROM direction WHERE profile_id = ? ${unhandled ? "AND handled_at IS NULL" : ""} ORDER BY created_at ASC`
  ).bind(profile).all();
  return json({ profile, direction: results });
}

async function runsJson(env, profile) {
  const { results } = await env.DB.prepare(
    `SELECT id, profile_version, started_at, ended_at, status, cost_usd, log FROM runs WHERE profile_id = ? ORDER BY started_at DESC LIMIT 30`
  ).bind(profile).all();
  return json({ profile, runs: results.map((r) => ({ ...r, log: r.log ? JSON.parse(r.log) : null })) });
}

function parseStory(s) {
  return { ...s, coverage: safeJson(s.coverage), related: safeJson(s.related), directed: !!s.directed };
}
function safeJson(t) { try { return t ? JSON.parse(t) : null; } catch { return t; } }

// ---------------------------------------------------------------------------
// Pages and feed
// ---------------------------------------------------------------------------

async function listingPage(env) {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, p.description, p.maintainer, p.current_version,
            (SELECT MAX(date) FROM editions e WHERE e.profile_id = p.id) AS latest,
            (SELECT status FROM runs r WHERE r.profile_id = p.id ORDER BY started_at DESC LIMIT 1) AS status,
            (SELECT started_at FROM runs r WHERE r.profile_id = p.id ORDER BY started_at DESC LIMIT 1) AS last_run
     FROM profiles p WHERE p.visibility = 'public' ORDER BY p.name`
  ).all();
  const items = results.map((p) => `
    <li class="profile">
      <h2><a href="/${p.id}">${esc(p.name)}</a></h2>
      <p>${esc(p.description)}</p>
      <p class="meta">${p.latest ? `Latest edition <a href="/${p.id}/${p.latest}">${p.latest}</a>` : "No editions yet"}
        · ${p.status ? `last run ${esc(p.status)} at ${esc(p.last_run)}` : "no runs yet"}
        · definition v${p.current_version} · <a href="/${p.id}/archive">archive</a> · <a href="/registry/${p.id}.json">registry</a></p>
    </li>`).join("");
  return html(page("PersonalPaper", `<h1>PersonalPaper</h1><p class="lede">Public profiles and their daily editions.</p><ul class="profiles">${items || "<li>No public profiles.</li>"}</ul>`));
}

async function editionPage(env, profile, date) {
  const p = await env.DB.prepare(`SELECT id, name FROM profiles WHERE id = ? AND visibility = 'public'`).bind(profile).first();
  if (!p) return notFound();
  const e = date
    ? await env.DB.prepare(`SELECT * FROM editions WHERE profile_id = ? AND date = ?`).bind(profile, date).first()
    : await env.DB.prepare(`SELECT * FROM editions WHERE profile_id = ? ORDER BY date DESC LIMIT 1`).bind(profile).first();
  if (!e) return html(page(p.name, `<p class="meta"><a href="/">PersonalPaper</a></p><h1>${esc(p.name)}</h1><p>No edition yet.</p>`), 404);
  const nav = await env.DB.prepare(
    `SELECT (SELECT MAX(date) FROM editions WHERE profile_id = ?1 AND date < ?2) AS prev,
            (SELECT MIN(date) FROM editions WHERE profile_id = ?1 AND date > ?2) AS next`
  ).bind(profile, e.date).first();
  const { html: body, toc } = renderWithToc(e.body_md);
  const topList = safeJson(e.today);
  // Top stories: link each pointer to its story heading when the headline matches one in the body.
  const headingByText = new Map(toc.flatMap((c) => c.stories.map((s) => [s.text, s.id])));
  const top = Array.isArray(topList) && topList.length
    ? `<section class="top"><h2>Top stories</h2><ol>${topList.map((t) => {
        const h = typeof t === "string" ? t : t.headline || "";
        const id = headingByText.get(esc(h)) || headingByText.get(h);
        return `<li>${id ? `<a href="#${id}">${esc(h)}</a>` : esc(h)}</li>`;
      }).join("")}</ol></section>`
    : "";
  const contents = toc.length
    ? `<nav class="toc"><h2>In this edition</h2>${toc.map((c) => `<p class="toc-cat"><a href="#${c.id}">${c.text}</a></p><ul>${c.stories.map((s) => `<li><a href="#${s.id}">${s.text}</a></li>`).join("")}</ul>`).join("")}</nav>`
    : "";
  const closing = e.closing ? `<section class="closing"><h2>From the desk</h2>${marked.parse(e.closing)}</section>` : "";
  const links = [
    nav.prev ? `<a href="/${profile}/${nav.prev}">← ${nav.prev}</a>` : "",
    `<a href="/${profile}">latest</a>`,
    nav.next ? `<a href="/${profile}/${nav.next}">${nav.next} →</a>` : "",
    `<a href="/${profile}/${e.date}/cuts">cuts</a>`, `<a href="/${profile}/archive">archive</a>`, `<a href="/">all profiles</a>`,
  ].filter(Boolean).join(" · ");
  return html(page(`${p.name} · ${e.date}`,
    `<p class="meta">${links}</p><header class="masthead"><h1>${esc(p.name)}</h1><p class="date">${esc(e.date)}</p></header>
     ${top}${contents}<article class="edition">${body}</article>${closing}<p class="meta">${links}</p>`));
}

async function archivePage(env, profile) {
  const p = await env.DB.prepare(`SELECT id, name FROM profiles WHERE id = ? AND visibility = 'public'`).bind(profile).first();
  if (!p) return notFound();
  const { results } = await env.DB.prepare(
    `SELECT e.date, e.today, e.created_at, r.status,
            (SELECT COUNT(*) FROM stories s WHERE s.run_id = e.run_id) AS story_count
     FROM editions e LEFT JOIN runs r ON r.id = e.run_id
     WHERE e.profile_id = ? ORDER BY e.date DESC`
  ).bind(profile).all();
  const items = results.map((e) => {
    const top = safeJson(e.today);
    const heads = Array.isArray(top) ? top.map((t) => esc(typeof t === "string" ? t : t.headline || "")).filter(Boolean) : [];
    return `<li class="profile"><h2><a href="/${p.id}/${e.date}">${esc(e.date)}</a></h2>
      <p class="meta">${e.story_count} stories${e.status ? ` · run ${esc(e.status)}` : ""}</p>
      ${heads.length ? `<ul class="heads">${heads.map((h) => `<li>${h}</li>`).join("")}</ul>` : ""}</li>`;
  }).join("");
  return html(page(`${p.name} · archive`,
    `<p class="meta"><a href="/${p.id}">latest</a> · <a href="/">all profiles</a></p>
     <header class="masthead"><h1>${esc(p.name)}</h1><p class="date">Archive · ${results.length} edition${results.length === 1 ? "" : "s"}</p></header>
     <ul class="profiles">${items || "<li>No editions yet.</li>"}</ul>`));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#fbfaf7;--fg:#1c1b19;--muted:#6b665d;--line:#ddd8cf;--link:#1f5f8b}
@media (prefers-color-scheme:dark){:root{--bg:#17171a;--fg:#ebe8e1;--muted:#a09b92;--line:#34343a;--link:#7fb3dc}}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.55 Georgia,"Times New Roman",serif}
main{max-width:42rem;margin:0 auto;padding:1.5rem 1rem 4rem}
a{color:var(--link)} h1{font-size:1.9rem;line-height:1.15;margin:.2rem 0} h2{font-size:1.25rem;margin:1.8rem 0 .4rem;border-bottom:1px solid var(--line);padding-bottom:.2rem}
h3{font-size:1.1rem;margin:1.2rem 0 .2rem} .meta,.date{color:var(--muted);font:14px/1.5 -apple-system,system-ui,sans-serif}
.masthead{border-bottom:2px solid var(--fg);padding-bottom:.5rem;margin-bottom:1rem} .lede{color:var(--muted)}
.profiles{list-style:none;padding:0} .profile{border-top:1px solid var(--line);padding:1rem 0}
.closing{margin-top:2.5rem;border-top:1px solid var(--line);padding-top:.5rem;color:var(--muted)}
.top{margin:1rem 0 1.2rem} .top h2{margin-top:0} .top ol{padding-left:1.4rem;margin:.3rem 0} .top li{margin:.25rem 0;font-weight:600}
.toc{margin:0 0 2rem;padding:.6rem 1rem;border:1px solid var(--line);border-radius:6px;font:15px/1.5 -apple-system,system-ui,sans-serif} .toc h2{margin:.2rem 0 .4rem;border:0;font-size:1rem} .toc-cat{margin:.5rem 0 .1rem;font-weight:600} .toc ul{margin:0 0 .2rem;padding-left:1.2rem} .toc li{margin:.1rem 0} .toc a{text-decoration:none}
.heads{margin:.2rem 0 0;padding-left:1.2rem;color:var(--muted);font-size:.95rem}
.cuts{list-style:none;padding:0;margin:0} .cut{display:flex;gap:.8rem;align-items:flex-start;border-top:1px solid var(--line);padding:.6rem 0} .cut-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:.15rem} .cut-title{font-size:1rem;line-height:1.3} .reason{font:14px/1.45 -apple-system,system-ui,sans-serif;color:var(--muted)} .count{font:14px -apple-system,system-ui,sans-serif;color:var(--muted);font-weight:400}
button.flag{font:14px -apple-system,system-ui,sans-serif;padding:.35rem .7rem;border:1px solid var(--line);border-radius:999px;background:var(--panel,transparent);color:var(--fg);cursor:pointer;flex:none;min-height:36px} button.flag[aria-pressed=true]{background:var(--fg);color:var(--bg);border-color:var(--fg)} .flagged .cut-title{font-weight:600}
.tokenbox{font:14px -apple-system,system-ui,sans-serif;color:var(--muted);margin:0 0 1rem} .tokenbox input{font-size:14px;padding:.3rem;width:14rem;max-width:60%} .tokenbox button{font-size:14px;padding:.3rem .6rem}
.edition p{margin:.4rem 0 .9rem} .edition ul{padding-left:1.2rem}
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
