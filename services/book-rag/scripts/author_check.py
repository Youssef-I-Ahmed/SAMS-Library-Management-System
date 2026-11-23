"""Check rule 13 and the misspelled-author list with Gemini (v16). Each question is asked in a new conversation.

    python scripts/author_check.py

What to look for:
  - correctly spelled names ("كتب أحمد ماهر", "كتب احمد ماهر", "كتب كوتلر", "كتب د. فريد النجار"): a normal answer,
    and NEVER "no books by that name";
  - misspelled names ("كتب دكتور نفين مكرم", "كتب نفين لبيب"): no refusal; first a clear sentence that the name is
    not in the catalog, then the close names; the list = only those authors' books;
  - a topic question ("كتب عن التفاوض") and an out-of-scope question ("إزاي أعمل كيكة؟"): as before.
"""
import logging
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
logging.basicConfig(level=logging.WARNING)

from sams_rag.engine import rag_answer, serialize  # noqa: E402

QUESTIONS = ["كتب أحمد ماهر", "كتب احمد ماهر", "كتب كوتلر", "كتب د. فريد النجار",
             "كتب دكتور نفين مكرم", "كتب نفين لبيب", "كتب عن التفاوض", "إزاي أعمل كيكة؟"]

if not os.getenv("GEMINI_API_KEY"):
    sys.exit("GEMINI_API_KEY is not set: this check needs Gemini.")
for q in QUESTIONS:
    d = serialize(rag_answer(q))
    ab = d["all_books"] or {}
    print("=" * 80)
    print(f"Q: {q}   [{d['provider']} | {d['latency_s']}s | refusal: {d['is_refusal']}]")
    print(d["answer"][:700])
    if d.get("author_list"):
        print(f"-> author list: {d['author_list']}")
    if d["coverage_note"]:
        print(f"-> note: {d['coverage_note']}")
    print(f"-> sources: {len(d['sources'])} | list: {len(ab.get('items', []))} books"
          f"{' (complete)' if ab.get('complete') else ''}")
    time.sleep(4)                                    # free-tier rate limits
