# مراجعة مجلد sams بالكامل — تصحيح النطاق والنتائج

الفحص الأول شمل Ddrive فقط. بعد توضيح المستخدم، تم توسيع الجرد والفحص إلى `Y:\Courses\sams` بالكامل: `aLIS` و`aLIS_setup` و`database` و`Ddrive` والملفات الموجودة مباشرة في sams.

**النتيجة الأهم:** قاعدة `sams\aLIS\slis.db` تحتوي على **2,843 سجل فهرسة، منها 2,837 مصنفًا Book، و4,832 سجل نسخة**. هذه أكبر من نسخة Ddrive التي احتوت على 2,416 سجلًا، وتضيف 427 رقم فهرسة مع الاحتفاظ بجميع الأرقام السابقة.

## Scope and completeness

- 582 original filesystem files, 2,041,927,975 bytes, read and hashed; no enumeration/read errors.
- 35 database paths: 31 nonempty SQL Anywhere files, four empty files, 17 distinct nonempty images. Every image has a parsed catalog/schema dossier.
- The RAR archive was read without executing its contents. All 435 member files match files already present on disk by SHA-256.
- 35 InstallShield CAB containers were identified and hashed, but the available archive decoder could not open their internal payloads. Other proprietary installer/binary files were statically inspected, not fully reverse-engineered. Therefore “every filesystem file inspected” does **not** mean every compressed installer payload or arbitrary binary structure was decoded.
- Original EXE/BAT/COM/DLL/setup files and shortcuts were never executed. Installed analysis tools and newly authored Python scripts were used. All outputs remain under `Ddrive/_analysis`.

## Corrected answers A–I

**A — Main database:** VERY LIKELY `sams/aLIS/slis.db`. The server shortcut explicitly targets `C:\Program Files\aLIS\slis.db`, engine `slis`, using TCP/IP. Runtime connection on the original PC was not tested.

**B — Books found:** CONFIRMED, in BOOK with author, publisher, subject and copy relationship tables.

**C — Count:** 2,843 catalog rows / 2,837 B-coded rows / 4,832 copies in the richest supplied image. Do not add backup totals. The Ddrive counts in the older reports describe only that subtree.

**D — Theses/projects:** No confirmed academic thesis/graduation-project collection in the decoded library tables. Keyword matches alone do not establish degree records. Compressed installer internals and deleted-record recovery remain limitations.

**E — Same database?:** Cannot confirm without identifying actual theses/projects. The mixed-material schema can hold other types, but capability is not proof of contents.

**F — Missing references:** The original slis8.0 DatabaseFile/host settings are still missing even though an ODBC.INI driver registration was found. host_database/EXP_IMP mappings remain unresolved. No main-library companion log found; custdb.log is a vendor-demo log. The installer files formerly missing from Ddrive do exist elsewhere under sams.

**G — Other PC/server evidence:** CONFIRMED historical network reference `\\SERVER\aLIS`, plus a dbsrv8 TCP/IP launch shortcut. This is stronger evidence than was available in Ddrive. It does not prove another catalog exists there or that SERVER is currently reachable.

**H — What to collect from original PC:** Preserve the current `C:\Program Files\aLIS` folder, its slis.db and consistent companion logs/backups; original ODBC registry settings for slis8.0, host_database and EXP_IMP; and any database targets on the SERVER share. Preserve the separately remembered thesis/project collection if it is on another drive/computer. Copy/image evidence safely rather than launching the old application to explore it.

**I — Safest CSV step:** Generate analysis CSVs from the already decoded `sams/04c9fb714000/records.json` inside `_analysis`, preserving all 2,843 BOOK rows and separate related tables. Keep copies with missing parents in an exception export. For vendor validation use only a disposable evidence copy, a trusted compatible engine and verified read-only mode; never repair/recover the originals.

## Reports and evidence

- [Full file inventory](sams/FILE_INVENTORY.md)
- [All database paths, counts and schema/sample dossiers](sams/DATABASE_CANDIDATES.md)
- [Updated book findings](sams/BOOK_DATA_CANDIDATES.md)
- [Updated connections and shortcuts](sams/CONNECTIONS.md)
- [Full-tree integrity check](sams/INTEGRITY_CHECK.md)

Original Ddrive-only reports are retained as scoped historical findings and carry a prominent correction banner. Native date fields remain raw storage bytes; Arabic decoding uses CP1256 based on readable content. Application row totals are checked against catalog metadata, not a running SQL engine. Native engine/index integrity has not been certified.
