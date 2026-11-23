"""Explicit evidence assessment + post-generation verification.

Principles (enforced in code, not in the prompt):

* A retrieval score / semantic similarity is NEVER proof. Support is decided
  by lexical coverage of the question's DISTINCTIVE terms in the record's own
  fields. Similarity-only matches are 'uncertain'.

* A metadata-only catalogue cannot support findings/method/statistics/summary
  claims -> always abstain.

* LLM output is verified: citations, numbers, people, titles and content-claims
  must be traceable to the retrieved records, otherwise the generated text
  is withheld.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from src.config.settings import Settings
from src.data.normalize_ar import normalize_text, search_terms
from src.data.schema import Record
from src.retrieval.engine import Cand, SearchEngine

_AR_INDIC = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")


# ------------------------------------------------------------------
# Support assessment

@dataclass
class Support:
    rid: str
    level: str
    coverage: float
    matched_terms: list[str]
    semantic: float | None
    reason: str


# Generic title words: they name a KIND of study rather than its subject.
# They count toward coverage, but cannot be the ONLY support for a question
# that also names a subject term.
GENERIC_TERMS = frozenset(
    search_terms("service services quality impact effect role analysis study")
    + search_terms("خدمات جودة اثر تأثير دور تحليل دراسة")
)

# A rounded two-thirds threshold: 2/3 is allowed to meet 0.67 with the
# additional guard that every subject term must match.
COVERAGE_TOLERANCE = 0.005


def distinctive_terms(
    engine: SearchEngine,
    terms: list[str],
    cap: float,
) -> list[str]:
    n = max(len(engine.bm25), 1)
    uniq = list(dict.fromkeys(terms))
    distinctive = [
        term
        for term in uniq
        if len(engine.bm25.postings.get(term, ())) / n < cap
    ]
    return distinctive or uniq


def assess_candidates(
    engine: SearchEngine,
    terms: list[str],
    cands: list[Cand],
    s: Settings,
) -> list[Support]:
    """Classify each retrieved candidate as explicit / uncertain support."""
    basis = (
        distinctive_terms(engine, terms, s.evidence_common_term_df)
        if terms
        else []
    )
    subject_terms = [term for term in basis if term not in GENERIC_TERMS]
    out: list[Support] = []

    for candidate in cands:
        doc_terms = set(engine.bm25.doc_terms.get(candidate.rid, ()))
        matched = [term for term in basis if term in doc_terms]
        coverage = len(matched) / len(basis) if basis else 0.0
        semantic = candidate.scores.get("semantic")

        at_threshold = coverage >= s.evidence_min_coverage
        in_band = (
            not at_threshold
            and coverage + COVERAGE_TOLERANCE >= s.evidence_min_coverage
        )
        generic_only = bool(subject_terms) and not any(
            term in doc_terms for term in subject_terms
        )
        band_ok = all(term in doc_terms for term in subject_terms)

        if basis and (
            at_threshold or (in_band and band_ok)
        ) and not generic_only:
            out.append(
                Support(
                    candidate.rid,
                    "explicit",
                    coverage,
                    matched,
                    semantic,
                    (
                        f"{len(matched)}/{len(basis)} distinctive question "
                        "terms occur in the record's title/subject"
                    ),
                )
            )
        elif matched or (
            semantic is not None
            and semantic >= s.rag_min_semantic_score
        ):
            semantic_only_allowed = (
                s.evidence_allow_semantic_only
                and semantic is not None
                and semantic >= s.rag_min_semantic_score
            )
            out.append(
                Support(
                    candidate.rid,
                    "uncertain",
                    coverage,
                    matched,
                    semantic,
                    (
                        "similarity only (allowed as uncertain)"
                        if semantic_only_allowed
                        else "partial lexical overlap or similarity only - not proof"
                    ),
                )
            )

    out.sort(
        key=lambda item: (
            item.level != "explicit",
            -item.coverage,
            -(item.semantic or 0),
            item.rid,
        )
    )
    return out


# ------------------------------------------------------------------
# Conflicts between records

def find_conflicts(
    engine: SearchEngine,
    rids: list[str],
) -> list[dict]:
    """Find duplicate normalized titles with conflicting metadata."""
    by_title: dict[str, list[str]] = {}

    for rid in rids:
        by_title.setdefault(engine.records[rid].title_norm, []).append(rid)

    out = []

    for group in by_title.values():
        if len(group) < 2:
            continue

        for attr, getter in (
            ("year", lambda record: record.year),
            (
                "supervisors",
                lambda record: tuple(
                    sorted(supervisor.key for supervisor in record.supervisors)
                ),
            ),
            ("subjects", lambda record: tuple(sorted(record.subjects))),
        ):
            values = {
                rid: getter(engine.records[rid])
                for rid in group
            }

            if len(set(values.values())) > 1:
                out.append(
                    {
                        "title": engine.records[group[0]].title,
                        "attribute": attr,
                        "values": {
                            rid: (
                                list(value)
                                if isinstance(value, tuple)
                                else value
                            )
                            for rid, value in values.items()
                        },
                    }
                )

    return out


# ------------------------------------------------------------------
# Verification of generated text

_NEG = [
    normalize_text(value)
    for value in [
        "does not contain",
        "do not contain",
        "not available",
        "not part of",
        "cannot",
        "can not",
        "no information",
        "not enough",
        "insufficient",
        "not recorded",
        "is not provided",
        "unavailable",
        "no record",
        "i will not",
        "not include",
        "لا تحتوي",
        "لا يحتوي",
        "غير متاح",
        "غير متوفر",
        "غير متوفره",
        "لا تتوفر",
        "لا يتوفر",
        "لا يمكن",
        "لا توجد",
        "لا يوجد",
        "غير مسجل",
        "لا تتضمن",
    ]
]

_CONTENT_CLAIM = [
    normalize_text(value)
    for value in [
        "concluded",
        "found that",
        "results show",
        "results indicate",
        "results suggest",
        "showed that",
        "shows that",
        "demonstrates",
        "demonstrated",
        "revealed",
        "recommends",
        "recommended",
        "the study finds",
        "the research finds",
        "methodology",
        "using a sample",
        "sample of",
        "questionnaire",
        "regression",
        "significant",
        "statistically",
        "improves",
        "increases",
        "reduces",
        "leads to",
        "توصل",
        "خلص",
        "اظهرت",
        "اثبتت",
        "كشفت",
        "اوصت",
        "نتايج",
        "وجد ان",
        "استنتج",
        "ثبت ان",
        "عينه",
        "منهج",
        "استبيان",
        "دلاله احصايي",
    ]
]

_SENT_SPLIT = re.compile(r"(?<=[.!?؟\n])\s+")

_CITE = re.compile(
    r"\[\s*R\s*\d+(?:\s*[,،;]\s*R?\s*\d+)*\s*\]",
    re.IGNORECASE,
)

_QUOTED = re.compile(
    r'"([^"]{3,})"|“([^”]{3,})”|«([^»]{3,})»'
)

# These are deliberately narrow, neutral catalogue introductions.
# They do not permit findings, conclusions, methods, statistics, or results.
_CATALOG_INTRO_PHRASES = tuple(
    normalize_text(value)
    for value in (
        "according to the available information",
        "based on the available records",
        "here are the available projects",
        "فيما يلي المشروعات المتاحة",
        "هذه هي المشروعات المتاحة",
        "هنا المشروعات المتاحة",
        "وفقًا للمعلومات المتوفرة في قاعدة البيانات",
        "وفقا للمعلومات المتوفرة في قاعدة البيانات",
    )
)


@dataclass
class Verification:
    ok: bool
    problems: list[str] = field(default_factory=list)
    clean_text: str = ""
    cited: set[int] = field(default_factory=set)
    warnings: list[str] = field(default_factory=list)


def _norm_digits(text: str) -> str:
    return text.translate(_AR_INDIC)


def _is_neutral_catalog_intro(sentence: str) -> bool:
    """Allow only a short, explicitly recognized catalogue introduction."""
    normalized = normalize_text(_CITE.sub(" ", sentence))
    words = normalized.split()

    return (
        0 < len(words) <= 18
        and any(
            phrase in normalized
            for phrase in _CATALOG_INTRO_PHRASES
        )
    )


def verify_answer(
    text: str,
    *,
    question: str,
    context: list[tuple[str, Record, list[str]]],
    facts: list[str],
    engine: SearchEngine,
) -> Verification:
    """Verify generated text against the exact retrieved context."""
    from src.rag.answer import validate_citations

    n_refs = len(context)
    clean, cited, warns = validate_citations(text, n_refs)
    problems: list[str] = []

    if not cited:
        problems.append("no_valid_citation")

    # Numbers must be traceable to metadata, supplied facts, or the question.
    allowed: set[str] = {str(n_refs)}

    for _ref, record, _supervisors in context:
        for value in (
            record.record_id,
            record.year,
            record.call_number,
            record.pages,
            record.extent_raw,
            record.dimension_raw,
            record.title,
            *record.subjects,
        ):
            if value is not None:
                allowed.update(
                    re.findall(
                        r"\d+(?:\.\d+)?",
                        _norm_digits(str(value)),
                    )
                )

    for fact in facts:
        allowed.update(
            re.findall(r"\d+", _norm_digits(fact))
        )

    allowed.update(
        re.findall(r"\d+", _norm_digits(question))
    )

    body = _CITE.sub(" ", _norm_digits(clean))

    for number in re.findall(r"\d+(?:\.\d+)?", body):
        if number not in allowed:
            problems.append(f"unsupported_number:{number}")

    # A named supervisor must belong to a context record or the question.
    context_supervisor_keys = {
        supervisor.key
        for _ref, record, _supervisors in context
        for supervisor in record.supervisors
    }

    normalized_text = f" {normalize_text(clean)} "
    normalized_question = f" {normalize_text(question)} "

    for key in engine.by_sup:
        if (
            f" {key} " in normalized_text
            and key not in context_supervisor_keys
            and f" {key} " not in normalized_question
        ):
            problems.append(f"unsupported_person:{key}")

    # Quoted titles must match titles in the retrieved context.
    context_titles = [
        normalize_text(record.title)
        for _ref, record, _supervisors in context
    ]

    for match in _QUOTED.finditer(clean):
        quoted_text = normalize_text(
            next(group for group in match.groups() if group)
        )

        if quoted_text and not any(
            quoted_text in title or title in quoted_text
            for title in context_titles
        ):
            problems.append("unsupported_title")

    # Sentence-level checks.
    for sentence in (
        part
        for part in _SENT_SPLIT.split(clean)
        if part.strip()
    ):
        normalized_sentence = (
            f" {normalize_text(_CITE.sub(' ', sentence))} "
        )

        negated = any(
            f" {negative} " in normalized_sentence
            or negative in normalized_sentence
            for negative in _NEG
        )

        if not negated:
            if any(
                claim in normalized_sentence
                for claim in _CONTENT_CLAIM
            ):
                problems.append("content_claim_not_in_metadata")

            words = normalized_sentence.split()
            has_citation = bool(_CITE.search(sentence))
            neutral_intro = _is_neutral_catalog_intro(sentence)

            if (
                not has_citation
                and len(words) > 4
                and not neutral_intro
            ):
                problems.append("uncited_claim")

    problems = list(dict.fromkeys(problems))

    return Verification(
        ok=not problems,
        problems=problems,
        clean_text=clean,
        cited=cited,
        warnings=warns,
    )