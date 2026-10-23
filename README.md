# PersonalPaper

**A news editor just for you:** an agent that collects news from sources you define, finds the best coverage for each story, and writes a short daily edition. Transparent about what it found, kept, and featured, showing everything it considered and what it cut.

Personal Paper has intelligent defaults with an expanding list of public news feeds, starting with World and U.S. news seeded by headlines from the Economist, the NY Times and the Wall Street Journal, with the BBC, NPR, the Guardian, Al Jazeera and the FT as signal feeds. Read it at **[personalpaper.org](https://personalpaper.org)**.

It's designed for anyone to define their own sources, and to then publish your news publicly or privately in your own hosting environment.

## Why

News matters more than it used to and the experience of reading it keeps getting worse. Feeds deliver volume without judgment. Aggregators rank by what everyone else is clicking. The stories that matter most to a person with real interests are often the ones with the least coverage, and the connection between a story and an interest is frequently indirect: a nutrition-policy change that shifts demand for regeneratively raised protein, a court ruling that reprices a market. No keyword filter makes that connection. An editor who knows the reader does.

PersonalPaper puts an editor between you and the firehose, and makes the editor accountable:

- **It reads the agenda, not just the feed.** Trusted publications say what is significant today. The agent then searches freely for the most complete, authoritative, and accessible coverage of each story, which is often not where it first appeared.
- **It writes, in its own words, from what it read.** Two to four sentences per story, true to the coverage it links, self-sufficient for a reader who opens no link at all. Subscriber-only links are marked. A story written from a headline alone says so.
- **It remembers.** Every story is kept. Nothing runs twice unless there is a new fact.
- **It shows its work.** Every edition has a cuts page: every candidate the editor considered, grouped by the stage it left at, with the reason. Flag what should have run. The editor reads the flags before its next run.
- **It takes direction.** Tell it to look into something, to file a document, or to add an interest, and the next edition reflects it.
- **It proposes, you decide.** The editor suggests changes to what it covers, with evidence. The profile changes only when its owner says so.

A **profile** is a definition of what matters: categories, the publications that set the agenda, what to deprioritize, and the editorial rules. Public profiles live in a registry anyone can read. Private profiles, stacking several profiles into one personal view, and sign-in are the next releases.

## How it works

Three parts. The repository is the product; personalpaper.org is one deployment of it.

| Part | What it is | Where |
|---|---|---|
| **Agent** | A user-delegated run of `agent/instructions.md`: pulls a profile from a registry, gathers the agenda, finds and reads coverage, edits, publishes, records every decision. Runs nightly. Holds no state between runs. | Any Claude Code session or routine, with the instructions as its prompt |
| **Hosted environment** | Serves the profile registry, accepts the agent's outputs behind a token, stores stories, editions, run logs, candidate records and flags, and renders the pages. | One Cloudflare Worker with a D1 database: `hosted/` |
| **Repository** | The instructions, the editorial standard, the tools, the environment's code, schema, and seed profile. Standalone: anyone can run the agent or deploy their own environment. | This repository, MIT |

The nightly run, in order: orient (profile, the last fourteen days of stories, direction, flags), handle direction, gather the agenda feeds, aggregate (collapse duplicates, categorize, drop repeats and deprioritized items, shortlist), cover (search for and read the best coverage, in parallel), edit (score on two axes, select, write), reflect (proposals), publish, report. `docs/sysarch-diagrams.html` draws it; `docs/prds/v2.1-public-news-profile.md` specifies it.

The two scores on every story are deliberate. **Newsworthiness** is the story's consequence on its own terms. **Relevance** is its fit to the profile. They are never folded together, so that a later view can reweight one without losing the other, which is what stacking a private profile over public ones will need.

## Use it

**Read.** Open a profile at personalpaper.org. The profile's root is always the latest edition; dated editions and an archive sit beneath it; each edition has a cuts page. Share a link and the preview carries the day's top three headlines.

**Run the agent yourself.** Clone this repository and, in a Claude Code session, say: *follow `agent/instructions.md` for the profile `global-us-news`*. The agent reads the registry at personalpaper.org, runs, and writes its outputs there if it has the write token, or to an environment of your own. A nightly schedule is a Claude Code routine with the same prompt.

```bash
npm install
node agent/tools/fetch_feeds.mjs global-us-news        # the agenda, as the agent sees it
node agent/tools/pp.mjs profile global-us-news         # the profile definition and version
node agent/tools/pp.mjs archive global-us-news         # the last fourteen days of stories
```

**Deploy your own environment.** `hosted/deploy.md` walks through it: one database, one Worker, one command, on a free Cloudflare account. Point your agent's registry and output at it. A deployment of your own is private by construction if you keep its address to yourself.

**Define a profile.** `hosted/seed/global-us-news.json` is the shape: categories with weights, agenda sources with feeds, a deprioritize list, coverage preferences, editorial rules, and an evolution mode. A contribution path for public profiles is planned; for now, deploy your own environment and seed it.

## Repository

```
agent/
  instructions.md         what a run does, step by step (the product)
  editorial-standard.md   what the judgment means in practice
  cover-brief.md          the brief for coverage subagents
  tools/                  deterministic helpers: feed fetch, page fetch, environment client
hosted/
  worker/index.js         the Cloudflare Worker: registry, write API, pages, share cards
  schema.sql              the tables
  seed/                   the sample profile and the seed builder
  deploy.md               deploy, verify, develop locally
docs/
  product-vision.md       what this is and why
  prds/                   one PRD per release
  sysarch-diagrams.html   the architecture, drawn
```

## Status

v2.1, the first release against the vision: one public profile, a nightly agent, a hosted environment at personalpaper.org, the cuts page, and owner flags. The first edition ran on 2026-10-17. Next: sign-in with flags per reader, private profiles, and stacking.

PersonalPaper v1 (January to February 2026) was a Python pipeline that turned about seventy-five RSS feeds into a daily PDF through two LLM editorial passes. It ran for five weeks and is deprecated; `docs/product-vision.md` records what carried over.

## License

MIT. Editions and the archive are the agent's own summaries, with attribution and a link to the coverage each was written from, and carry the same license.

The PersonalPaper name, the wordmark and the mark are not covered by the license. A deployment of your own should replace the favicon set in `hosted/public/`, the wordmark in `hosted/worker/index.js`, and the name in the registry.
