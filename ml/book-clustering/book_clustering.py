# -*- coding: utf-8 -*-
"""
BOOK TOPIC CLUSTERING - SAMS LIBRARY CATALOG
============================================

What this script does, in one paragraph:
    It reads the library catalog, cleans the text of each book, turns the text into
    numbers (TF-IDF), compresses those numbers (SVD), and groups similar books together
    (KMeans) - Arabic and English books separately. Then it names each group, checks how
    well the groups agree with the Dewey classification, finds the weak topics in the
    collection, and saves an Excel file plus charts.

Steps in this file (in order):
    STEP 1  - Imports and settings
    STEP 2  - Text cleaning helpers (normalization + light stemming)
    STEP 3  - Load and clean the catalog
    STEP 4  - Choose the number of clusters (k)
    STEP 5  - Cluster the books and name the clusters
    STEP 6  - Evaluate the clusters against the Dewey classification
    STEP 7  - Supervised accuracy reference (LinearSVC)
    STEP 8  - Find the weak topics
    STEP 9  - Draw the charts
    STEP 10 - Main: run everything and save the results

How to run:
    python book_clustering.py --input SAMS_Books_Merged_Book_Names_Corrected.xlsx
"""

# =====================================================================================
# STEP 1: IMPORTS AND SETTINGS
# -------------------------------------------------------------------------------------
# What happens in this step:
#   - We load the libraries the script needs.
#   - We define the settings (constants) in one place, so they are easy to change.
# =====================================================================================

import argparse   # reads command-line options such as --input
import os         # creates folders and builds file paths
import re         # regular expressions, used to clean text

import matplotlib                      # drawing charts
import numpy as np                     # fast math on arrays
import pandas as pd                    # tables (DataFrames)
from sklearn.cluster import KMeans                                   # the clustering algorithm
from sklearn.decomposition import PCA, TruncatedSVD                  # dimensionality reduction
from sklearn.feature_extraction.text import TfidfVectorizer          # turns text into numbers
from sklearn.metrics import adjusted_rand_score, normalized_mutual_info_score, silhouette_score  # quality scores
from sklearn.model_selection import StratifiedKFold, cross_val_score  # cross-validation
from sklearn.pipeline import make_pipeline                           # chains steps into one model
from sklearn.preprocessing import normalize                          # makes vectors the same length
from sklearn.svm import LinearSVC                                    # the supervised reference model

matplotlib.use("Agg")  # draw to image files only (no window), so it runs on any machine
import matplotlib.pyplot as plt  # noqa: E402  (must come after matplotlib.use)

# ---- Settings you can change ----
CURRENT_YEAR = 2026   # used to drop impossible publishing years and to decide what is "old"
SVD_DIMS = 30         # number of dimensions after compression (tested 30-300; 30-50 worked best)
OLD_YEARS = 10        # a book is "old" if it was published more than this many years ago

# Words that carry no topic meaning (connectors and generic words). They are removed from text.
EXTRA_STOP = {
    "في", "من", "على", "الى", "عن", "مع", "او", "و", "ال", "هل", "كيف", "ما",
    "and", "the", "of", "for", "in", "to", "a", "an", "with", "on", "by", "edition",
    "ed", "th", "nd", "rd", "st", "e", "its", "as", "at", "from", "your", "you",
}


# =====================================================================================
# STEP 2: TEXT CLEANING HELPERS (NORMALIZATION + LIGHT STEMMING)
# -------------------------------------------------------------------------------------
# What happens in this step:
#   Arabic can write the same word in many forms (different alef shapes, with or without
#   "al-", plural endings...). If we leave them as they are, the model treats them as
#   different words and the clusters get worse. So we define two helper functions:
#     1) light_stem      - cuts common prefixes/suffixes so word forms become one word.
#     2) normalize_text  - unifies letters, removes noise, and (optionally) calls light_stem.
#   Example: "الإدارة" and "إدارة" both become "ادار".
# =====================================================================================

def light_stem(w):
    """Strip common Arabic prefixes/suffixes (and English plurals) from one word."""

    # English word (no Arabic letters): only remove "ing", "es", "s" from the end.
    if not re.search("[\u0600-\u06ff]", w):
        for suf in ("ing", "es", "s"):
            # The length check stops us from cutting short words down to nothing.
            if w.endswith(suf) and len(w) > len(suf) + 3:
                return w[: -len(suf)]
        return w

    # Arabic word, part 1: remove ONE prefix ("al-", "wal-", "bil-", ...).
    for p in ("وال", "بال", "كال", "فال", "لل", "ال", "و"):
        if w.startswith(p) and len(w) > len(p) + 2:
            w = w[len(p):]
            break
    # Arabic word, part 2: remove ONE suffix (plural / feminine / adjective endings).
    for suf in ("ات", "ان", "ين", "ون", "يه", "ه", "ي", "ا"):
        if w.endswith(suf) and len(w) > len(suf) + 2:
            w = w[: -len(suf)]
            break
    return w


def normalize_text(t, stem=False):
    """Clean one piece of text. If stem=True, also apply light stemming to every word."""
    t = str(t).lower()                                   # English letters to lowercase
    t = re.sub("[\u064b-\u065f\u0640]", "", t)           # remove Arabic diacritics and tatweel
    t = re.sub("[إأآ]", "ا", t)                          # unify alef shapes -> ا
    t = t.replace("ى", "ي").replace("ة", "ه")            # unify yaa and taa marbouta
    t = re.sub(r"[^\w\s]", " ", t)                       # remove punctuation
    t = re.sub(r"\d+", " ", t)                           # remove numbers
    # Split into words, drop stop words and one-letter words.
    words = [w for w in t.split() if w not in EXTRA_STOP and len(w) > 1]
    if stem:
        words = [light_stem(w) for w in words]           # apply light stemming if requested
    return " ".join(words)


# =====================================================================================
# STEP 3: LOAD AND CLEAN THE CATALOG
# -------------------------------------------------------------------------------------
# What happens in this step:
#   - Read the Excel file and turn the text "NA" into real missing values.
#   - Fix the numeric columns (publishing year, number of copies).
#   - Build the text each book will be clustered on:
#         title  +  subjects (3 times)  +  subject codes (2 times)
#     Repeating the subjects gives them more weight, because titles alone are weak.
#   - Remove duplicate titles.
#   - Detect the language of each book (Arabic or English).
#   - Extract the Dewey number from CALL_NUM (used only to evaluate, never to cluster).
# =====================================================================================

def load_and_clean(path):
    # Read the file; the text "NA" becomes a real missing value (NaN).
    df = pd.read_excel(path).replace({"NA ": np.nan, "NA": np.nan})
    n0 = len(df)  # original row count (printed at the end of this step)

    # Publishing year: convert to a number; impossible years become missing.
    df["year"] = pd.to_numeric(df["PUBLISHING_DATE"], errors="coerce")
    df.loc[(df["year"] < 1900) | (df["year"] > CURRENT_YEAR), "year"] = np.nan

    # Number of copies as a number.
    df["copies"] = pd.to_numeric(df["NUM_OF_COPIES"], errors="coerce")

    # --- Pieces of text for each book ---
    title = df["TITLE"].fillna("")                                          # the title
    subj = df["SUBJECTS"].fillna("").str.replace("|", " ", regex=False)     # subjects (remove the "|" separator)
    # Subject codes: "1 | 2 | 3" becomes "c1 c2 c3" (the letter c makes them behave as words, not numbers).
    codes = df["SUBJECT_CODES"].map(
        lambda t: " ".join("c" + x for x in re.findall(r"\d+", str(t))) if pd.notna(t) else ""
    )

    # Final text used for clustering = title + subjects x3 + codes x2.
    # These weights were tested and gave the best agreement with Dewey.
    df["text"] = (title.map(lambda t: normalize_text(t, True))
                  + (" " + subj.map(lambda t: normalize_text(t, True))) * 3
                  + (" " + codes) * 2)

    # A second version WITHOUT stemming. It is used only to name clusters with readable words.
    df["text_plain"] = (title + " " + subj).map(normalize_text)

    df = df[df["text"].str.len() > 3]                               # drop rows with almost no text
    df = df.drop_duplicates(subset="TITLE").reset_index(drop=True)  # drop duplicate titles

    # Language: any Arabic letter in the title -> "ar", otherwise "en".
    df["lang"] = df["TITLE"].map(lambda t: "ar" if re.search("[\u0600-\u06ff]", str(t)) else "en")

    # Dewey class: first 3 digits of the call number (used for evaluation only, not for clustering).
    df["ddc"] = df["CALL_NUM"].astype(str).str.extract(r"(\d{3})")[0]

    print(f"Rows: {n0} -> {len(df)} after cleaning and removing duplicate titles")
    print(df["lang"].value_counts().to_dict())
    return df


# =====================================================================================
# STEP 4: CHOOSE THE NUMBER OF CLUSTERS (k)
# -------------------------------------------------------------------------------------
# What happens in this step:
#   We try several values of k (4 to 15) and measure the Silhouette score for each.
#   A higher Silhouette means clearer, better separated clusters.
#   The scores are saved to a table and a chart so you can compare them and pick k.
#   Note: there is no clear "best" k in this data (the score keeps rising with k),
#   so the defaults (10 Arabic, 6 English) are a practical choice, not a proven optimum.
# =====================================================================================

def pick_k(Z, candidates):
    rows = []
    for k in candidates:
        km = KMeans(k, n_init=10, random_state=42).fit(Z)
        rows.append((k, silhouette_score(Z, km.labels_)))
    return pd.DataFrame(rows, columns=["k", "silhouette"])


# =====================================================================================
# STEP 5: CLUSTER THE BOOKS AND NAME THE CLUSTERS (ONE LANGUAGE AT A TIME)
# -------------------------------------------------------------------------------------
# What happens in this step (for one language):
#   (a) TF-IDF   - turn each book's text into a vector of numbers.
#                  Words that are rare and distinctive get a high weight; words that
#                  appear in almost every book get a low weight.
#   (b) SVD      - compress thousands of columns into 30, which removes noise.
#   (c) KMeans   - split the books into k groups of similar books.
#   (d) Naming   - for each group, find its 4 highest-weighted words and use them as the name.
#   We cluster Arabic and English separately; mixed together, the groups split by
#   language instead of by topic.
# =====================================================================================

def cluster_language(sub, k, name):
    # (a) TF-IDF: turn text into numbers.
    vec = TfidfVectorizer(ngram_range=(1, 2),   # single words and pairs of words
                          min_df=2,              # a word must appear in at least 2 books
                          max_df=0.5,            # ignore words that appear in more than half of the books
                          sublinear_tf=True)     # soften the effect of very frequent words
    X = vec.fit_transform(sub["text"])

    # (b) SVD: compress to SVD_DIMS columns, then make every vector the same length.
    n_comp = min(SVD_DIMS, X.shape[1] - 1)       # safety in case there are fewer than 30 words
    Z = normalize(TruncatedSVD(n_comp, random_state=42).fit_transform(X))

    # (c) KMeans: split the books into k clusters.
    #     n_init=20 -> try 20 different starts and keep the best one.
    #     random_state=42 -> the result is the same every time you run it.
    km = KMeans(k, n_init=20, random_state=42).fit(Z)

    sub = sub.copy()
    # Cluster id such as AR-1 or EN-3.
    sub["cluster"] = [f"{name}-{c + 1}" for c in km.labels_]

    # (d) Naming: TF-IDF on the UNSTEMMED text, so the names are full readable words.
    lvec = TfidfVectorizer(min_df=2, max_df=0.5, sublinear_tf=True)
    LX = lvec.fit_transform(sub["text_plain"])
    terms = np.array(lvec.get_feature_names_out())   # list of all words
    labels = {}
    for c in range(k):
        idx = np.where(km.labels_ == c)[0]                   # the books in this cluster
        m = np.asarray(LX[idx].mean(axis=0)).ravel()         # average weight of each word in the cluster
        top = list(terms[m.argsort()[::-1]][:4])             # the 4 highest-weighted words
        labels[f"{name}-{c + 1}"] = " / ".join(top)          # name = those 4 words
    sub["cluster_label"] = sub["cluster"].map(labels)

    # Silhouette: how clear the clusters are (-1 to 1, closer to 1 is better).
    sil = silhouette_score(Z, km.labels_)
    print(f"[{name}] k={k} silhouette={sil:.3f}")
    return sub, Z, sil


# =====================================================================================
# STEP 6: EVALUATE THE CLUSTERS AGAINST THE DEWEY CLASSIFICATION
# -------------------------------------------------------------------------------------
# What happens in this step:
#   Clustering has no "accuracy" because there is no correct answer to compare with.
#   So we measure how much our clusters AGREE with the real Dewey class of each book
#   (the first 2 digits of CALL_NUM, e.g. 65 = management), using three scores:
#     - NMI     : how much information the clusters and Dewey share (0 to 1).
#     - ARI     : agreement between pairs of books, corrected for chance (0 = random).
#     - Purity  : share of books that match the most common Dewey class of their cluster.
#   For comparison we also print the baseline: the Purity you would get by putting
#   every book in a single cluster.
# =====================================================================================

def evaluate_vs_dewey(df):
    d = df[df["ddc"].notna()]            # only books that have a Dewey number
    y = d["ddc"].str[:2]                 # Dewey class with 2 digits (e.g. 65 = management)

    # Purity: in each cluster take the most common Dewey class and count how many books match it.
    tbl = pd.crosstab(d["cluster"], y)   # rows = clusters, columns = Dewey classes
    purity = tbl.max(axis=1).sum() / tbl.values.sum()

    res = {
        "NMI": normalized_mutual_info_score(y, d["cluster"]),   # shared information
        "ARI": adjusted_rand_score(y, d["cluster"]),            # pair agreement, corrected for chance
        "Purity": purity,                                        # match with the majority class
        "Majority-class baseline": y.value_counts(normalize=True).iloc[0],  # Purity of one single big cluster
        "Books evaluated": len(d),                               # number of books evaluated
    }
    print("\nAgreement with Dewey class:", {k: round(v, 3) for k, v in res.items()})
    return pd.DataFrame([res]).round(3)


# =====================================================================================
# STEP 7: SUPERVISED ACCURACY REFERENCE (LinearSVC)
# -------------------------------------------------------------------------------------
# What happens in this step:
#   This is NOT part of the clustering. It gives you a real "accuracy" number you can
#   quote in a report. We train a LinearSVC model to predict the Dewey class from the
#   book text and measure it with 5-fold cross-validation:
#     the data is split into 5 parts; train on 4, test on the 5th, repeat 5 times,
#     and average the accuracy.
#   Two cases are tested:
#     - title only         (the realistic case for new books with no subjects yet)
#     - title + subjects   (for books that already come with subjects)
# =====================================================================================

def supervised_reference(df):
    d = df[df["ddc"].notna()].copy()
    d["d2"] = d["ddc"].str[:2]
    # Drop very rare Dewey classes (fewer than 5 books) so 5-fold cross-validation works.
    d = d[d["d2"].isin(d["d2"].value_counts()[lambda v: v >= 5].index)]

    rows = []
    for name, txt in [("title only", d["TITLE"].fillna("").map(lambda t: normalize_text(t, True))),
                      ("title + subjects", d["text"].str.replace(r"\bc\d+\b", "", regex=True))]:  # remove subject codes
        # Pipeline = turn text into numbers (TF-IDF), then the LinearSVC model.
        pipe = make_pipeline(TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True), LinearSVC())
        acc = cross_val_score(pipe, txt, d["d2"], cv=StratifiedKFold(5, shuffle=True, random_state=1)).mean()
        rows.append({"input": name, "LinearSVC accuracy (Dewey 2-digit)": round(acc, 3)})
    print(pd.DataFrame(rows).to_string(index=False))
    return pd.DataFrame(rows)


# =====================================================================================
# STEP 8: FIND THE WEAK TOPICS
# -------------------------------------------------------------------------------------
# What happens in this step:
#   For every cluster we calculate: number of books, total and average copies, median
#   publishing year, share of old books, and share of single-copy books.
#   Then we raise up to 3 flags. A flag is ON when the cluster is in the WORST quarter
#   compared with the other clusters:
#     - flag_few_books    : very few books
#     - flag_old          : a high share of old books
#     - flag_low_copies   : a low average number of copies
#   weakness_score = number of flags that are ON (0 to 3). Higher = weaker topic.
#   Note: this is relative between clusters. The whole collection is old (median 2008),
#   so "old" only separates clusters from each other, not from a modern standard.
# =====================================================================================

def summarize(df):
    g = df.groupby(["cluster", "cluster_label"])   # group the books by cluster
    s = g.agg(
        books=("TITLE", "count"),                  # number of books
        total_copies=("copies", "sum"),            # total copies
        avg_copies=("copies", "mean"),             # average copies per book
        median_year=("year", "median"),            # median publishing year
        # share of old books (older than OLD_YEARS years)
        pct_old=("year", lambda y: (y.dropna() < CURRENT_YEAR - OLD_YEARS).mean()),
        # share of books that have one copy or fewer
        pct_single_copy=("copies", lambda c: (c <= 1).mean()),
    ).reset_index()
    s["avg_copies"] = s["avg_copies"].round(2)
    s["pct_old"] = s["pct_old"].round(2)
    s["pct_single_copy"] = s["pct_single_copy"].round(2)

    # Flags: each one turns ON when the cluster is in the worst quarter for that measure.
    s["flag_few_books"] = s["books"] <= s["books"].quantile(0.25)              # few books
    s["flag_old"] = s["pct_old"] >= s["pct_old"].quantile(0.75)                # many old books
    s["flag_low_copies"] = s["avg_copies"] <= s["avg_copies"].quantile(0.25)   # few copies
    # Weakness score = number of flags that are ON (0 to 3).
    s["weakness_score"] = s[["flag_few_books", "flag_old", "flag_low_copies"]].sum(axis=1)
    # Sort: weakest first; on a tie, the cluster with fewer books comes first.
    return s.sort_values(["weakness_score", "books"], ascending=[False, True])


# =====================================================================================
# STEP 9: DRAW THE CHARTS
# -------------------------------------------------------------------------------------
# What happens in this step:
#   Three PNG images are saved:
#     1) k_selection.png  - Silhouette score for each k (helps you choose k).
#     2) cluster_sizes.png - how many books are in each cluster.
#     3) book_map.png     - every book as a dot on a 2D map, colored by cluster.
#   Charts show cluster ids (AR-1, EN-2...) only, because Arabic letters come out
#   reversed in matplotlib. The readable Arabic names are in the Excel summary sheet.
# =====================================================================================

def charts(df, Z_all, ksel, outdir):
    # (1) Choosing k: one Silhouette line for Arabic and one for English.
    if ksel is not None:
        fig, ax = plt.subplots(figsize=(6, 4))
        for lang, tbl in ksel.items():
            ax.plot(tbl["k"], tbl["silhouette"], marker="o", label=lang)
        ax.set_xlabel("k")
        ax.set_ylabel("Silhouette")
        ax.set_title("Choosing k")
        ax.legend()
        fig.tight_layout()
        fig.savefig(os.path.join(outdir, "k_selection.png"), dpi=150)
        plt.close(fig)

    # (2) Cluster sizes: number of books in each cluster.
    sizes = df.groupby(["cluster", "cluster_label"]).size().reset_index(name="n").sort_values("n")
    fig, ax = plt.subplots(figsize=(8, max(4, 0.32 * len(sizes))))
    # Arabic letters render reversed in matplotlib, so we show the cluster id only (AR-1 ...);
    # the readable Arabic names are in the "cluster_summary" sheet of the Excel file.
    names = list(sizes["cluster"])
    ax.barh(names, sizes["n"])
    ax.set_xlabel("Number of books")
    ax.set_title("Books per topic cluster")
    fig.tight_layout()
    fig.savefig(os.path.join(outdir, "cluster_sizes.png"), dpi=150)
    plt.close(fig)

    # (3) Book map: compress the 30 dimensions to 2 with PCA, then draw one dot per book.
    pts = PCA(2, random_state=42).fit_transform(Z_all)
    fig, ax = plt.subplots(figsize=(8, 6))
    codes = pd.factorize(df["cluster"])[0]    # a number per cluster, used for coloring
    ax.scatter(pts[:, 0], pts[:, 1], c=codes, cmap="tab20", s=8, alpha=0.7)
    ax.set_title("Book map (PCA of TF-IDF, colored by cluster)")
    ax.set_xticks([])
    ax.set_yticks([])
    fig.tight_layout()
    fig.savefig(os.path.join(outdir, "book_map.png"), dpi=150)
    plt.close(fig)


# =====================================================================================
# STEP 10: MAIN - RUN EVERYTHING AND SAVE THE RESULTS
# -------------------------------------------------------------------------------------
# What happens in this step (this function calls the steps above in order):
#   1. Read the command-line options (--input, --outdir, --k_ar, --k_en).
#   2. Step 3  : load and clean the catalog.
#   3. Steps 5 and 4: cluster Arabic and English books separately, and compute the
#                     Silhouette scores for several k values.
#   4. Steps 8, 6, 7: weak-topic table, agreement with Dewey, supervised reference.
#   5. Save the Excel file (one sheet per table).
#   6. Step 9  : draw and save the charts.
#   7. Print the 8 weakest topics on screen.
# =====================================================================================

def main():
    # Command-line options.
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)                         # path to the catalog file (required)
    ap.add_argument("--outdir", default="clustering_output")          # folder for the results
    ap.add_argument("--k_ar", type=int, default=10, help="clusters for Arabic titles")   # number of Arabic clusters
    ap.add_argument("--k_en", type=int, default=6, help="clusters for English titles")    # number of English clusters
    args = ap.parse_args()
    os.makedirs(args.outdir, exist_ok=True)   # create the results folder if it does not exist

    # Step 3: load and clean the data.
    df = load_and_clean(args.input)

    # Steps 5 and 4: cluster each language on its own.
    # (Clustered together, the groups would split by language instead of by topic.)
    parts, zs, ksel = [], {}, {}
    for lang, k in [("ar", args.k_ar), ("en", args.k_en)]:
        sub = df[df["lang"] == lang]                              # only the books of this language
        sub, Z, _ = cluster_language(sub, k, lang.upper())        # cluster and name the groups
        parts.append(sub)
        zs[lang] = Z                                              # keep the vectors for the book map
        ksel[lang] = pick_k(Z, range(4, 16))                      # Silhouette for k = 4 to 15
    out = pd.concat(parts).sort_index()                           # merge both languages, original row order

    # Data for the book map: stack the Arabic and English vectors (the order must match out_for_map).
    # Note: dot positions are only comparable inside the same language.
    Z_all = np.vstack([zs["ar"], zs["en"]])
    out_for_map = pd.concat(parts)  # same order as Z_all

    # Steps 8, 6, 7: analysis and evaluation.
    summary = summarize(out)               # weak-topic table
    evaluation = evaluate_vs_dewey(out)    # agreement with Dewey
    reference = supervised_reference(out)  # supervised accuracy reference

    # Save the Excel file (one table per sheet).
    with pd.ExcelWriter(os.path.join(args.outdir, "clustering_results.xlsx")) as xw:
        summary.to_excel(xw, sheet_name="cluster_summary", index=False)
        cols = ["BOOK_CODE", "TITLE", "SUBJECTS", "CALL_NUM", "year", "copies", "lang", "cluster", "cluster_label"]
        out[cols].sort_values(["cluster", "TITLE"]).to_excel(xw, sheet_name="books_with_clusters", index=False)
        pd.concat(ksel, names=["lang"]).reset_index(level=0).to_excel(xw, sheet_name="k_selection", index=False)
        evaluation.to_excel(xw, sheet_name="evaluation_vs_dewey", index=False)
        reference.to_excel(xw, sheet_name="supervised_reference", index=False)

    # Step 9: charts.
    charts(out_for_map, Z_all, ksel, args.outdir)

    # Print the 8 weakest topics on screen.
    print("\nWeakest topics:")
    print(summary.head(8)[["cluster", "cluster_label", "books", "avg_copies", "pct_old", "weakness_score"]].to_string(index=False))
    print(f"\nSaved to {args.outdir}/")


# Run main() only when the file is executed directly (not when it is imported).
if __name__ == "__main__":
    main()
