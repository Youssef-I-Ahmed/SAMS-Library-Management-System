"""Full list for TOPIC questions (v15): "كتب عن التسويق" lists every book of the subject, not only the closest N.

Why: for a topic question the list under the answer showed the closest 30 books (100 in the open-book page), although
the catalog may hold more on the subject (e.g. 154 books under "التسويق"). Author questions already list every book.

What: when the question names one of the catalog's subject headings (the same detection as analyze_query), the list =
the closest books from the search (as before, so nothing that showed before disappears) + every other book filed under
that subject (a heading counts when it appears, as a whole phrase, inside a book's subject heading: "التسويق" also
covers "التسويق الالكتروني"). The answer itself (the 5-6 books Gemini writes about) is not changed.

When it does NOT run (the list stays "the closest N"):
  - CONFIG["topic_full_list"] is False;
  - the question names an author (author lists are already complete) or is (part of) a book title ("التمويل المعاصر"
    contains the subject "التمويل", but the researcher wants that one book) -- unless the question is exactly a subject
    heading ("كتب عن التسويق الإلكتروني", even though some books carry that title);
  - the question names no subject heading, or the subject is larger than CONFIG["topic_full_list_max"].
Several headings: the most specific one is kept ("ادارة الجودة الشاملة" rather than "الجودة"); two different subjects
("التسويق في البنوك") -> the books filed under both.

v16 -- the other language's headings: the catalog files the same field under an English and an Arabic heading
("Computer science": 16 books; "الحاسبات الالكترونية" and its sub-headings: 55 more). When a detected heading IS a
term of the bilingual glossary (expansion.py, v13), the books filed under that term's equivalents (both languages)
whose subject heading STARTS with one are listed too -- still the librarian's subject headings, not search guesses
("Computer Networks", "الحاسبات الالكترونية - برامج"; not "التسويق - تطبيقات الحاسب الالي"). Only an exact glossary term counts
("Computer science" yes; "ادارة التسويق" no). If that would pass CONFIG["topic_full_list_max"], the heading alone
is used, as before. CONFIG["topic_synonyms"] = False switches it off.
A question that names no heading but contains a glossary term whose equivalent IS a heading ("كتب عن الكمبيوتر") is a
topic question too (CONFIG["topic_from_glossary"]); the author / book-title guard below still applies.
"""
from .catalog import books_df
from .config import CONFIG
from .expansion import GLOSSARY, _contains, _entries, should_expand
from .filters import analyze_query, apply_filters
from .lexical import TITLE_NORM, title_phrase_matches
from .text import normalize_text, tokenize


def _most_specific(headings):
    norm = {h: normalize_text(h) for h in headings}
    return [h for h in headings
            if not any(f" {norm[h]} " in f" {norm[o]} " for o in headings if o != h and norm[o] != norm[h])]


_HEADINGS = {}


def _catalog_headings():
    # normalized subject heading -> the heading as written (most frequent spelling)
    if not _HEADINGS:
        from collections import Counter
        seen = Counter((n, raw) for subs_n, subs in zip(books_df["subjects_norm"], books_df["subjects"])
                       if isinstance(subs, list) for n, raw in zip(subs_n, subs))
        for (n, raw), _ in seen.most_common():
            _HEADINGS.setdefault(n, raw)
    return _HEADINGS


def glossary_headings(query):
    """v16: the catalog headings a question reaches through a glossary term it contains, when it names no heading
    itself ("كتب عن الكمبيوتر": "الكمبيوتر" is no heading, but its glossary equivalent "computer science" is)."""
    # ONE glossary subject only (two -- "Human Resources في الشركات" -- stay as before: no topic list); its first
    # heading is returned, and topic_books adds the others as its equivalents
    toks = tokenize(query)
    heads = _catalog_headings()
    found = []
    for en, ar, en_t, ar_t in _entries():
        if any(_contains(toks, t) for t in en_t + ar_t):
            found.append([heads[normalize_text(v)] for v in en + ar if normalize_text(v) in heads])
    found = [f for f in found if f]
    return found[0][:1] if len(found) == 1 else []


def heading_synonyms(head):
    """The glossary equivalents of a subject heading (normalized; both languages), when the heading IS a glossary term."""
    n, t = normalize_text(head), tuple(tokenize(head))       # tokens: "Computers" is the glossary's "computer"
    for en, ar, en_t, ar_t in _entries():
        if t and t in en_t + ar_t:
            variants = list(dict.fromkeys(normalize_text(v) for v in en + ar))
            return [v for v in variants if v != n]
    return []


def _filed_under(head, synonyms=()):
    # the heading anywhere in a book's subject heading (as in v15: "التسويق" covers "ادارة التسويق"); an equivalent
    # only at the START of one ("الحاسبات الالكترونية - برامج" yes; "التسويق - تطبيقات الحاسب الالي" no: that is
    # marketing, using computers)
    n = f" {head} "
    starts = tuple(f"{p} " for p in synonyms)
    return set(books_df.index[books_df["subjects_norm"].map(
        lambda subs: any(n in f" {s} " or f"{s} ".startswith(starts) for s in subs) if starts else
        any(n in f" {s} " for s in subs))])


def topic_books(query, search_query=None, filters=None):
    """(subject headings, set of book_ids filed under them, glossary equivalents used) for a topic question, else
    None."""
    if not CONFIG.get("topic_full_list", True):
        return None
    q = search_query or query
    heads = _most_specific(analyze_query(q).get("detected_topics") or [])
    if not heads and CONFIG.get("topic_from_glossary", True):      # v16: "كتب عن الكمبيوتر" -> "Computer science"
        heads = glossary_headings(q)
    if not heads:
        return None
    # A question that IS a subject heading ("كتب عن التسويق الإلكتروني") is a topic question even when a book has the
    # same title; otherwise never for author or book-title questions ("التمويل المعاصر" = "التمويل" + more words).
    # v16: so is a question that is exactly a glossary term ("كتب عن الحاسب الآلي": a field, although the catalog
    # also has a book titled "مقدمة في الحاسب الآلي")
    is_term = tuple(tokenize(q)) in {t for _, _, en_t, ar_t in _entries() for t in en_t + ar_t}
    if not is_term and not any(tokenize(h) == tokenize(q) for h in heads):
        for text in {query, q}:
            if text and not should_expand(text, analyze_query(text), title_phrase_matches(text), TITLE_NORM):
                return None
    limit = CONFIG.get("topic_full_list_max", 400)
    allowed = set(apply_filters(filters)) if filters is not None else None   # a broad filter (language, years) applies
    use_syn = CONFIG.get("topic_synonyms", True)
    for with_syn in ([True, False] if use_syn else [False]):  # v16: with the other language's headings, else alone
        ids, used = None, []
        for h in heads:
            syn = heading_synonyms(h) if with_syn else []
            used += syn
            hit = _filed_under(normalize_text(h), syn)
            ids = hit if ids is None else ids & hit
        if allowed is not None:
            ids &= allowed
        if ids and len(ids) <= limit:
            return heads, ids, used
        if not used:                             # nothing was added: the heading alone gives the same answer
            break
    return None
