# PersonalPaper: Goals Extraction (v1 post-mortem)

**Date**: 2026-10-17
**Location note (2026-10-17)**: Written inside the v1 repository, which is now the private local archive `../personal-paper-v1/`. File paths named below (`personalpaper.py`, `config/`, `docs/`, `context/`, `out/`) are relative to that archive, not to this drive.
**Purpose**: Reconstruct what v1 was trying to do, what it actually did, and what is undecided, as the input to a new product vision and PRD. v1 is deprecated; nothing here commits the rebuild to any v1 decision.

Sources read: CLAUDE.md, docs/architecture.md, docs/architecture-sketch.txt, docs/marketing_copy.txt, docs/personal-paper-todos.txt, docs/prds/*, context/session_*.md, config/feeds.py, config/interest_graph.py, the Pass 1 and Pass 2 prompts in personalpaper.py, and the last generated edition (out/personalpaper_20260221_1134.pdf).

---

## 1. What v1 was, in one paragraph

A Python script, run by cron on a Mac mini at 7am weekdays and 9am weekends, that pulled roughly 75 RSS feeds plus forwarded email newsletters, asked Claude twice to pick about 15 stories (first for objective newsworthiness, then for personal relevance against a hand-written interest graph), fetched full text for the picks, and rendered an 8 to 10 page PDF styled like a newspaper. It cost about $0.20 per edition.

## 2. The problem statements, as written at the time

These are the motivations recorded in docs/architecture.md and docs/marketing_copy.txt. They are the candidates for "objectives that should remain."

1. **Volume and duplication.** The prior RSS-to-PDF setup produced 90+ page PDFs with heavy duplication and low-signal stories.
2. **Reduce phone-based news consumption.** The PDF was a deliberate choice of a finite, print-like artifact over a feed.
3. **Editorial judgment that understands non-obvious relevance.** The example given: RFK nutrition policy leads to ancestral health leads to regenerative protein demand. A keyword filter cannot make that connection.
4. **Objective news must not be crowded out by niche interests.** The original single-pass design biased the top stories toward the interest graph and missed objectively important news. This is why the two-pass split exists.
5. **"Intentional news reading" / "deshittifying news."** The marketing copy frames consuming news as more important than ever while the experience gets worse. It promises Top Stories plus Your Feed, sourced from RSS and any newsletter you forward.

## 3. Goals that were implicit in the work, not written as goals

These show up in decisions and session notes rather than in a goals list. Each is a candidate to keep, drop, or restate.

- **Full stories, not click-through summaries.** Decided explicitly on 2026-01-18 when the `summary_only` treatment was removed. The layout v2 design then reintroduced short summaries on the front two pages with full text in a "Full Coverage" back section. The two positions were never reconciled.
- **Preserve the original writer's voice for newsletters.** The NYT Morning essay is rendered as written, with images and captions. A "Today's Reads" section preserving the best newsletter writing was planned and not built.
- **Newspaper aesthetics matter.** Serif body text, masthead, visual hierarchy, lead photo, 2x2 grids. Two layout engines were built in pursuit of this. The first (ReportLab) was abandoned for layout limitations; the second (PlutoPrint, Jinja2, two more LLM passes) was completed to the test-flag stage and never wired into production.
- **Zero manual intervention.** The layout PRD's success criterion was "works for 30 consecutive days without manual intervention."
- **Cost ceiling.** About $0.20 per edition in production, with a stated tolerance up to $0.50 for the four-pass version.
- **Fast iteration.** The SQLite cache exists so a layout or prompt change can be tested in 15 seconds instead of 3 minutes.
- **Trust the editor for some sources.** Tier 3 sources (Tennis.com, NYT Morning) bypass all LLM judgment and always appear.
- **Mandated personal sections.** Tennis is the only Tier 3 feed. It is also listed under "deprioritize: sports coverage" in the interest graph, which the Tier 3 bypass is designed to override.

## 4. Backlog that never shipped (from todos and architecture.md)

Grouped by what they imply about unmet needs.

**Cross-edition memory**
- Do not repeat stories already included in previous editions.
- Tighter date range (today and yesterday only).
- Reference prior editions to highlight developing personal-interest threads.
- Trend tracking across days.

**Feedback and interest-graph maintenance**
- Feedback loop to refine or add to the interest graph.
- Capture interest signals while browsing (browser plugin: "oh, this is of interest").
- Evals comparing models on editorial tasks.

**More inputs**
- Additional newsletters: NYT Climate, DealBook, Bloomberg, Architectural Record, Matt Levine, Atlantic, Economist.
- One-off articles pushed while browsing (save-for-later).
- Paywalled access (NYT, WSJ, Economist) via credentials.
- Use newsletters (Tier 3) to inform clustering, not just as mandated sections.
- Alternative viewpoints (FOX named).

**Output variants**
- Weekend edition: longer essays from the week, identified by the agent and stored for later.
- Summary page: list of stories plus an Opus summary of the day and why it matters to you (this item was deleted from the todo file at some point after the Jan 21 commit).
- Photos and layouts (the layout v2 work).

**Engineering hygiene (all deferred)**
- Refactor the 3,433-line monolith into editorial / layout / content / pdf modules.
- Hosted environment, makefile, tests, type hints, pre-commit, log rotation, cache clearing.

**Product ambitions beyond one user**
- Multi-user KV schema. The email infrastructure already uses a `{name}-{token}@inbox.personalpaper.org` pattern. The domain personalpaper.org is registered.
- Multiple forwarding addresses per user.

## 5. What actually happened in production

- Editions were generated daily from 2026-01-14 to 2026-02-21, roughly 60 PDFs in `out/`.
- Every production edition used the original ReportLab renderer. The layout v2 pipeline (inventory, slot assignment, summaries, PlutoPrint) exists in `lib/` behind `--test-*` flags and was never integrated. Phase 5 (validation) and Phase 6 (production integration) in docs/prds/ai-layout-v2.md are "Not Started."
- No crontab is installed on this machine. The architecture doc describes the cron on a Mac mini; either that is a different machine or the schedule was removed.
- The SQLite cache is 365 MB with no clearing policy.
- The last edition (2026-02-21, 8 pages) shows two quality problems visible without any tooling. The lead story's body includes BBC's "this breaking news story is being updated... please refresh the page" boilerplate. The third-ranked top story is a UK royal-family item, which suggests Pass 1's "coverage breadth" signal is skewed by the Tier 2 mix being heavy on BBC and Guardian.
- Pass 1's prompt hard-codes example clusters from January 2026 (Venezuela, Greenland, ICE). That text would need maintenance to stay neutral.

## 6. Architectural commitments that constrain a rebuild if kept

Each of these is a v1 decision, not a requirement. Listed so the vision step can accept or reject them explicitly.

| v1 decision | What it bought | What it cost |
|---|---|---|
| Three-tier feed system | Paywalled sources contribute signal without being displayed | Stories with no Tier 2 source are silently dropped; the user noted this as a judgment problem |
| Two LLM passes with disjoint candidate sets | Objective news is not crowded out | Pass 2 never sees the top-story clusters, so it cannot add a personal angle to a major story |
| Hand-written Python interest graph (~520 lines) | Rich second-order relevance | Nobody maintained it; no feedback path |
| PDF as the artifact | Finite, print-like, off-phone | Two layout engines; neither reached production quality |
| Cloudflare Email Worker + KV for newsletters | Any newsletter can be forwarded; multi-user ready | Only one newsletter was ever parsed (NYT Morning), with a bespoke HTML parser |
| SQLite raw-response cache | 15-second iteration | 365 MB, no retention policy |
| Cron on a Mac mini | Free | Fragile; stopped |

## 7. Open questions for the vision step

These are the decisions that change what gets built. They are stated as questions, not recommendations.

1. **What does "an agent can run it" mean?** Three readings, not exclusive: (a) the agent is the editor, exercising judgment with tools and memory instead of a fixed four-prompt pipeline; (b) the agent is the operator, running a scheduled job, noticing broken feeds and quality regressions, and fixing them; (c) the agent is the interface, taking feedback like "more of this," "save for the weekend," "why did you pick this."
2. **Is the artifact still a PDF newspaper?** The original motivation was off-phone reading. Did the PDF get read, on what device, and did it reduce phone use?
3. **Full stories or summaries plus links?** Two contradictory decisions exist in the record.
4. **Did the objective/personal split earn its keep?** Did Top Stories ever surface something you would otherwise have missed, and did Your Beat ever surface something non-obvious?
5. **Is the interest graph still accurate, and should it be maintained by hand or learned?**
6. **Newsletters: was NYT Morning the real daily value, and is the Cloudflare email pipeline worth keeping?**
7. **One user or a product?** The domain, marketing copy, and multi-user address scheme point at a product. Everything built points at a personal tool.
8. **Where does it run?** Mac mini cron, a cloud scheduled agent, or something else.
9. **What is the cost and cadence envelope?** $0.20 per day was fine; is $2 per day fine if the output is materially better?
