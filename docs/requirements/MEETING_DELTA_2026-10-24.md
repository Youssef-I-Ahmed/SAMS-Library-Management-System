# SAMS — Meeting Requirements Delta Register
**Date:** 2026-10-24 | Status: Draft pending on-site confirmation

Definitions: **CONFIRMED REQUEST** = clearly asked by stakeholder, not proof of implementation. **OBSERVED** = source evidence exists. **ASSUMPTION** = not verified. **PROPOSAL** = implementation recommendation, not agreed scope. **DEPENDENCY** = needs outside party/asset.

| ID | Topic | Classification | Action / evidence needed | Suggested phase |
|---|---|---|---|---|
| REQ-01 | High-impact motion-rich premium front end | CONFIRMED REQUEST | Visual direction and performance/accessibility budget; prefer purposeful animation | Sprint 10 |
| REQ-02 | Real student discovery, filters, detail, availability | OBSERVED existing functionality + IMPROVEMENT REQUEST | Audit Sprint 9 UI and real API E2E; polish, do not rebuild | Sprint 10 |
| REQ-03 | Book AI chatbot inside React site | CONFIRMED REQUEST; observed AI FastAPI contract | Integrate via SAMS Express backend adapter; Streamlit is demo UI only | Sprint 10 |
| REQ-04 | Animated avatar emerging from book | CONFIRMED REQUEST (UX) | Storyboard concept, accessibility/reduced motion; defer full speaking avatar | Sprint 10 concept / later implementation |
| REQ-05 | Add book from librarian interface | CONFIRMED REQUEST; backend/API historically exists | Fix UI flow after audit, avoid duplicate service | Sprint 10 or follow-on priority fix |
| REQ-06 | Record physical visits | CONFIRMED REQUEST; existing visit endpoint | Validate staff check-in and reporting vs paper visitor log | Sprint 11 |
| REQ-07 | Scan student ID card from mobile | CONFIRMED REQUEST; method unverified | Inspect barcode/QR; OCR + manual confirmation; no public self-check-in by possession of a number alone | Sprint 11/12 |
| REQ-08 | No student self-registration; university identity | CONFIRMED REQUEST; identity mechanism not finalized | Avoid self-signup; SSO or approved import path; never use ID as predictable permanent password | Sprint 11 |
| REQ-09 | Academic lifecycle, repeat-year exceptions | CONFIRMED BUSINESS NEED | Use institution-authorized status, not 'year four = graduate' shortcut | Sprint 11 |
| REQ-10 | SIS portal exists | OBSERVED (public portal, card reports) | Seek SIS owner, institutional API, SSO/export, legal permissions | Discovery now; implementation gated |
| REQ-11 | Student Excel is official source | ASSUMPTION | Ask for sanitized sample/schema/source and import refresh policy | Dependency |
| REQ-12 | Cover images for the catalog | CONFIRMED VISUAL NEED; IMPLEMENTATION PROPOSAL | Small ISBN/edition-based enrichment pilot; curated fallback; provenance/licensing | Sprint 10 pilot |
| REQ-13 | Audit book existence and shelf location | CONFIRMED BUSINESS NEED | Extend existing copy model with verified evidence/workflow after schema review | Sprint 12 |
| REQ-14 | AI index sync with current catalog | CONFIRMED INTENT; DESIGN UNDECIDED | Review current Excel/FAISS pipeline; CDC/batch sync or controlled export, authorization and rebuild plan | Sprint 10 architecture; Sprint 12 execution |
| REQ-15 | Projects/theses AI delivery | EXPECTED EXTERNAL HANDOFF | Receive contract/source; reuse Book/AcademicWork model appropriately | Sprint 13+ |
| REQ-16 | Paper borrowing form and visitors register | OBSERVED WORKFLOW ARTIFACTS | Compare printed field definitions and actual staff process; preserve optional printable view if confirmed | Sprint 11 |

## Questions to validate with library / IT
1. Is the SIS owner willing to provide an official export or API, or authorize SSO? Who owns the data quality, eligibility and disabling accounts?
2. Which numeric identifier is printed on every card? Do cards contain QR/barcode? Do formats vary by faculty/year?
3. Do individual physical book copies have barcode/accession number and shelf label? Is there a trusted shelf-to-copy mapping?
4. Can librarian staff use smartphones at the service desk? What are visitor-entry purpose categories and duplicate check-in rules?
5. Who is accountable for cover rights, legacy catalog sampling and physical audit sign-off?
6. What is the exact project/thesis AI handoff format and expected availability?

## Security / data quality constraints
- Cards contain personal information; mask real student photos, IDs and identity numbers in test fixtures, screenshots and repository docs.
- Never use OCR output or a plain student number as proof of account authentication; staff verification and/or official identity are mandatory.
- Never assume live AI recommendations guarantee shelf availability; check through authorized catalog/copy APIs.
- Source database extraction for Data Analysis remains raw, no cleaning/dedup unless specifically approved for the SAMS migration track.
