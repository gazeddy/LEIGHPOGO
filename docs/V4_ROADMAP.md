# LeighPogo V4 Roadmap

## Theme

**V4 = LeighPogo becomes its own Pokemon GO event guide.**

V3 remains the launched production baseline. V4 should reuse existing V3 systems wherever possible and stay focused on native event information, event-driven tools, and shareable social graphics.

## Branch handover

Before active V4 development starts:

- [ ] Finish current raid-boss work on `v3`
- [ ] Test and push the completed V3 raid-boss changes
- [ ] Merge/push the final V3 state to `main`
- [ ] Bring `v4` forward to the new `main` before feature work begins
- [ ] Retire/delete `v3` once `main` is confirmed good

## 1. Native event information

- [ ] Remove LeekDuck event links entirely
- [ ] Make event tickers/cards open native LeighPogo event pages
- [ ] Show event title, dates/times and concise summary
- [ ] Show wild spawns
- [ ] Show raids by tier
- [ ] Show Max Battles where relevant
- [ ] Show egg pools where relevant
- [ ] Show event bonuses/boosts
- [ ] Show research highlights
- [ ] Show special moves/shiny notes where relevant
- [ ] Separate free and ticket-only content clearly

## 2. Structured event dataset

Create a proper event model instead of storing event information as free-form text or external links.

Minimum fields/data:

- [ ] title and slug
- [ ] start/end datetime and timezone handling
- [ ] summary/description
- [ ] lifecycle/status
- [ ] wild-spawn Pokemon references
- [ ] raid Pokemon grouped by tier
- [ ] Max Battle Pokemon
- [ ] egg pools
- [ ] event bonuses
- [ ] research highlights
- [ ] special notes/moves/shiny information
- [ ] free vs ticketed content
- [ ] artwork/banner references
- [ ] draft/published state
- [ ] source/reference metadata

Pokemon should use existing internal Pokemon IDs/data wherever possible so V4 can reuse sprites, names, raid data and future tools.

## 3. Event lifecycle

Support:

- [ ] Draft
- [ ] Announced
- [ ] Upcoming
- [ ] Live
- [ ] Ending Soon
- [ ] Finished/Archived

The site should automatically show/hide or reclassify events as their dates change.

## 4. Admin event editor

- [ ] Create/edit events without code changes
- [ ] Select Pokemon from existing Pokemon data
- [ ] Add/edit structured bonuses and notes
- [ ] Save drafts
- [ ] Preview event page/card
- [ ] Publish/unpublish
- [ ] Update already-published events safely
- [ ] Leave room for assisted import/pre-fill later, but keep manual review available

## 5. Reuse existing V3 systems

Prefer reuse over duplication for:

- [ ] Pokemon sprites/data
- [ ] raid-boss components/data
- [ ] existing card layouts
- [ ] ticker behaviour
- [ ] PWA/mobile UI
- [ ] caching
- [ ] auth/admin patterns
- [ ] notifications
- [ ] navigation

## 6. Event search strings

Where useful, add one-tap Pokemon GO search-string generation for:

- [ ] wild event spawns
- [ ] featured raid Pokemon
- [ ] other event Pokemon collections

## 7. Infographic generation

Generate shareable graphics directly from the same structured event data used by the website.

The renderer should be template/data driven, not generative AI.

- [ ] Event overview infographic
- [ ] Wild-spawn infographic
- [ ] Raid infographic
- [ ] Bonuses/research infographic
- [ ] Teaser graphic
- [ ] Countdown graphic
- [ ] Weekly overview graphic
- [ ] Preview before publish
- [ ] Regenerate when event data changes
- [ ] Cache generated static outputs

Suggested implementation path:

- structured event data -> SVG/layout template -> PNG/WebP output
- render on create/update, not on every page view
- serve cached static images after generation

## 8. Future/upcoming social graphics

Support graphics before an event starts so LeighPogo can post to social channels in advance.

Partial event records must be allowed so an event can produce a teaser before every detail is known.

- [ ] Announced-event teaser
- [ ] Full upcoming-event preview
- [ ] Starts in 7 days
- [ ] Starts in 3 days
- [ ] Starts tomorrow
- [ ] Live now
- [ ] Weekly look-ahead graphic

## 9. Social output sizes

Generate common share formats from the same event dataset/template system:

- [ ] 1080x1350 main social post
- [ ] 1080x1920 story format
- [ ] 1200x630 social/link preview
- [ ] optional square/community-sharing format

## 10. Weekly overview

Generate a reusable weekly graphic from scheduled LeighPogo data showing, where available:

- [ ] week/date range
- [ ] major upcoming/live events
- [ ] raid highlights/rotations
- [ ] event bonuses
- [ ] notable weekly activities
- [ ] local/special events where appropriate

## Scope boundaries

### In scope for V4

- native event cards/pages
- structured event data
- lifecycle handling
- admin event editor
- event search strings
- infographic generation
- future/upcoming social graphics
- weekly overview graphics

### Keep out unless directly required

- unrelated major trade-board work
- unrelated Pokedex expansion
- OCR work unrelated to events
- broad UI rewrites outside the event experience

## Target timeline

### September 2026

- V3 launch support/stabilisation
- finalise V4 schema/design
- prototype native event page/card
- choose infographic renderer

### October 2026

- structured event system
- admin editor
- native event pages/cards
- lifecycle integration
- infographic templates
- upcoming-event previews
- weekly overview generation

### Late October / Early November 2026

- mobile/PWA polish
- template refinement
- publishing/regeneration tests
- feature freeze
- release candidate and production checks

## Target release

**6 November 2026**

Goal: V4 live and stable ahead of GO Wild Area Global on **14-15 November 2026**.

## V4 success criteria

V4 is ready when LeighPogo can:

- [ ] show event information natively without LeekDuck links
- [ ] support upcoming and live events cleanly
- [ ] let admins create/update events without code changes
- [ ] reuse V3 Pokemon and raid systems rather than duplicating them
- [ ] generate useful event search strings
- [ ] generate shareable event infographics from event data
- [ ] generate future-event teasers/countdowns before events start
- [ ] generate weekly look-ahead social graphics
- [ ] run the infographic system comfortably on the existing server hardware
