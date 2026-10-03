# SAMS Library Management System
## Design System v1.0

**Status:** Working design baseline  
**Scope:** Student Portal, Librarian/Admin Portal, Management/Analytics views  
**Implementation target:** React + responsive web UI  
**Brand note:** The palette below is a working SAMS-inspired palette based on the approved prototype direction (navy / blue / white). Exact hex values should be reconciled with official brand guidelines if/when they are provided.

---

## 1. Design Principles

1. **Academic & trustworthy** — the interface should feel appropriate for a university system, not a consumer social app.
2. **Fast for librarians** — circulation screens prioritize speed, clarity, keyboard use, and minimal clicks.
3. **Simple for students** — search, availability, reservation, and borrowing history are the primary student tasks.
4. **Consistent across roles** — Student, Librarian, and Management surfaces share the same visual language.
5. **Data-first** — tables, filters, statuses, counts, and analytics must remain readable at a glance.
6. **Accessible** — visible focus states, semantic colors, readable contrast, and large interaction targets.
7. **Responsive** — Student Portal must work comfortably on mobile; Admin Portal is desktop-first but tablet-safe.
8. **Arabic-data ready** — book titles, names, call numbers, and metadata may contain Arabic text. UI components must not break when mixed Arabic/English content is displayed.

---

## 2. Core Color Palette

### Brand / Primary

| Token | Hex | Usage |
|---|---|---|
| `primary-950` | `#071D35` | Deep navigation/background |
| `primary-900` | `#0B2F57` | Main SAMS navy |
| `primary-800` | `#104273` | Sidebar / dark buttons |
| `primary-700` | `#15558F` | Hover / active navigation |
| `primary-600` | `#1E6AB0` | Links / secondary emphasis |
| `primary-500` | `#2E7FC4` | Accent blue |
| `primary-100` | `#DCECF9` | Selected/soft surfaces |
| `primary-50`  | `#F2F8FD` | Light page accents |

### Neutral

| Token | Hex | Usage |
|---|---|---|
| `neutral-950` | `#111827` | Primary text |
| `neutral-800` | `#1F2937` | Headings |
| `neutral-700` | `#344054` | Body text |
| `neutral-500` | `#667085` | Secondary text |
| `neutral-400` | `#98A2B3` | Placeholder / disabled text |
| `neutral-300` | `#D0D5DD` | Strong borders |
| `neutral-200` | `#E4E7EC` | Standard borders |
| `neutral-100` | `#F2F4F7` | Table stripes / subtle fills |
| `neutral-50`  | `#F8FAFC` | App background |
| `white` | `#FFFFFF` | Cards / content surfaces |

### Semantic

| Meaning | Main | Soft background | Typical usage |
|---|---|---|---|
| Success | `#168A4B` | `#EAF8F0` | Available, Active, Returned |
| Warning | `#C77B00` | `#FFF6DF` | Reserved, Due Soon, Pending |
| Danger | `#D92D20` | `#FEECEC` | Overdue, Lost, Damaged, Error |
| Info | `#2563EB` | `#EEF4FF` | Informational states |
| Purple | `#6941C6` | `#F4F0FF` | Management / optional analytics accent |

**Rule:** Never communicate state using color alone. Always pair color with a label/icon.

---

## 3. Typography

### Recommended stack

```css
font-family: Inter, "Noto Sans Arabic", Arial, sans-serif;
```

- **Inter**: primary Latin UI font.
- **Noto Sans Arabic**: Arabic names, book metadata, call-number fragments, and possible future Arabic localization.

### Type Scale

| Style | Size | Weight | Usage |
|---|---:|---:|---|
| Display | 36px | 700 | Login / major landing title |
| H1 | 30px | 700 | Main page title |
| H2 | 24px | 700 | Major sections |
| H3 | 20px | 600 | Cards / subsections |
| H4 | 18px | 600 | Small sections |
| Body Large | 16px | 400/500 | Important body text |
| Body | 14px | 400 | Standard UI text |
| Small | 12px | 400/500 | Helper/meta text |
| Label | 13–14px | 500/600 | Form/table labels |

### Typography Rules

- Avoid all-caps for long labels.
- Table headers may use medium/semibold weight, not oversized text.
- Use tabular numerals where practical for IDs, dates, counts, and analytics.
- Mixed Arabic/English content must be tested with `dir="auto"` at the field/text level when needed.

---

## 4. Spacing System

Base unit: **4px**.

```text
4   = xxs
8   = xs
12  = sm
16  = md
20  = lg
24  = xl
32  = 2xl
40  = 3xl
48  = 4xl
64  = 5xl
```

Default page spacing:

- Desktop page padding: `24–32px`
- Mobile page padding: `16px`
- Card padding: `16–24px`
- Form field vertical gap: `16px`
- Section gap: `24–32px`

---

## 5. Radius & Elevation

### Border Radius

| Token | Value | Usage |
|---|---:|---|
| `radius-sm` | 6px | Compact inputs/badges |
| `radius-md` | 8px | Buttons/inputs |
| `radius-lg` | 12px | Cards/modals |
| `radius-xl` | 16px | Hero / large panels |

### Shadows

Use shadows lightly; university software should not feel overly decorative.

- Card: `0 1px 3px rgba(16,24,40,.08)`
- Elevated: `0 4px 12px rgba(16,24,40,.10)`
- Modal: `0 16px 40px rgba(16,24,40,.16)`

---

## 6. Layout

### Student Portal

- Top navigation on desktop.
- Mobile navigation collapses into menu/drawer.
- Search is the dominant home-page action.
- Max content width: approximately `1200–1280px`.

### Admin / Librarian Portal

- Desktop-first.
- Left sidebar: `240–264px`.
- Top bar contains branch selector, notifications, and user menu.
- Main content uses fluid width.
- Tables should remain usable from 1024px upward.

### Management

Uses the Admin shell but hides operational actions based on role permissions.

---

## 7. Responsive Breakpoints

```text
sm   640px
md   768px
lg   1024px
xl   1280px
2xl  1536px
```

### Behavior

- `< 768px`: Student UI stacks cards vertically; filters become a drawer.
- `< 1024px`: Admin sidebar may collapse to icons/drawer.
- Wide analytics tables may scroll horizontally rather than squeeze columns beyond readability.

---

## 8. Buttons

Minimum interactive height: **40px desktop**, ideally **44px on touch/mobile**.

### Primary

- Background: `primary-900`
- Text: white
- Hover: `primary-800`
- Use for one dominant action per section/modal.

Examples:

- Reserve Book
- Confirm Borrow
- Confirm Return
- Save Changes

### Secondary

- White background
- `primary-900` border/text

Examples:

- Cancel
- View Details
- Change Copy

### Destructive

- Danger text/border or solid danger only when consequence is clear.

Examples:

- Cancel Reservation
- Archive Item

### Disabled

- Neutral background/text.
- No hover effect.
- Cursor and ARIA state must reflect disabled status.

---

## 9. Form Controls

Supported components:

- Text Input
- Search Input
- Select
- Multi-select
- Date Picker
- Date Range Picker
- Checkbox
- Radio Group
- Textarea
- Autocomplete / searchable select

### Form Rules

- Label above field.
- Required fields use `*` plus accessible metadata.
- Validation text appears directly below the field.
- Do not clear entered values after a validation error.
- Search fields use a consistent search icon and keyboard submission.

---

## 10. Search & Filters

### Student Catalog

Primary search supports:

- Title
- Author / contributor
- ISBN
- Keyword
- Call Number (where applicable)

Filters:

- Type
- Branch
- Availability
- Category
- Publication Year
- Language
- Dewey Classification (browse or advanced filter)

### Admin Catalog

Adds operational filters:

- Active / archived
- Copy status
- Branch
- Item type

On mobile, filters should open in a drawer/bottom sheet.

---

## 11. Status Badges

### Library / Inventory

| State | Semantic style |
|---|---|
| AVAILABLE | Success |
| RESERVED | Warning |
| BORROWED | Info / Primary |
| UNAVAILABLE | Neutral |
| DAMAGED | Danger |
| LOST | Danger |
| ARCHIVED | Neutral |

### Reservation

| State | Style |
|---|---|
| PENDING | Warning |
| ACTIVE | Success/Primary |
| FULFILLED | Success |
| CANCELLED | Neutral |
| EXPIRED | Danger/Neutral |

### Borrowing UI State

| State | Style |
|---|---|
| Active | Success/Info |
| Due Soon | Warning |
| Overdue (derived) | Danger |
| Returned | Neutral/Success |
| Lost | Danger |

---

## 12. Cards

Primary card types:

1. **Content card** — item/book result.
2. **Stat card** — dashboard KPI.
3. **Profile card** — student data.
4. **Branch card** — branch inventory/visitors.
5. **Action card** — Book / Thesis / Project selection.

Rules:

- White surface.
- Border `neutral-200`.
- 12px radius.
- Avoid nested shadows.

---

## 13. Tables

Used heavily in Admin Portal.

Requirements:

- Sticky header for long datasets where useful.
- Search and filters above the table.
- Pagination below.
- Sortable columns where meaningful.
- Status displayed as badge.
- Actions remain predictable: View → Edit → Context menu.
- Never rely on horizontal color coding alone.
- Empty state instead of blank table.

Core tables:

- Catalog
- Reservations
- Students
- Copies
- Audit Logs
- Users & Roles

---

## 14. Navigation Components

### Student Top Nav

- Home
- Catalog
- My Reservations
- My Borrowings
- Profile
- Notifications (future/when enabled)

### Admin Sidebar

- Dashboard
- Library Operations
  - Borrow
  - Return
  - Reservations
  - Library Visits
- Catalog
  - Library Items
  - Add Item
  - Physical Copies
  - Categories
  - Dewey Classification
- Students
- Branches
- Reports
- Administration
  - Circulation Policies
  - Users & Roles
  - Audit Logs

Visibility depends on role/permissions.

---

## 15. Modals & Confirmation Dialogs

Use for high-consequence or short confirmatory flows:

- Confirm Reservation
- Cancel Reservation
- Archive Item
- Confirm Return
- Deactivate User

A destructive modal must state exactly what will happen.

Example:

> Archive this item? It will no longer appear as active in the catalog, but historical borrowing records will be preserved.

---

## 16. Notifications & Feedback

### Toasts

Use for successful low-risk actions:

- "Book returned successfully."
- "Item updated."

### Inline Alerts

Use for context-specific conditions:

- Student not eligible to borrow.
- Reservation expired.
- No copy available.

### Blocking Modal

Use only when explicit acknowledgement is required.

---

## 17. Loading / Empty / Error States

Every data screen must define:

- Loading skeleton.
- Empty state.
- Error state.
- Retry action when appropriate.

Examples:

- No active reservations.
- No books found for these filters.
- Could not load library data — Retry.

---

## 18. Iconography

Use one consistent outline icon family across the app.

Rules:

- 16px for compact/table actions.
- 20px for buttons/forms.
- 24px for navigation/cards.
- Icons supplement labels; important actions should not be icon-only unless universally understood and accessible.

---

## 19. Accessibility Baseline

- WCAG-style contrast target: at least 4.5:1 for normal text where applicable.
- Visible keyboard focus ring.
- All form inputs have labels.
- Interactive targets ~44px on touch interfaces.
- Do not encode status by color alone.
- Tables must have semantic headers.
- Modal focus should remain trapped until dismissed.
- Use `aria-live` for important async confirmation/error messages.

---

## 20. Role-Specific Experience

### Student

Priorities:

1. Search
2. Availability
3. Reserve
4. Current reservations
5. Current borrowing status

### Librarian

Priorities:

1. Borrow quickly
2. Return quickly
3. Register visits
4. Resolve reservations
5. Catalog/inventory maintenance

### Management

Priorities:

1. KPIs
2. Reports
3. Branch comparison
4. Trends / analytics

Management should not see circulation mutation actions unless also assigned an operational role.

---

## 21. Design Tokens — Implementation Naming

Recommended CSS/Tailwind semantic aliases:

```text
--color-primary
--color-primary-hover
--color-page
--color-surface
--color-border
--color-text
--color-text-muted
--color-success
--color-warning
--color-danger
--color-info
```

Do not scatter raw hex codes through React components.

---

## 22. Current Design Status

### Student Prototype

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

### Admin / Librarian Prototype

- A01 Dashboard
- A02 Borrow Item
- A03 Return Item
- A04 Reservations
- A05 Library Visits
- A06 Catalog / Library Items
- A07 Add Library Item
- A08 Physical Copies
- A09 Student Details
- A10 Students Management
- A11 Branches Management
- A12 Circulation Policies
- A13 Audit Logs
- A14 Reports & Analytics
- A15 Users & Roles

---

## 23. TBC Before Final Brand Freeze

- Official SAMS brand hex codes / brand guideline file.
- Official logo variants and minimum clear-space rules.
- Whether Arabic interface localization is required in v1 or only Arabic catalog data support.
- Whether Management is a separate visible portal or role-filtered Admin shell (current recommendation: shared shell).

---

**End of Design System v1.0**
