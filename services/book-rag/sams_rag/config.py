"""Central configuration (notebook Section 1). Values were chosen by the evaluation in notebook Section 12.

Environment variables (or a .env file) override paths and the LLM:
    SAMS_DATA_PATH, SAMS_STORE_DIR, SAMS_MODELS_DIR, LLM_PROVIDER, GEMINI_MODEL, GEMINI_API_KEY
"""
import os
import re

# Runtime environment is explicit; never load secrets/settings from a parent .env.
CONFIG = {
    # --- data ---
    "data_path": os.getenv("SAMS_DATA_PATH", os.path.join("data", "SAMS_Books_Merged_Book_Names_Corrected.xlsx")),

    # --- chunking (Lab 8/9 style word windows) ---
    "chunk_size": 60,
    "chunk_overlap": 15,

    # --- lexical retrieval ---
    # Field-aware BM25: a match in the title or author field counts more than a match in the full record.
    "bm25_field_weights": {"title": 2.0, "authors": 1.5, "subjects": 1.5, "all": 1.0},
    "title_phrase_boost": 0.5,
    "heading_phrase_boost": 0.5,   # v4: ACCEPTED -- subject heading as a whole phrase in the question (topic_heading +0.024)

    # --- semantic retrieval ---
    "embedding_model": "intfloat/multilingual-e5-small",   # v3: kept (bge-m3 +0.007 overall but ~4x larger; revisit at deployment)
    "embedding_batch_size": 64,

    # --- fusion / reranking ---
    "candidate_pool": 50,        # how many results each retriever contributes before fusion
    "rrf_k": 60,                 # standard RRF constant (Cormack et al., 2009)
    "hybrid_alpha": 0.5,         # weight of semantic score in weighted fusion (Lab 8)
    "use_reranker": True,
    "reranker_model": "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1",   # v4: kept. Stronger option: "BAAI/bge-reranker-v2-m3" (0.904 vs 0.882, ~7x slower, 2.2 GB) -- test on the deployment server   # multilingual (incl. Arabic)
    "rerank_pool": 20,

    # --- context building (Lab 8) ---
    "max_sources": 6,
    "word_budget": 450,

    # --- generation ---
    "llm_provider": os.getenv("LLM_PROVIDER", "extractive"),      # "gemini" | "extractive"
    "gemini_model": os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"),  # v6: primary (faster; answered all manual-review questions well)
    "gemini_fallback_models": ["gemini-3.5-flash", "gemini-flash-latest"],   # tried in order if the primary is busy
    "gemini_attempts_per_model": 2,  # tries per model before switching to the next one
    "gemini_retry_wait_s": 3,        # short wait between the two tries
    "gemini_max_tokens": 4096,   # newer Gemini models "think" first; thinking tokens can count toward this limit
    "gemini_temperature": None,  # None = Google's recommended default for the model
    "gemini_time_budget_s": None,  # website: max seconds for all Gemini tries of one call (None = no limit, as in the notebook)
    # --- persistence ---
    "store_dir": os.getenv("SAMS_STORE_DIR", "rag_store"),
    "models_dir": os.getenv("SAMS_MODELS_DIR", "models"),

    # --- full list of matching books (v7) ---
    "all_books_limit": 30,
}

# Local folder for the embedding model (notebook Section 6): downloaded once, then loaded offline.
CONFIG.setdefault(
    "embedding_local_dir",
    os.path.join(CONFIG["models_dir"], re.sub(r"[^A-Za-z0-9._-]+", "__", CONFIG["embedding_model"])),
)
CONFIG.setdefault(
    "reranker_local_dir",
    os.path.join(CONFIG["models_dir"], re.sub(r"[^A-Za-z0-9._-]+", "__", CONFIG["reranker_model"])),
)
