# Sprint 9G3 — UI/UX + Accessibility Polish

This checkpoint deliberately does not change business rules.

## Improvements

### Student responsive navigation

The primary student navigation no longer disappears on smaller screens.

- desktop / tablet: normal horizontal navigation when space permits
- mobile: fixed bottom navigation for Home, Catalog, Reservations and Borrowings

### Staff responsive navigation

At mobile widths the large sidebar becomes a compact horizontally scrollable
navigation strip instead of a tall multi-row block.

### Accessibility

- minimum interactive target baseline: 44px
- explicit account-menu semantics
- user menu closes with Escape and outside click
- admin dialogs close with Escape
- admin dialogs lock background scrolling
- dialog close button receives initial focus
- reduced-motion support retained
- high-contrast preference support added
- stronger form focus states

### RTL

Additional RTL alignment and direction rules are applied to operational facts,
tables and left-to-right identity values such as email.

### Tables and dialogs

- sticky table headers
- mobile sheet-style dialogs
- sticky modal heading/actions
- improved overflow behavior

## Browser validation

Review at minimum:

- 1366px desktop
- ~768px tablet
- ~390px mobile
- English + Arabic
- light + dark

Roles:

- Student
- Librarian
- Management
