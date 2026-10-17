# Deploying the hosted environment

The hosted environment is one Cloudflare Worker with a D1 database. It serves the registry (public reads), accepts run outputs (authenticated writes), stores everything, and renders pages and feeds. Anyone can deploy their own from this repository; personalpaper.org is the maintainer's deployment of the same code.

## Prerequisites

- Node 20 or later and npm.
- A Cloudflare account. The free plan is enough.
- Optionally, a domain on that account. Without one, the Worker is served at `https://<name>.<account>.workers.dev`.

## First deploy

```bash
npm install
npx wrangler login                                  # opens a browser; stores a token outside the repo
npx wrangler d1 create personal-paper               # prints a database_id
```

Put the printed `database_id` into `wrangler.toml` under `[[d1_databases]]`. If you have a domain on the account, set it in `routes`; otherwise delete the `routes` block.

```bash
npm run db:remote                                   # schema + seed into the remote database
npx wrangler deploy                                 # deploys; with a custom domain, also creates the DNS record and certificate
openssl rand -hex 32 | npx wrangler secret put WRITE_TOKEN   # the token agents use to write
```

Keep the token somewhere outside the repository. Agents send it as `Authorization: Bearer <token>` on every write. For a Claude Code cloud routine, store it as a network secret on the routine's cloud environment for your host, so the agent never sees it.

The certificate for a custom domain can take a few minutes after the first deploy. Plain HTTP answers immediately; HTTPS follows.

## Verify

```bash
curl https://<host>/registry/index.json             # lists public profiles
curl https://<host>/registry/global-us-news.json    # the sample profile, with its version
curl -X POST https://<host>/api/runs                # 401 without the token
```

## Local development

```bash
printf 'WRITE_TOKEN=local-dev-token\n' > .dev.vars  # gitignored
npm run db:local                                    # schema + seed into a local SQLite-backed D1
npm run dev                                         # http://127.0.0.1:8787
```

`npx wrangler d1 execute personal-paper --local --command "select id, current_version from profiles"` queries the local database; add `--remote` for the deployed one.

## Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/registry/index.json` | no | public profiles with latest edition and last run status |
| GET | `/registry/<id>.json` | no | a profile's current definition and version |
| GET | `/registry/<id>/versions` | no | version history |
| POST | `/api/profiles/<id>` | yes | write a definition; creates a new version if it changed |
| POST | `/api/runs` | yes | open a run |
| PATCH | `/api/runs/<id>` | yes | close a run with status, log, cost |
| POST | `/api/stories` | yes | insert stories (idempotent by id) |
| POST | `/api/editions` | yes | write or replace the day's edition |
| POST | `/api/direction` | yes | add a direction entry |
| POST | `/api/direction/<id>/handled` | yes | mark it handled with a result |
| GET | `/<profile>/archive.json?days=14` | no | recent stories, for repeat checks and stacking |
| GET | `/<profile>/direction.json?unhandled=1` | no | direction entries |
| GET | `/<profile>/runs.json` | no | recent run logs |
| GET | `/`, `/<profile>`, `/<profile>/<date>`, `/<profile>/feed.xml` | no | pages and RSS |

## Private profiles

Not in this release. A deployment of your own is private by construction if you keep its address to yourself; put Cloudflare Access in front of it if you want a login. Rows carry `owner` and `visibility` columns so a later release can add authenticated private profiles without a migration.
