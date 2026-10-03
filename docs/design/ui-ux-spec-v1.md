# SAMS Library Management System
## UI/UX Specification v1.0

This document records the screen map and primary interaction flows approved during the prototype phase.

---

## 1. Portal Structure

### Student Portal

- S01 Login
- S02 Student Home
- S03 Search Results / Catalog
- S04 Item Details
- S05 Reservation Confirmation
- S06 Reservation Success
- S07 My Reservations
- S08 My Borrowings
- S09 Student Profile
- S10 Availability by Branch
- S11 Notifications concept

### Librarian / Admin Portal

- A01 Dashboard
- A02 Borrow Item
- A03 Return Item
- A04 Reservations Management
- A05 Library Visits
- A06 Catalog / Library Items
- A07 Add Library Item
- A08 Manage Physical Copies
- A09 Student Details
- A10 Students Management
- A11 Branches Management
- A12 Circulation Policies
- A13 Audit Logs
- A14 Reports & Analytics
- A15 Users & Roles

---

## 2. Primary Student Journey

```text
University Login
    ↓
Home / Search
    ↓
Search Results
    ↓
Item Details + Branch Availability
    ↓
Reservation Confirmation
    ↓
Reservation Success
    ↓
Student visits selected branch
    ↓
Librarian processes borrowing
    ↓
My Borrowings updated
```

---

## 3. Primary Librarian Borrowing Journey

```text
Borrow Screen
    ↓
Search Student
    ↓
Eligibility Check
    ↓
Select Item / Physical Copy
    ↓
Detect Matching Reservation (if any)
    ↓
Review Due Date / Policy
    ↓
Confirm Borrow
    ↓
Success Feedback
```

Important UX rule: the librarian should not need to navigate through multiple unrelated screens to complete a routine checkout.

---

## 4. Return Journey

```text
Return Screen
    ↓
Search by Copy Code / Borrowing ID
    ↓
Show Student + Borrowing
    ↓
Select Return Condition
    ↓
Optional Notes
    ↓
Confirm Return
    ↓
Success Feedback
```

If the borrowing is already returned, show an explicit non-destructive message instead of attempting the operation again.

---

## 5. Visit Journey

### Check-In

```text
Search Student ID / University Email
    ↓
Student card
    ↓
Check In
```

### Check-Out

```text
Search Student
    ↓
Show open visit + duration
    ↓
Check Out
```

The Visit interface should expose "currently inside" count for librarians when practical.

---

## 6. Catalog Entry Flow

```text
Add Item
    ↓
Choose Type
(Book / Thesis / Graduation Project)
    ↓
Type-specific form
    ↓
Classification / Dewey / Call Number
    ↓
Add physical copy/copies
    ↓
Review
    ↓
Save
```

Type-specific data:

### Book
- Title
- Author(s)
- ISBN
- Publisher
- Edition
- Publication Year
- Language
- Category
- Dewey
- Call Number

### Thesis
- Title
- Researcher
- Supervisor
- Faculty
- Department
- Academic Year
- Abstract
- Dewey
- Call Number

### Graduation Project
- Title
- Team Members
- Supervisor
- Faculty
- Department
- Graduation Year
- Description
- Dewey
- Call Number

---

## 7. Dashboard

### Librarian Dashboard

Prioritize operational awareness:

- Visitors Today
- Borrowings Today
- Active Reservations
- Overdue Items
- Recent Activity
- Most Borrowed Items

### Management Analytics

Prioritize trends and comparisons:

- Total Visitors
- Total Borrowings
- Reservation Conversion
- Overdue Rate / Count
- Borrowings Over Time
- Items by Type
- Most Borrowed Items
- Visitors by Hour
- Branch comparison
- Department/category usage

---

## 8. Permissions in UI

The frontend may hide unauthorized controls for usability, but the backend remains the source of authorization truth.

### Student

Can search, view, reserve, cancel eligible reservations, and view personal activity.

### Librarian

Can manage catalog/inventory and perform circulation/visit operations according to permissions.

### Management

Primarily read-only analytics and reports unless another operational role is also assigned.

---

## 9. Responsive Priorities

### Mobile-first importance

Student screens:

- Login
- Home/Search
- Results
- Item Details
- Reservations
- Borrowings

### Desktop-first importance

Librarian/Admin screens:

- Borrow
- Return
- Catalog tables
- Reservations tables
- Analytics
- Audit logs

---

## 10. Shared Components

- AppLogo / BrandMark
- StudentTopNav
- AdminSidebar
- AdminTopBar
- BranchSelector
- SearchBox
- FilterPanel
- ItemCard
- AvailabilityIndicator
- StatusBadge
- StatCard
- DataTable
- Pagination
- StudentSummaryCard
- ReservationCard
- BorrowingCard
- ConfirmationModal
- Toast / InlineAlert
- EmptyState
- LoadingSkeleton

---

## 11. Design Reference

Use `design-system-v1.md` and `../../packages/ui/design-tokens.json` for visual implementation. Raw color values should not be duplicated throughout components.

---

## 12. Next UX Deliverable

The next implementation-planning artifact is the **MVP Backlog / Sprint Plan**, mapping these screens and workflows to backend modules and development tasks.

