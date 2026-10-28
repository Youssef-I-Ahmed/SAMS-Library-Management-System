# SAMS Living Library — Visual Design Handoff v2

> Checkpoint scope — 28 October 2026: C2 retains this design documentation and
> one canonical set of the six reference PNGs under `assets/`. Source ZIPs,
> supplementary screenshots, audit proposals and generated evidence remain
> local-only outside the checkpoint; no upload or remote reviewer access is
> claimed. AI/chat/avatar and cover sections below are historical proposals,
> not work implemented or authorized by this checkpoint.

**Date:** 24 October 2026  
**Scope:** SAMS Library System visual design only. This document is not evidence of live deployment, stock correctness, or production authorization.  
**Status:** Provisional design approval (not pixel-perfect sign-off). Prepared for review in the separate Codex/Sprint 10 conversation.  
**Budget rule:** $0 personal spend; evaluate actual tool licensing and public deployment conditions before adopting any dependency/service.

## 1. Executive design direction

**Concept D: SAMS Living Library** — *Modern Editorial + restrained Cinematic Motion + dedicated intelligent assistant.*

Create a believable, premium university library website that feels like the real Sadat Academy for Management Sciences, **not** a fantasy-game website or an animation showcase. Impress through polish, authentic institutional imagery, typography, small meaningful motion, and a distinctive AI character **only inside the chat interface**. The librarian/management workspaces must remain fast, practical, and calm.

### Non-negotiable decisions
- **Less clutter**: the busy initial landing mockup was rejected. Favor whitespace and clear hierarchy.
- **Imagery**: use verified existing SAMS campus/academy photos in the released Hero and brand sections, subject to their provenance and use rights. Existing generated concept depictions must not be presented as genuine campus photography.
- **Brand**: use the official supplied shield logo and existing navy identity, not a generated replacement.
- **Avatar scope**: Knowledge Spirit appears **only in the SAMS AI chat experience**, not in Landing hero, book catalog, item details, global navigation, or dashboards. A landing AI teaser can show abstract book imagery without the avatar.
- **No unverified stock**: demo/synthetic counts, generated mockup numbers, and RAG snapshot counts must not be displayed as verified physical availability.
- **No automatic site-wide 3D**: add Motion/scroll effects only where they improve usability and quality.
- **Languages/accessibility**: English and Arabic with correct RTL/LTR, keyboard/focus support, responsive mobile, and reduced-motion fallback.
- **Zero recurring personal expenses**: prefer native React/CSS/SVG/Web Animations for character movement. Do not subscribe to Rive, Higgsfield, paid asset sites, hosted render services or premium component libraries for this work.

## 2. Provisional approval ledger

| Deliverable | Review status | Attached illustration |
|---|---|---|
| Overall Concept D | Selected direction | — |
| Landing V3, realistic academy-photo direction | Provisionally accepted | `assets/01-landing-v3.png` |
| Book Discovery | Provisionally accepted | `assets/02-book-discovery.png` |
| Book Details | Provisionally accepted | `assets/03-book-details.png` |
| AI Chat Interface V2 | Provisionally accepted; content and proportions can be refined | `assets/04-ai-chat-v2.png` |
| Knowledge Spirit Concept C | Selected character direction | `assets/05-knowledge-spirit-sheet.png` |
| SAMS shield on cap + compact cloak badge | Visual direction accepted; use authorized logo assets at implementation | `assets/05-knowledge-spirit-sheet.png` |
| Knowledge Spirit animation storyboard v1 | Provisionally accepted | `assets/06-animation-storyboard.png` |
| Librarian/Management premium polish | Not individually designed or approved yet | — |
| Pixel dimensions, final copy, final motion assets | Not finalized | — |

**The concept images are VISUAL REFERENCES, not reliable sources of book records, counts, contact information, exact logos, software capabilities or application assets.** Text in generated images may be wrong or garbled. Use the repository's product copy and validated data in the implementation.

## 3. Existing project contract: extend, don't rewrite

Source audit checkpoint supplied by the user: branch `dev`, HEAD `ef3dbdc779c2513c377ba449636c52643d7d2064` at time of audit, **not independently reverified in this chat**. Worktree reportedly had 2 modified tracked and 52 untracked files. Preserve all existing work. Codex recovery verification is a parallel activity.

Known implemented pages and flows from the audit:
- Student Home: `apps/web/src/pages/student/StudentHomePage.jsx`.
- Discovery Catalog: `apps/web/src/pages/student/CatalogPage.jsx` (API-backed search, facets, sorting, paging, loading/errors).
- Item Details: `apps/web/src/pages/student/ItemDetailsPage.jsx` (metadata, availability, reservation panel).
- Librarian catalog, copies, visits, student directory and circulation screens exist; visually polish them later, rather than rebuilding.
- Supplied RAG/FastAPI implementation exists in an untracked local `RAG/` package, **not currently integrated into a SAMS React chat route**.

**Do not start modifying the repo on the basis of this file alone.** Wait for the recovery check and explicit implementation approval in the Codex conversation.

## 4. Visual system (seed, not final tokens)

- **Brand navy** `#0B2F57` (prior design-system baseline); use deep navy/charcoal for navigation/footer/AI accents.
- **Surfaces**: warm white and ivory, very light borders, subtle shadows, generous whitespace.
- **Accent**: muted gold/champagne for tiny editorial flourishes and limited CTA details, never as a competing primary color.
- **Type**: high-quality English editorial serif for large display headings; modern sans serif for interface text; Arabic typography treated as a first-class design, not mechanically copied from English serif styles.
- **Components**: precise rounded search bars, restrained outlined chips, book tiles with readable metadata, verified/unverified stock status, obvious primary CTA.
- **Motion**: tasteful scroll reveals, small hover depth, transition of book cover to details **if technically appropriate**; avoid constant effects on staff forms and dashboards.
- **Responsive**: small-screen legibility, touch controls, sensible stacked book/result layouts; no dependence on hover-only information.
- **Accessibility**: `prefers-reduced-motion`, contrast, semantic headings, keyboard/tab/focus, loading states and alternate static imagery.

No extra UI, motion, or 3D package is yet mandatory. Pick the least complex freely deployable solution compatible with the existing React/Vite project.

## 5. Screen-specific design direction

### 5.1 Landing (concept)
- Real academy campus photo with restrained overlay and short editorial headline **“Knowledge Today, A Brighter Tomorrow”** (final copy to confirm with institution).
- Immediate prominent search entry; primary routes to Books, Projects & Theses and AI.
- Editorial featured-collection cards, brief experience/highlights section, separate elegant AI teaser (no Knowledge Spirit here), institutional footer.
- Subtle hero media movement and title reveal, with still-image/reduced-motion option.
- Never publish invented counts, phone numbers, opening hours or source-cover images as institutional facts.
- Distinguish marketing landing from logged-in Student Home route. Codex must verify route ownership and where a public landing can be added without weakening auth.

### 5.2 Book Discovery
- Clear query field, relevant search chips, efficient desktop filters/mobile drawer, sorts, pagination and grid/list layouts appropriate to current endpoint capabilities.
- Show cover if genuinely matched to an edition/ISBN; otherwise use a consistent attractive branded placeholder. Respect cover-source license/API rules.
- Book cards prioritise title, contributor, year, category and trustworthy status; avoid tiny text and crowded metadata.
- Support real server loading, empty, no-results, failure and retry states; do not present imagined live results.
- Improvements are design and usability changes around the **existing API-backed CatalogPage**.

### 5.3 Book Details
- Cover + bibliographic metadata, sections for summary/contributors and branch/copy availability, reservation action if actually authorized and policy permits.
- Ensure visible distinctions: bibliographic item versus physical copy, branch/shelf versus verified holdings, actual versus synthetic/demo availability.
- Related books should use a real supported source or be clearly excluded until available; no fake reviews/table-of-contents/features.
- Maintain idempotency, RBAC and existing reservation rules.

### 5.4 AI Chat Interface V2
- The center of gravity is **conversation and validated book-result cards**, not an oversized mascot.
- Knowledge Spirit lives in the chat page. Desktop may show a modest dedicated character zone; mobile shifts to a small presence without obscuring content or input.
- Arabic/English direction follows message content; input and book metadata are readable in both scripts.
- Book suggestions point to verified SAMS LibraryItem URLs. Cards should convey unavailable/unverified/unknown stock honestly. No default invented 'Available' tags.
- Proper loading/error/retry/reset, session owner isolation, and helpful no-match alternatives.
- No fabricated tool response, pretend citations, fake streaming/progress, or claims of real-time stock unless checked against live DB.

## 6. Knowledge Spirit original character

**Selected: Concept C, Knowledge Spirit** — a friendly small floating academic guide with dark navy academic cap, elegant cloak, cool-blue expressive eyes, off-white highlights, fine golden trim, a book and restrained knowledge sparks.

**Academy identity:** authorized shield mark on the cap, with a smaller simplified mark on the cloak pin, provided it remains readable and visually uncluttered. Refer to user-supplied mark PNGs rather than regenerating a new crest for implementation.

**Exclusivity:** avatar is an AI-chat-only visual component.

**Motion state machine, provisional:**

| State | Trigger / meaning | Visual cue | End condition |
|---|---|---|---|
| `idle` | No active assistant request | Quiet float, blink, subtle cape/book | Enter active query |
| `searching` | Actual retrieval/process started | Lean forward, reading pages, small search accent | Phase detail changes or response finishes |
| `thinking` | Backend provides a distinct thinking/preparing stage, or a UI-neutral working phase | Calm focused expression, soft page/spark | Response resolves; **do not pretend to know an unavailable backend phase** |
| `success` | Valid answer/result presented | Smile, brief subtle accent, cue towards content | Return to idle after a short completion cue |
| `no_results` | Verified no matching records | Friendly gesture, optional question mark and alternate query suggestions | User follows up / return idle |

**Additional essential state:** `error` for network/backend failure, with respectful retry affordance. `pending` is a transport/backend state; map to a truthful neutral working animation rather than fabricated completion percentage.

Animation guidance: short easing transitions (~200–400ms for UI changes), very gentle continuous idle, brief celebratory effect for success, no endless or intrusive flashes. Motion should be disableable and replaceable by still poses on reduced-motion/mobile power limits.

## 7. AI backend contracts and integrity

Reported supplied FastAPI contract (implementation still requires verification):
- `POST /api/ask` accepts question, optional session ID and filters.
- `GET /api/jobs/{job_id}` polls pending jobs.
- `GET /api/books/{book_code}` supplies a source catalog record.
- `POST /api/session/reset` resets a conversation.
- `GET /api/health` supports readiness/status.

`/api/ask` may return `done`, `pending`, or even body-status `error` with HTTP 200. Node/Express must inspect body status and enforce SAMS auth/session/job ownership, validation, throttling and timeouts. The supplied RAG has in-memory jobs/sessions; it is not production-deployment ready by association alone.

The crosswalk had ~2,842 source book codes mapped to ~2,821 bibliographic items in an audited demo input; 70 copy-count mismatches were documented. **Do not treat RAG source copy counts as live library inventory.** Where a book code has multiple/ambiguous/unknown mappings, show a safe explicit state and do not falsely link an exact match. Any displayed availability must be computed from the right live database source and labelled as verified or not verified according to actual data provenance.

## 8. Assets and provenance

Previously reported names (verify current working tree, actual image subject, rights, crop, width and optimization):
```
apps/web/public/images/campus/sams-campus-courtyard.png
apps/web/public/images/campus/sams-main-building.png
apps/web/public/images/campus/sams-main-entrance-night.png
apps/web/public/images/campus/sams-main-entrance.png
apps/web/public/brand/sams-logo-navy.png
apps/web/public/brand/sams-logo-white.png
apps/web/public/brand/sams-full-logo-navy.png
apps/web/public/brand/sams-full-logo-white.png
```

Included images in this handoff package are ChatGPT-generated **design mockups**, not React components, vectors, true multi-frame spritesheets or deployable animation source. Cap/logo details seen in the render must be recreated accurately using official assets, not traced as proof of brand accuracy. Book cover art is mockup material; production rights/matching must be verified.

## 9. Deployment-cost and license gate

Before implementation/adoption of any third-party animation/component/video tool, verify and record:
1. Free creation **and** free commercial/public deployment if applicable.
2. Whether branding, attribution, watermarks, export restrictions or hosting fees apply.
3. Asset licenses and any model/video generation usage terms.
4. Whether the implementation can run self-hosted/free without recurring charges.

Default first choice: **React + CSS transforms/transitions + SVG layers / Web Animations API**, using internally authored static poses and animation components. Explore other tools only if there is a clear technical benefit and no unavoidable personal cost. No Rive/Higgsfield subscription is authorized.

## 10. Implementation sequence for the other conversation

**Keep design and repo implementation separate until authorized.**
1. Finish Sprint 10A controlled runtime readiness on the verified D: checkout and safe isolated target as approved by user. Protect README, CSS and untracked AI assets.
2. Codex cross-check these design specs against existing components/routes, APIs, tokens and public assets; report any mismatch before coding.
3. Implement premium foundation and small improvement batches: layout and typography -> campus hero -> discovery -> details -> covers pilot.
4. Independently harden the AI contract and mapping, then integrate authenticated Express adapter + React chat, truthful state machine, mascot animations.
5. Verify with desktop/mobile, EN/AR RTL, keyboard and reduced motion; confirm all demo/synthetic stock is visibly distinguished.
6. Keep SIS/mobile ID scanner and physical inventory audit as separate institution-dependent workstreams rather than inventing production integrations.

## 11. Review / acceptance checklist

- [ ] Product owner chooses final photo(s), approves rights and hero crop.
- [ ] Approve final English and Arabic landing/call-to-action copy.
- [ ] Verify real/unknown stock language before showing any status.
- [ ] Finalize page layout at desktop/tablet/mobile (mockups show intentions, not exact pixels).
- [ ] Finalize original Knowledge Spirit pose assets with accurate official badge, light/dark background tests.
- [ ] Confirm five-state animation mapping using real backend events, plus error fallback.
- [ ] Verify animation implementation can be built and hosted for $0 subscription cost.
- [ ] Verify interactive states, accessibility, performance and no regressions to existing APIs.
- [ ] Obtain explicit permission before Codex modifies the working repository.

**Next visual-design task:** obtain a final spot-check on the AI V2 character/chat proportions and then create a reduced-motion/static avatar asset plan. **Next software task:** finish user-authorized Sprint 10A recovery in the separate Codex conversation.
