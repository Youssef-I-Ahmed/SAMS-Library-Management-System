# Data Directory

## `raw/`
Legacy/recovered library exports exactly reserved for inspection and cleaning. Treat these files as input data; do not manually rewrite them during application development.

Current raw datasets:
- `books-extracted-partial.csv`
- `books-reconstructed-recovery.csv`
- `projects-theses-extracted.csv`

## `processed/`
Place cleaned, validated, import-ready datasets here. Keep transformations reproducible with scripts rather than editing the raw files.

The application database should not depend directly on recovery CSV files at runtime.
