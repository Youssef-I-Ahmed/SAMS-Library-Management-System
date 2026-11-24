# -*- coding: utf-8 -*-
"""
clustering_core.py - the reusable core of the book clustering model.

This file is shared by:
    train.py  -> trains the model on the catalog and saves it to disk
    api.py    -> loads the saved model and predicts the cluster of NEW books

It contains:
    - text cleaning (same logic as the notebook / book_clustering.py)
    - BookClusterer: holds the fitted parts (TF-IDF, SVD, KMeans) for Arabic and English,
      and can predict the cluster of a new book
"""

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Union

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

# Settings (must match the settings used in the notebook)
SVD_DIMS = 30
SUBJECT_WEIGHT = 3    # subjects are repeated 3 times in the text (more weight than the title)
CODES_WEIGHT = 2      # subject codes are repeated 2 times
MODEL_FORMAT_VERSION = 1

EXTRA_STOP = {
    "في", "من", "على", "الى", "عن", "مع", "او", "و", "ال", "هل", "كيف", "ما",
    "and", "the", "of", "for", "in", "to", "a", "an", "with", "on", "by", "edition",
    "ed", "th", "nd", "rd", "st", "e", "its", "as", "at", "from", "your", "you",
}


# ------------------------------------------------------------------ text cleaning
def light_stem(w: str) -> str:
    """Strip common Arabic prefixes/suffixes (and English plurals) from one word."""
    if not re.search("[\u0600-\u06ff]", w):
        for suf in ("ing", "es", "s"):
            if w.endswith(suf) and len(w) > len(suf) + 3:
                return w[: -len(suf)]
        return w
    for p in ("وال", "بال", "كال", "فال", "لل", "ال", "و"):
        if w.startswith(p) and len(w) > len(p) + 2:
            w = w[len(p):]
            break
    for suf in ("ات", "ان", "ين", "ون", "يه", "ه", "ي", "ا"):
        if w.endswith(suf) and len(w) > len(suf) + 2:
            w = w[: -len(suf)]
            break
    return w


def normalize_text(t, stem: bool = False) -> str:
    """Clean one piece of text. If stem=True, also apply light stemming to every word."""
    t = str(t).lower()
    t = re.sub("[\u064b-\u065f\u0640]", "", t)
    t = re.sub("[إأآ]", "ا", t)
    t = t.replace("ى", "ي").replace("ة", "ه")
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\d+", " ", t)
    words = [w for w in t.split() if w not in EXTRA_STOP and len(w) > 1]
    if stem:
        words = [light_stem(w) for w in words]
    return " ".join(words)


def detect_language(title: str) -> str:
    """'ar' if the title contains any Arabic letter, otherwise 'en'."""
    return "ar" if re.search("[\u0600-\u06ff]", str(title)) else "en"


def parse_codes(value) -> str:
    """Accepts '1 | 2 | 3', a list like [1, 2, 3], or None. Returns 'c1 c2 c3'."""
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return ""
    if isinstance(value, (list, tuple)):
        value = " ".join(str(v) for v in value)
    return " ".join("c" + x for x in re.findall(r"\d+", str(value)))


def clean_subjects(subjects) -> str:
    if subjects is None or (isinstance(subjects, float) and np.isnan(subjects)):
        return ""
    return str(subjects).replace("|", " ")


def build_text(title, subjects=None, codes=None) -> str:
    """The text the model works on: title + subjects x3 + subject codes x2."""
    subj = normalize_text(clean_subjects(subjects), True)
    return (normalize_text(title, True)
            + (" " + subj) * SUBJECT_WEIGHT
            + (" " + parse_codes(codes)) * CODES_WEIGHT)


def build_plain_text(title, subjects=None) -> str:
    """Unstemmed text, used only to name clusters with readable words."""
    return normalize_text(str(title) + " " + clean_subjects(subjects))


# ------------------------------------------------------------------ the model
@dataclass
class LanguageModel:
    """The fitted parts for one language."""
    name: str                       # "AR" or "EN"
    vectorizer: TfidfVectorizer
    svd: TruncatedSVD
    kmeans: KMeans
    labels: Dict[str, str]          # cluster id -> readable name
    sizes: Dict[str, int]           # cluster id -> number of training books


@dataclass
class BookClusterer:
    models: Dict[str, LanguageModel]
    meta: dict = field(default_factory=dict)

    # ---------------------------------------------------------------- training
    @classmethod
    def fit(cls, df: pd.DataFrame, k_ar: int = 10, k_en: int = 6):
        """Train on a cleaned catalog DataFrame (needs TITLE, SUBJECTS, SUBJECT_CODES).
        Returns (clusterer, assignments) where assignments has one row per training book."""
        df = df.copy()
        df["text"] = [build_text(t, s, c) for t, s, c in
                      zip(df["TITLE"].fillna(""), df["SUBJECTS"], df["SUBJECT_CODES"])]
        df["text_plain"] = [build_plain_text(t, s) for t, s in
                            zip(df["TITLE"].fillna(""), df["SUBJECTS"])]
        df = df[df["text"].str.len() > 3]
        df = df.drop_duplicates(subset="TITLE").reset_index(drop=True)
        df["lang"] = df["TITLE"].map(detect_language)

        models, parts = {}, []
        for lang, k in (("ar", k_ar), ("en", k_en)):
            sub = df[df["lang"] == lang].copy()
            name = lang.upper()

            vec = TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_df=0.5, sublinear_tf=True)
            X = vec.fit_transform(sub["text"])
            svd = TruncatedSVD(min(SVD_DIMS, X.shape[1] - 1), random_state=42)
            Z = normalize(svd.fit_transform(X))
            km = KMeans(k, n_init=20, random_state=42).fit(Z)

            sub["cluster"] = [f"{name}-{c + 1}" for c in km.labels_]

            # readable cluster names from an unstemmed TF-IDF
            lvec = TfidfVectorizer(min_df=2, max_df=0.5, sublinear_tf=True)
            LX = lvec.fit_transform(sub["text_plain"])
            terms = np.array(lvec.get_feature_names_out())
            labels = {}
            for c in range(k):
                idx = np.where(km.labels_ == c)[0]
                m = np.asarray(LX[idx].mean(axis=0)).ravel()
                labels[f"{name}-{c + 1}"] = " / ".join(terms[m.argsort()[::-1]][:4])
            sub["cluster_label"] = sub["cluster"].map(labels)

            sizes = sub["cluster"].value_counts().to_dict()
            models[lang] = LanguageModel(name, vec, svd, km, labels,
                                         {c: int(sizes.get(c, 0)) for c in labels})
            parts.append(sub)

        clusterer = cls(models=models, meta={"format_version": MODEL_FORMAT_VERSION,
                                             "n_training_books": int(len(df))})
        return clusterer, pd.concat(parts).sort_index()

    # -------------------------------------------------------------- prediction
    def predict(self, title: str, subjects=None, subject_codes=None, top_n: int = 3) -> dict:
        """Assign ONE book to its nearest cluster.

        Returns the cluster id and readable name, the distance to the cluster centre,
        the margin to the second-nearest cluster (small margin = the book sits between
        two topics), and the nearest alternatives.
        """
        lang = detect_language(title)
        lm = self.models[lang]
        X = lm.vectorizer.transform([build_text(title, subjects, subject_codes)])

        # None of the words were seen in training: any cluster would be a random guess.
        if X.nnz == 0:
            return {"language": lang, "cluster": None, "cluster_label": None,
                    "distance": None, "margin": None, "alternatives": [],
                    "reason": "no_known_words"}

        Z = normalize(lm.svd.transform(X))
        dist = np.linalg.norm(lm.kmeans.cluster_centers_ - Z, axis=1)
        order = np.argsort(dist)
        ids = [f"{lm.name}-{i + 1}" for i in range(len(dist))]

        def item(i):
            return {"cluster": ids[i], "cluster_label": lm.labels[ids[i]],
                    "distance": round(float(dist[i]), 4)}

        best = int(order[0])
        margin = float(dist[order[1]] - dist[best]) if len(order) > 1 else None
        return {"language": lang, "cluster": ids[best], "cluster_label": lm.labels[ids[best]],
                "distance": round(float(dist[best]), 4),
                "margin": None if margin is None else round(margin, 4),
                "alternatives": [item(int(i)) for i in order[1:top_n]],
                "reason": None}

    def predict_many(self, books: List[dict], top_n: int = 3) -> List[dict]:
        return [self.predict(b["title"], b.get("subjects"), b.get("subject_codes"), top_n)
                for b in books]

    def clusters(self) -> List[dict]:
        return [{"cluster": c, "cluster_label": lm.labels[c], "language": lang,
                 "n_training_books": lm.sizes[c]}
                for lang, lm in self.models.items() for c in lm.labels]

    # ----------------------------------------------------------------- saving
    def save(self, path: str) -> None:
        joblib.dump(self, path, compress=3)

    @staticmethod
    def load(path: str) -> "BookClusterer":
        """WARNING: joblib files are pickles. Only load files that you created yourself."""
        obj = joblib.load(path)
        if not isinstance(obj, BookClusterer):
            raise ValueError("The file is not a BookClusterer model.")
        return obj
