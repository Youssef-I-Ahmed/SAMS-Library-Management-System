# SAMS Arabic Catalog Search Normalization — Change Report

> Verification update — 28 October 2026: sections 1–9 preserve the original
> implementation report and its then-offline database limitation. Section 10
> supersedes that limitation with actual read-only database verification,
> current tests and timings. The original delivery-state paragraph describes
> the earlier stage, before the authorized local checkpoint.

**Date:** 28 October 2026 (Africa/Cairo)  
**Project:** SAMS Library System  
**Scope:** Implementation and verification performed in this chat

## 1. Outcome

SAMS catalog and discovery search now apply the same normalization to the user's search text and to searchable catalog field values. In the regression fixtures, `أحمد ماهر`, `احمد ماهر`, and a version containing diacritics, tatweel, punctuation and extra whitespace select the same three unique library-item IDs.

Matching happens before the existing count and pagination queries. Original titles, contributor names and other stored values remain intact for display. The discovery response continues to return the original query in `meta.query`.

The focused regression test file passed: **33 tests passed, 0 failed**. Tests use mocked Prisma calls; live database integration was not verified because the configured PostgreSQL server was unavailable.

## 2. Requested scope

The original request was to inspect the current SAMS catalog search and the reference RAG project, then implement only the text normalization behavior from `sams_rag/text.py` in the existing search.

The implementation was constrained to preserve:

- Existing API routes, parameter names and response structures.
- Pagination, totals, sorting and existing filters.
- Authentication and permission rules.
- The existing database schema and stored catalog text.

Alias tables, transliteration, migrations and new search infrastructure were explicitly excluded. Stemming, stopword removal and other RAG search features were also excluded from this implementation.

## 3. Implementation inspected

### Reference implementation

The reference was located at:

```text
RAG/sams-library-search/sams_rag/text.py
```

Its `normalize_text` function performs safe text normalization before tokenization. The same file also contains language detection, stopword lists, stemming and tokenization; those features were not imported into SAMS.

### Existing SAMS search

Two service functions handled the relevant search paths:

| Search path | Service function | Query parameter |
| --- | --- | --- |
| `GET /api/v1/catalog/items` | `listLibraryItems` | `search` |
| `GET /api/v1/discovery/items` | `searchDiscoveryItems` | `q` |

Before this change, both paths built Prisma `contains` conditions with `mode: 'insensitive'` against the original stored text. Case-insensitive matching did not fold Arabic letter variants such as `أ` and `ا`, or remove diacritics and tatweel. Consequently, the two spellings of an author's name were not guaranteed to select the same items.

## 4. Files changed

Paths in this report are relative to the repository root.

| File | Change | Purpose |
| --- | --- | --- |
| `apps/api/src/modules/catalog/catalog-search.js` | Added | Shared text normalizer and matching helper for both search services. |
| `apps/api/src/modules/catalog/library-items.service.js` | Modified | Replaced its original text-search conditions with the shared helper. |
| `apps/api/src/modules/discovery/discovery.service.js` | Modified | Replaced `buildSearchFilter` with the shared helper, including discovery's additional searchable fields. |
| `apps/api/tests/catalog-search.test.js` | Added | Focused normalization, matching, service-contract and authentication regression tests. |
| `docs/architecture/SAMS_ARABIC_SEARCH_NORMALIZATION_CHANGE_REPORT_2026-10-28.md` | Added | This report. |

The reference RAG files were read without modification. Unrelated working-tree changes already present at the start of the chat were excluded from this work.

## 5. Normalization rules

The new `normalizeCatalogText` function implements the safe normalization operations from the reference `normalize_text` function.

| Operation | Implemented behavior |
| --- | --- |
| Missing values | Convert `null` and `undefined` to an empty string. |
| Arabic-Indic digits | Convert `٠١٢٣٤٥٦٧٨٩` to `0123456789`. |
| Eastern Arabic/Persian digits | Convert `۰۱۲۳۴۵۶۷۸۹` to `0123456789`. |
| Diacritics | Remove characters in `U+0610–U+061A`, `U+064B–U+065F`, `U+0670`, and `U+06D6–U+06ED`. |
| Tatweel | Remove `ـ` (`U+0640`). |
| Alef variants | Map `أ`, `إ`, `آ` and `ٱ` to `ا`. |
| Alef maqsura | Map `ى` to `ي`. |
| Ta marbuta | Map `ة` to `ه`. |
| Waw with hamza | Map `ؤ` to `و`. |
| Yeh with hamza | Map `ئ` to `ي`. |
| Letter case | Lowercase text, preserving the reference's English normalization behavior. |
| Punctuation and underscores | Replace characters outside Unicode letters, numbers, whitespace, `+` and `#` with spaces. This includes Arabic punctuation and underscores. |
| Whitespace | Collapse consecutive whitespace to one space and trim both ends. |

The `+` and `#` characters remain searchable, supporting text such as `C++` and `C#`.

Examples:

```text
أحمد ماهر              -> احمد ماهر
أَحْـمَد   ماهر         -> احمد ماهر
أحمد، ماهر             -> احمد ماهر
إِدارة_١٢              -> اداره 12
مكتبة؟ C++ C#          -> مكتبه c++ c#
```

Normalization does not remove words or reduce them to stems. The search remains a substring match against each individual normalized field. It does not tokenize queries, reorder words, join separate fields into a phrase, expand synonyms or transliterate between Arabic and Latin characters.

## 6. Search execution

The shared `buildCatalogSearchWhere` helper follows this sequence:

1. Receive the existing service's visibility and filter conditions.
2. If no search text was supplied, return those conditions directly without an additional candidate query.
3. Normalize the query. If supplied text normalizes to an empty string, return an empty item-ID filter so punctuation-only or diacritic-only input does not match the entire catalog.
4. Load the searchable fields of library items satisfying the existing conditions.
5. Normalize each searchable field and check whether it contains the normalized query.
6. Add the matching item IDs to the original conditions through an `id.in` filter.
7. Let the existing service execute its original count and paginated result queries using those conditions.

The candidate query does not apply `skip` or `take`. This ensures matching is completed before pagination rather than filtering an already limited page.

### Searchable fields

Both paths continue to search their existing common fields:

- Title.
- Call number.
- Raw Dewey code.
- Abstract/description.
- Contributor full names, including authors and other existing contributor roles.

Discovery additionally continues to search:

- Category name.
- Dewey classification code and name.
- Book ISBN, publisher and edition.
- Academic-work academic year.

The catalog endpoint does not gain discovery-only searchable fields.

### Unique results

Prisma retrieves one candidate per library item, with contributors nested under that item. The helper includes an item ID once if any of its fields match. An item matching both its title and several contributor names therefore remains one result.

Uniqueness is by library-item ID. This change does not merge separate database records representing similar books or contributor names.

## 7. Existing behavior preserved

The service integrations retain the existing:

- Route handlers, validation schemas and query-parameter names.
- Default active-item visibility rules.
- Catalog `includeInactive` handling and its existing route-level permission checks.
- Type, category, Dewey classification, language and publication-year filters.
- Discovery branch and availability filters.
- Sort definitions and their existing tie-breakers.
- `skip`/`take` pagination and response pagination fields.
- Count and page queries grouped through the existing Prisma transaction call.
- Discovery availability lookup and response enrichment for the returned page.
- Original catalog values in result objects and original discovery query metadata.

No route, middleware, schema, migration, package manifest or dependency was changed. No alias table, normalized-text column, index, external service or RAG runtime was added. No catalog data was rewritten.

## 8. Regression tests

The new test file contains **33 tests**:

| Group | Tests | Coverage |
| --- | --- | --- |
| Reference normalization behavior | 8 | Arabic character mappings, diacritics, tatweel, both digit sets, punctuation, whitespace, `C++`/`C#`, missing values, retained words and idempotence. |
| Normalized catalog matching | 18 | Equivalent name queries, unique IDs, no accidental cross-field phrase matching, all searchable field groups, discovery-only field scope, browsing without a query, and input that normalizes to empty text. |
| Service contracts and authentication | 7 | Both name spellings through both services, unchanged filters, count/page conditions, sorting, pagination, metadata, availability lookup scope, staff service handling of `includeInactive`, and unauthenticated requests returning HTTP 401. |
| **Total** | **33** | **All passed.** |

### Name-equivalence fixture

The matching fixture includes:

- An item with both `أَحْـمَد   ماهر` and `احمد ماهر` as contributor names.
- An item with `احمد ماهر` as a contributor name.
- An item whose title and contributor name both match.
- An unrelated item with `أحمد` in its title and `ماهر` in a separate contributor field.

Each tested query variant selects exactly:

```text
author-hamza
author-bare
title
```

The unrelated item is excluded because its separate fields are not concatenated. Multiple matches within an item do not duplicate its ID.

### Command and result

Executed from the repository root:

```powershell
npm run test -w @sams/api -- tests/catalog-search.test.js
```

Observed result:

```text
Vitest v2.1.9
Test Files  1 passed (1)
Tests       33 passed (33)
Duration    9.50s
```

Only this relevant test file was run. The full API suite, frontend/browser tests and reference RAG test suite were not run.

`git diff --check -- apps/api` also completed without reported whitespace errors for tracked API changes.

## 9. Verification limits and implementation tradeoffs

### Database availability

A read-only Prisma connectivity probe could not reach PostgreSQL at `localhost:5433`. The Docker daemon was also unavailable when checked. No database writes or migrations were performed.

The regression tests therefore mock Prisma. They verify actual normalization and matching logic, the query arguments sent by the services, their response construction, and unauthenticated route rejection. They do not establish live PostgreSQL query execution, real catalog totals or complete authenticated role behavior against a running database. Counts and page rows in the service-contract tests are supplied by mocks.

### Candidate scan

For a nonempty normalized query, the implementation adds one Prisma candidate query and normalizes the filtered candidate fields in application memory. It does not use a normalized database index. Memory use, data transfer and matching time therefore grow with the number and size of candidates passing the existing filters. Production-scale performance was not measured.

The candidate selection occurs before the existing count/page transaction. It does not introduce a single database snapshot spanning all three reads; concurrent catalog changes between reads are outside the guarantees verified by these tests.

### Delivery state

The implementation and tests remain local workspace changes. No commit, push, deployment or publication was performed in this chat. This follow-up added the report without changing application behavior or rerunning the previously passing test file.

## 10. Real database verification and checkpoint — 28 October 2026

### Target and safeguards

The existing `sams-postgres` Docker container was running. The configured target
was verified without printing credentials: loopback port 5433, database
`sams_library` (internal PostgreSQL container port 5432). Verification aborted
unless the local target matched. Connection options enforced
`default_transaction_read_only=on`, confirmed by a query before checking services.

The actual `listLibraryItems` and `searchDiscoveryItems` services, their Express
GET routes and authentication middleware ran against existing catalog data.
Existing active Student, Librarian and Management accounts were used; tokens
were issued in memory without printing or saving them. No DB fixtures were
created. No migrations, seed, import, restore or other data-writing command ran.

The main verification observed 919 SELECT, 50 BEGIN and 50 COMMIT statements,
with no data-changing SQL. COMMIT closed read-only count/page transactions.
Before/after item, copy and contributor counts agreed. This describes these
checks, not unrelated activity by other processes.

### Verified database record counts

| Group | Count |
| --- | ---: |
| Library items / active items / BOOK items | 2,821 / 2,821 / 2,821 |
| Inactive / THESIS / PROJECT items | 0 / 0 / 0 |
| Contributors / item-contributor links | 4,059 / 4,059 |
| Physical-copy records | 2,821 |
| AVAILABLE / RESERVED / BORROWED copies | 2,819 / 1 / 1 |
| Branches / active branches | 1 / 1 |
| Book details with a nonempty stored ISBN | 1,314 |
| Categories / active categorized items | 0 / 0 |

These are records in the intended local database, not an independent physical
stock inspection. Nonempty ISBN strings were counted without checksum or
edition validation; no cover rights or enrichment was assessed.

### Name equivalence and pagination

The database has 25 contributor rows named `أحمد ماهر` and nine named
`احمد ماهر`. Nothing was merged or rewritten. Both actual routes returned
identical sets of **34 unique item IDs**, total 34, for:

```text
أحمد ماهر
احمد ماهر
أَحْمَد مَاهِر
```

The IDs also matched an independent query for the union of the two exact stored
contributor-name spellings. Full IDs are retained only in local evidence.

For each route, five requests with `pageSize=7` rotated these query spellings.
Page lengths were 7, 7, 7, 7 and 6; every page retained total 34 and totalPages 5.
Their combined IDs equaled the full result with no duplicates or omissions.
This checks matching before pagination against the real existing records.

### Filters and permissions

Responses were compared with independently filtered existing item IDs:

| Existing-data filter | Matches | Routes |
| --- | ---: | --- |
| Type BOOK | 34 | Catalog and Discovery |
| Language `ar` | 34 | Catalog and Discovery |
| Existing matching item's Dewey classification | 25 | Catalog and Discovery |
| Publication year 2006 | 5 | Catalog and Discovery |
| Existing active branch, availableOnly=false | 34 | Discovery |
| Existing active branch, availableOnly=true | 33 | Discovery |

Actual middleware/route checks confirmed anonymous requests receive 401 on both
routes; Student Catalog `includeInactive=true` receives 403; Librarian and
Management Catalog `includeInactive=true` and Discovery search receive 200;
Discovery `pageSize=101` receives 400.

No Category or inactive-item rows exist in this database. Positive category
matching and actual inactive-item exclusion therefore remain unverified on live
rows; mocked tests retain those filter/visibility conditions. Multi-branch and
real THESIS/PROJECT coverage is also unavailable in this dataset. No fixtures
were inserted to broaden coverage.

### Focused tests and build

The test file was reviewed to confirm Prisma is mocked, then rerun:

```powershell
npm run test -w @sams/api -- tests/catalog-search.test.js
```

**33/33 passed**, Vitest duration 4.15 seconds. The live read-only checks above
supplement these unit/service-contract tests. No broader backend suite ran.
`npm run build` passed: Vite transformed 122 modules; API build remained its
existing plain-ESM informational step.

### Search timing

A separate fresh Node process ran after browser verification finished. Each
measurement calls the real Discovery service with pageSize 20, including
candidate loading, normalization/matching, count/page and availability reads.
Each query has one first measurement and three subsequent measurements.

The read-only connection guard runs before timing. Only the first author call
is the first search-service call in that process; other first values mean the
first measurement of that particular query. OS/PostgreSQL caches were not
flushed. These local unthrottled observations are not an SLA or load test.

| Existing-data query | Candidates | Matches | First ms | Subsequent ms | Subsequent mean ms |
| --- | ---: | ---: | ---: | --- | ---: |
| `أحمد ماهر` | 2,821 | 34 | 688.57 | 620.77, 576.36, 570.09 | 589.07 |
| `الإدارة الإلكترونية` | 2,821 | 10 | 545.89 | 628.08, 858.60, 838.42 | 775.03 |
| `International financial reporting standards desk reference` | 2,821 | 1 | 860.22 | 754.55, 564.22, 541.17 | 619.98 |
| `977-281-385-8` | 2,821 | 1 | 561.58 | 553.71, 568.05, 539.64 | 553.80 |
| `احمد ماهر + active branch / availableOnly` | 2,819 | 33 | 606.94 | 590.35, 575.61, 571.40 | 579.12 |

An earlier pass potentially competing with other verification is retained
separately in local evidence. The table uses the later isolated pass; no causal
speedup is claimed. Search still scans filtered candidates in memory; its design
was not changed because of these measurements.

### Checkpoint boundaries and evidence

C3 comprises five explicit files: helper, two service integrations, test and
this report. It passed independently of C1's frontend failures. C1 remains
uncommitted; C2 records that partial checkpoint status. No source redesign,
dependency change, covers work or AI integration was added during verification.

Detailed scripts, full IDs, JSON results, timing samples and preservation
manifests remain local-only outside the repository at:

```text
D:/Digi/SAMS_Library_System_Root/SAMS_PreSprint10C_Assessment_2026-10-28/checkpoint-verification-2026-10-28/
```

These files were not uploaded and cannot be obtained from a checkout alone.
This committed report retains aggregate results. Final hashes/counts are
recorded in the local checkpoint-result report after commits are created.
No push, branch change or database write is part of this checkpoint.
