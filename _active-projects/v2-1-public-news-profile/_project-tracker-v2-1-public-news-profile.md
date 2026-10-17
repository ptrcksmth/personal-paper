# Project Tracker: v2.1, public global and U.S. news profile

**Owner:** Patrick
**Description:** First release of PersonalPaper v2: the `global-us-news` public profile, nightly unattended run, public reading surface. **Done means** the PRD's four build blocks are complete and its two-week success criteria are met. Design in `_project-plan-v2-1-public-news-profile.md`; the plan is design-time, this tracker is run-time.

## MTG

*Build in progress from 2026-10-17 on the owner's go. Steps per PRD section 10.*

- **Step 2: cloud environment** for the routine: network access Custom with the feed hosts; the write token as a network secret for personalpaper.org; connectors removed.
- **Step 3, remaining:** owner reads the first edition on personalpaper.org and gives corrections; a second manual run if the corrections are material.
- **Step 4: nightly routine**, one manual trigger, run log checked for feeds fetched and writes accepted.
- **Step 5: pages** reviewed on the iPad; listing, editions, feed, archive JSON already render from D1.

## SFL

- **Sign-in with GitHub (Google later), flags recorded per user** (owner, 2026-10-17; paired with private profiles in v2.2): OAuth in the Worker with a users table and a flags table keyed by user; the owner's flags stay the eval signal, other readers' flags become reader signals and counts; the owner link and cookie retire. Needs a GitHub OAuth app (client id and secret). Cloudflare Access considered and set aside: free only to 50 users and built for gating, not public sign-in.
- **Weekly flag review** (2026-10-17): after two weeks, count the owner's flags by exit stage and category, and decide which rule or profile setting to change. First step: a session that reads `/<profile>/flags.json` and the cuts records.
- **Images in the edition** (owner, 2026-10-17): preview images from the coverage page's metadata as credited thumbnails with a fallback. Eight of twelve non-paywalled sources returned one on 2026-10-17; four refused the fetch. Needs the agent to record an image URL per story. Layout C has a thumbnail slot ready.
- **Edition increment for multiple runs per day** (owner, 2026-10-17): keep date URLs; add an incrementor when a second edition is produced on the same day.
- **Weekend mode for profiles** (surfaced 2026-10-17, first edition, owner's observation): the Economist's weekly batch is analysis and lands Thursday and Friday; weekend NYT feeds are thin on hard news. A profile could define a weekend edition with fewer stories and analysis welcome. First step: a `cadence` block in the profile schema.
- **One-day hold for same-day agenda stories** (surfaced 2026-10-17, first edition): same-day NYT stories run headline-only because nothing else has covered them; a profile option to hold them a day would trade timeliness for coverage. 10 of 27 stories in the first edition.
- **MCP connector for the hosted environment** (surfaced 2026-10-17, architecture session): expose registry, outputs, and direction as tools with the credential held by claude.ai; documented as possible for routines. First step: when a second kind of agent needs the environment, or the write API grows. PRD sections 8.6 and 14.
- **Self-hosted environment as the private path** (surfaced 2026-10-17): deploying the hosted environment yourself gives private profiles and editions with no auth feature; the owner's v2.2 form. Requires one-command deploy and destinations kept as agent configuration. PRD section 14.
- **Admin write UI** (surfaced 2026-10-17): profile and direction edits through a page instead of the seed script and token. PRD section 14.
- **Personal signals into the editor** (surfaced 2026-10-17, PRD review): implicit (opened stories) or explicit (thumbs up and down) signals the editor ingests, the mechanism by which a private view emerges from the public profile. First question: which signal is cheap to collect on a static reading surface. PRD section 14.
- **Single-source variant** (surfaced 2026-10-17, PRD review): seed the public profile from the Economist alone and let signals shape a private view. Set aside as too much scope for a first release. PRD section 14.
- **Adding agenda sources through profile evolution** (surfaced 2026-10-17, decision 1): a wire service is the first candidate; the discovered-to-agenda ratio in run logs is the evidence. PRD sections 3.2 and 14.
- **Contributor agreement before outside contributions** (surfaced 2026-10-17, decision 2b): needed if a later move from MIT to copyleft stays a live option. PRD section 9.
- **Browser extension for directed surfacing** (from the vision, section 10): the natural form of direction; v2.1 uses a simpler channel.
- **Newsletter inbox as the first source increment** (from the vision, section 9): the v1 Cloudflare email pipeline, reconnected.

## Done

- ✓ 2026-10-17 Layout chosen from three mockups (layout-mockups.html): the scan layout, Lexend, small size. Edition page now renders from story rows: a headed, numbered Top stories block with category kicker and first sentence; table of contents by category; stories as headline plus first sentence, tap to expand; no category chips; no images yet.
- ✓ 2026-10-17 Evals: candidates table; the agent records every candidate's stage and reason; cuts page per edition at /<profile>/<date>/cuts with a flag button (write token kept in the browser); flags.json and flag-handled for the agent; instructions updated to read flags at orient, run current flagged items as directed stories, and treat flag patterns as proposal evidence; tonight's 191 candidates backfilled.
- ✓ 2026-10-17 Owner's first-edition review applied: RSS removed; Top stories block linked to anchors; table of contents per edition; archive index per profile at /<profile>/archive; profile v3 gives Business and Finance and economics up to four stories with the AI build-out, debt loads and market exposure named in scope; coverage brief moved to agent/cover-brief.md; closing-block count corrected.
- ✓ 2026-10-17 Step 3, first edition: agent/instructions.md and agent/editorial-standard.md written; tools fetch_feeds.mjs and pp.mjs; profile v2 (Economist window 7 days); first edition run from this session with 12 Sonnet coverage subagents, 27 stories in 12 categories, live at https://personalpaper.org/global-us-news/2026-10-17; run log closed ok. Lessons folded into the instructions: discovery queries, unfetchable agenda hosts, snippet facts.
- ✓ 2026-10-17 Step 1, hosted environment: D1 `personal-paper` created and seeded; Worker deployed at https://personalpaper.org (custom domain, certificate issued) and personal-paper.patrick-e68.workers.dev; registry reads, authenticated writes (401 without token), idempotent story insert, pages and RSS all verified locally and on the domain; write token in `.secrets/write-token`, gitignored; deploy guide at hosted/deploy.md
- ✓ 2026-10-17 Architecture locked (PRD section 8): agent as cloud routine, hosted environment on personalpaper.org, standalone repository; write path by network secret; diagrams at docs/sysarch-diagrams.html (promoted to docs by the owner 2026-10-17)
- ✓ 2026-10-17 Project opened from _explorations/2026-10-17-v2-vision/; plan written by reference to the PRD
