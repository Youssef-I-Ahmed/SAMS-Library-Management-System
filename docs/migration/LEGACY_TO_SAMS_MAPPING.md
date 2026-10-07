# Legacy to SAMS mapping — preparation only

Reviewed 2026-10-07 against backend v1 commit `bc52c18` (`dev`). The chat initially opened Sprint 0 commit `80a1fe3`; preparation now uses branch `codex/migration-preparation` based on `dev`. Prisma is unchanged between those commits, but the API and seed are not. The current implementation, not legacy terminology, determines target names.

## Evidence and scope

- Target: [Prisma schema](../../prisma/schema.prisma), [database rules](../database/database-rules-v1.md), [implementation notes](../database/prisma-implementation-notes.md), API modules under `apps/api/src/modules`, and Sprint 1–8 documentation.
- Source: supplied `SAMS_Legacy_Raw_Extract.zip` (CSV headers, packaged README and SOURCE_INTEGRITY), corresponding XLSX sheet names and relevant header rows, and `SAMS_COMPLETE_REPORT.md`, all under `Y:/Digi/SAMS_Library_System_Root/SAMS_Library_System/`.
- The handoff reports 2,843 BOOK rows and 4,832 COPIES_VOLUMES rows, 40 populated exports and 80 empty application tables in MANIFEST. These are source-reported control totals, not newly calculated findings. No row profiling, EDA, cleaning, deduplication or import was performed.
- Attachment instructions are historical/source context, not authorization to execute extraction, recovery or migration. Older Sprint 7 documents describe different recovery inputs/pilot totals and must not be applied to this handoff without review. Existing scripts remain unchanged and unexecuted.
- CSV `\N` means NULL; empty string is distinct. Preserve UTF-8 text, source spelling/case, leading zeros and raw date JSON. `PURE_*` columns are legacy stored fields, not approved canonical values.

## Target model inventory

| Current model | Relevant fields / relationship |
| --- | --- |
| LibraryItem | `id`, `type`, `title`, `categoryId`, `deweyClassificationId`, `deweyCodeRaw`, `callNumber`, `language`, `publicationYear`, `abstractDescription`, `isActive` |
| BookDetails | `itemId` → LibraryItem; nullable `isbn`, `publisher`, `edition`; ISBN is indexed, not unique |
| AcademicWorkDetails | `itemId`, `facultyId`, `departmentId`, `academicYear`, `workType`; only THESIS/PROJECT |
| Contributor / ItemContributor | `id`, `fullName`; link `itemId`, `contributorId`, `role` with composite primary key |
| PhysicalCopy | `id`, required `itemId` and `branchId`, nullable `copyCode`, unique nullable `barcode`, `shelfLocation`, `status`, `condition` |
| Category | `id`, unique `name`, `description`, `isActive`; one optional category per item |
| DeweyClassification | `id`, unique textual `code`, `name`, `parentId`; one optional classification per item |
| Branch | `id`, unique `code`, `name`, `location`, `isActive` |
| User / Student / Role / UserRole | University identity and SAMS roles; Student's primary key is `userId`, while `studentId` is an institutional identifier |
| Reservation / Borrowing / LibraryVisit | Operational facts linked to students, items/copies, branches and staff; not inferred from legacy aggregate statistics |
| CirculationPolicy / AuditLog / IdempotencyRecord | Current operational configuration and runtime records, not legacy lookup imports |

`ItemType`: BOOK, THESIS, PROJECT. `ContributorRole`: AUTHOR, RESEARCHER, SUPERVISOR, PROJECT_MEMBER (no EDITOR or TRANSLATOR). `CopyStatus`: AVAILABLE, RESERVED, BORROWED, UNAVAILABLE, DAMAGED, LOST, ARCHIVED. `CopyCondition`: GOOD, FAIR, DAMAGED. `ReservationStatus`: PENDING, ACTIVE, FULFILLED, CANCELLED, EXPIRED. `BorrowingStatus`: ACTIVE, RETURNED, LOST; overdue is derived, not an enum. `AcademicStatus`: ACTIVE, GRADUATED, SUSPENDED, INACTIVE. `VisitSource`: MANUAL, BARCODE, QR.

## Mapping interpretation

DIRECT = compatible candidate value without semantic alteration; still subject to approved row eligibility. RELATION = source-key join resolved through a future external identifier crosswalk. TRANSFORMATION_REQUIRED = a technical conversion/composition must be specified later. NOT_MIGRATED = no operational target in current scope; retain original evidence, not a deletion instruction. WAIT_FOR_ANALYSIS_DECISION = unresolved meaning, quality, relationship or loss-of-information decision; no automatic fallback.

Grouped fields below share the same disposition. A dash means there is no supported target field, not an invented model. Proposed mappings are documentation, not executable rules. All DIRECT/RELATION candidates remain blocked for records covered by the decision register.

## BOOK

| Legacy table | Legacy field | Current SAMS model | Current SAMS field | Mapping type | Notes / risks |
| --- | --- | --- | --- | --- | --- |
| BOOK | BOOK_CODE | LibraryItem | id | TRANSFORMATION_REQUIRED | Generate UUID and preserve source key in external crosswalk; never cast legacy key into UUID. Duplicate identity decisions D01. |
| BOOK | TITLE | LibraryItem | title | DIRECT | Preserve text; missing/test/duplicate-looking titles D01/D05/D07. Do not invent titles. |
| BOOK | BOOK_TYPE | LibraryItem | type | WAIT_FOR_ANALYSIS_DECISION | D08: resolve via BOOK_TYPE; B is a candidate BOOK, not permission to default every record. |
| BOOK | RECORD_TYPE | LibraryItem | type | WAIT_FOR_ANALYSIS_DECISION | D08: RECORD_TYPE lookup may describe bibliographic format, not BOOK/THESIS/PROJECT. |
| BOOK | CALL_NUM | LibraryItem | callNumber | DIRECT | Raw textual candidate at item level; no splitting, numeric conversion or comma replacement. Scope/classification D06. |
| BOOK | CALL_NUM | LibraryItem | deweyCodeRaw, deweyClassificationId | WAIT_FOR_ANALYSIS_DECISION | D06: full call number is not necessarily a Dewey code; no automatic prefix extraction. No dedicated Dewey field in BOOK headers. |
| BOOK | LANG_CODE | LibraryItem | language | WAIT_FOR_ANALYSIS_DECISION | D09: explicit LANGUAGE code/label map; do not infer from title. |
| BOOK | PUBLISHING_DATE | LibraryItem | publicationYear | TRANSFORMATION_REQUIRED | Date/text to nullable SmallInt year only under agreed format/calendar rules; ambiguous values D10. |
| BOOK | ISBN | BookDetails | isbn | DIRECT | Nullable, nonunique target; preserve supplied text. Missing/invalid/colliding ISBNs D03. No generated ISBNs. |
| BOOK | EDITION_STATMENT | BookDetails | edition | DIRECT | Spelling is actual source header. Composite edition semantics D11. |
| BOOK | REMAN_EDITION_STATMENT | BookDetails | edition | WAIT_FOR_ANALYSIS_DECISION | D11: single target field; no implicit concatenation or overwriting primary edition. |
| BOOK | SUMMARY | LibraryItem | abstractDescription | DIRECT | Preserve source text; do not append unrelated notes silently. |
| BOOK | GENERAL_NOTE | LibraryItem | abstractDescription | WAIT_FOR_ANALYSIS_DECISION | D11: competing content, no separate notes field. |
| BOOK | LOCATION | PhysicalCopy / Branch | shelfLocation / id | WAIT_FOR_ANALYSIS_DECISION | D12: prove shelf vs branch vs other meaning and per-copy applicability. Cannot assign copies to MAIN by default. |
| BOOK | NUM_OF_COPIES, NUM_OF_VOLUMES | — | — | NOT_MIGRATED | Source evidence for later reconciliation; never manufacture copies from totals. COPIES_VOLUMES is copy candidate source. |
| BOOK | SUB_TITLE, SECTION_NUM, SECTION_TITLE | LibraryItem | title | WAIT_FOR_ANALYSIS_DECISION | D11: no dedicated fields; agree title composition/loss policy. |
| BOOK | TRANS_TITLE, REMAIN_TRANS_TITLE, TRANS_TITLE_SECTION_NUM, TRANS_TITLE_SECTION_NAME | — | — | NOT_MIGRATED | No alternate/translated title representation; retain in staging evidence. D11 if preservation in app required. |
| BOOK | COLLECTIVE_TITLE, COLLECTIVE_TITLE_SECTION_NUM, COLLECTIVE_TITLE_SECTION_NAME | — | — | NOT_MIGRATED | No series/collective-title target. |
| BOOK | PURE_TITLE | — | — | NOT_MIGRATED | Do not substitute legacy normalized title for TITLE. |
| BOOK | PRICE, CODE_PAGE, EXTENT, OTHER_PHYSICAL_DETAILS, DIMENSION, ACCOMP_MATERIAL, STRN, PERIODICAL_NOTES | — | — | NOT_MIGRATED | No matching current fields; do not overload description or ISBN. |
| BOOK | H_YEAR, H_MONTH, FREE_GDATE, FREE_HDATE | LibraryItem | publicationYear | WAIT_FOR_ANALYSIS_DECISION | D10: competing dates/calendars; no conversion or precedence chosen. |
| BOOK | ENTER_DATE | — | — | NOT_MIGRATED | Raw `date_raw` bytes are not SAMS createdAt; retain original evidence. |
| BOOK | USER_NAME | — | — | NOT_MIGRATED | Legacy operator is not current authenticated actor. |
| BOOK | EDITOR_TYPE | ItemContributor | role | WAIT_FOR_ANALYSIS_DECISION | D04: interpret alongside relation role fields; not a global AUTHOR default. |

## Physical inventory

| Legacy table | Legacy field | Current SAMS model | Current SAMS field | Mapping type | Notes / risks |
| --- | --- | --- | --- | --- | --- |
| COPIES_VOLUMES | GENERAL_CODE | PhysicalCopy | id | TRANSFORMATION_REQUIRED | UUID crosswalk keyed by source/table/key; retain original identifier. |
| COPIES_VOLUMES | BOOK_CODE | PhysicalCopy | itemId | RELATION | Resolve BOOK crosswalk; missing parent D02, no fabricated parent. |
| COPIES_VOLUMES | COPY_CODE | PhysicalCopy | copyCode | DIRECT | Nullable and not unique; retain text, do not treat as globally unique key. |
| COPIES_VOLUMES | BARCODE | PhysicalCopy | barcode | WAIT_FOR_ANALYSIS_DECISION | D13: target uniqueness requires approved collision/empty handling; no synthetic production barcodes. |
| COPIES_VOLUMES | STATUS | PhysicalCopy | status | WAIT_FOR_ANALYSIS_DECISION | D14: STATUS lookup and operational meaning required. RESERVED/BORROWED need consistent transaction context; never default unknown to AVAILABLE. |
| COPIES_VOLUMES | DEL_DATE | PhysicalCopy | status | WAIT_FOR_ANALYSIS_DECISION | D14: deletion evidence is not automatic ARCHIVED or a reason to recreate an active copy. |
| COPIES_VOLUMES | VOL_CODE, VOL_SUB_TITLE, isbn_v | — | — | NOT_MIGRATED | Current copy has no volume/title/ISBN fields; do not overwrite item ISBN. D11 if operational retention required. |
| COPIES_VOLUMES | general_number, other_number, ENCY_CODE, NOTES | — | — | NOT_MIGRATED | Additional inventory identifiers/notes unsupported; preserve in evidence. |
| COPIES_VOLUMES | IS_PERIODIC | LibraryItem | type | WAIT_FOR_ANALYSIS_DECISION | D08: no PERIODICAL enum. Does not establish academic work type. |
| COPIES_VOLUMES | USER_NAME | — | — | NOT_MIGRATED | Do not fabricate staff/audit history. |
| COPIES_VOLUMES | (no branch field) | PhysicalCopy | branchId | WAIT_FOR_ANALYSIS_DECISION | D12: required target relation; approve branch assignment independently of source folder/PC name. |
| COPIES_VOLUMES | (no condition field) | PhysicalCopy | condition | WAIT_FOR_ANALYSIS_DECISION | D14: nullable target; status is not condition. Do not invent GOOD. |

## Contributors and publishers

| Legacy table | Legacy field | Current SAMS model | Current SAMS field | Mapping type | Notes / risks |
| --- | --- | --- | --- | --- | --- |
| EDITOR | EDIT_CODE | Contributor | id | TRANSFORMATION_REQUIRED | UUID crosswalk; name equality is not identity, D04. |
| EDITOR | EDIT_NAME | Contributor | fullName | DIRECT | Preserve unsplit source name; table name EDITOR does not prove author role. |
| EDITOR | EDIT_DATE, PURE_EDIT_NAME | — | — | NOT_MIGRATED | No date/normalized-name target; no substitution or deduplication. |
| EDITOR_BOOK | EDIT_CODE | ItemContributor | contributorId | RELATION | Resolve EDITOR crosswalk; missing relationship D02. |
| EDITOR_BOOK | BOOK_CODE | ItemContributor | itemId | RELATION | Resolve BOOK crosswalk; missing relationship D02. |
| EDITOR_BOOK | EDIT_NATURE, EDITOR_TYPE, EDIT_SUBJECT | ItemContributor | role | WAIT_FOR_ANALYSIS_DECISION | D04: confirm lookup joins/role meanings with RELATOR; unsupported editor/translator roles cannot become AUTHOR silently. |
| EDITOR_BOOK | EDIT_RANK | — | — | NOT_MIGRATED | No contributor ordering field; API sorts by role/name. D11 if source order is required. |
| PUBLISHER | PUBL_CODE | — | — | NOT_MIGRATED | Preserve join key in staging; there is no Publisher model or target publisher UUID. |
| PUBLISHER | PUBL_NAME | BookDetails | publisher | DIRECT | Candidate only after resolving PUBL_BOOK; D04/D15 controls duplicates/multiple publishers. |
| PUBLISHER | PURE_EDIT_NAME, PURE_PUBL_NAME | — | — | NOT_MIGRATED | No normalized publisher fields; retain evidence. |
| PUBL_BOOK | BOOK_CODE | BookDetails | itemId | RELATION | Resolve BOOK crosswalk; only if approved type BOOK. |
| PUBL_BOOK | PUBL_CODE | BookDetails | publisher | RELATION | Join PUBLISHER.PUBL_CODE to PUBL_NAME; no target publisher FK. D15 when more than one relationship. |
| PUBL_BOOK | PUBL_TYPE | BookDetails | publisher | WAIT_FOR_ANALYSIS_DECISION | D15: select/compose roles only after agreed rule; no arbitrary first row. |
| PUBL_BOOK | PUBL_DATE | LibraryItem | publicationYear | WAIT_FOR_ANALYSIS_DECISION | D10: precedence against BOOK.PUBLISHING_DATE and calendar interpretation unresolved. |
| PUBL_BOOK | CONT_CODE, PLACE_OF_PUB | — | — | NOT_MIGRATED | No country/place-of-publication fields. |

## Subjects, classification and lookups

| Legacy table | Legacy field | Current SAMS model | Current SAMS field | Mapping type | Notes / risks |
| --- | --- | --- | --- | --- | --- |
| SUBJECT | SUBJECT_CODE | — | — | NOT_MIGRATED | No Subject model; keep key and links externally. |
| SUBJECT | SUBJECT_NAME, GEOGRAPHIC_SUB, CHRONOLOGICAL_SUB, PURE_SUBJECT | Category | name, description | WAIT_FOR_ANALYSIS_DECISION | D16: candidate only if approved taxonomy mapping exists. Many subject headings/qualifiers cannot fit one category without a decision. Never treat subject text as Dewey. |
| BOOK_SUBJECT | SUBJECT_CODE, BOOK_CODE | LibraryItem | categoryId | WAIT_FOR_ANALYSIS_DECISION | D16/D02: legacy many-to-many versus one category per item; no first-subject selection. |
| CLASS_PLAN | PLAN_CODE, PLAN_NAME, A_PLAN_NAME | DeweyClassification | code, name | WAIT_FOR_ANALYSIS_DECISION | D06: plan identifier/name may identify a classification system, not a Dewey class. No proven BOOK→CLASS_PLAN FK in inspected headers. |
| CATEGORIES | CATEGORY_CODE, CATEGORY_NAME | — | — | NOT_MIGRATED | BORROWERS.CATEGORY_CODE indicates borrower-category linkage; not proof of catalog Category equivalence. |
| BOOK_TYPE | TYPE_CODE, TYPE_NAME, A_TYPE_NAME, IS_PERIODIC | LibraryItem | type | WAIT_FOR_ANALYSIS_DECISION | D08: supporting lookup for BOOK.BOOK_TYPE; no dedicated target lookup table. |
| RECORD_TYPE | RECORD_CODE, TYPE_ENG, A_TYPE_ENG | LibraryItem | type | WAIT_FOR_ANALYSIS_DECISION | D08: resolve format semantics before combining with BOOK_TYPE. |
| LANGUAGE | LANG_CODE, LANG_NAME, A_LANG_NAME | LibraryItem | language | WAIT_FOR_ANALYSIS_DECISION | D09: choose documented target representation, not implicit code/label interchange. |
| STATUS | STATUS, STATUS_NAME, STATUS_NAME_ENG | PhysicalCopy | status | WAIT_FOR_ANALYSIS_DECISION | D14: lookup labels inform approved enum map; not proof of live loan history. |
| RELATOR | EDIT1_CODE, EDIT_ENG, A_EDIT_ENG | ItemContributor | role | WAIT_FOR_ANALYSIS_DECISION | D04: confirm which source role fields reference this lookup; existing enum is intentionally limited. |
| COUNTRY | CONT_CODE, REGN_CODE, CONT_NAME, A_CONT_NAME | — | — | NOT_MIGRATED | No publication geography model. |
| REGION | REGN_CODE, REGN_NAME, A_REGN_NAME, CONT_CODE | — | — | NOT_MIGRATED | No publication geography model. |
| GEOGRAPHIC_NAME | GEO_CODE, GEO_NAME, A_GEO_NAME | — | — | NOT_MIGRATED | Not Branch geography by assumption. |
| AUTHORITY | AUTHORITY_CODE, AUTHORITY_NAME | — | — | NOT_MIGRATED | Do not infer Faculty/Department from borrower authority. |
| BORROWING_TYPE / TRANSACTION_TYPE | BORROWING_CODE, BORROWING_NAME, E_BORROWING_NAME / TRANSACTION_CODE, TRANSACTION_NAME, E_TRANSACTION_NAME | — | — | NOT_MIGRATED | Not SAMS transaction enums or policy values by default. |
| CURRENCY / FREQUENCY / CLAIM_LEVEL | all exported fields | — | — | NOT_MIGRATED | Acquisition/serial/claim configuration outside v1 target. |

## Other tables and fields outside catalog migration

| Legacy table | Legacy field | Current SAMS model | Current SAMS field | Mapping type | Notes / risks |
| --- | --- | --- | --- | --- | --- |
| BOOK_OTHER_TITLES | BOOK_CODE, OTHER_TITLES_CODE, OTHER_TITLES, REMAIN_OTHER_TITLES, OTHER_TITLES_SECTION_NAME, OTHER_TITLES_SECTION_NUM, OTHER_TITLES_TYPE_FLG | — | — | NOT_MIGRATED | No alternate-title model; retain source links, D11 if required. |
| SERIALS / SERIAL_BOOK | SER_CODE, ISSN, SER_ADDRESS / SER_CODE, BOOK_CODE, SERIAL_NUM | — | — | NOT_MIGRATED | No serial model; ISSN is not ISBN. Type eligibility D08. |
| lost_book | book_code | PhysicalCopy | status | WAIT_FOR_ANALYSIS_DECISION | D14: book-level evidence cannot identify a lost copy automatically. |
| BORROWERS | ID, ID_TYPE, BORROWER_CODE, BORROWER_NAME, BORROWER_NAME_CONCATENATED, EMAIL, CATEGORY_CODE, AUTHORITY_CODE, STOPPED, MEMBERSHIP_BEGIN_DATE, MEMBERSHIP_END_DATE | User / Student | universityEmail, displayName / userId, studentId, academicStatus | WAIT_FOR_ANALYSIS_DECISION | D17: separate identity scope/authority decision; no assumed university email, student ID or SSO match. |
| BORROWERS | BORROWER_PASSWORD, BORROWER_USER_NAME, PIC_FILE, TITLE, ADDRESS, PHONE, NOTES, STOPPING_DATE, STOPPING_REASON, FINES, JOB_CODE | — | — | NOT_MIGRATED | No approved identity/history migration; credentials are never copied into SAMS. |
| USERS / USERS_FUNCTIONS / FUNCTION | all exported fields | — | — | NOT_MIGRATED | Legacy credentials/menu permissions do not establish SAMS RBAC. STAFF roles are provisioned separately. |
| STATISTICS | STATISTIC_DAY, RENOVATION, BORROWING, RETURNED, RESERVATION, ENTRY, SEARCH | — | — | NOT_MIGRATED | Aggregates cannot reconstruct Borrowing/Reservation/LibraryVisit facts; raw date bytes remain evidence. |
| BORROWING / BORROWING_HISTORY / RESERVATION | no exported rows; manifest-only | Borrowing / Reservation | — | NOT_MIGRATED | Packaged README reports these empty. Do not fabricate operational transactions from copy status or statistics. |
| LAST_CODES / SEQUENCES / MESSAGES / pbcatcol / pbcatedt / pbcatfmt / pbcattbl | all exported fields | — | — | NOT_MIGRATED | Legacy counters/UI/tool metadata; no operational migration. |
| MANIFEST | all fields | — | — | NOT_MIGRATED | Handoff metadata retained as future migration evidence, not application rows. Other manifest-only empty tables require scope review if a later extract contains rows. |

No source field is approved to set SAMS `version`, `createdAt`, `updatedAt`, active flags, circulation policy, AuditLog or IdempotencyRecord. Future migration execution metadata must be distinct from historical source timestamps and actors.

## Unresolved decision register

Every entry below is **WAIT_FOR_ANALYSIS_DECISION**. These are required decision categories, not newly established findings or counts. Data Analysis supplies evidence/dispositions; librarians confirm catalog semantics and software owners approve any operational loss or scope change.

| ID | Decision required before migration |
| --- | --- |
| D01 | Duplicate-looking catalog records, duplicate source identifiers, canonical identity/retain decisions; no title/ISBN based automatic merge. |
| D02 | Orphan copies, missing contributor/publisher/subject parents, repeated relationship rows; no invented parent or silent link dropping. |
| D03 | Missing, malformed or colliding ISBNs; nullability is supported but does not settle acceptance policy. |
| D04 | Duplicate-looking authors/publishers, name identity, role lookup meanings and unsupported roles. |
| D05 | Suspicious/test records and inclusion/exclusion approval. |
| D06 | Inconsistent classification, Dewey extraction, classification-plan semantics and item vs copy call-number scope. |
| D07 | Missing title/required data; hold rather than invent values. |
| D08 | Material/type lookup interpretation, serials and any academic work evidence; report does not confirm a thesis/project collection. |
| D09 | Language code mapping and unmapped values. |
| D10 | Publication date/calendar/precedence decisions and undecoded native dates. |
| D11 | Subtitle/edition/note composition and disposition of unsupported bibliographic, volume and contributor-order information. |
| D12 | Required real branch assignment and LOCATION/shelf meaning. |
| D13 | Barcode uniqueness/blank handling and source-copy identity. |
| D14 | Status/condition/deletion/lost evidence, unavailable handling and current operational state reconciliation. |
| D15 | Multiple publisher relationships into one string; no arbitrary selection/concatenation. |
| D16 | SUBJECT many-to-many preservation versus one Category; approved taxonomy and Dewey must remain separate. |
| D17 | Whether legacy borrower identity/history is in scope and how institutional identity will be validated. |

## Schema gap assessment

No proven blocking gap requires changing the current schema for frontend development or this preparation. Real representation limits exist: no Subject join model, Publisher entity/multiple publisher relation, editor/translator role, alternate titles, per-copy volume metadata or per-copy call number. These are conditional migration gaps if stakeholders require lossless operational retention. Retain the source in future staging and obtain a decision before changing schema or discarding information. UUID traceability can live in an external migration crosswalk; it does not require a new Prisma model now.

The current APIs trim several inputs and coerce blank optional text to null. A future importer must review that behavior against approved preservation rules rather than blindly posting raw rows through catalog endpoints. Existing PostgreSQL partial indexes, checks and cross-table triggers remain mandatory; see [migration plan](MIGRATION_PLAN.md).
