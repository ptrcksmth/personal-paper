# Project Plan: v2.1, public global and U.S. news profile

**Owner:** Patrick
**Opened:** 2026-10-17 from _explorations/2026-10-17-v2-vision/
**Design-time document.** Run-time state lives in `_project-tracker-v2-1-public-news-profile.md`. When they diverge on intent, amend this plan with a dated `## Amendment (YYYY-MM-DD): reason` block above this header; the body beneath stays for the record.
**Plan of record:** `docs/prds/v2.1-public-news-profile.md`. The PRD is canon and holds scope, sources, the profile, records, edition form, agent instructions, architecture, build plan, decisions, and deferred items. This file says what the directory produces against it and does not restate it.
**What this is:** The first release of PersonalPaper v2: one public profile, `global-us-news`, with the New York Times and the Economist as agenda sources, an edition organized by the Economist's section categories, an unattended nightly run, and a public reading surface.
**Why it exists:** To prove the vision's core loop (agenda, coverage search, edit, publish, archive, no repeats) on the objective-newsworthiness axis alone, before v2.2 adds the owner's private profile and the first weighted view.
**Done means:** The four build blocks in PRD section 10 are complete and the success criteria in PRD section 11 are met over two weeks: fourteen consecutive unattended editions, zero repeats, summaries true to linked coverage, at least one accepted profile proposal, at least one direction handled, cost recorded per run.
**Relationships:** Governed by `docs/product-vision.md`. Succeeded by v2.2 (private profile and view), whose PRD will cite this one. Deferred items from the PRD review are in this tracker's SFL and the root tracker's Someday Maybe.

## Gates

- **G1:** Cloud routine verified: a one-time run fetches a feed and pushes a commit. Unlocks blocks 2 to 4 under architecture option A; failure falls back to option C for the first week.
- **G2:** First edition the owner would read tomorrow, produced in an interactive session. Unlocks the nightly routine.
