#!/usr/bin/env node
// Client for the hosted environment. The agent uses this instead of hand-building requests.
//
// Reads (no auth):
//   node agent/tools/pp.mjs profile   <id>                      -> definition + version
//   node agent/tools/pp.mjs archive   <id> [--days 14]          -> recent stories
//   node agent/tools/pp.mjs direction <id> [--unhandled]        -> direction entries
//   node agent/tools/pp.mjs runs      <id>                      -> recent run logs
//   node agent/tools/pp.mjs flags     <id> [--unhandled]        -> candidates the owner flagged "should have run"
//   node agent/tools/pp.mjs cuts      <id> <date>               -> the candidate record for an edition
// Writes (auth: WRITE_TOKEN env var if set; otherwise none is sent, and the cloud environment's
//         network secret is expected to add it):
//   node agent/tools/pp.mjs run-open  <file.json>   {id, profile_id, profile_version, started_at}
//   node agent/tools/pp.mjs run-close <id> <file.json>  {ended_at, status, log, cost_usd}
//   node agent/tools/pp.mjs stories   <file.json>   {stories: [...]}
//   node agent/tools/pp.mjs edition   <file.json>   {profile_id, date, run_id, today, body_md, closing}
//   node agent/tools/pp.mjs handled   <direction-id> <file.json>  {result}
//   node agent/tools/pp.mjs put-profile <id> <file.json>  {definition, note}
//   node agent/tools/pp.mjs candidates <file.json>  {candidates: [...]}   every candidate with its stage and reason
//   node agent/tools/pp.mjs flag-handled <candidate-id> <file.json>  {result}
//
// Host: PP_HOST env var or --host, default https://personalpaper.org. Prints the JSON response.

import { readFileSync } from "node:fs";

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


const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const flag = (name) => args.includes(name);
const pos = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && args[i - 1] !== "--unhandled"));
const [cmd, a1, a2] = pos;
const host = (process.env.PP_HOST || opt("--host", "https://personalpaper.org")).replace(/\/$/, "");
const token = process.env.WRITE_TOKEN;

async function call(method, path, body) {
  const headers = { "user-agent": "PersonalPaper/2.1 agent", accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token && (method === "POST" || method === "PATCH")) headers["authorization"] = `Bearer ${token}`;
  const res = await fetch(`${host}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) { console.error(`${method} ${path} -> HTTP ${res.status}`); console.error(JSON.stringify(data, null, 2)); process.exit(1); }
  console.log(JSON.stringify(data, null, 2));
}
const load = (f) => JSON.parse(readFileSync(f, "utf8"));

switch (cmd) {
  case "profile":   await call("GET", `/registry/${a1}.json`); break;
  case "archive":   await call("GET", `/${a1}/archive.json?days=${opt("--days", "14")}`); break;
  case "direction": await call("GET", `/${a1}/direction.json${flag("--unhandled") ? "?unhandled=1" : ""}`); break;
  case "runs":      await call("GET", `/${a1}/runs.json`); break;
  case "flags":     await call("GET", `/${a1}/flags.json${flag("--unhandled") ? "?unhandled=1" : ""}`); break;
  case "cuts":      await call("GET", `/${a1}/${a2}/cuts.json`); break;
  case "candidates": await call("POST", `/api/candidates`, load(a1)); break;
  case "flag-handled": await call("POST", `/api/candidates/${a1}/flag-handled`, load(a2)); break;
  case "run-open":  await call("POST", `/api/runs`, load(a1)); break;
  case "run-close": await call("PATCH", `/api/runs/${encodeURIComponent(a1)}`, load(a2)); break;
  case "stories":   await call("POST", `/api/stories`, load(a1)); break;
  case "edition":   await call("POST", `/api/editions`, load(a1)); break;
  case "handled":   await call("POST", `/api/direction/${a1}/handled`, load(a2)); break;
  case "put-profile": await call("POST", `/api/profiles/${a1}`, load(a2)); break;
  default:
    console.error("unknown command; see the header of this file"); process.exit(2);
}
