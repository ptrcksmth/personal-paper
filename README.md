# personal-paper: working drive

An agent that finds the news stories significant to a defined set of interests, keeps a record of what it found, and delivers a daily edition of summaries linked to sources. Any session or collaborator working here should read this file first, then `_active-projects/_project-tracker-root.md` for what is currently in flight.

## Directory map

- **_active-projects/**: the primary working area. Time-bounded project spaces, each carrying its plan and tracker. See lifecycle below. Everything outside it and `_explorations/` is repository.
- **_explorations/**: unscoped activity. Transcripts, brainstorms, riffs, threads that are not yet work. One dated directory per exploration (`YYYY-MM-DD-topic-slug`). No plan, no tracker, no definition of done. See `_explorations/_readme.md`.
- **_active-projects/_archive/** and **_explorations/_archive/**: concluded material kept for the record, held beside the live work it came from so it stays visible to anyone working here.
- **docs/**: Canon for the product: the product vision, the owner's founding brief, and the PRD series (one per release).

## Conventions

**Meta naming.** The underscore prefix marks what is not canon, files and directories both: meta files (orientation, tracking, closing records) and the non-canonical directories (`_active-projects/`, `_explorations/`, `_archive/`). They sort to the top of listings and are read before content. Unprefixed directories are the canonical corpus, repositories of settled artifacts that later work cites. Two exceptions keep canonical names because tooling depends on them: `README.md` in git repositories and `CLAUDE.md`.

**The two classes of live activity.** Both are underscored, because neither is canon. They differ on whether the work has a scope.

- **Scoped**, in `_active-projects/`. Time-bounded work with a stated destination. Every directory carries a plan and a tracker, and the plan requirement is the intentionality constraint: no folder without a definition of the work. A project can be finished, and finishing it is the point.
- **Unscoped**, in `_explorations/`. Open thinking with no destination yet. No plan, no tracker, no definition of done, because there is nothing yet to define. An exploration can sit unfinished forever without that being a loose end.

The boundary between them is intent, never size or seriousness. An exploration that produces intent opens a project, and the exploration stays put as the record of how the project got its shape. Canon is the third state, and it is not a class of activity at all. Material becomes canonical by graduating out of either class into a topical folder, at which point it stops being live and starts being cited.

**Movement between the three is expected in both directions.** The usual direction is exploration, then project, then canon. But the classes describe what a piece of work currently is; they are not rungs on a ladder. A project whose destination dissolves goes back to `_explorations/` as open thinking. Canon reopens when a canonical entry fails in use or the evidence under it moves. Record the move and the reason wherever the work lives; there is no ceremony beyond that.

**Plans and trackers carry a project designator:** `_project-plan-[project].md`, `_project-tracker-[project].md`. Sub-projects follow the same rule: a directory nested inside a project that warrants its own pair carries it under its own designator, and the parent tracker holds a pointer bullet in place of task detail.

**Project plans.** Opening a project directory requires writing its plan first. The plan is design-time, the tracker is run-time; when they diverge on intent, amend the plan with a dated amendment block at its top. External plans of record (a statement of work, a brief held elsewhere) satisfy the requirement by reference.

**Project trackers.** One `_project-tracker-[project].md` per project directory, plus `_project-tracker-root.md` in `_active-projects/`. Three sections: **MTG** (More to Go: active items), **SFL** (Save it for Later: intended but out of current scope), **Done** (completed, date-stamped `✓ YYYY-MM-DD`, newest first). The root tracker adds a fourth, **Someday Maybe**, possibilities noted without commitment, deletable without ceremony. The root tracker lists projects; project trackers list tasks. Each tracker opens with a header: name, owner, description, and at project level what done means. Rules of the road: capture anywhere, triage weekly (misfiled beats unfiled); sessions add surfaced items to SFL or Someday Maybe by default, promotion to MTG is Patrick's; the tracker holds state, the plan holds design.

**Project lifecycle.** Work happens in `_active-projects/`; knowledge lives in topical folders. A project opens as a bullet in the root tracker's MTG plus a directory with a plan and tracker, accumulates drafts and scratch freely while active (deprecated working documents go to a `_superseded/` subdirectory), and at close its durable outputs graduate to their permanent topical homes. The graduation test: would a future session look for this document without knowing the project folder existed? Then it moves. The emptied project folder moves to `_active-projects/_archive/`, and the root bullet moves to Done. Explorations close the same way: durable outputs graduate, live working documents move to the project that succeeded them, and what remains moves to `_explorations/_archive/` with a closing record (`_closing-record — YYYY-MM-DD.md`) saying where everything went.

**Topical filing.** Content is filed by what it is about, never by who made it. Authored work carries authorship in the filename: `topic — author — YYYY-MM`.

**Outputs.** Session outputs land in the relevant project folder, the topical folder for standalone knowledge work, or a dated directory in `_explorations/` for open thinking, never at the root. Canonical documents are read-only references unless the task is explicitly their revision.

## Key documents

The load-bearing documents a new session should know exist. Read the one that matches the task; do not reconstruct what is already written here.

- **The product vision (v2)**: `docs/product-vision.md`. What the product is and why: problem statement, concepts and how they relate, stacking, inputs, the two surfacing modes, the agent's roles, non-goals, and the open questions handed to each PRD. Deliberately contains no architecture. Read before any product or release work; it governs every PRD.
- **The owner's founding brief**: `docs/product-vision-inputs.txt`. Patrick's own account of the new direction, written 2026-10-17 before the v2 vision existed: goals, agent role, inputs, output, project structure. Owner-authored; sessions read it and never edit it. Read when a question about intent is not settled by the vision.
- **PRD: v2.1, public global and U.S. news profile**: `docs/prds/v2.1-public-news-profile.md`. The first release against the vision: scope, agenda sources and coverage, the profile, records, edition form, agent instructions, system architecture, build plan, decisions, and deferred items. Read before any work on the v2.1 project; it is that project's plan of record.
- **System architecture diagrams**: `docs/sysarch-diagrams.html`. The three-part architecture drawn: components and data flows, one nightly run step by step, the write path, the data model, build order, and deferred items. Read alongside PRD section 8; open in a browser.

## Prior work

PersonalPaper v1 (January to February 2026) was a Python pipeline that turned about 75 RSS feeds and forwarded newsletters into a daily PDF through two LLM editorial passes. It ran daily for five weeks. It is deprecated and lives outside this repository as a private local archive; its post-mortem is in `_explorations/2026-10-17-v2-vision/`, and the vision's "What changes from v1" table records what carried over.
