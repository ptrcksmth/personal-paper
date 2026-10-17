# Public profiles: personas, functionality, and system architecture

**Project:** v2.1, public global and U.S. news profile
**Author:** Claude, from a working session with Patrick, 2026-10-17
**Status:** Superseded 2026-10-17. Sections 4 and 5 (architecture) are replaced by PRD section 8 and `sysarch-diagrams.html`, which adopt a simpler three-part design: agent, hosted environment, repository. Sections 1 to 3 (the capabilities, the personas, the release matrix) still hold and are the record of how the design was reached. Not canon.

---

## 1. The conflation, named

"Public profiles" bundles six things that have different users, different costs, and different infrastructure. Separating them is most of the design.

| Capability | What it is | Who does it | What it needs |
|---|---|---|---|
| **Author** | Write a profile definition: categories, agenda sources, deprioritize list, description | A profile author | A schema, a place to submit, a review |
| **Run** | Execute the agent against a profile every night and produce an edition, archive entries, and a run log | The operator, or a self-hoster | Compute, an API key, a scheduler, somewhere to write outputs |
| **Publish** | Make editions and archives readable at a stable address, in human and machine form | The operator | Hosting, a site build, per-profile feeds |
| **Browse** | Find profiles, see what they cover, read their editions | A reader | A listing with metadata and a sample edition |
| **Stack** | Compose a personal view from several profiles with weights | A reader with preferences | Either per-reader state on a server, or a client-side merge of public data |
| **Direct and signal** | Tell an agent to look into something; react to a story | A profile owner, later any reader | A write path from the reader back to a specific agent |

The owner's question "PR to the main repo, we review, Cloudflare pulls daily, included for browsing and stacking" is a correct sketch of Author, Run, Publish, and Browse for the hosted case. Stack and Direct are the two that force per-reader state, and they are the ones to design around rather than into.

## 2. Personas

Six, in the order they appear in the product's life. The first three exist in v2.1. The fourth is v2.2. The last two arrive when outside people show up.

**The operator (Patrick, now).** Runs the central instance, pays for its compute, reviews contributed profiles, owns personalpaper.org. Needs: every run visible and cheap to inspect, failures impossible to miss, a cost ceiling per profile, and a contribution process that does not consume evenings.

**The reader.** Opens a public edition most mornings on a phone or tablet. No account, no setup. Needs: a stable URL per profile, a page that scans in a minute and reads in ten, links that work, and a way to be told when a new edition exists (a feed or an email). Does not want to configure anything.

**The profile author.** Has a domain they want covered the way the Economist covers the world: a region, an industry, a beat. Can write a structured file with guidance; may not be a programmer. Needs: a schema with an example, a dry-run so they can see an edition before submitting, a review that says yes or what to fix, and their profile running and listed without them operating anything.

**The private-profile owner (Patrick, v2.2; later anyone).** Has interests they do not want public, and wants a morning view that stacks their private profile over one or more public ones. Needs: their private profile to run somewhere they trust, their view to merge public editions, and the direction channel to reach their own agent. Two ways to serve this persona, and they are the product's main fork in the road: **self-hosting**, where the owner runs a private fork and the central instance never sees their profile, and **hosted private profiles**, a paid tier on personalpaper.org where the operator runs the private profile and the stacked view for them. The first is free and needs no accounts. The second is the revenue path and needs everything accounts imply. Patrick in v2.2 is the self-hoster; the paid tier is designed for, not built.

**The stacker.** A reader who wants two or three public profiles merged by weight, with nothing private. Needs: a way to say "these profiles, these weights" and get one page. Should not need an account.

**The code contributor.** Improves the agent instructions, the tools, the site, the schema. Standard open-source persona. Needs: a readable repository, tests or checks that run on a pull request, and the method's trackers to know what is in flight.

## 3. Functionality by persona and release

| Capability | v2.1 (operator, reader) | v2.2 (private-profile owner) | v2.x (author, stacker, contributor) |
|---|---|---|---|
| Author | Operator writes `global-us-news` by hand | Operator writes a private profile in a private instance | Schema published; PR template; CI validates; dry-run instructions; review checklist |
| Run | One nightly run on the central instance | A second instance (the owner's fork) runs the private profile and reads the public one's outputs | Central instance runs every merged public profile; a cap on count; authors who exceed it self-host |
| Publish | personalpaper.org serves the one profile: edition pages, archive, JSON, RSS | Private instance publishes nowhere, or to a private site | Each public profile gets its path, its feed, and its archive JSON |
| Browse | A one-profile index page | Unchanged | A listing page from profile metadata, with description, categories, cadence, last run status, sample edition |
| Stack | Not built; the edition reads from a one-entry weighted list | The private agent merges public archive JSON into its own edition by weight, in the owner's own instance | Client-side merge in the browser from public JSON, weights in the URL, no account. Hosted private stacking is the paid tier (section 4.4) |
| Direct and signal | Owner appends to a file in the repository | Owner directs their own instance's agent the same way | Public reader signals deferred until there is an account; per-reader state is the gate |

## 4. System architecture

### 4.1 Shape

```
                      contributors                       readers
                           │ PR                              │ HTTPS
                           ▼                                 ▼
   ┌──────────────────────────────────┐        ┌─────────────────────────────┐
   │  GitHub: ptrcksmth/personal-paper│        │  personalpaper.org          │
   │  canon + profiles + outputs      │ deploy │  Cloudflare Pages           │
   │  profiles/<id>/profile.yaml      │───────▶│  built from site/ on every  │
   │  profiles/<id>/editions/*.md     │ on push│  push; serves               │
   │  profiles/<id>/archive/*.json    │        │  /<profile>/   latest       │
   │  profiles/<id>/runs/*.md         │        │  /<profile>/YYYY-MM-DD      │
   │  agent/ tools/ site/             │        │  /<profile>/feed.xml        │
   └──────────────┬───────────────────┘        │  /<profile>/archive.json    │
                  ▲ commit + push               │  /           listing        │
                  │                             └─────────────────────────────┘
   ┌──────────────┴───────────────────┐
   │  Runner (nightly, 06:00 UTC)     │
   │  checks out repo, for each       │
   │  public profile: runs the agent  │
   │  (agent/instructions.md), writes │
   │  edition, archive, run log       │
   └──────────────────────────────────┘

   Private instance (v2.2): a fork with the same runner, a private profile,
   and a view file; its agent reads public /<profile>/archive.json over HTTPS
   and merges by weight. Publishes to its own private site or nowhere.
```

**The repository is the system of record.** Profiles, editions, archives, and run logs are files. The runner writes them; the site renders them; readers and other instances consume the JSON. There is no database until a persona needs per-reader state.

**The site is static and builds on push.** Cloudflare Pages connects to the GitHub repository and deploys on every commit, so "Cloudflare pulls the repo daily" becomes "the runner's nightly push triggers a deploy." Custom domain personalpaper.org, which the owner already holds on Cloudflare. The build step is a small generator in `site/` that turns each profile's markdown and JSON into HTML pages, one RSS feed per profile, and a listing from profile metadata. GitHub Pages would also work; Cloudflare Pages is chosen because the domain and account exist and the Email Worker from v1 lives there, which matters for direction later.

**The runner is the one place with a model and a key.** For v2.1 it is the Claude Code cloud routine decided in the PRD. The routine's prompt is "check out the repo, follow `agent/instructions.md` for every profile under `profiles/` whose visibility is public, commit, push." One routine, looping, rather than one per profile, because the cron minimum is an hour and the loop keeps scheduling in one place. The alternative runner, when contributors want to see runs or the operator wants runs independent of a personal account, is a GitHub Actions workflow on a schedule running an Agent SDK script with the API key as a repository secret. The records and the site do not change between the two; only the thing that executes the instructions does. A Cloudflare Worker on a cron trigger calling the Claude API is a third option with the same property.

**Stacking has two implementations, and neither needs a server.** For the private-profile owner, the agent in their instance fetches the public profiles' archive JSON and merges by the weights in their view file; this is server-side in the sense that an agent does it, but the server is theirs. For a public stacker, a page on the site merges archive JSON in the browser from weights in the URL, so a stacked view is a shareable link and the central instance stores nothing per reader.

**Direction is a write path to one agent.** In v2.1 it is a file in the repository. When a browser extension or an email path arrives, the v1 Email Worker on Cloudflare is the natural receiver: it already accepts mail at `inbox.personalpaper.org` and writes to KV, and the runner can read KV at the start of a run. Public readers do not get direction; profile owners do.

### 4.2 Contribution flow for public profiles

1. Author copies `profiles/_template/profile.yaml`, fills it in, and runs the dry-run instructions locally (an interactive Claude Code session against their fork is enough) to see a sample edition.
2. Author opens a pull request adding `profiles/<id>/profile.yaml` and a sample edition.
3. CI validates the schema, checks that agenda feeds respond, and rejects a profile that names an individual or a private matter.
4. Operator reviews against a short checklist: is the domain clear, are the agenda sources legitimate and reachable, is the deprioritize list sane, is the description honest, does the sample edition read like news.
5. Merge. The next nightly run includes the profile; the next deploy lists it.
6. The operator sets a cap on hosted profiles (cost is roughly linear in count) and states it in the contribution guide. Beyond the cap, authors self-host from a fork and may ask to be listed as external.

### 4.3 What the free, public architecture does not do, and why

- **No accounts.** Every per-reader feature (signals, saved views, private profiles on the central instance) needs identity and state, and with them a database, auth, billing, abuse handling, and privacy obligations. The self-hosted instance absorbs the private case for free; URL-encoded weights absorb public stacking. Accounts arrive with the paid tier, and nowhere else.
- **No private profiles on the free central instance.** A private profile on the operator's instance makes the operator a custodian of someone's interests. That custodianship is the thing a paying customer buys; it is not something the free tier gives away.
- **No layout engine.** The site is a template over markdown. v1 spent its effort here and shipped nothing.

### 4.4 Hosted private profiles and stacking as a paid tier

The owner's framing: stacking a private profile over public ones is the feature people would pay for, and the alternative is to let them self-host. Both are true, and the architecture above supports both without a rewrite, because the unit of work is a profile directory and the unit of output is an archive JSON.

**What the paid tier adds**, and nothing else does: an account (identity, auth, billing), a private store per customer (their profile, their view weights, their editions and archive, their direction inbox), a runner that executes each customer's private profile nightly on the operator's key and bills for it, and a private page per customer that renders their stacked view. Public profiles stay exactly as they are and become the shared substrate every paid view draws on. The operator becomes custodian of customers' interests, with the privacy and security obligations that implies.

**What the self-hosted path offers instead**: a fork, the same runner on the customer's own key and schedule, their private profile and view in their own repository, and their agent fetching public archive JSON from personalpaper.org. No account, no billing, no custodianship. The operator's cost is zero. The customer's cost is running an instance.

**Why the records design matters here.** A hosted private profile is a profile directory in a private store instead of a public repository. A hosted view is a weights file plus a merge the agent already does for the self-hoster. A hosted direction inbox is the same file behind auth. The paid tier is therefore infrastructure (accounts, store, billing, per-customer runner) wrapped around records and an agent that already exist, which is the right order: prove the agent and the records on public profiles and one self-hosted private profile, then add the wrapper when there is someone to pay for it.

**Sequencing.** v2.1 public profile. v2.2 Patrick's private profile, self-hosted, proving the stacking merge. v2.x contributors and public stacking. The paid tier after that, when the self-hosted path has shown that people want private stacking and found self-hosting too much work. The decision the owner makes now is only that the paid tier is a goal, so that nothing in v2.1 or v2.2 closes the door: no per-reader state in the free site, archive JSON as the exchange format, the view defined as a weights file over profile ids.

## 5. Consequences for the v2.1 PRD

- Section 8.3, repository layout: add `site/` as the Cloudflare Pages source with a generator, and `profiles/_template/`. Editions written as markdown plus a JSON archive entry per story, because the JSON is what stacking consumes.
- Section 10, block 4: Cloudflare Pages at personalpaper.org replaces GitHub Pages. Same effort; the domain exists.
- Section 5, records: the archive entry is JSON, one file per day, in addition to the markdown edition. The story record already has the fields.
- Section 9: add the contribution flow summary and the hosted-profile cap as a policy the operator sets.
- Section 14 (deferred): client-side stacking page; CI schema validation; the Email Worker as a direction receiver.
- Nothing in v2.1's build changes in kind. The runner, the records, and the site are the same three things; the architecture above is what they grow into.

## 6. Decisions this asks of the owner

1. Cloudflare Pages at personalpaper.org as the v2.1 reading surface, in place of GitHub Pages.
2. Archive entries as JSON alongside the markdown edition from day one, so stacking has data to consume.
3. v2.2's shape: the owner's private profile runs in a private fork, as the first self-hosted instance, and the merge it performs is the one the paid tier will later run centrally.
5. That hosted private profiles and stacking are the intended paid tier, deferred until after v2.x, with the free tier kept free of per-reader state so the door stays open.
4. A hosted-profile cap, as a number the contribution guide states. A starting figure to react to: ten.
