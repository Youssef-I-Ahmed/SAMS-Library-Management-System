# SAMS — Next Library Visit Migration Checklist

## Goal

Collect enough source evidence to unblock the real migration.

Do not modify the legacy machines more than necessary.

---

## For every legacy PC

Create a separate folder, for example:

```text
PC-01/
PC-02/
```

Do not merge files from different machines.

Inside each folder record:

```text
physical PC label/location
library branch/location
Windows version
date/time collected
person who collected it
```

---

## Copy the full application/data folders

Priority extensions:

```text
.exe
.dll
.mdb
.accdb
.db
.dbf
.dat
.ini
.cfg
.xml
.bak
```

Do not copy only the files that "look useful".

The missing master table/source may be in a file that was previously ignored.

---

## Windows shortcut information

For every shortcut used to launch the legacy library program record:

```text
Target
Start In
```

Screenshot or copy the exact text.

This may reveal the actual application/data directory.

---

## Find database/config references

Search copied/config files for terms like:

```text
digi1
sss
BOOK
BOOK_CODE
CALL_NUM
BOOK_TYP
LANG_C
STATUS
COPY
PROJECT
THESIS
RESEARCH
```

Preserve the original file before testing anything.

---

## Questions for library staff

Ask explicitly:

```text
1. What does status code A mean?
2. Are there other copy status codes? What does each mean?
3. What does BOOK_TYP / BOOK_TYPE B mean?
4. What do language codes 1, 2, ... mean?
5. How does the system distinguish:
   - book
   - project
   - thesis
   - research?
6. Is CALL_NUM the same for every copy of one title?
7. Can the same title have different CALL_NUM values by branch/copy?
8. Does each PC represent a different branch/database?
9. Are deleted/lost/archived copies still stored in the old database?
10. Is there a backup/export function inside the legacy program?
```

Write down answers exactly; avoid translating them into SAMS enums on the spot.

---

## Safe collection order

```text
1. identify shortcut Target / Start In
2. close legacy application if staff permits
3. copy whole app/data folder
4. copy obvious backup folders
5. record PC/branch/source identity
6. do not rename source files
7. do not merge PC folders
8. hash/archive the copy later on the development machine
```

---

## Highest-priority blockers to resolve

```text
A. recover 2,108 missing book titles/master records
B. PROJECT vs THESIS distinction for 3,890 rows
C. real source DB/PC -> SAMS Branch mapping
D. legacy copy-status meanings
E. language-code meanings
F. item-level vs copy-level CALL_NUM semantics
```

If those are resolved, the full migration pipeline can move from pilot to production planning.
