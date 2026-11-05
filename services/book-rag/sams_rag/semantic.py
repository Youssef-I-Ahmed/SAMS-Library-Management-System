"""Multilingual embeddings + FAISS vector search (notebook Section 6).

On import: loads the embedding model (offline-first), loads or computes the chunk embeddings
(cached in CONFIG["store_dir"]) and builds the FAISS index.
"""
import logging
import os
import re
import time

import faiss
import numpy as np
import pandas as pd
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize as l2_normalize

from .catalog import chunk_to_book, chunks_df
from .config import CONFIG
from .text import normalize_text
from app import local_models

log = logging.getLogger("sams_rag")

def _is_saved_sentence_transformer(path):
    # A folder written by SentenceTransformer.save() always contains modules.json (or at least config.json).
    return bool(path) and os.path.isdir(path) and any(
        os.path.exists(os.path.join(path, f)) for f in ("modules.json", "config.json"))


class TextEncoder:
    # Sentence-transformers encoder with E5 prefixes, loaded offline-first; falls back to char-ngram LSA.

    def __init__(self, model_name, local_dir=None):
        self.model_name = model_name
        self.is_e5 = "e5" in model_name.lower()
        self.local_dir = local_dir or CONFIG.get("embedding_local_dir")
        self.model = None
        self.load_source = None          # "local-dir" | "hf-cache" | "download" | "lsa-fallback"

        try:
            from sentence_transformers import SentenceTransformer
        except Exception as exc:         # library itself missing -> straight to the fallback
            raise RuntimeError("Local embedding runtime unavailable") from None

        # SAMS runtime is strictly local: no Hub/cache fallback, download, save or LSA downgrade.
        from sentence_transformers import SentenceTransformer
        if not _is_saved_sentence_transformer(self.local_dir):
            raise RuntimeError("Required local embedding model unavailable")
        self.model = local_models.encoder(self.local_dir)
        self.load_source = "local-dir"
        self.backend = f"sentence-transformers:{model_name}"

    def fit(self, corpus_texts):
        # Only the fallback needs fitting.
        if self.model is None:
            self._tfidf = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4), min_df=2, sublinear_tf=True)
            X = self._tfidf.fit_transform([normalize_text(t) for t in corpus_texts])
            self._svd = TruncatedSVD(n_components=256, random_state=42).fit(X)
        return self

    def _encode(self, texts, prefix):
        if self.model is not None:
            texts = [f"{prefix}{t}" for t in texts] if self.is_e5 else list(texts)
            return local_models.encode(self.model, texts, batch_size=CONFIG["embedding_batch_size"], convert_to_numpy=True,
                                     normalize_embeddings=True, show_progress_bar=len(texts) > 200).astype("float32")
        X = self._svd.transform(self._tfidf.transform([normalize_text(t) for t in texts]))
        return l2_normalize(X).astype("float32")

    def encode_passages(self, texts):
        return self._encode(texts, "passage: ")

    def encode_queries(self, texts):
        return self._encode(texts, "query: ")


encoder = TextEncoder(CONFIG["embedding_model"]).fit(chunks_df["chunk_text"].tolist())
log.info("Embedding backend: %s | loaded from: %s", encoder.backend, encoder.load_source)

# Content-keyed vectors, reused across catalog revisions. A changed row with the
# same chunk count cannot reuse an unrelated old matrix.
chunk_embeddings = local_models.passages(encoder.model, chunks_df["chunk_text"].tolist(), CONFIG["embedding_batch_size"])

# --- Vector store (Diagram step 5) ---
dim = chunk_embeddings.shape[1]
vector_index = faiss.IndexIDMap2(faiss.IndexFlatIP(dim))
vector_index.add_with_ids(chunk_embeddings, chunks_df["chunk_id"].to_numpy().astype("int64"))

# Book -> chunk ids lookup, used to turn book-level filters into a FAISS IDSelector
book_to_chunks = chunks_df.groupby("book_id")["chunk_id"].apply(np.array).to_dict()

def semantic_search(query, candidate_ids=None, top_n=50, min_similarity=None):
    # Vector search over chunks, aggregated to books (max). Supports FAISS ID-filtered search.
    q = encoder.encode_queries([query])
    n_chunks = top_n * 3                                   # oversample chunks; several may belong to one book

    if candidate_ids is None:
        sims, ids = vector_index.search(q, min(n_chunks, vector_index.ntotal))
    else:
        allowed = np.concatenate([book_to_chunks[b] for b in candidate_ids if b in book_to_chunks]).astype("int64")
        if len(allowed) == 0:
            return pd.DataFrame(columns=["book_id", "semantic_score", "semantic_rank"])
        try:   # FAISS >= 1.7.3: pre-filtering inside the index
            params = faiss.SearchParameters(sel=faiss.IDSelectorBatch(allowed))
            sims, ids = vector_index.search(q, min(n_chunks, len(allowed)), params=params)
        except Exception:   # older FAISS: brute-force on the allowed rows (identical result for a flat index)
            s = chunk_embeddings[allowed] @ q[0]
            top = np.argsort(-s)[:n_chunks]
            sims, ids = s[top][None, :], allowed[top][None, :]

    sims, ids = sims[0], ids[0]
    keep = ids >= 0
    hits = pd.DataFrame({"book_id": chunk_to_book[ids[keep]], "semantic_score": sims[keep]})
    if min_similarity is not None:                       # Diagram step 8: similarity threshold
        hits = hits[hits["semantic_score"] >= min_similarity]
    hits = (hits.groupby("book_id", as_index=False)["semantic_score"].max()
                .sort_values("semantic_score", ascending=False).head(top_n).reset_index(drop=True))
    hits["semantic_rank"] = np.arange(1, len(hits) + 1)
    return hits
