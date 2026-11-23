# Post-deployment test plan (run from another device, e.g. a phone and a laptop that are not the developer's)

Expected values come from the approved workbook and were verified locally; the hosted app has **not** been tested by the developer.
Record PASS/FAIL and a screenshot for each row. Start in Arabic, repeat the numbered checks in English (language toggle top-right).

## 0. Open
| # | Step | Expected |
|---|---|---|
| 0.1 | Open the existing Streamlit URL (wake it if asleep; allow ~1–3 min on a cold start) | Home page, 4 stat cards: **3,983** projects, years 2001–2026, 11 subjects |
| 0.2 | Password prompt (only if `APP_ACCESS_PASSWORD` is set) | wrong password rejected; correct one admitted |
| 0.3 | Phone: rotate, scroll every page | no horizontal scrolling, nothing clipped, top navigation works |

## 1. Project number (exact, no similarity)
| # | Input (Assistant page) | Expected |
|---|---|---|
| 1.1 | `ما عنوان المشروع رقم 1113، وفي أي سنة تم نشره؟` | "Development and analysis of sadat academy's Digital library", **2007**, source card #1113 |
| 1.2 | `What is the title of project number 1113 and in which year was it published?` | same record |
| 1.3 | same question with `١١١٣` | same record |
| 1.4 | `ما عنوان المشروع رقم 99999؟` | "no project with this number"; no other record shown |
| 1.5 | `ما نتائج المشروع رقم 1113؟` | project exists; findings are **not part of the dataset** (no invented text) |
| 1.6 | `ما عنوان المشروع رقم 1113 لسنة 2015؟` | answers #1113 and **warns** that 2015 does not match the recorded 2007 |
| 1.7 | Search page → *Project number* `1113` → View details | stored fields only; empty ones show "not recorded" |

## 2. Counts and years (SQL)
| # | Input | Expected |
|---|---|---|
| 2.1 | `كم عدد المشروعات المسجلة في سنة 2023؟` / `How many projects were completed in 2023?` | **165** |
| 2.2 | `كم عدد المشروعات لكل سنة؟` | per-year list summing to **3,973**, plus the note "10 record(s) without a valid year" (3,973 + 10 = 3,983) |
| 2.3 | `How many projects in 1850?` | a valid **0** ("not an error") |
| 2.4 | `كم عدد مشروعات التسويق في سنة 2023؟` / `How many marketing projects were completed in 2023?` | **4** under a marketing subject (التسويق 1 + تسويق وتجارة إلكترونية 3) and **22** mentioning marketing in title/subject; both definitions stated |
| 2.5 | Statistics page | charts by year/subject/supervisor; numbers equal Home |

## 3. Search (Arabic and English)
Search page: by title (an Arabic title and an English title copied from a result list), by supervisor (a name from the list), by student name, by subject, by year range, number+year. Check: the total shown equals the number of rows over all pages; similar names are **not merged**; a 1-letter query and gibberish (`qqqq`) return no results, not "everything".

## 4. Semantic search (only meaningful if the About page says semantic mode is active)
| # | Step | Expected |
|---|---|---|
| 4.1 | About page | says semantic mode active (otherwise: keyword mode = model not loaded; record the reason shown) |
| 4.2 | Status page → *Run semantic self-test* | AR→AR, EN→EN, AR→EN rows return sensible titles |
| 4.3 | Topic question in Arabic and its English twin (e.g. `مشروعات عن جودة الخدمات المصرفية` / `projects about banking service quality`) | related records; unrelated records are not presented as answers |
| 4.4 | Nonsense topic | abstention |

## 5. Questions without an answer
`ما ملخص المشروع رقم 1113؟` · `ما منهجية البحث؟` · `من هو رئيس الأكاديمية؟` · `What are the findings of the dinosaur study?` → each must **abstain / state the information is not in the dataset**; never an invented answer.

## 6. Gemini (only if `LLM_PROVIDER=gemini` with a valid key)
Status page → *Test the LLM* (one tiny call). Topical question 4.3 → answer with `[R#]` citations only for listed records; no names/titles that are not in the listed records. With Gemini off (`LLM_PROVIDER=none`) the same question shows the record list and a notice; sections 1–3 are unchanged.

## 7. Stability
Reload 3 times; open the app on two devices at once; wait for the app to sleep and reopen it; confirm sections 1–2 still pass after the cold start.
