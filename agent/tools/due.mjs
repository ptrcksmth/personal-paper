#!/usr/bin/env node
// Which topics are due to run now, from each topic's cadence and its run register.
//
// Usage: node agent/tools/due.mjs [--host https://personalpaper.org] [--now 2026-10-26T09:05:00Z] [--definition <id>=<file.json>]
// --now and --definition are for testing: a different clock, and a local definition in place of the registry's.
//
// A topic's cadence (docs/prds/v2.1.3-cadence.md):
//   "cadence": { "runs_per_day": 1, "from": "05:00", "timezone": "America/New_York", "note": "..." }
// Its run times start at `from` and are spaced evenly across the day (24 / runs_per_day hours apart);
// times past midnight are dropped. A topic is due when today's runs that are ok, degraded or still
// running are fewer than the run times already passed. "Today" is the date in the cadence's timezone.
// A topic whose cadence is prose, or has no runs_per_day, is due at every fire (the behavior before v2.1.3).
// A run left "running" for more than two hours is treated as abandoned and does not count.
//
// Prints JSON: {now, due: [ids], skip: [{id, reason}]}. Deterministic: no model, no judgment.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const ca = process.env.NODE_EXTRA_CA_CERTS || process.env.SSL_CERT_FILE || process.env.CURL_CA_BUNDLE ||
    ["/root/.ccr/ca-bundle.crt", "/etc/ssl/certs/ca-certificates.crt", "/etc/ssl/cert.pem", "/etc/pki/tls/certs/ca-bundle.crt"].find((f) => existsSync(f));
  const env = { ...process.env, NODE_USE_ENV_PROXY: "1", ...(ca ? { NODE_EXTRA_CA_CERTS: ca } : {}) };
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env });
  process.exit(r.status ?? 1);
}

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const host = (process.env.PP_HOST || opt("--host", "https://personalpaper.org")).replace(/\/$/, "");
const now = new Date(opt("--now", new Date().toISOString()));
const override = opt("--definition", "");
const [overrideId, overrideFile] = override ? override.split("=") : [];
const UA = "PersonalPaper/2.1 agent";
const get = async (path) => { const r = await fetch(`${host}${path}`, { headers: { "user-agent": UA, accept: "application/json" } }); if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.json(); };

// Wall-clock date and minutes past midnight of an instant in a timezone.
function local(d, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute };
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const index = await get("/registry/index.json");
const due = [], skip = [];
for (const t of index.topics || []) {
  const def = t.id === overrideId ? JSON.parse(readFileSync(overrideFile, "utf8")) : (await get(`/registry/${t.id}.json`)).definition;
  const c = def?.cadence;
  if (!c || typeof c !== "object" || !c.runs_per_day) { due.push(t.id); continue; }
  const tz = c.timezone || "America/New_York";
  const [h, m] = String(c.from || "00:00").split(":").map(Number);
  const start = h * 60 + (m || 0), step = Math.floor(1440 / c.runs_per_day);
  const times = Array.from({ length: c.runs_per_day }, (_, k) => start + k * step).filter((x) => x < 1440);
  const here = local(now, tz);
  const passed = times.filter((x) => x <= here.minutes).length;
  const { runs = [] } = await get(`/${t.id}/runs.json`);
  const today = runs.filter((r) => {
    if (local(new Date(r.started_at), tz).date !== here.date) return false;
    if (r.status === "ok" || r.status === "degraded") return true;
    return r.status === "running" && now - new Date(r.started_at) < 2 * 3600 * 1000;
  }).length;
  if (today < passed) due.push(t.id);
  else skip.push({ id: t.id, reason: passed === 0 ? `first run time ${hhmm(times[0])} ${tz} not reached` : `${today} of ${passed} run(s) due by now already made today (${times.map(hhmm).join(", ")} ${tz})` });
}
console.log(JSON.stringify({ now: now.toISOString(), due, skip }, null, 2));
