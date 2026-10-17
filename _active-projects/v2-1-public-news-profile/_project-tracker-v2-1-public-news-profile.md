# Project Tracker: v2.1, public global and U.S. news profile

**Owner:** Patrick
**Description:** First release of PersonalPaper v2: the `global-us-news` public profile, nightly unattended run, public reading surface. **Done means** the PRD's four build blocks are complete and its two-week success criteria are met. Design in `_project-plan-v2-1-public-news-profile.md`; the plan is design-time, this tracker is run-time.

## MTG

*PRD is approved with one refinement pass still open (owner, 2026-10-17). Build blocks are not promoted until the owner says go.*

## SFL

- **Personal signals into the editor** (surfaced 2026-10-17, PRD review): implicit (opened stories) or explicit (thumbs up and down) signals the editor ingests, the mechanism by which a private view emerges from the public profile. First question: which signal is cheap to collect on a static reading surface. PRD section 14.
- **Single-source variant** (surfaced 2026-10-17, PRD review): seed the public profile from the Economist alone and let signals shape a private view. Set aside as too much scope for a first release. PRD section 14.
- **Adding agenda sources through profile evolution** (surfaced 2026-10-17, decision 1): a wire service is the first candidate; the discovered-to-agenda ratio in run logs is the evidence. PRD sections 3.2 and 14.
- **Contributor agreement before outside contributions** (surfaced 2026-10-17, decision 2b): needed if a later move from MIT to copyleft stays a live option. PRD section 9.
- **Browser extension for directed surfacing** (from the vision, section 10): the natural form of direction; v2.1 uses a simpler channel.
- **Newsletter inbox as the first source increment** (from the vision, section 9): the v1 Cloudflare email pipeline, reconnected.

## Done

- ✓ 2026-10-17 Project opened from _explorations/2026-10-17-v2-vision/; plan written by reference to the PRD
