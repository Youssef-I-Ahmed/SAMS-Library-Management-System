# SAMS Student Discovery Frontend v1

**Sprint:** 9C

## Backend contracts

```text
GET /api/v1/discovery/facets
GET /api/v1/discovery/items
GET /api/v1/discovery/items/:id
```

## Student features

- search-first home
- BOOK / THESIS / PROJECT shortcuts
- URL-backed catalog filters
- type / category / Dewey / language / year / branch filters
- available-only filter
- sorting
- pagination
- item details
- safe branch-level availability
- reservation-readiness display
- English / Arabic
- Light / Dark

## Privacy

Student discovery must not expose:

```text
physicalCopy.id
barcode
copyCode
shelfLocation
```

Reservation mutation remains deferred to Sprint 9D.
