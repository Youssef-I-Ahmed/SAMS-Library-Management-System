"""The complete pipeline: rag_answer() and its display rules (notebook Section 11.3)."""
import re
import time
from dataclasses import asdict
from types import SimpleNamespace
from typing import Optional

import pandas as pd
from rapidfuzz import fuzz

from .catalog import books_df, build_content
from .config import CONFIG
from .context import build_context_package, is_near_duplicate
from .filters import SearchFilters, apply_filters
from .generation import REFUSAL_AR, REFUSAL_EN, generate_answer, last_gemini_model
from .recency import order_by_recency, wants_recent, year_of
from .search import hybrid_search, reranker
from .topics import topic_books
from .text import STOPWORDS, detect_language, normalize_text

CITE_RE = re.compile(r"\[S(\d+)\]")

# --- "What can you help me with?" -> fixed capabilities answer (no search, works without an API key) ---
HELP_PATTERNS = [normalize_text(p) for p in [
    "تقدر تساعدني", "تساعدني في ايه", "تساعدني بايه", "بتعمل ايه", "تعمل ايه", "تقدر تعمل ايه",
    "ماذا تستطيع", "ماذا يمكنك", "ما الذي يمكنك", "كيف يمكنك مساعدتي", "كيف تساعدني", "انت مين", "من انت",
    "ما وظيفتك", "ايه وظيفتك", "ازاي استخدمك",
    "what can you do", "how can you help", "what do you do", "who are you", "what are you",
    "what can i ask", "how do i use you", "how can i use you",
]]
GREETINGS = {normalize_text(g) for g in [
    "مرحبا", "اهلا", "أهلا", "اهلا بك", "السلام عليكم", "هاي", "مساعدة", "ساعدني",
    "hi", "hello", "hey", "help", "help me",
]}

def is_help_question(query):
    # True for short greetings / "what can you do?" questions (long queries are treated as real searches).
    q = normalize_text(query)
    if not q or len(q.split()) > 8:
        return False
    return q in GREETINGS or any(p in q for p in HELP_PATTERNS)

def help_answer(query):
    n = f"{len(books_df):,}"
    if detect_language(query) == "ar":
        return (f"أنا مساعد البحث في فهرس المكتبة. أقدر أساعدك في:\n"
                f"- البحث عن الكتب الموجودة في المكتبة (حوالي {n} كتاب) بالموضوع أو العنوان أو اسم المؤلف، بالعربي أو بالإنجليزي.\n"
                f"- ترشيح أنسب الكتب لسؤالك مع رقم الاستدعاء (مكان الكتاب على الرف).\n"
                f"- عرض البيانات الكاملة لكل كتاب: المؤلف، الناشر، سنة النشر، الطبعة، ISBN، عدد النسخ وغيرها.\n"
                f"- تضييق البحث بسنة النشر أو اللغة أو الناشر.\n"
                f"- متابعة أسئلتك في نفس المحادثة، مثل: \"وهل توجد كتب أخرى لنفس المؤلف؟\"\n"
                f"ملحوظة: لدي بيانات فهرس المكتبة فقط، وليس نصوص الكتب نفسها.\n"
                f"مثال لسؤال: \"ما هي الكتب المتاحة عن إدارة الموارد البشرية؟\"")
    return (f"I am the search assistant for this library's catalog. I can help you:\n"
            f"- Find books in the library (about {n} titles) by topic, title or author, in Arabic or English.\n"
            f"- Recommend the most relevant books for your question, with their call numbers (shelf location).\n"
            f"- Show each book's full catalog details: authors, publisher, year, edition, ISBN, number of copies, and more.\n"
            f"- Narrow results by publication year, language or publisher.\n"
            f"- Follow up within the same conversation, e.g. \"Are there other books by the same author?\"\n"
            f"Note: I only have the library's catalog records, not the full text of the books.\n"
            f"Example: \"Which books cover human resource management?\"")

# --- conversation memory: earlier turns rendered for the LLM prompt ---
def format_history(history, max_turns=4, max_answer_chars=600):
    if not history:
        return None
    blocks = []
    for turn in history[-max_turns:]:
        answer = CITE_RE.sub("", turn["answer"]).strip()          # old [S#] tags would clash with the new sources
        if len(answer) > max_answer_chars:
            answer = answer[:max_answer_chars] + " ..."
        block = f"User: {turn['question']}\nAssistant: {answer}"
        if turn.get("books"):
            block += "\nBooks shown: " + "; ".join(f"({i}) {b}" for i, b in enumerate(turn["books"], start=1))
        blocks.append(block)
    return "\n\n".join(blocks)


def verify_citations(answer, package):
    cited = {f"S{n}" for n in CITE_RE.findall(answer)}
    available = set(package["sources"]["source"]) if package["num_sources"] else set()
    return {"cited": sorted(cited, key=lambda s: int(s[1:])), "invalid": sorted(cited - available),
            "uncited_sources": sorted(available - cited, key=lambda s: int(s[1:])),
            "is_refusal": _is_refusal(answer)}


def _is_refusal(answer):
    # v8: the refusal sentence counts even with a comma or extra words after it (normalized comparison)
    a = normalize_text(answer)
    return any(normalize_text(r) in a for r in (REFUSAL_EN, REFUSAL_AR))


def _books_used(out):
    # v8: valid [S#] tags the answer cites -- if none, the retrieved books were not used for the answer
    # v10: if the answer names books without [S#] tags, the titles found in the text count (see _inferred_tags)
    src = out["package"]["sources"]
    valid = set(src["source"]) if out["package"]["num_sources"] else set()
    explicit = [t for t in out["citations"]["cited"] if t in valid]
    if out["citations"]["is_refusal"]:
        return explicit
    if explicit:                                       # v16: plus the books named in bold without their [S#] tag
        extra = [t for t in out["citations"].get("inferred", []) if t in valid and t not in explicit]
        if not extra:
            return explicit
        order = {t: i for i, t in enumerate(src["source"])}   # S1, S2, S3... (the added book takes its own place)
        return sorted(explicit + extra, key=lambda t: order[t])
    return [t for t in out["citations"].get("inferred", []) if t in valid]


def _inferred_tags(answer, package):
    # v10/v11: when the answer has no [S#] tags, find the books it names.
    #   1) each text written in **bold** or between quotes ("..." / «...» / “...”) -- how the LLM marks book titles --
    #      is linked to the ONE source whose title is closest to it (ties: all equally close), if similar enough;
    #      a subtitle or a topic phrase is not a book (v12: quotes added)
    #   2) if nothing is bold, only a FULL title (>= 3 words) found in the text counts
    if not package["num_sources"]:
        return []
    src = list(package["sources"].itertuples())
    names = {r.source: (normalize_text(str(r.title)), normalize_text(re.split(r"[:=]", str(r.title))[0])) for r in src}
    marked = re.findall(r"\*\*(.+?)\*\*", answer) + re.findall(r'"([^"\n]+)"', answer) + \
             re.findall(r"«([^»\n]+)»", answer) + re.findall(r"“([^”\n]+)”", answer)
    bold = [normalize_text(x) for x in marked]
    bold = [x for x in bold if len(x.split()) >= 2]
    tags = set()
    if bold:
        for x in bold:
            scores = {s: max(fuzz.ratio(x, t), fuzz.ratio(x, m)) for s, (t, m) in names.items()}
            best = max(scores.values())
            if best >= 85:
                tags |= {s for s, v in scores.items() if v == best}
    else:
        a = f" {normalize_text(answer)} "
        tags = {s for s, (t, m) in names.items() if len(t.split()) >= 3 and f" {t} " in a}
    return [r.source for r in src if r.source in tags]


def _named_without_tag(answer, package, cited):
    # v16: the answer cites some books with [S#] tags but names another one of its sources without its tag
    # (e.g. "**Strategize**" with no [S2]). A source that is not cited is added when a text in **bold** in the answer
    #   - is its title (or main title, before ":") at >= 85% similarity and no other source is closer (2+ words), or
    #   - is exactly its whole title (a one-word title: "Strategize"; "Management" is not "Management: An Introduction").
    # Only adds books (the tagged ones stay as they are) and only among the books given to the LLM.
    if not package["num_sources"]:
        return []
    src = list(package["sources"].itertuples())
    cited = set(cited)
    if not any(r.source not in cited for r in src):
        return []
    names = {r.source: (normalize_text(str(r.title)), normalize_text(re.split(r"[:=]", str(r.title))[0])) for r in src}
    tags = set()
    for x in (normalize_text(b) for b in re.findall(r"\*\*(.+?)\*\*", answer)):
        if not x:
            continue
        if len(x.split()) == 1:
            tags |= {s for s, (t, m) in names.items() if s not in cited and x == t}
            continue
        scores = {s: max(fuzz.ratio(x, t), fuzz.ratio(x, m)) for s, (t, m) in names.items()}
        best = max(scores.values())
        if best >= 85:
            tags |= {s for s, v in scores.items() if v == best and s not in cited}
    return [r.source for r in src if r.source in tags]


REFUSAL_HINT_AR = ("أنا متخصص في البحث في كتب هذه المكتبة. جرّب أن تسأل عن موضوع أو عنوان كتاب أو اسم مؤلف، "
                   "مثل: «كتب عن إدارة المشروعات».")
REFUSAL_HINT_EN = ("I can only search this library's books. Try asking about a topic, a book title or an author, "
                   "e.g. \"books on project management\".")


def coverage_note(query, out):
    # v6: when filters match more books than the answer can show, say so (written by code, not the LLM).
    filt, total, shown = out.get("filters") or {}, out.get("n_candidates") or 0, out["package"]["num_sources"]
    if out.get("all_books_complete") and out.get("all_books") is not None:
        total = len(out["all_books"])                    # count books, not catalog records (near-duplicates merged)
    tl = out.get("topic_list")                                     # v15: "5 of the 154 books on «التسويق»"
    if (tl and not _is_narrow(filt) and not out["citations"]["is_refusal"] and _books_used(out) and shown
            and tl["count"] > shown):
        # the list holds the books filed under the subject first, then related books found by the search: say so,
        # so "4 of 16" is not read against the length of the list (no count of the related books: a website may
        # shorten that part of the list)
        related = out.get("all_books") is not None and len(out["all_books"]) > tl["count"]
        if detect_language(query) == "ar":
            names = " و".join(f"«{h}»" for h in tl["headings"]) + (" ومرادفاته في الفهرس" if tl.get("synonyms") else "")
            if related and out.get("recency"):
                return (f"عُرض {shown} من أصل {tl['count']} كتاباً مصنّفة تحت موضوع {names}. "
                        f"القائمة بالأسفل فيها هذه الكتب ومعها كتب قريبة من الموضوع، من الأحدث للأقدم.")
            if related:
                return (f"عُرض {shown} من أصل {tl['count']} كتاباً مصنّفة تحت موضوع {names}. "
                        f"القائمة بالأسفل تبدأ بها، وبعدها كتب قريبة من الموضوع.")
            return f"عُرض {shown} من أصل {tl['count']} كتاباً في موضوع {names}، والقائمة الكاملة بالأسفل."
        names = " and ".join(f"«{h}»" for h in tl["headings"]) + (" and its equivalents" if tl.get("synonyms") else "")
        if related and out.get("recency"):
            return (f"Showing {shown} of the {tl['count']} books filed under {names}. "
                    f"The list below holds them together with related books, newest first.")
        if related:
            return (f"Showing {shown} of the {tl['count']} books filed under {names}. "
                    f"The list below starts with them, followed by related books.")
        return f"Showing {shown} of the {tl['count']} books on {names}; the full list is below."
    al = out.get("author_list")                                    # v16: "3 of the 6 books by «X» and «Y»"
    used = len(_books_used(out))
    if al and not out["citations"]["is_refusal"] and used and al["count"] > used:
        if detect_language(query) == "ar":
            names = " و".join(f"«{a}»" for a in al["authors"])
            word = "كتاباً" if al["count"] > 10 else "كتب"
            who = "للمؤلف" if len(al["authors"]) == 1 else "للمؤلفين"
            return f"عُرض {used} من أصل {al['count']} {word} {who} {names}، والقائمة الكاملة بالأسفل."
        names = " and ".join(f"«{a}»" for a in al["authors"])
        return f"Showing {used} of the {al['count']} books by {names}; the full list is below."
    if not _is_narrow(filt) or out["citations"]["is_refusal"] or not _books_used(out) or not shown or total <= shown:
        return None
    labels_ar = {"author": "المؤلف", "title": "العنوان", "topics": "الموضوع", "publisher": "الناشر",
                 "year_from": "من سنة", "year_to": "حتى سنة", "language": "اللغة"}
    def _v(v):
        v = {"en": "English", "ar": "العربية"}.get(v, v) if isinstance(v, str) else v
        return "، ".join(map(str, v)) if isinstance(v, (list, tuple)) else str(v)
    parts = [(k, _v(v)) for k, v in filt.items() if k in labels_ar]
    if detect_language(query) == "ar":
        cond = "؛ ".join(f"{labels_ar[k]}: {v}" for k, v in parts)
        return f"عُرض {shown} من أصل {total} كتاباً في المكتبة تطابق ({cond})، والقائمة الكاملة بالأسفل."
    cond = "; ".join(f"{k.replace('_', ' ')}: {v}" for k, v in parts)
    return f"Showing {shown} of {total} books in the library that match ({cond}); the full list is below."


# v7: full list of matching books (code only, no LLM): all books matching the filters, or the closest N without filters.
# Server change: the list's groups of book_ids are returned in out["all_books_groups"] (the notebook kept them in a
# single global list, which would mix up researchers on a server); book_card() replaces show_card().


# v16: a question naming an author the catalog spells differently ("نفين مكرم" for نيفين غراب / مكرم عبد المسيح
# باسيلى) gets no author filter, so its list was "the closest N books" and ended with unrelated ones. When EVERY book
# the answer uses has an author whose name shares a word with the question (fuzzy, >= 80%), the question is treated
# like an author question: the list = every book of those authors (as "كتب فريد النجار" lists all his books).
NAME_WORDS = {normalize_text(w) for w in """دكتور الدكتور دكتورة الدكتورة للدكتور للدكتورة استاذ الاستاذ أستاذ الأستاذ
    استاذة الاستاذة مهندس المهندس شيخ الشيخ dr doctor prof professor mr mrs ms by""".split()}
AUTHOR_NAME_MATCH = 80


def _question_names(query):
    return [w for w in normalize_text(query).split() if len(w) >= 3 and w not in STOPWORDS and w not in NAME_WORDS]


def author_list(query, used_ids):
    """(author names as in the catalog, book_ids of all their books) or None -- see the note above."""
    words = _question_names(query)
    if not words or not used_ids:
        return None
    matched = {}
    for b in used_ids:
        hit = {a_norm: a_raw for a_norm, a_raw in zip(books_df.at[b, "authors_norm"], books_df.at[b, "authors"])
               if any(fuzz.ratio(w, t) >= AUTHOR_NAME_MATCH for w in words for t in a_norm.split() if len(t) >= 3)}
        if not hit:
            return None                                            # a book by someone else -> not an author question
        matched.update(hit)
    ids = [b for b, authors in zip(books_df.index, books_df["authors_norm"]) if any(a in matched for a in authors)]
    return [matched[a] for a in sorted(matched)], ids


def all_matching_books(out):
    # Returns (DataFrame of the list, complete?, groups of book_ids per row).
    if out.get("provider") == "help" or out["citations"]["is_refusal"] or not _books_used(out):
        return None, False, []
    q = out.get("search_query") or out["query"]
    filt = out.get("filters") or {}
    f_all = (SearchFilters(**{k: v for k, v in filt.items() if k in SearchFilters.__dataclass_fields__})
             if filt else None)
    topic = None
    if _is_narrow(filt):                                           # every book that matches the filters
        f = SearchFilters(**{k: v for k, v in filt.items() if k in SearchFilters.__dataclass_fields__})
        cand = list(apply_filters(f))
        ranked = hybrid_search(q, filters=f, k=min(len(cand), 200), method="rrf", rerank=False,
                               auto_filters=False)["book_id"].tolist() if cand else []
        seen_ids = set(ranked)
        rest = sorted((b for b in cand if b not in seen_ids),       # not reached by the search -> newest first
                      key=lambda b: -(books_df.at[b, "year"] if pd.notna(books_df.at[b, "year"]) else 0))
        ranked, complete = ranked + rest, True
    else:                                                          # no / broad filter: the closest N books
        ranked = hybrid_search(q, filters=f_all, k=CONFIG["all_books_limit"], method="rrf", rerank=reranker.available,
                               auto_filters=False)["book_id"].tolist()
        complete = False
        topic = topic_books(out["query"], q, f_all)                # v15: topic question -> every book of the subject
        if topic:
            seen_ids = set(ranked)
            rest = sorted((b for b in topic[1] if b not in seen_ids), key=lambda b: -year_of(books_df.at[b, "year"]))
            ranked, complete = ranked + rest, True
        else:                                                      # v16: misspelled author -> all books of the authors
            used_tags = set(_books_used(out))
            used_ids = [b for r in out["package"]["sources"].itertuples() if r.source in used_tags
                        for b in r.merged_book_ids]
            auth = author_list(out["query"], used_ids)
            if auth:
                keep = set(auth[1])
                rest = sorted((b for b in keep if b not in set(ranked)), key=lambda b: -year_of(books_df.at[b, "year"]))
                ranked, complete = [b for b in ranked if b in keep] + rest, True
                out["author_list"] = {"authors": auth[0]}

    groups = []                                                    # near-duplicate records -> one entry
    for b in ranked:
        g = next((g for g in groups if is_near_duplicate(g[0], b)), None)
        if g is not None:
            g.append(b)
        else:
            groups.append([b])

    src = out["package"]["sources"]
    cited = set(_books_used(out))
    in_answer = {b for r in src.itertuples() if r.source in cited for b in r.merged_book_ids}
    rows = []
    if topic:                                                      # v15: how many listed books are on the subject
        out["topic_list"] = {"headings": topic[0], "count": sum(any(b in topic[1] for b in g) for g in groups),
                             "synonyms": topic[2]}             # v16: glossary equivalents whose headings were added
    if out.get("author_list"):                                     # v16: how many books those authors have
        out["author_list"]["count"] = len(groups)
    if out.get("recency"):                                         # v14: newest first (unknown years last)
        groups.sort(key=lambda g: -year_of(books_df.at[g[0], "year"]))
    if topic and not out.get("recency"):                           # books filed under the subject first, then the related
        groups.sort(key=lambda g: not any(b in topic[1] for b in g))   # ones (a "newest" question stays newest first)
    for n, g in enumerate(groups, start=1):
        b0 = g[0]
        copies = sum(int(books_df.at[b, "copies"]) for b in g if pd.notna(books_df.at[b, "copies"]))
        rows.append({"#": n, "title": books_df.at[b0, "title"], "author": books_df.at[b0, "author"],
                     "year": books_df.at[b0, "year"], "call_number": books_df.at[b0, "call_number"],
                     "copies": copies, "in_answer": "✓" if any(b in in_answer for b in g) else "",
                     "book_codes": [c for b in g for c in books_df.at[b, "merged_codes"]]})
        if topic:
            rows[-1]["in_topic"] = any(b in topic[1] for b in g)    # v15: filed under the subject (else: a close book)
    return pd.DataFrame(rows), complete, groups


def book_card(book_ids):
    # Full 22-field record of a book (a group of near-duplicate records is combined) -- the notebook's show_card().
    g = list(book_ids)
    if len(g) > 1:
        codes = [c for b in g for c in books_df.at[b, "merged_codes"]]
        return build_content(SimpleNamespace(merged_codes=codes, book_code=books_df.at[g[0], "book_code"]))
    return books_df.at[g[0], "content"]


def book_ids_for_code(book_code):
    # book_ids of the record holding this BOOK_CODE, plus its near-duplicate records (so the card shows every copy).
    hit = [b for b, codes in enumerate(books_df["merged_codes"]) if str(book_code) in [str(c) for c in codes]]
    if not hit:
        return []
    b0 = hit[0]
    return [b0] + [b for b in range(len(books_df)) if b != b0 and is_near_duplicate(b0, b)]


# v9: explicit language request ("بالإنجليزي", "English books", "in Arabic") -> language filter (applied by code)
LANG_REQUEST_PATTERNS = {
    "en": [r"\benglish\b", r"بالانجليزي", r"بالانكليزي", r"باللغه الانجليزيه", r"باللغه الانكليزيه",
           r"كتب انجليزي", r"مراجع انجليزي", r"اللغه الانجليزيه"],
    "ar": [r"\bin arabic\b", r"\barabic books?\b", r"\barabic language\b", r"بالعربي", r"باللغه العربيه",
           r"كتب عربي", r"مراجع عربي"],
}
BROAD_FILTER_KEYS = {"language", "year_from", "year_to"}     # match hundreds of books -> no "all matching" list


def requested_language(text):
    q = normalize_text(text or "")
    hits = [lang for lang, pats in LANG_REQUEST_PATTERNS.items() if any(re.search(p, q) for p in pats)]
    return hits[0] if len(hits) == 1 else None                # ambiguous (both) -> no filter


def _is_narrow(filt):
    return any(k not in BROAD_FILTER_KEYS and k != "topics_mode" for k in (filt or {}))


def rag_answer(query, filters: Optional[SearchFilters] = None, k=10, method="rrf", provider=None,
               history=None, search_query=None):
    # history: earlier turns (see ChatSession, §11.4); search_query: standalone query used for retrieval.
    t0 = time.time()
    if is_help_question(query):                               # capabilities question -> fixed answer, no search
        package = {"context_text": "", "used_words": 0, "num_sources": 0,
                   "sources": pd.DataFrame(columns=["source", "book_id", "book_code", "title", "author", "year", "call_number"])}
        answer = help_answer(query)
        out = {"query": query, "search_query": None, "answer": answer, "provider": "help", "filters": None,
               "n_candidates": 0, "results": pd.DataFrame(), "package": package,
               "citations": verify_citations(answer, package), "prompt": None, "fallback_errors": {},
               "latency_s": round(time.time() - t0, 2)}
        return out

    search_query = search_query or query
    lang = requested_language(query) or requested_language(search_query)
    if lang and not (filters and filters.language):              # v9
        filters = SearchFilters(**{**(asdict(filters) if filters else {}), "language": lang})
    recent = wants_recent(query, search_query)                   # v14: "the newest books" -> ordered by year
    results = hybrid_search(search_query, filters=filters, k=max(k, CONFIG.get("recency_pool", 20)) if recent else k,
                            method=method)
    if recent:
        results = order_by_recency(results, k)
    package = build_context_package(results)
    answer, used_provider, prompt, errors = generate_answer(query, package, results.attrs.get("filters"), provider,
                                                            history_text=format_history(history))
    out = {"query": query, "search_query": search_query, "answer": answer, "provider": used_provider,
           "filters": results.attrs.get("filters"),
           "n_candidates": results.attrs.get("n_candidates"), "results": results, "package": package,
           "citations": verify_citations(answer, package), "prompt": prompt, "fallback_errors": errors,
           "latency_s": round(time.time() - t0, 2)}
    out["model"] = last_gemini_model() if used_provider == "gemini" else None
    out["recency"] = bool(results.attrs.get("recency"))
    if out["citations"]["is_refusal"]:                         # v10: refusal -> the refusal sentence only
        out["raw_answer"] = answer
        out["answer"] = REFUSAL_AR if detect_language(query) == "ar" else REFUSAL_EN
        out["citations"] = verify_citations(out["answer"], package)
    else:                                                      # v10: books named without [S#] tags
        out["citations"]["inferred"] = (_named_without_tag(answer, package, out["citations"]["cited"])
                                        if out["citations"]["cited"] else _inferred_tags(answer, package))
    out["all_books"], out["all_books_complete"], out["all_books_groups"] = all_matching_books(out)
    out["coverage_note"] = coverage_note(query, out)
    out["hint"] = ((REFUSAL_HINT_AR if detect_language(query) == "ar" else REFUSAL_HINT_EN)
                   if out["citations"]["is_refusal"] or not _books_used(out) else None)
    out["latency_s"] = round(time.time() - t0, 2)
    return out


# ---------------------------------------------------------------------------
# Website addition (phase 2): the SAME pipeline in two steps, so the API can show the books before Gemini answers.
#   retrieve(...)  -> search + context package (under a second)
#   finish(stage)  -> Gemini + the display rules (refusal, inferred books, full list, notes)
# finish(retrieve(...)) returns exactly what rag_answer(...) returns -- tests/test_staged.py checks it.
# rag_answer() above is unchanged (the notebook-verified reference).
# ---------------------------------------------------------------------------
def retrieve(query, filters: Optional[SearchFilters] = None, k=10, method="rrf", history=None, search_query=None):
    t0 = time.time()
    if is_help_question(query):                               # fixed answer: nothing to wait for
        return {"query": query, "t0": t0, "out": rag_answer(query, filters=filters, k=k, method=method,
                                                           history=history, search_query=search_query)}
    search_query = search_query or query
    lang = requested_language(query) or requested_language(search_query)
    if lang and not (filters and filters.language):              # v9
        filters = SearchFilters(**{**(asdict(filters) if filters else {}), "language": lang})
    recent = wants_recent(query, search_query)                   # v14: "the newest books" -> ordered by year
    results = hybrid_search(search_query, filters=filters, k=max(k, CONFIG.get("recency_pool", 20)) if recent else k,
                            method=method)
    if recent:
        results = order_by_recency(results, k)
    package = build_context_package(results)
    return {"query": query, "search_query": search_query, "history": history, "results": results,
            "package": package, "t0": t0}


def finish(stage, provider=None):
    if "out" in stage:                                        # help question: already complete
        return stage["out"]
    query, search_query, results, package = stage["query"], stage["search_query"], stage["results"], stage["package"]
    t0 = stage["t0"]
    answer, used_provider, prompt, errors = generate_answer(query, package, results.attrs.get("filters"), provider,
                                                            history_text=format_history(stage["history"]))
    out = {"query": query, "search_query": search_query, "answer": answer, "provider": used_provider,
           "filters": results.attrs.get("filters"),
           "n_candidates": results.attrs.get("n_candidates"), "results": results, "package": package,
           "citations": verify_citations(answer, package), "prompt": prompt, "fallback_errors": errors,
           "latency_s": round(time.time() - t0, 2)}
    out["model"] = last_gemini_model() if used_provider == "gemini" else None
    out["recency"] = bool(results.attrs.get("recency"))
    if out["citations"]["is_refusal"]:                         # v10: refusal -> the refusal sentence only
        out["raw_answer"] = answer
        out["answer"] = REFUSAL_AR if detect_language(query) == "ar" else REFUSAL_EN
        out["citations"] = verify_citations(out["answer"], package)
    else:                                                      # v10: books named without [S#] tags
        out["citations"]["inferred"] = (_named_without_tag(answer, package, out["citations"]["cited"])
                                        if out["citations"]["cited"] else _inferred_tags(answer, package))
    out["all_books"], out["all_books_complete"], out["all_books_groups"] = all_matching_books(out)
    out["coverage_note"] = coverage_note(query, out)
    out["hint"] = ((REFUSAL_HINT_AR if detect_language(query) == "ar" else REFUSAL_HINT_EN)
                   if out["citations"]["is_refusal"] or not _books_used(out) else None)
    out["latency_s"] = round(time.time() - t0, 2)
    return out
