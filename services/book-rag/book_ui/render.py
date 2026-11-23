"""Builds the HTML of the open book (shown with streamlit.components.v1.html).

The engine output (sams_rag.engine.serialize) is passed to the page as JSON; book.js draws it.
All text is inserted with textContent / escaped, so catalog data can never inject HTML.
"""
import base64
import functools
import json
import os

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
BOOK_HEIGHT = 640            # height of the book frame in the page (px)
MAX_CARDS = 120              # full catalog cards embedded per answer (books of the "all matches" list)
MAX_HISTORY = 6              # previous questions kept as ribbons on the book


FONTS_DIR = os.path.join(ASSETS, "fonts")
_RANGES = {   # same unicode ranges as the Fontsource subsets, so the browser picks the right file per character
    "arabic": "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,"
              "U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC",
    "latin": "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,"
             "U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
}
# (family, css weight or weight range, file) -- bundled under the SIL Open Font License (assets/fonts/LICENSES.txt)
_FONTS = [
    ("Amiri", "400", "amiri-arabic-400.woff2", "arabic"), ("Amiri", "700", "amiri-arabic-700.woff2", "arabic"),
    ("Amiri", "400", "amiri-latin-400.woff2", "latin"), ("Amiri", "700", "amiri-latin-700.woff2", "latin"),
    ("Aref Ruqaa", "400 500", "aref-ruqaa-arabic-400.woff2", "arabic"),
    ("Aref Ruqaa", "600 800", "aref-ruqaa-arabic-700.woff2", "arabic"),
    ("IBM Plex Sans Arabic", "300 500", "ibm-plex-sans-arabic-arabic-400.woff2", "arabic"),
    ("IBM Plex Sans Arabic", "600 800", "ibm-plex-sans-arabic-arabic-600.woff2", "arabic"),
    ("IBM Plex Sans Arabic", "300 800", "ibm-plex-sans-arabic-latin-400.woff2", "latin"),
]


@functools.lru_cache(maxsize=1)
def font_css():
    """@font-face rules with the font files inlined: the fonts work on every device, with no internet font service."""
    rules = []
    for family, weight, name, subset in _FONTS:
        with open(os.path.join(FONTS_DIR, name), "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        rules.append(f"@font-face{{font-family:'{family}';font-style:normal;font-weight:{weight};font-display:swap;"
                     f"src:url(data:font/woff2;base64,{b64}) format('woff2');unicode-range:{_RANGES[subset]};}}")
    return "\n".join(rules)


def _read(name):
    with open(os.path.join(ASSETS, name), encoding="utf-8") as f:
        return f.read()


def build_entry(question, lang, data, engine=None):
    """One answered question, ready for the book: the serialized answer + the full card of every listed book."""
    data = dict(data)
    cards = {}
    for s in data.get("sources") or []:
        for code in s.get("book_codes") or []:
            cards[str(code)] = s.get("card") or {}
    ab = data.get("all_books") or {}
    if engine is not None:
        for it in (ab.get("items") or [])[:MAX_CARDS]:
            codes = it.get("book_codes") or []
            if not codes or str(codes[0]) in cards:
                continue
            try:
                ids = engine.book_ids_for_code(codes[0])
                if ids:
                    cards[str(codes[0])] = engine.card_to_dict(engine.book_card(ids))
            except Exception:                 # a missing card never breaks the page
                pass
    data["cards"] = cards
    return {"q": question, "lang": lang, "data": data}


def book_html(view, history, current=None, pending=None, intro=False, animate=True, brand=None, books_total=None,
              with_fonts=True):
    """view: "welcome" | "searching" | "answer".  history: list of build_entry() dicts (oldest first).

    with_fonts: send the font files with this frame (needed once per browser session: the frame also installs them
    in the page, and the next frames reuse them from there -- so later answers stay light)."""
    history = list(history or [])[-MAX_HISTORY:]
    if current is None or current >= len(history):
        current = len(history) - 1
    payload = {
        "view": view,
        "intro": bool(intro),
        "animate": bool(animate),
        "history": history,
        "current": current,
        "pending": pending,
        "brand": brand or {"name": "أكاديمية السادات", "sub": "أكاديمية السادات للعلوم الإدارية"},
        "books_total": books_total,
    }
    data = json.dumps(payload, ensure_ascii=False, default=str).replace("</", "<\\/")
    html = _read("book.html")
    return (html.replace("/*__FONTS__*/", font_css() if with_fonts else "")
                .replace("/*__CSS__*/", _read("book.css"))
                .replace("/*__JS__*/", _read("book.js"))
                .replace("__DATA__", data))
