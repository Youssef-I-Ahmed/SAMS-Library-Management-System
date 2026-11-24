"""Standalone text normalizer required to load best_model.pkl (keep this file next to it)."""
import re
import unicodedata

import pandas as pd

# ---------------------------------------------------------------- text normalization
_DIACRITICS = re.compile(r"[\u064B-\u0652\u0670]")          # tashkeel + dagger alef
_TATWEEL = "\u0640"
_ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
_ALEF_VARIANTS = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا"})
_NON_WORD = re.compile(r"[^\w\s]|_", flags=re.UNICODE)
_SPACES = re.compile(r"\s+")


def normalize_text(text) -> str:
    """Normalize an academic title (Arabic, English or mixed).

    Steps: Unicode NFKC -> lowercase (English) -> strip Arabic diacritics and tatweel
    -> unify alef forms, alef maqsura (ى->ي) and ta marbuta (ة->ه) -> Arabic-Indic
    digits to ASCII -> drop punctuation/symbols -> collapse whitespace.
    Words are NOT removed here: academic terms must survive (see README).
    """
    if text is None or (isinstance(text, float) and pd.isna(text)):
        return ""
    text = unicodedata.normalize("NFKC", str(text)).lower()
    text = _DIACRITICS.sub("", text).replace(_TATWEEL, "")
    text = text.translate(_ALEF_VARIANTS).translate(_ARABIC_DIGITS)
    text = text.replace("ى", "ي").replace("ة", "ه")
    text = _NON_WORD.sub(" ", text)
    return _SPACES.sub(" ", text).strip()


