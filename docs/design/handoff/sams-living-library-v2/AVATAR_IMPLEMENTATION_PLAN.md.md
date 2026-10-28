# SAMS Library System — Unified Sprint 10 and Knowledge Spirit Implementation Plan

> Checkpoint scope — 28 October 2026: C2 retains this design documentation and
> one canonical set of the six reference PNGs under `assets/`. Source ZIPs,
> supplementary screenshots, audit proposals and generated evidence remain
> local-only outside the checkpoint; no upload or remote reviewer access is
> claimed. AI/chat/avatar and cover sections below are historical proposals,
> not work implemented or authorized by this checkpoint.

**Date:** 2026-10-24  
**Status:** Proposed technical handoff; not executed or approved as production-ready.  
**Source of truth:** Existing repository code and verified runtime reports outrank illustrative mockups.

## A. Project checkpoint

- Sprint 10A: completed according to user's Codex runtime recovery summary. It establishes **local development** readiness, not production release readiness.
- Work branch: `dev`; last reported HEAD `ef3dbdc779c2513c377ba449636c52643d7d2064` (recheck before editing).
- Preserve all tracked edits, untracked AI/RAG resources and existing visual design handoff materials; do not assume untracked file counts are unchanged.
- Apply existing APIs and React components; no rewrites or migrations by default.
- Never describe synthetic/demo stock as independently verified physical inventory.
- Budget target: no paid subscriptions or services, including for public shipping.

## B. Sprint 10 order

| Batch | Goal | Gate |
|---|---|---|
| 10B.1 | Fix `auth.continue` translations, `AdminModal` focus containment/restoration, and Catalog loading announcements | Reviewed relevant source; passing tests and production build; no unrelated changes |
| 10B.2 | Transparently label/avoid showing synthetic stock as verified inventory | Verify actual data provenance and API responses; no fabricated stock flags |
| 10B.3 | Implement approved Concept D visual system + premium student Home / approved landing route | Review design handoff; distinguish public landing vs authenticated Student Home; official campus assets |
| 10B.4 | Refine existing Catalog and Item Details | Keep search, API filters, availability and reservations working; verify real cover rights and match quality |
| 10B.5 | UI motion, Arabic RTL, mobile, keyboard, reduced motion, performance regression | Browser checks and screenshots against design spec |
| 10C | Cover-enrichment pilot + independently test FastAPI/Express contract and book-code mapping | No unverified live availability; reject ambiguous mappings |
| 10D | Authenticated Express AI adapter + React chat + responsive Knowledge Spirit animation | Real backend states; per-user ownership, throttling, error and timeout handling |
| 10E | Cross-feature E2E, security, data integrity and final QA | Explicit go/no-go; production sign-in and stock constraints still gated |

## C. Visual handoff

Existing verified zip content in chat artifact `SAMS_Visual_Design_Handoff_v2.zip`:

- `DESIGN_HANDOFF.md`
- `assets/01-landing-v3.png`
- `assets/02-book-discovery.png`
- `assets/03-book-details.png`
- `assets/04-ai-chat-v2.png`
- `assets/05-knowledge-spirit-sheet.png`
- `assets/06-animation-storyboard.png`

Codex must locate the **actual extracted directory** before changing UI. Source screenshots are **concept artwork**, not deployable React UI, rigged vector art, verified book covers or authentic images of campus architecture.

**Design decision:** Concept D (Modern Editorial + restrained Cinematic Minimalism); official academy logo; real and authorized campus photos; navy/ivory/warm-white, restrained gold; generous whitespace; motion used meaningfully. Knowledge Spirit avatar appears **only on the AI chat page**, never on the landing hero, catalogue, details, main navigation or staff dashboards.

## D. Build Knowledge Spirit without paid products

### Deliverables

1. **Master artwork**: fixed, approved front/three-quarter reference with authorized academy shield on academic cap and a small mark on cloak brooch. Avoid re-generating the seal as invented geometry.
2. **Layered assets** (author-controlled, transparent): `body`, `cape`, `cap`, `tassel`, `face`, eye variants, `arms`, `book`, optional `pages`, `spark` sprites. Prefer compact SVG when manually authored/traceable, otherwise optimized PNG/WebP layers. Illustrator-like layered, independently moveable assets are required; flattened AI-generated storyboard PNGs are not directly riggable.
3. **Five visual poses/states**: idle, searching, thinking, success, no-results; additional network/error fallback. Support a neutral static fallback.
4. **React component**: `KnowledgeSpirit` with a declared state prop and no AI/network calls inside the character renderer. Preserve all business logic in chat controller.
5. **Motion primitives**: CSS transforms and keyframes (`translate`, `rotate`, `scale`, `opacity`) or optional browser Web Animations API, no subscription and no mandatory runtime library. SVG markup/layers can be edited with free Inkscape as needed.
6. **Responsive adaptation**: character medium size in desktop AI sidebar/companion panel, smaller on mobile so it never blocks chat text, results or input.
7. **Accessibility**: respect `prefers-reduced-motion`, avoid flicker; use a single localized status announcement by chat UI instead of repeating spoken mascot events. Keyboard/focus behavior remains functional.

### Motion mapping to real FastAPI/Express events

| Actual state | UI state | Truthfulness rule |
|---|---|---|
| No active query | idle | Small float and blink |
| User request submitted and awaiting upstream | searching or neutral working | Real retrieval phase not necessarily exposed; searching is visual metaphor |
| `pending` job/polling | thinking/neutral working | Do not claim backend has a separate model-thinking phase or invent progress % |
| Parsed body-status `done` with meaningful mapped result | success | Show linked records; stock only if separately validated against SAMS database |
| Parsed successful result genuinely contains no matching records | no_results | Offer alternative queries, don't invent matching titles |
| Network failure, timeout or body-status `error` even with HTTP 200 | error | Show retry; stop/reduce animation and expose useful error text |

**Practical animation sequence:** `idle` → `working` (searching/thinking display) → `success | no_results | error` → `idle`. A brief success gesture can end while the answer remains visible. Stop polling UI must not promise upstream cancellation unless implemented.

### Tool licensing and cost

- **Inkscape:** free/open-source vector editor; exports SVG assets; optional, not mandatory.
- **CSS / Web Animations API / SVG:** browser platform capabilities; no paid subscription or hosting service is needed to use them. Website hosting itself must be separately planned and approved.
- **Rive:** official pricing currently separates free editing from production exporting/shipping, which requires a paid plan. Do not rely on it under $0 spend rule.
- **Higgsfield:** not required for a reactive mascot. Pre-rendered video is a different product from stateful chat animation.
- Verify third-party assets and logo rights for deployment; custom-created layers based on approved in-project reference minimize dependencies.

## E. Definition of done for 10D Avatar

- Same identifiable character in every state (correct academy logos and consistent colors).
- Reliable event-driven state transitions for immediate done, pending, no results and error.
- Text+book cards stay primary in chat and remain usable if asset fails to load.
- Confirm Arabic/English, RTL/LTR, viewport ~320px up, reduced-motion and keyboard/screen-reader behavior.
- No invented available-stock labels, no extraneous public avatar appearances, no external paid service.
- Performance measured on a modest device; assets sized reasonably and loaded lazily with static fallback.

## F. Immediate authorized action (10B.1 only)

Use existing Codex Sprint 10B.1 prompt: fix translation, dialog focus, catalog loading status with targeted tests/build, after preflight `git status`. Preserve current modifications and all untracked resources. **No avatar implementation and no visual redesign in 10B.1.** Stop and review the report before 10B.2.

## G. Placement guidance

Suggested documentation path in the local repository (only after verifying destination and no overwrite):

`docs/design/handoff/sams-living-library-v2/AVATAR_IMPLEMENTATION_PLAN.md`

Runtime assets later under an existing or new approved web source asset directory, e.g. `apps/web/src/assets/knowledge-spirit/`, not buried in documentation. React component placement should follow the repository's verified architecture, not a guessed path.

## H. References

- Rive official pricing: https://rive.app/pricing
- Inkscape: https://inkscape.org/
- MDN Web Animations API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Using_the_Web_Animations_API
