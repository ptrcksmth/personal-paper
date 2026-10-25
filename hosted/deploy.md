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
openssl rand -hex 24 | npx wrangler secret put OWNER_KEY     # the owner's flagging key (see the cuts page section)
```

Keep the token somewhere outside the repository. Agents send it as `Authorization: Bearer <token>` on every write. For a Claude Code cloud routine, store it as a network secret on the routine's cloud environment for your host, so the agent never sees it.

The certificate for a custom domain can take a few minutes after the first deploy. Plain HTTP answers immediately; HTTPS follows.

## Verify

```bash
curl https://<host>/registry/index.json             # lists public topics
curl https://<host>/registry/global-us-news.json    # the sample topic, with its version
curl -X POST https://<host>/api/runs                # 401 without the token
```

## Local development

```bash
printf 'WRITE_TOKEN=local-dev-token\n' > .dev.vars  # gitignored
npm run db:local                                    # schema + seed into a local SQLite-backed D1
npm run dev                                         # http://127.0.0.1:8787
```

`npx wrangler d1 execute personal-paper --local --command "select id, current_version from topics"` queries the local database; add `--remote` for the deployed one.

## Upgrading an existing database

`hosted/schema.sql` describes a fresh database. A database created by an earlier release is brought forward by the files in `hosted/migrations/`, each applied once, in date order, local first:

```bash
npx wrangler d1 export personal-paper --remote --output backup.sql             # a copy first
npx wrangler d1 execute personal-paper --local  --file hosted/migrations/<file>.sql
npx wrangler d1 execute personal-paper --remote --file hosted/migrations/<file>.sql
npx wrangler deploy                                                            # the code that expects the new shape
```

Deploy the Worker in the same minute as the remote migration, and outside the window of any scheduled run, so no run writes to a Worker that disagrees with its database.

| Migration | Release | What it does |
|---|---|---|
| `2026-10-25-topic.sql` | v2.1.1 | renames `profiles` to `topics`, `profile_versions` to `topic_versions`, and `profile_id`, `profile_version` to `topic_id`, `topic_version` in every table; rows do not move |
| `2026-10-25-subtopic.sql` | v2.1.2 | renames `category` to `subtopic` in `stories` and `candidates`; rows do not move |

## Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/registry/index.json` | no | public topics with latest edition and last run status |
| GET | `/registry/<id>.json` | no | a topic's current definition and version |
| GET | `/registry/<id>/versions` | no | version history |
| POST | `/api/topics/<id>` | yes | write a definition; creates a new version if it changed |
| POST | `/api/runs` | yes | open a run |
| PATCH | `/api/runs/<id>` | yes | close a run with status, log, cost |
| POST | `/api/stories` | yes | insert stories (idempotent by id) |
| POST | `/api/editions` | yes | write or replace the day's edition |
| POST | `/api/direction` | yes | add a direction entry |
| POST | `/api/direction/<id>/handled` | yes | mark it handled with a result |
| GET | `/<topic>/archive.json?days=14` | no | recent stories, for repeat checks and stacking |
| GET | `/<topic>/direction.json?unhandled=1` | no | direction entries |
| GET | `/<topic>/runs.json` | no | recent run logs |
| POST | `/api/candidates` | yes | the candidate record for a run: every item with its stage and reason (idempotent by run and ref) |
| POST | `/api/candidates/<id>/flag` | yes | the owner flags a candidate "should have run" (`{"flag": false}` clears it) |
| POST | `/api/candidates/<id>/flag-handled` | yes | the agent records what it did with a flag |
| GET | `/<topic>/flags.json?unhandled=1` | no | flagged candidates |
| GET | `/<topic>/<date>/cuts.json` | no | the candidate record for an edition |
| GET | `/`, `/<topic>`, `/<topic>/<date>`, `/<topic>/<date>/cuts`, `/<topic>/archive` | no | listing, latest edition, dated edition, the cuts page, archive index |

## The cuts page and flags

Every edition has a cuts page at `/<topic>/<date>/cuts`: every candidate the agent considered, grouped by the stage it left at, with the agent's one-line reason. The owner flags anything that should have run with one click. Flagging is authorized by an owner cookie: set a second secret, `OWNER_KEY`, and open `https://<host>/owner?k=<OWNER_KEY>` once on each device you flag from. That sets a one-year HttpOnly cookie; the key never appears in page links. Treat the link as a password; rotating the secret invalidates every device. The agent reads unhandled flags at the start of each run, runs a flagged item as a directed story if it is still current, and treats patterns in flags as evidence for topic proposals.

## Private topics

Not in this release. A deployment of your own is private by construction if you keep its address to yourself; put Cloudflare Access in front of it if you want a login. Rows carry `owner` and `visibility` columns so a later release can add authenticated private topics without a migration.
