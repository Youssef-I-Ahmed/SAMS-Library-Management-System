# UI redesign report

Reference: the supplied navy/gold RTL image. Implementation: Streamlit + custom CSS (`src/ui/style.py`), no new
dependency. Pages (`src/ui/views.py`, `views_ops.py`): **Home · Smart Assistant · Project Search · Project Details ·
Statistics · Sources & About**, plus System status (and Administration only when `PILOT_ADMIN_PASSWORD` is set).

| Area | Implementation |
|---|---|
| Language | working AR/EN toggle (top bar, visible on every screen); AR = RTL (sidebar on the right), EN = LTR; all strings in `i18n.py` + `i18n_v2.py` |
| Navy sidebar + gold accents | `#0B2447` / `#C9A24B`; brand mark (inline SVG, **not** the academy's official logo — replace with the official file if you have the licence) |
| Home | hero, 4 stat cards computed from the database (`src/stats.py`): total, supervisors, subjects, year span; CTA buttons that navigate |
| Assistant | example questions, chat history in the session, answer-state badge (database answer / no match / unavailable / error), source cards with a details button |
| Search | number (any digit set), text, supervisor, student (hidden if `HIDE_STUDENT_NAMES`), subject, year range, page size; exact number = primary-key lookup; pagination; empty state |
| Details | only stored fields; empty values shown as "not recorded"; schema-absent fields (abstract, findings…) stated as not part of the dataset |
| Statistics | bar by year, donut by subject, top supervisors, data table — every number from `stats.overview()` |
| Responsive | ≥1000 px: sidebar; <1000 px: sidebar hidden, top-nav pills + language toggle, result rows stack, buttons wrap |
| No fake controls | every button/radio is wired; none decorative |

## Browser verification (Playwright + Chromium, real Streamlit server, real dataset, hashing embedder)
`python scripts/ui_check.py` — desktop 1440×900 (AR+EN), tablet 820×1100 (AR), phone 390×844 (AR+EN):
language direction, stat cards, #1113 answer (AR and EN) with exact title+year, 2023 count = 165 read from the workbook,
nonexistent ID → no substitute, unsupported info → stated unavailable, search→details, charts rendered, **no horizontal
overflow on any page**. Result of the final full run: **90/90 passed**. An earlier run had one failure, a fixed-sleep timing flake
(`desktop/ar stats: charts rendered`, 0 charts at 2.5 s); the check now waits for the chart element instead of sleeping.
Defect found and fixed during this work: on phones the sidebar drawer overlapped the content (now hidden <1000 px).
Screenshots were produced locally (`/home/claude/work/shots`, not shipped).

## Not verified
Safari/iOS and Firefox (Chromium only); real touch devices; screen-reader/accessibility audit; pixel-parity with the
reference image (matched by eye, not measured).
