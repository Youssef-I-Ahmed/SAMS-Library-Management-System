"""Open-book interface for the SAMS library search (Streamlit).

Only adds a new look on top of the existing engine: nothing in sams_rag/ or streamlit_app.py is changed.
    streamlit run book_app.py
"""
from .render import book_html, build_entry, BOOK_HEIGHT
from .theme import inject_theme, ribbon_css, sidebar_brand, status_line

__all__ = ["book_html", "build_entry", "BOOK_HEIGHT", "inject_theme", "ribbon_css", "sidebar_brand", "status_line"]
