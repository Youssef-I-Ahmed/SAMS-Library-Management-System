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
from .search import hybrid_search, reranker
from .text import detect_language, normalize_text

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
    if explicit or out["citations"]["is_refusal"]:
        return explicit
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


REFUSAL_HINT_AR = ("أنا متخصص في البحث في كتب هذه المكتبة. جرّب أن تسأل عن موضوع أو عنوان كتاب أو اسم مؤلف، "
                   "مثل: «كتب عن إدارة المشروعات».")
REFUSAL_HINT_EN = ("I can only search this library's books. Try asking about a topic, a book title or an author, "
                   "e.g. \"books on project management\".")


def coverage_note(query, out):
    # v6: when filters match more books than the answer can show, say so (written by code, not the LLM).
    filt, total, shown = out.get("filters") or {}, out.get("n_candidates") or 0, out["package"]["num_sources"]
    if out.get("all_books_complete") and out.get("all_books") is not None:
        total = len(out["all_books"])                    # count books, not catalog records (near-duplicates merged)
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


def all_matching_books(out):
    # Returns (DataFrame of the list, complete?, groups of book_ids per row).
    if out.get("provider") == "help" or out["citations"]["is_refusal"] or not _books_used(out):
        return None, False, []
    q = out.get("search_query") or out["query"]
    filt = out.get("filters") or {}
    f_all = (SearchFilters(**{k: v for k, v in filt.items() if k in SearchFilters.__dataclass_fields__})
             if filt else None)
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
    for n, g in enumerate(groups, start=1):
        b0 = g[0]
        copies = sum(int(books_df.at[b, "copies"]) for b in g if pd.notna(books_df.at[b, "copies"]))
        rows.append({"#": n, "title": books_df.at[b0, "title"], "author": books_df.at[b0, "author"],
                     "year": books_df.at[b0, "year"], "call_number": books_df.at[b0, "call_number"],
                     "copies": copies, "in_answer": "✓" if any(b in in_answer for b in g) else "",
                     "book_codes": [c for b in g for c in books_df.at[b, "merged_codes"]]})
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
    results = hybrid_search(search_query, filters=filters, k=k, method=method)
    package = build_context_package(results)
    answer, used_provider, prompt, errors = generate_answer(query, package, results.attrs.get("filters"), provider,
                                                            history_text=format_history(history))
    out = {"query": query, "search_query": search_query, "answer": answer, "provider": used_provider,
           "filters": results.attrs.get("filters"),
           "n_candidates": results.attrs.get("n_candidates"), "results": results, "package": package,
           "citations": verify_citations(answer, package), "prompt": prompt, "fallback_errors": errors,
           "latency_s": round(time.time() - t0, 2)}
    out["model"] = last_gemini_model() if used_provider == "gemini" else None
    if out["citations"]["is_refusal"]:                         # v10: refusal -> the refusal sentence only
        out["raw_answer"] = answer
        out["answer"] = REFUSAL_AR if detect_language(query) == "ar" else REFUSAL_EN
        out["citations"] = verify_citations(out["answer"], package)
    else:                                                      # v10: books named without [S#] tags
        out["citations"]["inferred"] = [] if out["citations"]["cited"] else _inferred_tags(answer, package)
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
    results = hybrid_search(search_query, filters=filters, k=k, method=method)
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
    if out["citations"]["is_refusal"]:                         # v10: refusal -> the refusal sentence only
        out["raw_answer"] = answer
        out["answer"] = REFUSAL_AR if detect_language(query) == "ar" else REFUSAL_EN
        out["citations"] = verify_citations(out["answer"], package)
    else:                                                      # v10: books named without [S#] tags
        out["citations"]["inferred"] = [] if out["citations"]["cited"] else _inferred_tags(answer, package)
    out["all_books"], out["all_books_complete"], out["all_books_groups"] = all_matching_books(out)
    out["coverage_note"] = coverage_note(query, out)
    out["hint"] = ((REFUSAL_HINT_AR if detect_language(query) == "ar" else REFUSAL_HINT_EN)
                   if out["citations"]["is_refusal"] or not _books_used(out) else None)
    out["latency_s"] = round(time.time() - t0, 2)
    return out
