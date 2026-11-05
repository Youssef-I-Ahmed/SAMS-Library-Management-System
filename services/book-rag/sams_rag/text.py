"""Arabic + English text normalization and tokenization (notebook Section 3)."""
import re

from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

try:
    from nltk.stem import PorterStemmer
    _porter = PorterStemmer()
except Exception:            # nltk missing -> English tokens are simply not stemmed
    _porter = None


def detect_language(text):
    # 'ar' if Arabic letters dominate, else 'en'.
    text = text or ""
    arabic = len(re.findall(r"[\u0600-\u06FF]", text))
    latin = len(re.findall(r"[A-Za-z]", text))
    return "ar" if arabic >= latin else "en"


AR_DIACRITICS = re.compile(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]")
AR_TATWEEL    = "\u0640"
DIGIT_MAP     = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
CHAR_MAP      = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي"})

def normalize_text(text):
    # Safe normalization for Arabic + English (no stemming, no stopword removal).
    if not text:
        return ""
    text = str(text).translate(DIGIT_MAP)
    text = AR_DIACRITICS.sub("", text).replace(AR_TATWEEL, "")
    text = text.translate(CHAR_MAP).lower()
    text = re.sub(r"[^\w\s\+#]", " ", text)          # drop punctuation (Arabic ، ؛ ؟ included); keep + and # (c++, c#)
    text = text.replace("_", " ")
    return re.sub(r"\s+", " ", text).strip()


# Stopwords: function words + "search words" that appear in questions but not in catalog records.
AR_STOPWORDS = {normalize_text(w) for w in '''
في من على الى إلى عن مع او أو و ثم لا ما ماذا هل كيف لماذا متى اين أين هذا هذه ذلك تلك التي الذي الذين
كان كانت يكون هو هي هم انا أنا نحن انت أنت بين كل بعض اي أي غير قد لقد ان أن إن كما ايضا أيضا حول
كتاب كتب الكتب الكتاب مؤلف المؤلف مؤلفات اريد أريد ابحث أبحث عايز ممكن اعطني أعطني اقترح ارشح موضوع
'''.split()}
EN_QUERY_STOPWORDS = {"book", "books", "find", "show", "give", "recommend", "list", "written", "wrote",
                      "author", "authors", "title", "titles", "topic", "topics", "please", "want", "need", "looking"}
STOPWORDS = AR_STOPWORDS | set(ENGLISH_STOP_WORDS) | EN_QUERY_STOPWORDS

AR_PREFIXES = ("وال", "بال", "كال", "فال", "لل", "ال")

def light_stem(token):
    # Arabic: strip definite article / attached prepositions. English: Porter stemmer (Lab 5).
    if re.search(r"[\u0600-\u06FF]", token):
        for prefix in AR_PREFIXES:
            if token.startswith(prefix) and len(token) - len(prefix) >= 3:
                return token[len(prefix):]
        return token
    if _porter is not None and token.isalpha() and len(token) > 3:
        return _porter.stem(token)
    return token

def tokenize(text, remove_stopwords=True):
    tokens = normalize_text(text).split()
    if remove_stopwords:
        tokens = [t for t in tokens if t not in STOPWORDS]
    return [light_stem(t) for t in tokens if len(t) > 1 or t.isdigit()]
