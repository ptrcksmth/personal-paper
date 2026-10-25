# Defining a topic

How to add a topic to a PersonalPaper deployment: from a stated scope to a registered definition the routine runs. Written 2026-10-23 from the second topic, `climate-physical-risk`, and the first, `global-us-news`, under the title "Defining a topic"; renamed 2026-10-25 in v2.1.1, when the system's "profile" and this guide's "topic" both became "topic" (`docs/prds/v2.1.1-topic.md`).

A topic is a JSON definition in the registry. Nothing else is needed: the agent reads every public definition in the registry index on each run, the Worker renders pages for any registered id, and the routine runs on its own schedule for all of them. Defining one is a research task and a writing task, with one POST at the end.

## 1. State the scope

Write down, in a sentence or two each, before looking for a single feed:

- **The categories.** Three to twelve names a reader would scan. Each becomes a section with its own id. The general topic uses the Economist's sections; the climate topic uses the owner's three concerns.
- **The story kinds**, if the topic has more than one. The climate topic runs direct impacts and projections in every category, and the definition says so in the category notes so the editor looks for both.
- **Geography and emphasis.** Where the reader wants depth, and what is out of scope.
- **Visibility and cadence.** Only public topics exist today, and all of them run on the shared routine (05:05 and 17:05 Eastern; the later run is the edition, earlier runs fold). A cadence of its own is a system change.

Open a project directory in the working drive for the work (`_active-projects/<slug>/` with a plan and tracker); the research document and the decisions live there.

## 2. Research the sources

The agent only sees what feeds carry. Web-search discovery was retired on 2026-10-17, so a story reaches the editor only through a feed in the definition, a direction entry, or a flag. The source list is the topic.

**Gather candidates** by category: the desks that cover the subject, the trade and regional press, the agencies and institutes that publish the primary documents, the research journals, and search-based feeds (Google News RSS) as a last resort. Guess feed URLs from the common patterns (`/feed/`, `/rss`, `/rss.xml`, `?format=rss`, a journal's `.rss`) and expect half to be wrong.

**Probe every URL** and record, per feed: HTTP status; item count; items in the last seven days; newest item date; the median length of the description text. Fifty URLs take a minute in parallel. The climate research probed 84 and found 40 live. The probe script from that research is in the project's source document; it is a candidate for `agent/tools/`.

**Test readability** of one current article per host with `node agent/tools/fetch_page.mjs <url>`. A host that returns a page with text is readable; a 403, a Cloudflare challenge, or a teaser of a few hundred characters is not. This decides whether a desk's stories can run from read coverage or only headline-only, and it feeds the fetchability list in `agent/cover-brief.md`.

**Read the numbers for three things.** Volume: the sum of items a week across the proposed list, against the general topic's 600 a run, says whether the cadence has material and whether a high-volume feed will flood a category. Description length: under 150 characters is a headline and a clause, 300 to 700 is a paragraph, over 2,000 is full text; a topic whose desks carry paragraphs can run well from feeds alone. Recency: a feed whose newest item is months old is dead even if it returns 200.

**Name the gaps.** Sources with no feed, feeds that are dead, hosts that block. Say what would fill each (a newsletter, a page the tool could fetch on a schedule, a desk that reports on the primary source) so the gap is a decision rather than an omission.

**Write it up** as `sources — <author> — YYYY-MM.md` in the project folder: a table per category with feed, items a week, description length, readability, proposed role and the reason; then the gaps; then the decisions the owner has to make. The climate research is the model.

## 3. Assign roles and windows

Every source in the definition has a role and a window.

- **agenda**: sets what is significant. The editor ranks from these desks' judgment. Choose the few desks whose editorial judgment on the subject the reader would trust; five to nine feeds across three to seven publishers is the range so far.
- **signal**: corroborates, widens the aperture, and carries the specialist and research material. Items are candidates like any other. A story only a signal feed surfaced is the measure of what the agenda missed, and the cuts page tallies it per source, which is the evidence for promoting a signal to agenda later.
- **agenda_only_digest**: a flag on a feed that is a weekly digest (the Economist's "The world this week"); read for the agenda, never a category.

**window_hours** is how far back the feed tool looks. Use 48 for daily desks, 72 for a source that publishes a few times a week, 168 for weeklies and journals, 336 for monthly or occasional sources such as attribution studies and temperature reports. A feed with no dates (NBER's) is treated as entirely inside the window; say so in its note and rely on the archive check for repeats.

Give each source a **note** saying why it is there and what the editor should know (volume, what to deprioritize, readability). The notes are read by the agent and by the next person to edit the definition.

## 4. Write the definition

Create `hosted/topics/<id>.json`. The id is the URL slug (`/<id>/<date>`) and must match the path it is posted to. Copy the shape from an existing definition; the fields and what the agent does with them:

| Field | What it is |
|---|---|
| `id`, `name`, `visibility`, `maintainer`, `description` | Identity. `description` is the listing-page blurb and the share card's text |
| `cadence` | Prose for the reader and the agent; the routine's schedule is set outside the definition |
| `edition_size` | Prose rule, for example "2 to 4 stories per category; a category with nothing significant is omitted" |
| `categories[]` | `id`, `name`, `weight` (1.0 at launch; exists for later reweighting), optional `max_stories` |
| `category_notes[]` | Prose the editor reads before assigning categories: story kinds, how feeds map to categories, anything about the shape |
| `category_scope_notes{}` | Per category id, what belongs and what outranks what. The most-read field; write it carefully |
| `entities[]` | Watched entities; empty so far |
| `deprioritize[]` | What to leave out. Derive it from the feeds chosen: every broad feed brings a kind of noise, and this list names it |
| `agenda_sources[]` | Every source, agenda and signal alike, with `publisher`, `role`, `window_hours`, `feeds[]` (`name`, `url`, optional `agenda_only_digest`) and `note` |
| `coverage` | `search: "unconstrained"`, `prefer: ["complete","authoritative","accessible"]`, `mark_subscriber_links: true`, `discovery_per_category: false` |
| `editorial` | `two_axes: true`, `summary_length`, `summary_rule`, `mark_thin_summaries: true`. Add subject-specific rules to `summary_rule` (the climate topic says to keep numbers and their sources) |
| `evolution` | `mode: "propose"`: the agent proposes definition changes in the run's closing block and never edits |
| `source_roles{}` | Prose definitions of agenda and signal for this topic, naming the desks |

Two habits from the first two definitions. Record decisions and dates inside the definition's notes, since the definition is versioned and the notes travel with it. And when a decision was taken as a default pending the owner, say so in `category_notes`, so the next version has a list to work from.

Validate before posting: the JSON parses; `id` matches the filename and the path; every id in `category_scope_notes` is a category; every feed URL was live in the probe.

## 5. Register it

```
# wrap the definition; the route expects {"definition": {...}, "note": "..."}
python3 -I -c "import json; json.dump({'definition': json.load(open('hosted/topics/<id>.json')), 'note': 'first version'}, open('out/body.json','w'))"
WRITE_TOKEN=$(cat .secrets/write-token) node agent/tools/pp.mjs put-topic <id> out/body.json
# the same as: curl -X POST https://personalpaper.org/api/topics/<id> with the token as a bearer header
# -> {"id": "<id>", "version": 1, "changed": true}
```

Posting the same definition again returns `changed: false`; posting a changed one creates the next version, and the version number goes into every run record and edition. Then check:

```
curl https://personalpaper.org/registry/index.json      # the topic is listed
curl https://personalpaper.org/registry/<id>.json       # the definition, with its version
```

The listing page at `/` shows it at once. Its own pages return 404 until the first edition exists.

Rebuild the seed file so a fresh deployment carries the topic: `node hosted/seed/build-seed.mjs` regenerates `hosted/seed/seed.sql` from every JSON in `hosted/topics/`. Commit the JSON and the seed together.

## 6. The first edition and after

The agent runs every topic in the index only when the run is not given a list, and the routine's prompt is such a list: it named `global-us-news` alone until 2026-10-23, when the second topic's first fire skipped it. The prompt now says every topic in the registry index, one after another, each with its own run record, so a new topic joins the next scheduled fire with no routine change. The first edition appears at `/<id>/<date>`, with its cuts page at `/<id>/<date>/cuts` showing every candidate and the stage it left at, and the per-source tally at the foot.

To produce a first edition on demand, do not fire the whole routine: the edition table is keyed by topic and date, so a second run of an established topic the same day overwrites its edition with one built after the day's stories were dropped as repeats. Create a one-time routine on the same cloud environment instead, with the standard prompt amended to name the new topic only, and clear the connectors it attaches by default (the production routine runs with none).

Read the first editions against three questions: did the deprioritize list hold (what noise got through, from which feed); did each category carry what the scope notes asked for (both story kinds, the right emphasis); and what did the signal feeds surface that the agenda missed. The agent's proposals in each run's closing block answer some of this on their own. Each change is an edit to the JSON and a POST, producing the next version.

If the definition needs something the system does not have (a feed role for pages without feeds, a cadence of its own, search-based discovery, private visibility), that is a system change with its own PRD under `docs/prds/`, and the topic runs without it in the meantime.

## 7. Record it

In the working drive: the project's tracker records the registration and version in Done, the defaults taken in the root tracker's SFL, and the owner's review as MTG items as they arise. The source research stays in the project folder until the project closes, when it graduates to a topical home. The definition itself lives in the repository and the registry, and is the plan of record for the topic.
