# PersonalPaper: Product Vision (v2)

**Owner**: Patrick
**Date**: 2026-10-17
**Status**: Draft 4 for validation; v2.1 built against it. Section 16 appended 2026-10-19 at the owner's direction, recording an evolution of the framing; sections 1 to 15 stand as written. Supersedes the v1 goals in `_explorations/2026-10-17-v2-vision/v1-goals-extraction — Claude — 2026-10.md` where they conflict.
**Inputs**: `docs/product-vision-inputs.txt` (owner's brief), `_explorations/2026-10-17-v2-vision/v1-goals-extraction — Claude — 2026-10.md` (v1 post-mortem), owner's feedback on drafts 1 to 3.
**Naming**: "v2" is the vision. "v2.1" is the initial release built against it.
**Scope of this document**: what the product is and why. System architecture, runtime, storage, and rendering are PRD decisions and are deliberately absent here.

---

## 1. Problem statement

Consuming news matters more than it used to, and the experience of consuming it keeps getting worse. Feeds and aggregators produce volume without judgment: the owner's previous RSS setup yielded 90-page daily PDFs full of duplicates and low-signal items, and the phone-based alternative trades volume for distraction. The stories that matter most to a person with specific professional and personal interests are often not the ones with the widest coverage, and the connection between a story and an interest is frequently indirect (a nutrition-policy change that shifts demand for regeneratively raised protein, for instance). No feed filter makes that connection; an editor who knows the reader does.

v1 of this project proved that an LLM can act as that editor, and it ran daily for five weeks. It also showed what did not work: a fixed feed list biased the selection toward whichever outlets happened to be in it, the selection had no memory so stories repeated, the interest profile was never updated, a print layout engine consumed most of the effort and never shipped, and the scheduled job stopped without anyone noticing.

The problem v2 addresses is therefore: deliver, every morning, the small set of stories that are significant either on their own terms or to a defined set of interests, with summaries linked to sources, with no repeats, from an agent that maintains its own interest profile, runs itself, and can be directed by the owner when the owner finds something the agent could not.

## 2. The one-sentence product

An agent that finds the news stories significant to a defined set of interests, keeps a record of what it found, delivers a short daily edition of summaries linked to sources, and takes direction from the owner between editions.

The central unit is the **story**: one published item, summarized, linked, and filed under the interests it touches. The edition is the day's set of stories, ordered by significance. The archive is every story kept, so the agent does not repeat itself and the owner can look back. Grouping related stories into developments that carry state across days is a later increment, a layer between an interest and its stories that the model leaves room for and v2.1 does not build.

## 3. What changes from v1

| | v1 | v2 |
|---|---|---|
| Core object | Story, selected daily, then forgotten | Story, selected daily, kept in an archive the agent consults |
| Discovery | 75 RSS feeds, fixed, biased to full-text sources | Agent-driven search and fetch, with a profile-derived pointer list |
| Judgment | Four fixed prompts in a Python pipeline | One agent with tools, an editable interest profile, and the archive |
| Interests | 520-line Python file, never updated | A profile the agent proposes changes to, and that evolves with feedback |
| Direction | None; the owner could only edit config | The owner directs the agent: look into this, file this, add this topic |
| Output | 8 to 10 page PDF, two layout engines | Digital summaries linked to sources, no layout engine |
| Operator | Scheduled job that silently stopped | The agent runs itself on a schedule and reports its own failures |
| Sources at launch | Everything at once | A handful, proven, then added one at a time |
| Profiles | One, implicit | One at launch; the model holds several and merges them |

What survives from v1: the problem statement, the interest content itself (the graph is a strong starting profile), the principle that objective significance and personal relevance are judged separately, and the newsletter inbox as a later input.

## 4. Goals

**Primary.** Find and keep track of news items related to developments significant to the defined interests. "Keep track" at launch means record: every story the agent surfaces is filed with its date, source, interests, and summary, and nothing is surfaced twice. Measured by whether, after two weeks of use, the owner can point to stories he learned of through the paper that he would otherwise have missed, and by zero repeats.

**Daily refresh.** Runs unattended between 2am and 3am Eastern, every day. Measured by thirty consecutive editions with no manual intervention, the criterion v1 set and never met.

**Evolve the topics over time.** The interest profile is a living document. The agent proposes additions, deprioritizations, and new watched entities based on what it finds and on the owner's direction. Measured by the profile changing, with a log of why.

**Take direction.** The owner can hand the agent a thing to look into, a document to file, a topic to add, or a freeform instruction, and the next edition reflects it. See section 10.

**Digital, summaries linked to full details.** Each story is a short summary with a link to the source. Reading surface is the iPad mini. No print, no layout engine.

**Incremental sources.** Launch with the smallest source set that demonstrates the concept, then add one source at a time with a reason recorded for each.

**Agent does everything.** Scraper, aggregator, editor, operator, and interface. There is no pipeline code that embodies editorial judgment; there is an agent with tools, a profile, and an archive. Code exists only where the agent needs a deterministic tool.

**Composable profiles.** The product is designed so that more than one profile can exist and a reader's view can be a weighted merge of several. See section 8.

## 5. Non-goals for v2.1

Stated so they are not quietly built. Each is a candidate for a later increment, and several are part of the vision.

- Tracking developments across days: grouping related stories into named threads with status and history. The archive makes this possible later; v2.1 surfaces stories and nothing above them.
- A second profile, public editions, or the merged view. The model accommodates them; v2.1 runs one private profile.
- The browser extension for directed surfacing. v2.1 takes direction through a simpler channel; see section 10.
- PDF output, print layout, typography, photos.
- Full-text access behind paywalls (NYT, Economist). Headlines and subscriber newsletters only at launch; see section 9.
- LinkedIn feed ingestion by any automated means.
- Email newsletter ingestion (the inbox from v1 exists and can be reconnected as the first source increment).
- Evals, model comparisons, cost optimization.

## 6. The concepts

**Profile.** One reader's definition of what matters. It holds interests, watched entities, deprioritized topics, and a weight for each. Seeded from v1's interest graph. The agent may propose edits; the owner approves, or the agent applies and logs, depending on a setting. A profile also determines its own sources (section 9).

**Interest.** A topic the reader cares about. Primary interests are direct. Connected interests are second- and third-order, and each carries the reasoning chain that links it back to a primary interest, because the chain is what lets the agent recognize an indirect story.

**Entity.** A named organization, person, program, or publication that gets a relevance boost when it appears. Entities attach to interests.

**Deprioritized topic.** A topic the agent should skip unless it is tightly coupled to an interest.

**Source.** Anywhere candidate items come from: search queries derived from interests and entities, pointer feeds for publications known to cover them, the newsletter inbox (later), and direction from the owner. Sources belong to a profile.

**Story.** A single published item the agent judged worth surfacing: link, source, published date, headline, a summary of two to four sentences, the interests and entities it touches, the profile it was surfaced for, a significance score on two axes (objective newsworthiness and relevance to the profile), and one or two sentences on why it matters to this reader.

**Archive.** Every story kept, forever. The agent consults it to avoid repeats; the owner browses it to look back.

**View.** A weighted merge of one or more profiles. v2.1 has one view over one profile with weight one.

**Edition.** A view rendered for one day. Two parts, carrying v1's principle: stories significant on their own terms, then stories significant because of the profile, ordered by weight. Directed items appear where their significance places them, marked as directed. A short closing section says what the agent changed in the profile or wants to change, and what it did with any direction received.

**Direction.** An instruction from the owner to the agent: find out more about this, summarize and file this, add this interest, or freeform. Direction is both a source (it yields stories) and a way the profile changes.

**Run log.** What the agent did on each run: sources consulted, candidates considered, stories kept, repeats dropped, direction handled, failures, time and cost. A missing run log is itself a signal.

**Development, reserved.** A named grouping of related stories under an interest that persists across editions with a status and a history. The layer between an interest and its stories. Not built in v2.1; the story record carries enough (interests, dates) to construct it from the archive later.

## 7. How the concepts relate

```
                 ┌───────────────────────────────────────┐
                 │                PROFILE                │
                 │     one reader's definition of        │
                 │           what matters                │
                 ├───────────────────────────────────────┤
                 │  INTERESTS  (primary, connected)      │
                 │     └─ ENTITIES  (watched)            │
                 │  DEPRIORITIZED TOPICS                 │
                 │  weights on each                      │
                 └──────────────┬───────────────┬────────┘
                                │ determines    │ evolves via
                                ▼               │
                 ┌───────────────────────────┐  │
                 │          SOURCES          │  │
                 │  search queries           │  │
                 │  pointer feeds            │  │
                 │  newsletter inbox (later) │  │
                 │  DIRECTION from owner  ◄──┼──┼───────────────┐
                 └──────────────┬────────────┘  │               │
                                │ yield          │               │
                                │ candidates     │               │
                                ▼                │               │
                 ┌───────────────────────────┐   │               │
                 │           AGENT           │   │               │
                 │  scraper → aggregator     │   │               │
                 │          → editor         │───┘               │
                 │  checks ARCHIVE for       │   proposes        │
                 │  repeats                  │   profile edits   │
                 └──────────────┬────────────┘                   │
                                │ keeps                          │
                                ▼                                │
                 ┌───────────────────────────┐                   │
                 │           STORY           │                   │
                 │  link · source · date     │                   │
                 │  summary · why it matters │                   │
                 │  interests & entities     │                   │
                 │  profile surfaced for     │                   │
                 │  score: newsworthiness    │                   │
                 │  score: profile relevance │                   │
                 └───────┬───────────┬───────┘                   │
                 filed in│           │selected into              │
                         ▼           ▼                           │
            ┌─────────────┐    ┌───────────────────────────┐     │
            │   ARCHIVE   │    │           VIEW            │     │
            │ every story │    │  weighted merge of        │     │
            │ ever kept   │    │  profiles                 │     │
            └─────────────┘    │  (v2.1: one profile, 1.0) │     │
                               └──────────────┬────────────┘     │
                                              │ rendered daily   │
                                              ▼                  │
                               ┌───────────────────────────┐     │
                               │          EDITION          │     │
                               │  significant on own terms │     │
                               │  significant to profile   │     │
                               │  directed items           │     │
                               │  profile changes, notes   │     │
                               └──────────────┬────────────┘     │
                                              │ read by          │
                                              ▼                  │
                                        ┌───────────┐            │
                                        │   OWNER   │────────────┘
                                        └───────────┘   gives direction

   Reserved, between INTERESTS and STORY:
                 ┌───────────────────────────┐
                 │   DEVELOPMENT (later)     │   a named group of related
                 │   interest → development  │   stories that persists
                 │              → stories    │   across editions
                 └───────────────────────────┘
```

In words, because the arrows can be read more than one way:

- A profile has many interests, entities, and deprioritized topics, each weighted. Entities hang off interests.
- A profile determines its sources. Sources are not shared across profiles unless two profiles happen to name the same one.
- Sources yield candidates. The agent turns candidates into stories, checking the archive so a story already kept is not kept again.
- A story belongs to exactly one profile (the one it was surfaced for) and touches one or more interests or entities. It carries both significance scores separately.
- The archive holds every story. Nothing leaves it.
- A view is a weighted list of profiles. An edition is one view rendered for one day.
- The owner reads editions and gives direction. Direction enters as a source (it yields stories) and as profile change (it adds or reweights interests).
- The agent proposes profile edits from what it finds; the owner's setting decides whether those apply immediately or wait.
- A development, when built, sits between an interest and the stories under it and persists across editions.

## 8. Stacking: private and public profiles

This is part of the vision and constrains the design of v2.1 without being built in it.

A **profile** is a definition of interests plus the sources that serve them. The owner's private profile is one. Public profiles are others: a general-news profile that aggregates global, national, and local news; industry profiles for regenerative agriculture finance, environmental markets, or energy transition. Each profile produces its own stories through the same agent and the same model.

A **view** is a weighted merge. The owner's morning edition would be the private profile stacked with a general-news profile and one or two industry profiles, ranked by the owner's own weightings. Another reader with the same public profiles and a different private one would get a different edition from largely shared work.

What v2.1 must preserve so this stays possible: each profile is self-contained and nothing assumes there is only one; every story records which profile surfaced it; the two significance axes are stored separately so a merge can reweight them; and an edition is composed from a weighted list of profiles even when that list has one entry.

```
   PROFILE: private (Patrick)   ─── weight 0.5 ──┐
   PROFILE: general news         ─── weight 0.3 ──┼──▶  VIEW  ──▶  EDITION (Patrick's)
   PROFILE: regen ag finance     ─── weight 0.2 ──┘

   PROFILE: private (someone else) ─ weight 0.6 ─┐
   PROFILE: general news           ─ weight 0.4 ─┴──▶  VIEW  ──▶  EDITION (theirs)
```

## 9. Inputs

The owner's brief raises the right question: given what foundation models can now reach through search, are feeds necessary? The answer this vision takes is that **search is the primary discovery mechanism and feeds are pointers**, for three reasons. The interests are already the queries, so an agent searching for each interest and each entity finds stories regardless of which outlet covered them. Feeds only surface what their publisher chose to publish, which is why v1's top stories skewed toward BBC and the Guardian. And search plus fetch reaches the long tail of trade publications, agency releases, and filings that an interest profile like this one depends on, where RSS is often absent.

Feeds remain useful as cheap, deterministic pointer lists for a known source the agent should check every run. They are added as sources, one at a time, with a reason.

**The pointer list is rebuilt from the profile, not inherited from v1.** v1's displayed sources were chosen for one property: free full text, because the PDF needed article bodies. That is why the list is BBC, Guardian, NPR, CNBC, and trade publications with open feeds, and why NYT, WSJ, FT, and the Economist were "signal only." v2 outputs a summary and a link, so a paywalled source is as good a pointer as a free one. The pointer list for v2.1 is therefore derived from the profile: for each primary interest and entity, which sources reliably publish on it, paywalled or not. The NYT, Economist, and FT headline feeds, which need no login, belong on that list on their merits. Summaries of paywalled stories are written from the headline, the feed description, and other coverage of the same event, and the edition says when that is the case.

**Launch sources.** Agent web search and fetch, driven by the profile. Plus the profile-derived pointer list, on the order of five to ten feeds, fixed at PRD time.

**Paywalled subscriptions.** Three realities constrain this. Unattended automated access to a personal subscription is, for most publishers, against their terms, and cookie-based fetching breaks whenever the session expires. NYT and the Economist both publish headline-level feeds that need no login, which serves discovery. Both subscriptions also include email newsletters (NYT Morning, Economist Espresso and The World in Brief), which are the publisher's own sanctioned delivery of subscriber text, and the v1 inbox already ingests them. The path is therefore: headlines via feed now, newsletters via the inbox as the first increment, and full article text only when the owner directs the agent at a specific article from a signed-in browser.

**LinkedIn.** The owner says this is where the most pertinent industry developments and the most prescient trend analysis appear. No feed, no API for reading a personal feed, and automation prohibited by its terms. This is the case that makes directed surfacing (section 10) a first-class mode rather than a workaround: the owner sees the post, and hands it to the agent. LinkedIn newsletters a person subscribes to also arrive by email and can go to the inbox.

**Email newsletters.** Deferred to the first increment, because the inbox exists and reconnecting it is a bounded task once the core loop is proven.

## 10. Two modes of surfacing: scheduled and directed

**Scheduled.** The agent runs on its own every night, searches, selects, writes the edition. This is the mode v1 had.

**Directed.** The owner, while reading anything anywhere, hands the agent an instruction. This mode exists because some of the most valuable content (LinkedIn posts, a signed-in article, a document someone sent) is visible only to the owner, and because the owner's judgment in the moment is a better signal than any profile edit made later. Direction decomposes into a small set of discrete actions, each of which the agent handles on its next run or immediately in a session:

- **Find out more about this.** A link, a name, or a phrase. The agent researches it, writes it up as a story or a short brief, and files it. If it recurs, it proposes a profile entry.
- **Summarize and file this document.** A link or an attached document. The agent summarizes, tags it against the profile, and adds it to the archive and the next edition.
- **Add this topic to my interests.** A topic, entity, or connection, with optional weight. The agent updates the profile and logs the change.
- **Freeform direction.** Anything else: "less of this," "why did this make the cut," "stop checking that source," "from now on, treat X as a signal for Y." The agent interprets, acts, and records what it did.

**The natural form is a browser extension**: a button on any page that sends the link, a selection, and one of the four actions to the agent. That is an increment. v2.1 needs a channel that works at launch; the PRD picks it. The shape of a direction (action, payload, timestamp, origin) is the same whatever the channel, so the extension later adds a front end, not a new concept.

## 11. Output

**Digital, summaries linked to sources, read on an iPad mini.** No print, no layout engine. The edition is the primary artifact; the archive is browsable; both should read well on a tablet without any work from the owner.

**Form of an edition.** Short. Each story gets its headline, source, a two-to-four sentence summary, a link, and where it is not obvious, one line on why it matters to the profile. Stories significant on their own terms come first; stories significant because of the profile follow, grouped by the interest they serve. Directed items appear where their significance places them, marked as directed. An edition is ten minutes of reading that points outward for anything longer.

**The canonical record is agent-native.** Whatever form the archive, profile, and editions take, it should be one the agent reads and writes directly and the owner can inspect and edit without tooling. The specific form, and how it is rendered for reading, are PRD decisions.

## 12. The agent

One agent, five roles.

- **Scraper.** Searches for each interest and entity, fetches candidate pages, pulls pointer feeds, fetches anything the owner directed it to.
- **Aggregator.** Checks candidates against the archive and drops repeats, collapses multiple reports of the same event into one story with the best available source.
- **Editor.** Decides what is significant enough to keep, scores each story on objective newsworthiness and on profile relevance, writes summaries and "why it matters," and orders the edition. Keeps the v1 principle that the two axes are judged separately so that niche interests do not crowd out major news and major news does not crowd out the niche.
- **Operator.** Runs on schedule, writes the run log, publishes the edition, and reports a failed or degraded run in a form the owner will see.
- **Interface.** Receives direction through whatever channel v2.1 adopts, acts on it, and reports back in the edition and the run log.

Where the agent runs, where its state lives, and how the edition is served are architecture questions for the PRD.

## 13. v2.1, in the owner's time budget

Three to four hours. The release is the smallest loop that proves the concept and the format.

1. One profile, seeded from v1's interest graph, and an empty archive.
2. Agent instructions that define the five roles, the record formats, the edition form, and the direction channel.
3. One manual run, reviewed by the owner, corrected, and re-run until the edition reads right.
4. The scheduled, unattended run enabled.
5. The edition readable on the iPad the next morning.

Not in the budget: any input beyond search, fetch, and the pointer list; the browser extension; a second profile. The first increments after launch, in no fixed order: the newsletter inbox, the browser extension, a general-news public profile to prove stacking.

## 14. Success criteria for the first two weeks

- Fourteen consecutive editions produced without the owner touching the runtime.
- The owner reads the edition on most days and can point to stories he would otherwise have missed.
- Zero stories repeated across editions.
- At least one profile change proposed by the agent and accepted by the owner.
- At least one directed item handled end to end through the v2.1 channel.
- Cost per edition recorded in every run log and reviewed once at the end of the period.

## 15. Open questions for the PRD

1. System architecture: where the agent runs, where profile, archive, editions, and run logs live, and how the edition is served to the iPad.
2. Whether the agent applies profile edits itself and logs them, or proposes and waits for approval.
3. The profile-derived pointer list, and the method for deriving it so the same method produces the list for a second profile.
4. The v2.1 direction channel.
5. The shape of the archive.
6. How the owner receives a failure signal from the operator role before notifications exist.
7. Model choice and the cost ceiling per edition.
8. Whether the project is open-sourced, and if so how the private profile stays private.

## 16. Evolution (2026-10-19): one surface for two modes of consumption

Appended at the owner's direction after two days of reading v2.1 editions. It extends the problem statement in section 1 and records where the product may go. It does not change the one-sentence product for v2.1, and it contains no architecture; each incarnation below is a feature with its own PRD when it is taken up.

**The reframing.** PersonalPaper is a way to reclaim attention. Its scope is then a filter on all of the owner's media consumption, with news as the first input. The measure of the product becomes how much of that consumption runs through the paper, and how much of the rest the owner no longer opens. The two-week criterion in section 14, reading the edition in preference to the NYT app for the same ten minutes, is the narrow form of that measure.

**Two modes of consumption.** Media is consumed in two modes. *Directed consumption* asks "what is important in the world today about [x]?" *Undirected consumption* asks "what is interesting or fun?" Platforms are paid for engagement, so most media is trending toward the second mode, and the second mode is where the feeds that trade volume for distraction (section 1) do their work. The owner wants one surface that serves both modes on his own terms. These are modes of consumption; the two modes of surfacing in section 10, scheduled and directed, describe how the agent comes to know what to look for, and either can serve either mode of consumption.

**What the reframing keeps.** The story stays the central unit: a book, a film, a series or a video is a story, and its reviews are its coverage. Sources inform what the agent looks for and never constrain where coverage comes from; for entertainment the agenda role is held by critics, lists and chosen creators rather than news desks. The profile model generalizes without change: categories, agenda sources, a deprioritize list and weights, with the owner's view stacking profiles. Directed surfacing is the capture mechanism for both modes: a friend's recommendation, a found link, "more like this" on something watched.

**What the reframing changes.** The agent becomes a filter as well as an editor. An editor is trusted on what it chose; a filter is also trusted on what it withheld, which is a stronger claim, and the cuts page is the only place the owner can audit it. Success criteria for later releases measure attention reclaimed, time and opens, through the signals the paper can observe: what the owner expands, clicks through to, flags and directs. The one-sentence product in section 2 says "news stories"; whether it generalizes to media items is the open question this section leaves to the owner, and the vision reopens if the sentence changes.

**A personal recommendation algorithm.** Extending scope to entertainment, books and their reviews, film, television and short-form video, means the owner runs a recommender whose objective he writes down in a profile he can read, in place of trusting Netflix, YouTube or another platform whose recommender optimizes for the platform's engagement on behavior observed inside its walls. Three things follow. The signal is thin: a platform sees thousands of implicit signals a month, the paper sees tens, so the result is a critic-led system with the owner's corrections on top, closer to a well-read friend than to a feed, and the design question is how few ratings the owner can give and still get a useful result. Short-form video has no review ecosystem and its value lies in the platform's own ranking, which the paper cannot reach and would not want to reproduce; the paper's move there is substitution, a chosen set of creators on a set cadence, with the platform feed left closed. Film and television carry an availability question a news story does not, where a work is streaming tonight, and a recommendation without that answer sends the owner back through the platform's front door.

**Potential incarnations.** Recorded as possibilities, in no fixed order; each is tracked in the project's SFL and becomes a PRD when taken up.

- *Editions by cadence and mode.* A morning edition for directed consumption, the news. A second daily run, in place since 2026-10-19, for what the afternoon added. A weekend edition for undirected consumption, longer and slower: analysis (the Economist's weekly batch, Stratechery and its kind) and books.
- *Entertainment profiles.* Books, with critics' desks and lists as agenda and reviews as coverage. Film and television, with an availability lookup as part of coverage. Chosen video creators, surfaced on a cadence as the substitute for the platform feed. Each a profile in the registry, stacked under the owner's view by weight.
- *One surface.* The edition page holds both modes with a short surface on top and depth on tap, the fold v2.1 built. Open: whether one page holds both modes or each mode has its own edition on the same surface and cadence.
- *The taste record.* Expands, click-throughs, flags and direction entries as the owner's own signal set, inspectable and editable, the data a recommender needs and the data a platform keeps for itself.
- *The capture point.* The browser extension of section 10, as the way a recommendation or a found item enters from anywhere, including places the agent cannot see.

**Order.** Sign-in and the taste signals first, since an entertainment profile has no value without them (v2.2). Then the weekend edition with analysis and books, which needs no new tooling. Then film and television once an availability lookup exists. Short-form video by substitution whenever a creator list is worth maintaining.

