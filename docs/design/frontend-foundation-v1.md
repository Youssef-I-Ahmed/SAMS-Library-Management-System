# SAMS Library Frontend Foundation v1

**Sprint:** 9A  
**Scope:** Frontend architecture, localization, theming, branding and responsive baseline.

## Core rules

### 1. Language

The frontend supports:

- English (`en`) using `dir="ltr"`
- Arabic (`ar`) using `dir="rtl"`

Changing language updates both:

- visible copy
- the root document language/direction

The preference is persisted with:

```text
sams.language
```

### 2. Theme

The frontend supports:

- Light
- Dark

The preference is persisted with:

```text
sams.theme
```

Components must use semantic theme variables such as:

```css
--app-bg
--surface
--text-primary
--text-secondary
--border-default
--brand-primary
```

Avoid hard-coding white/black as general page colors.

### 3. SAMS brand asset rule

Brand selection is **surface-first**, not theme-first.

Light surfaces use navy artwork:

```text
/brand/sams-logo-navy.png
/brand/sams-full-logo-navy.png
```

Dark surfaces use white artwork:

```text
/brand/sams-logo-white.png
/brand/sams-full-logo-white.png
```

Examples:

- Light theme + dark hero -> white logo
- Light theme + white navbar -> navy logo
- Dark theme + dark navbar -> white logo
- Dark theme + light content card -> navy logo

`BrandLogo` owns this decision so pages do not duplicate asset-selection logic.

### 4. Shared design tokens

Existing SAMS primitives remain in:

```text
packages/ui/src/design-tokens.css
packages/ui/design-tokens.json
```

Application-specific semantic light/dark mappings live in:

```text
apps/web/src/styles/themes.css
```

### 5. RTL/LTR implementation

Prefer CSS logical properties:

```text
margin-inline
padding-inline
inset-inline-start
inset-inline-end
border-inline-start
```

Avoid layout code that assumes left/right unless direction is intrinsically meaningful.

### 6. Architecture

```text
apps/web/src
├── app
│   ├── providers
│   └── router
├── components
│   ├── brand
│   ├── layout
│   └── ui
├── features
├── hooks
├── i18n
├── styles
├── App.jsx
├── main.jsx
└── styles.css
```

The root entry files stay intentionally thin.

## Sprint 9A validation

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sprint9\sprint9a-frontend-foundation-smoke.ps1
```

The smoke verifies:

- required foundation files
- all four SAMS PNG brand assets
- English + Arabic contract
- RTL/LTR contract
- surface-aware logo selection
- Vite production build
- brand assets copied into production `dist`
