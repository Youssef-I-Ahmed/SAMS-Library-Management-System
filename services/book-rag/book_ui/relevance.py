"""Moved to sams_rag/listing.py (v16), so the website API gives the same list as this page.

engine.serialize() already trims the list; book_app.py still calls keep_relevant(), which then changes nothing.
Kept so old imports keep working.
"""
from sams_rag.listing import (FALLBACK_LIMIT, KEEP_TOP, MIN_RELEVANCE, SHOW_SCORES, _INDEX,  # noqa: F401
                              keep_relevant)
