"""System prompt, Gemini with fallback models, and the extractive fallback (notebook Sections 11.1-11.2)."""
import json
import logging
import os
import threading
import time

import pandas as pd

from .config import CONFIG
from .text import detect_language

log = logging.getLogger("sams_rag")

REFUSAL_EN = "The provided sources do not contain enough information to answer this question."
REFUSAL_AR = "المصادر المتاحة لا تحتوي على معلومات كافية للإجابة عن هذا السؤال."

SYSTEM_PROMPT = f'''You are a careful library research assistant for an academic book collection (business,
management, finance, economics, and related fields). You answer ONLY from the catalog records inside <sources>.

Rules:
1. Use only the sources. Never add books, authors, years, publishers, or facts that are not in them.
2. The sources are catalog records (title, authors, topics, publisher, year, call number), NOT the books' text.
   Do not describe what a book says beyond its listed topics. ONLY if the question asks for something inside the
   books (steps, tips, summaries, explanations, quotes), say the catalog does not include the books' contents, then
   point to the most relevant books. Do NOT add that remark when the question only asks for books, authors, topics
   or where to find them.
3. Cite every book you mention with its tag, e.g. [S2]. Only use tags that exist in <sources>.
4. If no source is relevant, reply with exactly this one sentence and NOTHING else (no explanation, no reason):
   English question -> "{REFUSAL_EN}"
   Arabic question  -> "{REFUSAL_AR}"
5. Reply in the same language as the question. Keep book titles and author names exactly as written in the sources.
6. Order books from most to least relevant. Include the call number when the user wants to locate a book.
7. Be concise: a short direct answer, then the supporting books.
8. <conversation_history>, when present, shows earlier turns of this chat. Use it ONLY to understand what the user
   refers to ("the same author", "the second book", "more like that"). Facts about books still come only from
   <sources>, and you may only cite tags from the current <sources>.
9. If the user asks what you can do or how you can help, briefly explain that you search this library's catalog by
   topic, title or author (Arabic or English), recommend the most relevant books with their call numbers, and show
   their full catalog details. Do not cite sources in that reply.
10. A field whose value is "NA" is not recorded in the catalog. Never write "NA" to the user: write "غير مذكور"
    (Arabic answer) or "not stated" (English answer), or leave that field out.
11. ONLY when the user explicitly asks WHERE to find books (e.g. "where", "أين", "فين", "on the shelf", "على الرف")
    AND the call numbers of ALL the books you mention start with the same class number (e.g. 657 for every one of
    them), first say that the topic is shelved under that class number, then list the books with their full call
    numbers. In every other case, never state a shelf/class number for a topic -- just give each book's call number.
'''

def build_user_prompt(query, package, filters_desc, history_text=None):
    filt = json.dumps(filters_desc, ensure_ascii=False) if filters_desc else "none"
    history_block = f"<conversation_history>\n{history_text}\n</conversation_history>\n\n" if history_text else ""
    return (history_block +
            f"<question>\n{query}\n</question>\n\n"
            f"<search_filters_applied>{filt}</search_filters_applied>\n\n"
            f"<sources>\n{package['context_text'] or '(no matching records)'}\n</sources>")

# Which Gemini model produced the answer -- per thread, so concurrent requests on a server do not mix it up
# (the notebook used one global GEMINI_LAST_MODEL).
_last = threading.local()


def last_gemini_model():
    return getattr(_last, "model", None)


def call_gemini(system_prompt, user_prompt):
    # Try the primary Gemini model, then the fallback models, switching quickly when a model is busy.
    #   503 / 429 / 500 / 504  -> one short retry, then the next model
    #   404 (model not available for this key) or empty reply -> next model immediately
    #   anything else (e.g. 400 invalid key) -> stop: another model will not fix it
    _last.model = None
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"),
                          http_options=types.HttpOptions(timeout=60_000))          # 60 s per request
    # Website addition: optional total time budget (CONFIG["gemini_time_budget_s"]). None = no limit, exactly as in
    # the notebook. With a budget, no new attempt starts after it, and each request may only use the time left.
    budget = CONFIG.get("gemini_time_budget_s")
    deadline = None if budget is None else time.time() + budget
    config_kwargs = {"system_instruction": system_prompt, "max_output_tokens": CONFIG["gemini_max_tokens"]}
    if CONFIG.get("gemini_temperature") is not None:
        config_kwargs["temperature"] = CONFIG["gemini_temperature"]

    models = list(dict.fromkeys([CONFIG["gemini_model"]] + list(CONFIG.get("gemini_fallback_models", []))))
    attempts = max(1, CONFIG.get("gemini_attempts_per_model", 2))
    wait_s = CONFIG.get("gemini_retry_wait_s", 3)
    errors_seen = {}

    for model in models:
        for attempt in range(1, attempts + 1):
            if deadline is not None:
                left = deadline - time.time()
                if left <= 1:
                    errors_seen[model] = "time budget exceeded"
                    raise RuntimeError(f"Gemini time budget ({budget}s) exceeded: {errors_seen}")
                client = genai.Client(api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"),
                                      http_options=types.HttpOptions(timeout=int(min(60.0, left) * 1000)))
            try:
                resp = client.models.generate_content(model=model, contents=user_prompt,
                                                      config=types.GenerateContentConfig(**config_kwargs))
            except Exception as exc:
                code = getattr(exc, "code", None)
                msg = str(exc)
                errors_seen[model] = f"{code or type(exc).__name__}"
                if code == 404 or "NOT_FOUND" in msg:
                    break                                            # model not available -> next model now
                busy = code in (429, 500, 503, 504) or any(t in msg for t in ("503", "429", "UNAVAILABLE", "RESOURCE_EXHAUSTED"))
                if not busy:
                    raise                                            # e.g. invalid key: no other model will help
                if attempt < attempts:
                    log.info("[gemini] %s busy (%s); retrying in %ss", model, code, wait_s)
                    time.sleep(wait_s if deadline is None else max(0.0, min(wait_s, deadline - time.time())))
                continue
            text = resp.text or ""
            if text.strip():
                if model != models[0]:
                    log.info("[gemini] answered by fallback model %s", model)
                _last.model = model
                return text
            reason = resp.candidates[0].finish_reason if resp.candidates else "no candidates"
            errors_seen[model] = f"empty reply ({reason})"
            break                                                    # empty reply -> next model
        if model != models[-1]:
            log.info("[gemini] switching from %s to the next model (%s)", model, errors_seen.get(model))
    raise RuntimeError(f"all Gemini models failed: {errors_seen}")
def extractive_answer(query, package):
    is_ar = detect_language(query) == "ar"
    if package["num_sources"] == 0:
        return REFUSAL_AR if is_ar else REFUSAL_EN
    head = "أكثر الكتب صلة بسؤالك في الفهرس:" if is_ar else "The most relevant books in the catalog:"
    lines = [head]
    for s in package["sources"].itertuples():
        year = "" if pd.isna(s.year) else f", {s.year}"
        lines.append(f"- {s.title} — {s.author or 'n/a'}{year} (call no. {s.call_number or 'n/a'}) [{s.source}]")
    lines.append(("المصادر: " if is_ar else "Sources: ") + ", ".join(f"[{t}]" for t in package["sources"]["source"]))
    return "\n".join(lines)


def generate_answer(query, package, filters_desc, provider=None, history_text=None):
    provider = provider or CONFIG["llm_provider"]
    user_prompt = build_user_prompt(query, package, filters_desc, history_text)
    chain = {"gemini": ["gemini", "extractive"]}.get(provider, ["extractive"])   # Claude / Ollama paths not used in production
    errors = {}
    for p in chain:
        try:
            if p == "gemini":
                if not (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")):
                    raise RuntimeError("GEMINI_API_KEY not set")
                return call_gemini(SYSTEM_PROMPT, user_prompt), p, user_prompt, errors
            return extractive_answer(query, package), p, user_prompt, errors
        except Exception as exc:
            errors[p] = f"{type(exc).__name__}: {str(exc)[:120]}"
    raise RuntimeError(errors)
