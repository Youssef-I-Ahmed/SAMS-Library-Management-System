"""Conversation memory and follow-up rewriting (notebook Section 11.4). One ChatSession per researcher."""
import logging
import os
from typing import Optional

from .answer import finish, format_history, is_help_question, rag_answer, retrieve
from .config import CONFIG
from .filters import SearchFilters
from .generation import call_gemini

log = logging.getLogger("sams_rag")

REWRITE_SYSTEM = """You rewrite the user's latest message into a standalone search query for a library book catalog.
Use the conversation history to resolve references such as "the same author", "the second book", "more like that".
Output ONLY the rewritten query on one line, in the same language as the latest message, with no explanation.
If the latest message is already a standalone question, output it unchanged."""


def llm_complete(system_prompt, user_prompt):
    # One plain call to the configured LLM; returns None when it is unavailable (no key, network error, ...).
    provider = CONFIG["llm_provider"]
    try:
        if provider == "gemini" and (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")):
            return call_gemini(system_prompt, user_prompt)
    except Exception as exc:
        log.warning("query rewrite with %r failed (%s); using the simple fallback.", provider, type(exc).__name__)
    return None


def rewrite_followup(query, history):
    # Turn a follow-up message into a standalone search query. Returns (query, method).
    if not history or is_help_question(query):
        return query, "as-is"
    user_prompt = (f"<conversation_history>\n{format_history(history)}\n</conversation_history>\n\n"
                   f"<latest_message>\n{query}\n</latest_message>")
    text = llm_complete(REWRITE_SYSTEM, user_prompt)
    if text and text.strip():
        return text.strip().splitlines()[0].strip()[:300], "llm"
    return f"{history[-1]['search_query']} {query}", "fallback: previous query + message"


class ChatSession:
    # Multi-turn RAG chat with memory of the last `max_turns` turns.

    def __init__(self, max_turns=4):
        self.max_turns = max_turns
        self.history = []          # list of {"question", "search_query", "answer", "books"}

    def ask(self, query, filters: Optional[SearchFilters] = None, **kwargs):
        search_query, method = rewrite_followup(query, self.history)
        out = rag_answer(query, filters=filters, history=self.history[-self.max_turns:],
                         search_query=search_query, **kwargs)
        out["rewrite_method"] = method
        if out["provider"] != "help":                      # capability answers are not remembered
            src = out["package"]["sources"]
            cited = set(out["citations"]["cited"])
            books = [f"{r.title} — {r.author}" for r in src.itertuples() if r.source in cited] if len(src) else []
            self.history.append({"question": query, "search_query": out["search_query"],
                                 "answer": out["answer"], "books": books})
            self.history = self.history[-self.max_turns:]
        return out

    # Website addition (phase 2): ask() in two steps -- begin() searches (books ready at once), end() adds Gemini.
    # end(begin(q)) behaves exactly like ask(q).
    def begin(self, query, filters: Optional[SearchFilters] = None, **kwargs):
        search_query, method = rewrite_followup(query, self.history)
        stage = retrieve(query, filters=filters, history=self.history[-self.max_turns:],
                         search_query=search_query, **kwargs)
        stage["rewrite_method"] = method
        return stage

    def end(self, stage, provider=None):
        out = finish(stage, provider)
        out["rewrite_method"] = stage["rewrite_method"]
        query = stage["query"]
        if out["provider"] != "help":                      # capability answers are not remembered
            src = out["package"]["sources"]
            cited = set(out["citations"]["cited"])
            books = [f"{r.title} — {r.author}" for r in src.itertuples() if r.source in cited] if len(src) else []
            self.history.append({"question": query, "search_query": out["search_query"],
                                 "answer": out["answer"], "books": books})
            self.history = self.history[-self.max_turns:]
        return out

    def reset(self):
        self.history = []
