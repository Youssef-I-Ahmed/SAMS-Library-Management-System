# SAMS Library Management System
## Development Roadmap v1.0

## Current Status

| Area | Status |
|---|---|
| Requirements | ✅ Complete v1 |
| ERD | ✅ Complete v2 |
| Workflow | ✅ Complete |
| Use Cases | ✅ Complete |
| System Architecture | ✅ Complete |
| Database Design | ✅ Complete v1 |
| PostgreSQL / Prisma baseline | ✅ Complete v1 |
| UI/UX Prototype | ✅ Complete v1 |
| Design System | ✅ Complete v1 |
| MVP Backlog | ✅ Complete v1 |
| Sprint Plan | ✅ Complete v1 |
| Coding | **NEXT** |

## Delivery Stages

### Stage A — Analysis & Design
Complete for v1.

### Stage B — MVP Implementation
- Authentication abstraction.
- Catalog.
- Search.
- Reservations.
- Borrowing/returns.
- Visits.
- Basic analytics.

### Stage C — Legacy Migration
- Source discovery.
- Staging.
- Transformation.
- Validation.
- Full migration.

### Stage D — University Integrations
- SSO.
- Student Database.
- Hosting/network.
- Production deployment.

### Stage E — Enhancements
- Barcode/QR.
- Notifications.
- Advanced BI.
- Semantic search / AI.
- Mobile app.

## Technical Baseline

```text
Frontend: React + Vite
Backend: Node.js + Express
ORM: Prisma
Database: PostgreSQL
Auth: Provider abstraction → University SSO later
Analytics: SQL Views + Python/Pandas/Power BI
Deployment: Modern server/cloud + HTTPS
```

## Development Principles

1. Do not target Windows XP for the new system.
2. Do not block development on external university integrations.
3. Database integrity is authoritative.
4. Concurrency is a first-class requirement.
5. Historical data must remain valid.
6. Multi-branch stays in the core model.
7. Policies are configurable, not hardcoded.
8. Analytics requirements affect data capture from the beginning.
9. MVP first; AI later.

## Immediate Next Action

**Begin Sprint 0 — Project Foundation.**
