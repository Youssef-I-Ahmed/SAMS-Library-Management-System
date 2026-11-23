"""Data-quality analysis. Every number is computed from the file; nothing is assumed."""
from __future__ import annotations

from collections import Counter, defaultdict

import numpy as np
from rapidfuzz import fuzz, process

from src.data.schema import SOURCE_COLUMNS, Record, is_missing, split_multi, split_supervisors
from src.data.supervisors import similar_name_candidates, supervisor_counts


def duplicate_groups(records: list[Record]) -> dict:
    """Possible duplicates. Nothing is removed; groups are classified for human review.

    Criteria
      * exact-normalised: identical ``title_norm`` (Arabic-normalised, case/punctuation/diacritics folded).
          - likely_duplicate_entry : same normalised title AND same year AND same supervisor-key set
                                      AND same student list
          - repeated_title         : same normalised title but any of year / supervisors / students differ
      * near-title: different ``title_norm`` but rapidfuzz ``fuzz.ratio`` >= 95 (character level)
    """
    by_title: dict[str, list[Record]] = defaultdict(list)
    for r in records:
        by_title[r.title_norm].append(r)
    exact_groups = {t: g for t, g in by_title.items() if len(g) > 1}
    likely, repeated = [], []
    for t, g in exact_groups.items():
        sig = {(r.year, tuple(sorted(s.key for s in r.supervisors)), tuple(sorted(x.lower() for x in r.students))) for r in g}
        (likely if len(sig) == 1 else repeated).append([r.record_id for r in g])
    # near duplicates (blocked by nothing; 4k x 4k char-level ratio is cheap in rapidfuzz)
    titles = sorted(by_title)
    near = []
    if len(titles) > 1:
        m = process.cdist(titles, titles, scorer=fuzz.ratio, dtype=np.uint8, score_cutoff=95, workers=1)
        idx = np.argwhere(np.triu(m >= 95, k=1))
        for i, j in idx:
            near.append((titles[i], titles[j], int(m[i][j])))
    return {
        "exact_groups": len(exact_groups),
        "exact_rows_involved": sum(len(g) for g in exact_groups.values()),
        "likely_duplicate_entry_groups": len(likely),
        "repeated_title_groups": len(repeated),
        "near_title_pairs": len(near),
        "likely_duplicate_entry_ids": likely,
        "repeated_title_ids": repeated,
        "near_pairs_sample": [(a, b, s) for a, b, s in near[:25]],
    }


def quality_report(header: list[str], rows: list[dict], records: list[Record], rejected: list[dict], sheet: str) -> dict:
    n = len(rows)
    col = {}
    for h in header:
        vals = [r.get(h, "") for r in rows]
        miss = sum(1 for v in vals if is_missing(v))
        col[h] = {
            "mapped_to": SOURCE_COLUMNS.get(h),
            "missing_or_NA": miss,
            "missing_pct": round(100 * miss / n, 2) if n else 0,
            "unique_values": len(set(vals)),
        }
    flags = Counter(f for r in records for f in r.flags)
    years = Counter(r.year_raw for r in records if r.year_raw is not None)
    bad_year = sorted(r.year_raw for r in records if "year_suspect" in r.flags)
    sup_c = supervisor_counts(records)
    raw_sup_tokens = {s.raw for r in records for s in r.supervisors}
    multi_sup = sum(1 for r in records if len(r.supervisors) > 1)
    multi_sup_raw = sum(1 for r in rows if len(split_supervisors(r.get("Supervisor"))) > 1)
    embedded_title_split = sum(1 for r in rows if len(split_supervisors(r.get("Supervisor"))) > len(split_multi(r.get("Supervisor"))))
    subj = Counter(s for r in records for s in r.subjects)
    multi_subject = [r.record_id for r in records if len(r.subjects) > 1]
    dims = Counter(r.dimension_raw for r in records if r.dimension_raw)
    extent_unparsed = sum(1 for r in records if r.extent_raw and r.pages is None)
    lang = Counter(r.language for r in records)
    dup = duplicate_groups(records)
    candidates = similar_name_candidates(list(sup_c), 88.0)
    return {
        "source": {"sheet": sheet, "rows": n, "columns": header,
                   "records_loaded": len(records), "rejected": len(rejected)},
        "columns": col,
        "ids": {"unique": len({r.record_id for r in records}), "non_numeric": flags["record_id_non_numeric"]},
        "years": {"valid": sum(1 for r in records if r.year is not None), "missing": flags["year_missing"],
                  "suspect_values": bad_year, "min_valid": min((r.year for r in records if r.year), default=None),
                  "max_valid": max((r.year for r in records if r.year), default=None),
                  "per_year": dict(sorted(years.items()))},
        "titles": {"leading_trailing_or_multiple_spaces": flags["title_whitespace_fixed"],
                   "with_diacritics_or_tatweel": flags["title_has_diacritics_or_tatweel"],
                   "exact_duplicate_title_rows(raw string equality)": n - len({r.raw.get("TITLE") for r in records}),
                   "languages": dict(lang)},
        "supervisors": {
            "rows_without_supervisor": flags["supervisor_missing"],
            "rows_with_multiple_supervisors": multi_sup_raw,
            "rows_where_names_were_joined_by_academic_title_instead_of_pipe": embedded_title_split,
            "distinct_raw_name_strings(after split)": len(raw_sup_tokens),
            "distinct_canonical_people_keys": len(sup_c),
            "rows_where_same_person_listed_twice(after title/spelling normalisation)": flags["supervisor_repeated_in_record"],
            "similar_but_distinct_name_pairs_for_review(token_sort>=88)": len(candidates),
            "top10": sup_c.most_common(10),
        },
        "subjects": {"distribution": dict(subj.most_common()), "rows_without_subject": flags["subject_missing"],
                     "rows_with_multiple_subjects": len(multi_subject), "multi_subject_ids": multi_subject},
        "students": {"rows_without_students": flags["students_missing"]},
        "extent": {"missing": sum(1 for r in records if not r.extent_raw), "unparsed": extent_unparsed},
        "dimension": {"missing": sum(1 for r in records if not r.dimension_raw),
                      "distinct_spellings": len(dims)},
        "duplicates": dup,
        "flag_counts": dict(flags),
        "similar_names": candidates,
    }
