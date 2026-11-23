"""Arabic / English text normalisation used for matching and indexing.

Two levels:
* ``normalize_text``  - for titles, subjects, free text (keeps word boundaries).
* ``person_key``      - for personal names: also strips academic titles (د/ أ.د/ Dr.).

Normalisation never mutates stored/displayed values; it only produces comparison keys.
"""
from __future__ import annotations

import re
import unicodedata

_DIACRITICS = re.compile("[ؐ-ًؚ-ٰٟۖ-ۭ]")
_TATWEEL = "ـ"
_ARABIC_INDIC = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
_CHAR_MAP = str.maketrans(
    {
        "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",  # alef variants
        "ى": "ي",  # alef maqsura -> ya (very common typing variant)
        "ئ": "ي", "ؤ": "و",  # hamza carriers
        "ة": "ه",  # ta marbuta -> ha
        "ک": "ك", "ی": "ي", "ھ": "ه",  # Persian/Urdu forms
    }
)
_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)
_WS = re.compile(r"\s+")
_ZERO_WIDTH = re.compile("[​-‏‪-‮⁦-⁩﻿]")

# Academic / honorific prefixes. "د" must be followed by "/", "." or whitespace so that
# names that merely START with the letter dal (e.g. "دعاء") are never truncated.
_TITLE_PREFIX = re.compile(
    r"^\s*(?:(?:أ|ا)\s*\.?\s*د\s*(?:[/.\\]\s*|\s+)"
    r"|د\s*(?:[/.\\]\s*|\s+)"
    r"|(?:أ|ا)\s*[/.\\]\s*"
    r"|(?:prof|dr|eng)\s*\.?\s*[/.]?\s*)",
    re.IGNORECASE,
)


def to_western_digits(value: str | None) -> str:
    """Convert Arabic-Indic (٠-٩) and Eastern/Persian (۰-۹) digits to ASCII 0-9 (nothing else is changed).
    Also folds the Arabic decimal/thousands separators so that '١٬١١٣' is read as '1113'."""
    if not value:
        return ""
    return str(value).translate(_ARABIC_INDIC).replace("٬", "").replace("٫", ".")


def normalize_text(value: str | None, *, keep_ascii_case: bool = False) -> str:
    """Normalise Arabic/English text for matching. Returns '' for None."""
    if not value:
        return ""
    s = unicodedata.normalize("NFKC", str(value))
    s = _ZERO_WIDTH.sub("", s)
    s = s.replace(_TATWEEL, "")
    s = _DIACRITICS.sub("", s)
    s = s.translate(_ARABIC_INDIC)
    s = s.translate(_CHAR_MAP)
    if not keep_ascii_case:
        s = s.lower()
    s = s.replace("_", " ")
    s = _PUNCT.sub(" ", s)
    return _WS.sub(" ", s).strip()


def strip_person_title(name: str) -> str:
    """Remove a leading academic title (د/ , أ.د/ , Dr.) from a raw name."""
    prev = None
    s = name
    while prev != s:  # e.g. "أ.د/ د/ x"
        prev = s
        s = _TITLE_PREFIX.sub("", s, count=1)
    return s.strip()


def person_key(name: str | None) -> str:
    """Canonical comparison key for a person's name."""
    if not name:
        return ""
    return normalize_text(strip_person_title(unicodedata.normalize("NFKC", name)))


def tokenize(value: str | None) -> list[str]:
    n = normalize_text(value)
    return n.split(" ") if n else []


_AR_STOP = {
    "في", "من", "على", "الى", "عن", "ما", "هو", "هي", "و", "او", "ان", "هل", "كم", "كيف", "ماذا",
    "هذا", "هذه", "التي", "الذي", "بين", "مع", "لدي", "اريد", "ابحث", "عنه", "عنها", "لها", "له",
}
_EN_STOP = {
    "the", "a", "an", "of", "in", "on", "and", "or", "for", "to", "is", "are", "what", "which",
    "how", "many", "about", "by", "with", "from", "me", "show", "list", "all", "any", "do", "does",
}


def content_tokens(value: str | None) -> list[str]:
    """Tokens with stop-words removed (for BM25 / query analysis)."""
    return [t for t in tokenize(value) if t not in _AR_STOP and t not in _EN_STOP and len(t) > 1 or t.isdigit()]


def strip_ar_prefix(tok: str) -> str:
    """Very light Arabic clitic stripping (definite article / و / ب / ل prefixes) for BM25 recall.

    Only applied when the remaining stem has >= 3 letters, to avoid destroying short words.
    """
    for p in ("وال", "بال", "لل", "ال", "كال", "فال"):
        if tok.startswith(p) and len(tok) - len(p) >= 3:
            return tok[len(p):]
    return tok


def stem_en(tok: str) -> str:
    """Tiny plural folding for English tokens (systems -> system, studies -> study)."""
    if tok.isascii() and tok.isalpha():
        if len(tok) > 4 and tok.endswith("ies"):
            return tok[:-3] + "y"
        if len(tok) > 3 and tok.endswith("s") and not tok.endswith(("ss", "us", "is")):
            return tok[:-1]
    return tok


def stem_token(tok: str) -> str:
    return stem_en(strip_ar_prefix(tok))


def search_terms(value: str | None) -> list[str]:
    """Tokens used for BM25: normalised, stop-word filtered, light Arabic clitic stripping + English plural folding."""
    return [stem_token(t) for t in content_tokens(value)]


def detect_language(value: str | None) -> str:
    """'ar', 'en', 'mixed' or 'unknown' based on letter counts."""
    if not value:
        return "unknown"
    ar = len(re.findall(r"[؀-ۿ]", value))
    en = len(re.findall(r"[A-Za-z]", value))
    if ar == 0 and en == 0:
        return "unknown"
    if ar and en and min(ar, en) / max(ar, en) > 0.25:
        return "mixed"
    return "ar" if ar >= en else "en"
