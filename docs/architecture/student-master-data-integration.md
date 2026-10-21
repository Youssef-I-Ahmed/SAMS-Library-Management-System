# Student Master Data Integration Decision

**Status:** Approved architecture direction
**Integration source:** TBD

## Ownership

Student master data is owned by the university, not by the library.

This includes student ID, university email, display name, faculty, department,
academic status and university account state.

SAMS consumes a synchronized copy so reservations, borrowing and physical-library
visits can reference a trusted student identity.

## Librarian access

Librarians may search and view student records and use an existing record in
circulation/visit workflows.

Librarians must not create or correct university-owned student master data.
Corrections must originate from the authoritative university source.

## Integration source

The transport mechanism is still TBD. Possible adapters include:

- CSV / Excel supplied by the university
- University API
- read-only university database / SIS integration
- scheduled synchronization from another authoritative system

```text
Authoritative University Student Source
             |
             v
     Integration / Sync Adapter
             |
             v
       SAMS students table
             |
       +-----+---------+
       |               |
       v               v
 Circulation       Student login
 / Visits          identity match
```

## Existing import endpoint

The current backend student import/upsert capability is retained temporarily for
migration/integration work. It is not exposed as a librarian-owned Add/Edit Student
workflow in the production UI.

When the integration mechanism is confirmed, backend authorization for student
synchronization should move to the appropriate administrative/service identity.
