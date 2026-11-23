"""Ask the engine from a terminal (same behavior as the notebook's chat.ask cells).

    python scripts/ask.py
    commands:  /reset  new conversation   |   /card N  full record of book N in the last list   |   /quit
"""
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
logging.basicConfig(level=logging.WARNING)

from sams_rag.engine import ChatSession, book_card, serialize  # noqa: E402


def show(data):
    print("=" * 80)
    print(f"[{data['provider']}{' / ' + data['model'] if data['model'] else ''} | {data['latency_s']}s]"
          + (f"  search: {data['search_query']}" if data["search_query"] else ""))
    print(data["answer"])
    for extra in (data["coverage_note"], data["hint"]):
        if extra:
            print("\n" + extra)
    for s in data["sources"]:
        print(f"\n[{s['tag']}]")
        print("\n".join(f"{k}: {v}" for k, v in s["card"].items()))
    if data["all_books"]:
        ab = data["all_books"]
        print(f"\n{'All matching books' if ab['complete'] else 'Closest books'} ({len(ab['items'])}):")
        for it in ab["items"]:
            print(f"  {it['n']:>3}. {'✓' if it['in_answer'] else ' '} {it['title']} | {it['author']} | {it['year']} | "
                  f"{it['call_number']} | copies: {it['copies']}")


def main():
    chat, last = ChatSession(), None
    print("Ask a question (Arabic or English). /reset, /card N, /quit")
    while True:
        try:
            q = input("\n> ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not q:
            continue
        if q == "/quit":
            break
        if q == "/reset":
            chat.reset(); print("(new conversation)"); continue
        if q.startswith("/card"):
            try:
                n = int(q.split()[1])
                print(book_card(last["all_books_groups"][n - 1]))
            except Exception:
                print("usage: /card N  (N = a number from the last list)")
            continue
        last = chat.ask(q)
        show(serialize(last))


if __name__ == "__main__":
    main()
