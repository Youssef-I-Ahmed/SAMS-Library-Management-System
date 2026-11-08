# Sprint 10D.4A — Approved Source Reconciliation

Date: 2026-11-08
Status: design and reconciliation complete; canonical import remains blocked

## Decision

`Project.xlsx` and `SAMS_Projects_Analysis_Starter.xlsx` form the approved migration source set v1 for projects and research.

They are the best available sources, not a complete raw database extract. Their absence from Git is intentional because participant names and legacy titles can contain private student data. The committed manifest records their hashes, sizes and aggregate controls without storing source rows.

The import identity is:

```text
(source_namespace = LEGACY_PROJECTS_V1, legacy_book_code)
```

Bare `BOOK_CODE` is forbidden as a global identity. Of the 3,983 research codes, 2,705 collide with the existing book crosswalk.

## Source controls

| Control | Result |
| --- | ---: |
| Rows in `Project.xlsx` | 3,983 |
| Rows in `ACADEMIC_WORKS` | 3,983 |
| Unique codes in each source | 3,983 |
| Codes present in both sources | 3,983 |
| Book crosswalk code collisions | 2,705 |
| Copy rows | 3,988 |
| Contributor relations | 5,050 |
| Subject relations | 3,949 |
| Document-link review rows | 1,864 |

The two files agree on identity and most structural fields, but they do not agree on the public title representation.

## Field reconciliation

| Field | Both present | Equal after conservative normalization | Exceptions | Authority and action |
| --- | ---: | ---: | ---: | --- |
| `BOOK_CODE` | 3,983 | 3,983 | 0 | Shared legacy key, always namespaced. |
| `TITLE` | 3,983 | 126 | 3,857 | Preserve Starter title as restricted legacy evidence. Treat Project title only as a public-title candidate. Never overwrite automatically. |
| `PUBLISHING_DATE` | 3,973 | 3,969 | 4 | Import agreed valid four-digit years. Block the four disagreements for review. |
| `CALL_NUM` | 3,983 | 3,983 | 0 | Import as text without numeric conversion or punctuation rewriting. |
| `EXTENT` | 2,988 | 2,988 | 0 | Preserve as optional descriptive metadata. Missing remains null. |
| `DIMENSION` | 3,204 | 3,204 | 0 | Preserve as optional descriptive metadata. Missing remains null. |

Title normalization used only Unicode normalization, Arabic mark removal, conservative Arabic letter folding, whitespace collapse and case folding. It did not establish semantic equivalence.

## Subject reconciliation

The Starter relationship table is primary because it retains source subject codes. Project text is a secondary cross-check.

| Outcome | Academic works |
| --- | ---: |
| Equal subject sets | 3,947 |
| Missing in both | 33 |
| Project-only subject candidate | 2 |
| Conflicting set | 1 |

No department or faculty may be inferred from a subject. The 11 legacy subject codes remain a legacy vocabulary until an explicit mapping is approved. The three non-agreeing cases stay in the exception queue.

## Copies

`COPIES` is the only approved source for physical-copy candidates.

- It contains 3,988 rows covering all 3,983 works.
- `GENERAL_CODE` is the candidate historical copy identity.
- `COPY_CODE` is not unique enough to identify a copy.
- Raw status `A` is a candidate for `AVAILABLE`.
- Raw status `D` requires approval before mapping to `ARCHIVED`.
- Raw status `v` describes a volume in the legacy lookup and must not be silently mapped to a circulation status.

Copy rows remain staged until branch ownership, status mapping and the removal of synthetic demo copies are planned together.

## Contributors and private participants

`CONTRIBUTORS` contains 5,050 relations across 3,952 works. Of these, 4,999 are marked with legacy role `S` (supervisor). Remaining roles and 27 missing role values require explicit mapping.

Authority rules:

- Structured Starter contributors are primary for supervisor and contributor relations.
- The free-text Project supervisor field is reconciliation evidence only.
- Project student names are the only approved student-participant source.
- Students must not be stored in the generic public `Contributor` projection.
- Student names, legacy titles that embed names, and participant source cells are staff-only data.
- Public catalog, Student API, logs, analytics payloads and both RAG indexes must exclude student names.
- Direct public filtering by student identity is forbidden because it creates a membership oracle.

## Work type

Legacy `BOOK_TYPE = 1` is labelled `thesis / بحث تخرج`, but it does not reliably distinguish canonical `PROJECT` from `THESIS`.

The staging value remains unresolved. Canonical insertion into `LibraryItem` is blocked until one of these policies is approved:

1. library staff supplies a reliable per-row classification;
2. all records are formally approved as one canonical type; or
3. the canonical schema gains an approved generic academic-work type.

No classifier or title heuristic may make this decision automatically.

## Target schema direction

The canonical design should extend the existing `LibraryItem` and `AcademicWorkDetails` model with separate structures for:

- namespaced historical identity;
- restricted academic participants;
- subject vocabulary and work-subject relations;
- restricted source provenance and conflict evidence.

Student participants must not reuse public contributor search paths. Research RAG must use a separate database principal, projection, index/store, service identity and feature flag from Book RAG. Shared reviewed libraries and container-building mechanisms may be reused.

## Import gates

Canonical writes are allowed only when all gates pass:

1. source hashes match the committed manifest;
2. every work has the expected namespaced legacy identity;
3. title candidate passes privacy checks and is explicitly approved;
4. year disagreement and subject exceptions are resolved or quarantined;
5. work type policy is approved;
6. copy status and branch mappings are approved;
7. student-private tables and role-level access are implemented;
8. dry-run totals and exception counts are reviewed;
9. backup and rollback evidence exists;
10. the feature remains disabled until API, UI and privacy tests pass.

## Current completion boundary

Sprint 10D.4A closes the source-selection, field-authority, privacy and staging-design work. It does not authorize a Prisma migration, PostgreSQL write, source workbook commit, model execution or Research RAG integration.

The next implementation sprint is Sprint 10D.5: build a deterministic dry-run importer against an isolated staging schema, then review its report before any canonical migration.
