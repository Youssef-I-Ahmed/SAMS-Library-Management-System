# Data Directory

- `raw/` — legacy exports and source spreadsheets. **Local only (git-ignored).**
- `processed/` — cleaned, import-ready outputs produced by scripts. **Local only (git-ignored).**
- `demo/` — small demo mappings that are safe to commit.
- `templates/` — import templates.

Some sources contain student names, so they must never be committed to a public repository.
The application database never reads these files at runtime.
