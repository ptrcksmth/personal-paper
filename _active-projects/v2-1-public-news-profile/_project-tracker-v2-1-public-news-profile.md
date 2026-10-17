# Project Tracker: v2.1, public global and U.S. news profile

**Owner:** Patrick
**Description:** First release of PersonalPaper v2: the `global-us-news` public profile, nightly unattended run, public reading surface. **Done means** the PRD's four build blocks are complete and its two-week success criteria are met. Design in `_project-plan-v2-1-public-news-profile.md`; the plan is design-time, this tracker is run-time.

## MTG

*Build in progress from 2026-10-17 on the owner's go. Steps per PRD section 10.*

- **Step 2: cloud environment** for the routine: network access Custom with the feed hosts; the write token as a network secret for personalpaper.org; connectors removed.
- **Step 3: agent instructions** and the editorial standard; first manual edition from a laptop session; corrected and re-run.
- **Step 4: nightly routine**, one manual trigger, run log checked for feeds fetched and writes accepted.
- **Step 5: pages** reviewed on the iPad; listing, editions, feed, archive JSON already render from D1.

## SFL

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

- ✓ 2026-10-17 Step 1, hosted environment: D1 `personal-paper` created and seeded; Worker deployed at https://personalpaper.org (custom domain, certificate issued) and personal-paper.patrick-e68.workers.dev; registry reads, authenticated writes (401 without token), idempotent story insert, pages and RSS all verified locally and on the domain; write token in `.secrets/write-token`, gitignored; deploy guide at hosted/deploy.md
- ✓ 2026-10-17 Architecture locked (PRD section 8): agent as cloud routine, hosted environment on personalpaper.org, standalone repository; write path by network secret; diagrams at sysarch-diagrams.html
- ✓ 2026-10-17 Project opened from _explorations/2026-10-17-v2-vision/; plan written by reference to the PRD
