"""Grounded answer pipeline with an explicit evidence-validation and abstention policy.

Order of decisions (all in code):

1. Analyse the question (entities, requested info categories, quoted title).
2. RECORD questions (a specific title): evidence must belong to that exact record.
3. Requests for unavailable research content -> abstain in the user's language.
4. ENTITY questions (supervisor/subject/year): deterministic catalogue answers.
5. TOPIC questions: require explicit lexical evidence before using the LLM.
"""

from __future__ import annotations

import logging
import re

from collections import Counter
from typing import Literal

from pydantic import BaseModel
from rapidfuzz import fuzz, process

from src.config.settings import Settings
from src.data.normalize_ar import normalize_text, search_terms, stem_token
from src.rag import messages as M
from src.rag.analyze import (
    ATTRIBUTE_PATTERNS,
    COUNT_WORDS,
    LIST_WORDS,
    PROFILE_WORDS,
    UNAVAILABLE_PATTERNS,
    QuestionAnalysis,
    analyze_question,
)
from src.rag.context import build_user_message, record_block, system_prompt
from src.rag.evidence import (
    assess_candidates,
    find_conflicts,
    verify_answer,
)
from src.rag.structured import (
    group_by_request,
    mentions_project_noun,
    parse_project_ids,
    parse_years,
    requested_attributes,
)
from src.rag.llm import LLMError, LLMProvider, llm_hint
from src.retrieval.engine import SearchEngine, _id_sort_key

log = logging.getLogger("rag.answer")

Status = Literal[
    "ok",
    "answered_from_catalog",
    "abstained",
    "llm_unavailable",
    "llm_error",
    "answer_withheld",
    "error",              # a TECHNICAL failure - never to be read as "the information does not exist"
]

AbstainReason = Literal[
    "no_results",
    "insufficient_evidence",
    "content_not_available",
    "record_not_found",
    "empty_question",
]

# Generic words that describe the request rather than its actual topic.
# Added Arabic variants: مشروعات، المشروعات، متاحة، متاحه، متاح.
_GENERIC = {
    normalize_text(w)
    for w in [
        "مشاريع",
        "مشروع",
        "مشروعا",
        "بحثا",
        "مشروعات",
        "المشروعات",
        "متاحة",
        "متاحه",
        "متاح",
        "ابحاث",
        "بحوث",
        "بحث",
        "رساله",
        "رسائل",
        "اشرف",
        "اشراف",
        "تحت",
        "دكتور",
        "دكتوره",
        "قدم",
        "قدمت",
        "دراسه",
        "project",
        "projects",
        "research",
        "researches",
        "supervised",
        "supervisor",
        "supervise",
        "titles",
        "title",
        "study",
        "studies",
        "papers",
        "paper",
        "work",
        "works",
        "thesis",
        "theses",
        "catalogue",
        "catalog",
        "library",
        "found",
        "exist",
        "available",
        "tell",
        "about",
        "topic",
        "records",
        "record",
        "تتناول",
        "يتناول",
        "تناول",
        "متعلقه",
        "المتعلقه",
        "تتعلق",
        "يتعلق",
        "بخصوص",
        "هناك",
        "توجد",
        "يوجد",
        "موجود",
        "مواضيع",
        "موضوع",
        "تتحدث",
        "يتحدث",
        "تخص",
        "يخص",
        "related",
        "regarding",
        "concerning",
        "discuss",
        "discussing",
        "deal",
        "dealing",
        "covering",
        "cover",
        "covers",
        "any",
        "some",
        "which",
        "what",
        "are",
        "there",
        "have",
        "has",
    ]
}

_STOP_EXTRA = {
    normalize_text(w)
    for w in [
        "ما",
        "هي",
        "هو",
        "ماذا",
        "عن",
        "حول",
        "بشان",
        "tell",
        "me",
        "which",
        "any",
        "are",
        "there",
    ]
}

_INTENT_WORDS = {
    t
    for w in (COUNT_WORDS | LIST_WORDS | PROFILE_WORDS)
    for t in normalize_text(w).split()
} | {
    t
    for ws in UNAVAILABLE_PATTERNS.values()
    for w in ws
    for t in normalize_text(w).split()
}

_DROP_STEMS = {
    stem_token(t)
    for t in (_GENERIC | _INTENT_WORDS | _STOP_EXTRA)
}

# Words that only describe WHERE the records live ("registered in the database / academy / library"); they are not topics.
_COUNT_FILLER = {
    stem_token(normalize_text(w))
    for w in [
        "الاكاديمية", "اكاديمية", "الأكاديمية", "المكتبة", "مكتبة", "قاعدة", "البيانات", "بيانات", "الفهرس", "فهرس",
        "المسجلة", "مسجلة", "مسجل", "الموجودة", "موجودة", "موجود", "الحالية", "حالية", "الان", "لدينا", "عندنا", "لديكم",
        "اجمالي", "إجمالي", "الاجمالي", "كلي", "الكلي", "مجموع", "المجموع", "جميع", "كل", "المنشورة", "منشورة", "المنشور",
        "سنة", "سنه", "عام", "خلال", "بين", "الى", "إلى", "حتى", "من", "بعد", "قبل", "منذ", "و", "او", "أو", "لكل", "حسب",
        "total", "overall", "currently", "database", "dataset", "library", "academy", "registered", "recorded", "stored",
        "published", "year", "years", "during", "between", "from", "until", "since", "after", "before", "per", "each",
        "number", "count", "many", "much", "in", "the", "of", "is", "do", "we", "have", "does", "exist", "there",
        "were", "was", "are", "be", "been", "did", "has", "had", "how", "what", "which", "who", "when", "where", "tell",
        "give", "show", "me", "us", "you", "please", "can", "could", "would", "should", "will", "entered", "added",
        "listed", "available", "so", "far", "ever", "all", "a", "an", "at", "on", "for", "to", "and", "or", "by", "with",
        "فى", "في", "على", "عن", "هل", "كم", "كام", "ما", "ماذا", "هو", "هي", "يوجد", "توجد", "هناك", "تم", "تمت", "المسجلين",
        "اعطني", "اخبرني", "ارجو", "لو", "سمحت", "فقط", "بالضبط", "تقريبا", "الاجمالي", "اجمالى", "الان", "حاليا", "ضمن",
        "عليه", "عليها", "عليهم", "له", "لها", "لهم", "به", "بها", "فيه", "فيها", "منه", "منها", "عنه", "عنها", "اليه", "لديه",
        "لديها", "عنده", "معه", "قام", "قامت", "يقوم", "كان", "كانت", "يكون", "الذي", "التي", "الذين", "اللذين", "اللاتي",
        "هذا", "هذه", "ذلك", "تلك", "هؤلاء", "بواسطة", "عبر", "يشرف", "تشرف", "اشرفت", "اشرفوا", "يشرفون", "اشراف", "تحت",
        "اشرف", "قدم", "قدمت", "اعد", "اعدت", "ناقش", "ناقشت", "نشر", "نشرت", "نشرها", "نشره", "دكتور", "دكتوره", "الدكتور",
        "الدكتورة", "د", "استاذ", "الاستاذ", "الاستاذه", "الاستاذة", "اجرى", "اجرت", "قبل", "supervise", "supervised", "supervises",
        "supervising", "under", "did", "done", "written", "wrote", "write", "published", "publish", "made", "by", "dr", "prof",
        "professor", "doctor", "mr", "mrs", "list", "projects", "project", "records", "record",
        "عمل", "اعمال", "اعمل", "مجال", "مجالات", "نشاط", "اهتمامات", "اهتمام", "يعمل", "تعمل", "اشتغل", "ابحاث", "بحوث",
        "work", "works", "areas", "area", "fields", "field", "topics", "interests", "specialty", "specialties",
        # status/completion verbs that describe the records, not a topic ("how many projects were COMPLETED in 2023")
        "completed", "complete", "finished", "finish", "submitted", "submit", "produced", "conducted", "carried", "out",
        "approved", "accepted", "defended", "discussed", "delivered", "archived", "catalogued", "cataloged", "logged",
        "انجزت", "أنجزت", "انجز", "أنجز", "منجزة", "منجز", "اكتملت", "اكتمل", "مكتملة", "مكتمل", "اجريت", "أجريت",
        "سجلت", "سجل", "نوقشت", "نوقش", "اعتمدت", "اعتمد", "ارشفت", "فهرست",
    ]
}
_DROP_STEMS_COUNT = _DROP_STEMS | _COUNT_FILLER
_ATTRIBUTE_STEMS = {
    stem_token(t)
    for ws in ATTRIBUTE_PATTERNS.values()
    for w in ws
    for t in normalize_text(w).split()
}


_SUP_CUE = re.compile(
    r"(?:اشرف\s+عليه|اشرفت\s+عليه|تحت\s+اشراف|باشراف|المشرف|supervised\s+by|under\s+the\s+supervision\s+of|supervisor)"
    r"\s+(?:(?:الدكتوره?|دكتوره?|د|الاستاذ|استاذ|dr|prof|professor)\s+)*"
    r"((?:[^\W\d_]+)(?:\s+[^\W\d_]+){1,2})",
    re.IGNORECASE,
)
_TITLE_TOKENS = {"الدكتور", "الدكتوره", "دكتور", "دكتوره", "د", "الاستاذ", "استاذ", "dr", "prof", "professor"}


def _premise_mismatches(question: str, rec, lang: str, ys) -> list[str]:
    """Deterministic check of details the QUESTION asserts about an existing record (supervisor, year) against the stored
    record. A mismatch is reported explicitly; it is never silently ignored and never 'corrected' by guessing."""
    out: list[str] = []
    try:
        if getattr(ys, "years", None) and rec.year is not None and rec.year not in ys.years:
            out.append(M.premise_mismatch(lang, "year", ", ".join(map(str, ys.years)), str(rec.year)))
        m = _SUP_CUE.search(normalize_text(question))
        if m:
            claimed = [t for t in m.group(1).split() if t not in _TITLE_TOKENS]
            sup_names = [str(getattr(s_, "name", s_)) for s_ in (rec.supervisors or [])]   # Supervisor objects or plain strings
            sup_tokens = {t for n_ in sup_names for t in normalize_text(n_).split()}
            if len(claimed) >= 2 and not (set(claimed) & sup_tokens):
                out.append(M.premise_mismatch(lang, "supervisor", " ".join(claimed), " | ".join(sup_names)))
    except Exception:  # a heuristic check must never break an otherwise correct exact-ID answer
        return out
    return out



class Source(BaseModel):
    ref: str
    record_id: str
    title: str
    year: int | None = None
    supervisors: list[str] = []
    subjects: list[str] = []
    call_number: str | None = None
    match_type: str | None = None
    support: Literal["explicit", "uncertain", "listed"] = "listed"
    support_reason: str | None = None
    cited: bool = False


class LLMInfo(BaseModel):
    provider: str | None = None
    model: str | None = None
    latency_ms: int | None = None
    error_kind: str | None = None
    error: str | None = None


class EvidenceReport(BaseModel):
    explicit_in_records: list[str] = []
    uncertain: list[str] = []
    unavailable_from_dataset: list[str] = []
    verification_problems: list[str] = []


class AskResponse(BaseModel):
    question: str
    language: str
    status: Status
    abstain_reason: AbstainReason | None = None
    answer: str | None
    generated_by: Literal["llm", "catalog", "policy", "none"]
    sources: list[Source]
    retrieved: list[Source]
    facts: list[str]
    strategy: list[str]
    limitations: list[str]
    warnings: list[str]
    evidence: EvidenceReport
    conflicts: list[dict] = []
    citations_valid: bool | None = None
    total_matching: int | None = None
    complete_list: dict | None = None
    llm: LLMInfo | None = None
    error_kind: str | None = None             # exception class name when status == "error" (never the message / question)
    resolved_id: str | None = None            # exact-ID questions: the project number that was looked up


_CITE_GROUP = re.compile(
    r"\[\s*(R\s*\d+(?:\s*[,،;]\s*R?\s*\d+)*)\s*\]",
    re.IGNORECASE,
)


def validate_citations(
    text: str, n_refs: int
) -> tuple[str, set[int], list[str]]:
    """Remove citation markers that refer to records outside the context."""

    cited: set[int] = set()
    bad: set[int] = set()

    def repl(m: re.Match) -> str:
        nums = [int(x) for x in re.findall(r"\d+", m.group(1))]
        good = [n for n in nums if 1 <= n <= n_refs]
        bad.update(n for n in nums if not 1 <= n <= n_refs)
        cited.update(good)

        return (
            "[" + ", ".join(f"R{n}" for n in good) + "]"
            if good
            else ""
        )

    clean = _CITE_GROUP.sub(repl, text)

    warns = (
        [
            f"removed {len(bad)} invalid citation marker(s) "
            "referring to records that were not retrieved"
        ]
        if bad
        else []
    )

    return re.sub(r"[ \t]{2,}", " ", clean).strip(), cited, warns


class AnswerService:
    def __init__(
        self,
        engine: SearchEngine,
        provider: LLMProvider | None,
        settings: Settings,
    ):
        self.engine, self.provider, self.s = engine, provider, settings

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _topical_terms(self, a: QuestionAnalysis) -> list[str]:
        terms = search_terms(a.residual_query or a.question)
        return [t for t in terms if t not in _DROP_STEMS]

    def _leftover_terms(self, a: QuestionAnalysis, terms: list[str]) -> list[str]:
        """Topical terms NOT explained by a recognised entity (subject name, attribute words, filler)."""

        consumed = set(_DROP_STEMS_COUNT) | _ATTRIBUTE_STEMS

        for name in a.subjects:
            consumed |= {stem_token(t) for t in normalize_text(name).split()}

        return [t for t in terms if t not in consumed]

    def _src(
        self,
        n: int,
        rid: str,
        support: str,
        reason: str | None = None,
        mt: str | None = None,
    ) -> Source:
        e = self.engine
        r = e.records[rid]

        return Source(
            ref=f"R{n}",
            record_id=rid,
            title=r.title,
            year=r.year,
            supervisors=[e.sup_display(s.key) for s in r.supervisors],
            subjects=r.subjects,
            call_number=r.call_number,
            match_type=mt,
            support=support,
            support_reason=reason,
        )

    def _sources(
        self,
        rids: list[str],
        support: str = "listed",
        reasons: dict | None = None,
        mts: dict | None = None,
        start: int = 1,
    ) -> list[Source]:
        return [
            self._src(
                start + i,
                rid,
                support,
                (reasons or {}).get(rid),
                (mts or {}).get(rid),
            )
            for i, rid in enumerate(rids)
        ]

    def _structured_ids(
        self,
        a: QuestionAnalysis,
        use_subjects: bool = True,
    ):
        e = self.engine
        sets: list[set[str]] = []
        bits: list[tuple[str, str]] = []

        for b in a.supervisors:
            sets.append(set(e.by_sup.get(b.key, ())))
            bits.append(("supervisor", b.name))

        if a.subjects and use_subjects:
            sets.append(
                set(e.by_subject.get(normalize_text(a.subjects[0]), ()))
            )
            bits.append(("subject", a.subjects[0]))

        if a.year is not None:
            sets.append(set(e.by_year.get(a.year, ())))
            bits.append(("year", str(a.year)))

        if a.year_from is not None:
            ids: set[str] = set()

            for y, record_ids in e.by_year.items():
                if a.year_from <= y <= a.year_to:
                    ids |= record_ids

            sets.append(ids)
            bits.append(("years", f"{a.year_from}-{a.year_to}"))

        if not sets:
            return None, []

        ids = set.intersection(*sets)

        return sorted(
            ids,
            key=lambda i: (
                -(e.records[i].year or 0),
                _id_sort_key(i),
            ),
        ), bits

    # ------------------------------------------------------------------
    # Record resolution
    # ------------------------------------------------------------------

    def _resolve_record(
        self,
        a: QuestionAnalysis,
    ) -> tuple[list[str], list[str]]:
        """Resolve an exact record ID or normalized title, then suggest similar titles."""

        e = self.engine
        exact: list[str] = []

        id_match = re.search(
            r"\b(?:project|record|thesis|research)\s*"
            r"(?:(?:id|number|no\.?)\s*)?"
            r"[:#\-]?\s*(\d+)\b",
            a.question,
            flags=re.IGNORECASE,
        )

        if id_match:
            rid = id_match.group(1)

            if rid in e.records:
                return [rid], []

        for q in a.quoted:
            exact = sorted(
                e.by_title.get(normalize_text(q), ()),
                key=_id_sort_key,
            )

            if exact:
                break

        if not exact and not a.quoted and (a.attributes or a.unavailable):
            padded = f" {a.qn} "
            best = ""

            for tn in e.by_title:
                if (
                    len(tn) >= 8
                    and f" {tn} " in padded
                    and len(tn) > len(best)
                ):
                    best = tn

            if best:
                exact = sorted(e.by_title[best], key=_id_sort_key)

        similar: list[str] = []

        if not exact and a.quoted:
            titles = list(e.by_title)

            for _, _, idx in process.extract(
                normalize_text(a.quoted[0]),
                titles,
                scorer=fuzz.token_set_ratio,
                score_cutoff=self.s.evidence_similar_title_ratio,
                limit=5,
            ):
                similar.extend(
                    sorted(e.by_title[titles[idx]], key=_id_sort_key)[:2]
                )

        return exact, similar[:5]

    def _record_text(
        self,
        rid: str,
        attrs: list[str],
        lang: str,
    ) -> str:
        e = self.engine
        r = e.records[rid]
        ar = lang == "ar"

        lab = {
            "supervisors": ("المشرفون", "supervisors"),
            "year": ("السنة", "year"),
            "subjects": ("التخصص", "subject"),
            "call_number": ("رقم التصنيف", "call number"),
            "extent": ("عدد الصفحات", "extent"),
            "dimension": ("المقاس", "dimensions"),
            "students": ("الطلاب", "students"),
        }

        missing = (
            "غير مسجّل في الفهرس"
            if ar
            else "not recorded in the catalogue"
        )

        vals = {
            "supervisors": (
                " | ".join(e.sup_display(s.key) for s in r.supervisors)
                or None
            ),
            "year": (
                None
                if r.year is None
                else str(r.year)
                if not r.year_raw or r.year_raw == str(r.year)
                else f"{r.year}"
            ),
            "subjects": " | ".join(r.subjects) or None,
            "call_number": r.call_number,
            "extent": r.extent_raw,
            "dimension": r.dimension_raw,
            "students": (
                (" | ".join(r.students) or None)
                if self.s.expose_students
                else None
            ),
        }

        if "year" in attrs and r.year is None and r.year_raw:
            vals["year"] = None
            missing_year = (
                f"القيمة المسجّلة ({r.year_raw}) غير صالحة كسنة"
                if ar
                else f"recorded value ({r.year_raw}) is not a valid year"
            )
        else:
            missing_year = missing

        show = attrs or [
            "supervisors",
            "year",
            "subjects",
            "call_number",
            "extent",
            "dimension",
        ]

        parts = []

        for k in show:
            if k == "students" and not self.s.expose_students:
                parts.append(
                    f"{lab[k][0 if ar else 1]}: "
                    + (
                        "غير معروض (سياسة الخصوصية)"
                        if ar
                        else "not shown (privacy setting)"
                    )
                )
                continue

            v = vals.get(k)

            parts.append(
                f"{lab[k][0 if ar else 1]}: "
                f"{v if v else (missing_year if k == 'year' else missing)}"
            )

        return "; ".join(parts)

    # ------------------------------------------------------------------
    # Main entry
    # ------------------------------------------------------------------

    def ask(self, question: str) -> AskResponse:
        self.engine.refresh()
        question = (question or "").strip()
        a = analyze_question(self.engine, question)
        lang = a.lang
        e = self.engine

        ev = EvidenceReport(unavailable_from_dataset=list(a.unavailable))

        st = dict(
            facts=[],
            strategy=[],
            warnings=[],
            limitations=[],
            retrieved=[],
            conflicts=[],
            total=None,
            complete=None,
        )

        if a.unavailable:
            st["limitations"].append(
                M.content_unavailable(lang, a.unavailable)
            )

        def done(
            status,
            answer,
            by,
            sources,
            retrieved=None,
            reason=None,
            valid=None,
            llm=None,
        ) -> AskResponse:
            evidence_records = (
                retrieved if retrieved is not None else sources
            )

            ev.explicit_in_records = [
                s.record_id
                for s in evidence_records
                if s.support in ("explicit", "listed")
            ]
            ev.uncertain = [
                s.record_id
                for s in (retrieved or [])
                if s.support == "uncertain"
            ]

            return AskResponse(
                question=question,
                language=lang,
                status=status,
                abstain_reason=reason,
                answer=answer,
                generated_by=by,
                sources=sources,
                retrieved=retrieved if retrieved is not None else sources,
                facts=st["facts"],
                strategy=st["strategy"],
                limitations=st["limitations"],
                warnings=st["warnings"],
                evidence=ev,
                conflicts=st["conflicts"],
                citations_valid=valid,
                # an abstention for lack of evidence must not carry a structured count that the answer does not claim
                total_matching=(
                    None
                    if status == "abstained" and reason in ("no_results", "insufficient_evidence")
                    else st["total"]
                ),
                complete_list=st["complete"],
                llm=llm,
            )

        if not question or not normalize_text(question):
            return done(
                "abstained",
                M.empty_question(lang),
                "policy",
                [],
                reason="empty_question",
            )

        # ---- 1b. EXACT project-ID lookup: deterministic, straight from the database, never similarity-based.
        wanted_ids = parse_project_ids(question)

        if wanted_ids:
            return self._id_answer(a, wanted_ids, st, ev, done)

        # ---- 1c. Deterministic structured aggregation (counts / breakdowns) computed by SQL.
        if not a.unavailable:
            structured = self._structured_route(a, st, done)

            if structured is not None:
                return structured

            topic_year = self._topic_year_route(a, st, done)      # "marketing projects in 2023": subject + year fields, SQL

            if topic_year is not None:
                return topic_year

        # ---- 2. Specific record
        exact_ids, similar_ids = self._resolve_record(a)

        if a.quoted or exact_ids:
            st["strategy"].append("exact_title_record_lookup")

            if not exact_ids:
                src = self._sources(
                    similar_ids,
                    "uncertain",
                    {
                        i: "similar title - NOT the same record"
                        for i in similar_ids
                    },
                )

                return done(
                    "abstained",
                    M.record_not_found(lang),
                    "policy",
                    [],
                    retrieved=src,
                    reason="record_not_found",
                )

            if a.unavailable and not a.attributes:
                src = self._sources(
                    exact_ids,
                    "listed",
                    {
                        i: "exact normalised title match"
                        for i in exact_ids
                    },
                )
                st["conflicts"] = find_conflicts(e, exact_ids)

                return done(
                    "abstained",
                    M.content_unavailable(lang, a.unavailable),
                    "policy",
                    [],
                    retrieved=src,
                    reason="content_not_available",
                )

            return self._record_answer(a, exact_ids, st, ev, done)

        # ---- 3/4. Entity questions
        terms = self._topical_terms(a)

        # A bare subject inside a topical question is not a hard filter.
        ids, bits = self._structured_ids(
            a,
            use_subjects=(a.intent != "topic"),
        )

        # Entity answers (supervisor / subject / year lists and counts) are exact catalogue lookups. They may be used ONLY
        # when every content word of the question was consumed by a recognised entity. Words that remain ("... marketing
        # AND dinosaurs") must never be silently dropped: the question then goes to the evidence-checked topical path.
        leftover = self._leftover_terms(a, terms)

        if ids is not None and not (leftover and not a.unavailable):
            return self._entity_answer(a, ids, bits, st, ev, done)

        # ---- 5. Topical question: requires explicit evidence
        st["strategy"].append("hybrid_rrf")
        q = " ".join(terms) if terms else a.question
        allowed = set(ids) if ids is not None else None

        if ids is not None:
            st["strategy"].insert(0, "structured_entities")
            st["facts"].append(
                "Catalogue records matching "
                f"({'; '.join(f'{k} = {v}' for k, v in bits)}): "
                f"{len(ids)} (exact count from the database)."
            )
            st["total"] = len(ids)

        cands = (
            e._ranked(q, allowed, True, True)
            if terms or ids is None
            else []
        )
        sup = assess_candidates(e, terms, cands, self.s)

        explicit = [x for x in sup if x.level == "explicit"]
        uncertain = [x for x in sup if x.level == "uncertain"]

        top_exp = explicit[: self.s.rag_top_k]
        top_unc = uncertain[:5]

        src_exp = self._sources(
            [x.rid for x in top_exp],
            "explicit",
            {x.rid: x.reason for x in top_exp},
        )

        src_unc = self._sources(
            [x.rid for x in top_unc],
            "uncertain",
            {x.rid: x.reason for x in top_unc},
            start=len(src_exp) + 1,
        )

        if a.unavailable:
            return done(
                "abstained",
                M.content_unavailable(lang, a.unavailable),
                "policy",
                [],
                retrieved=src_exp + src_unc,
                reason="content_not_available",
            )

        if (
            len(explicit) < self.s.evidence_min_supported_records
            or not terms
        ):
            reason = (
                "no_results"
                if not (src_exp or src_unc)
                else "insufficient_evidence"
            )
            msg = (
                M.no_results(lang)
                if reason == "no_results"
                else M.insufficient(lang)
            )

            return done(
                "abstained",
                msg,
                "policy",
                [],
                retrieved=src_exp + src_unc,
                reason=reason,
            )

        st["conflicts"] = find_conflicts(
            e,
            [x.rid for x in top_exp],
        )
        retrieved = src_exp + src_unc

        deterministic = M.topical_listing(
            lang,
            len(explicit),
            capped=len(cands) >= self.s.candidate_pool,
        )

        if len(explicit) > len(top_exp):
            st["facts"].append(
                f"{len(explicit)} records match; "
                f"the context contains the top {len(top_exp)}."
            )

        if self.provider is None:
            st["warnings"].append(
                llm_hint("not_configured")
                + " Showing the verified catalogue listing instead."
            )

            return done(
                "llm_unavailable",
                deterministic,
                "catalog",
                src_exp,
                retrieved=retrieved,
            )

        ctx = [
            (s.ref, e.records[s.record_id], s.supervisors)
            for s in src_exp
        ]

        blocks = [
            record_block(
                r,
                rec,
                sups,
                self.s.rag_include_students,
                self.s.rag_include_supervisors,
            )
            for r, rec, sups in ctx
        ]

        notes = [
            "All records above are explicitly matched on their title/subject text.",
            "Only report records and metadata supported by the catalogue.",
            "Write the answer in Arabic when the question is in Arabic.",
            "Start with a short introduction, then list the matching record titles.",
            "Every list item must include the exact title from its record and its citation [R#].",
            "Never output citation markers alone without the corresponding record title.",
            "Do not infer findings, methods, conclusions, or other information absent from the metadata.",
        ]

        if not self.s.rag_include_supervisors:
            notes.append(
                "Supervisor and student names are withheld for privacy. "
                "Do not reveal any person's name, but you MUST still list record titles "
                "and cite each title with its [R#] marker. Do not output citation markers alone."
            )

        if st["conflicts"]:
            notes.append(
                "CONFLICT: some records share a title but differ in "
                + ", ".join(
                    sorted(
                        {c["attribute"] for c in st["conflicts"]}
                    )
                )
                + ". You MUST state this disagreement and cite each record; "
                "do not choose one silently."
            )

        try:
            r = self.provider.generate(
                system_prompt(lang),
                build_user_message(question, st["facts"], blocks, notes),
            )
        except LLMError as err:
            st["warnings"].append(
                llm_hint(err.kind)
                + " Showing the verified catalogue listing instead."
            )

            return done(
                (
                    "llm_unavailable"
                    if err.kind == "not_configured"
                    else "llm_error"
                ),
                deterministic,
                "catalog",
                src_exp,
                retrieved=retrieved,
                llm=LLMInfo(
                    provider=getattr(self.provider, "name", None),
                    model=self.provider.model,
                    error_kind=err.kind,
                    error=str(err),
                ),
            )

        ver = verify_answer(
            r.text,
            question=question,
            context=ctx,
            facts=st["facts"],
            engine=e,
        )

        st["warnings"].extend(ver.warnings)
        ev.verification_problems = ver.problems

        info = LLMInfo(
            provider=r.provider,
            model=r.model,
            latency_ms=r.latency_ms,
        )

        if not ver.ok:
            st["warnings"].append(M.withheld(lang))

            return done(
                "answer_withheld",
                deterministic,
                "catalog",
                src_exp,
                retrieved=retrieved,
                valid=False,
                llm=info,
            )

        cited = [
            s.model_copy(update={"cited": True})
            for s in src_exp
            if int(s.ref[1:]) in ver.cited
        ]

        for s in retrieved:
            s.cited = (
                s.support == "explicit"
                and int(s.ref[1:]) in ver.cited
            )

        return done(
            "ok",
            ver.clean_text,
            "llm",
            cited,
            retrieved=retrieved,
            valid=True,
            llm=info,
        )

    # ------------------------------------------------------------------
    # Safe wrapper: a technical failure is reported as such (status="error")
    # ------------------------------------------------------------------

    def ask_safe(self, question: str) -> AskResponse:
        """Like ``ask`` but never raises. A technical failure becomes status="error" - it is NOT reported as
        "no matching information", because the data may well exist. Only the exception class is kept (no text)."""

        try:
            return self.ask(question)
        except Exception as exc:  # noqa: BLE001 - last line of defence for the UI; logged without the question text
            log.exception("ask failed (%s)", type(exc).__name__)
            lang = "ar" if re.search(r"[\u0600-\u06ff]", question or "") else "en"
            return AskResponse(
                question=question or "",
                language=lang,
                status="error",
                answer=M.technical_error(lang),
                generated_by="none",
                sources=[],
                retrieved=[],
                facts=[],
                strategy=["technical_error"],
                limitations=[],
                warnings=[],
                evidence=EvidenceReport(),
                error_kind=type(exc).__name__,
            )

    # ------------------------------------------------------------------
    # Exact project-ID answers (deterministic, database only)
    # ------------------------------------------------------------------

    def _source_from_record(self, n: int, rec, *, reason: str, mt: str = "exact") -> Source:
        e = self.engine

        return Source(
            ref=f"R{n}",
            record_id=rec.record_id,
            title=rec.title,
            year=rec.year,
            supervisors=[e.sup_display(s.key) for s in rec.supervisors],
            subjects=list(rec.subjects),
            call_number=rec.call_number,
            match_type=mt,
            support="explicit",
            support_reason=reason,
        )

    def _field_lines(self, rec, attrs: list[str], lang: str) -> list[str]:
        """'label: value' for each requested stored field. Empty stays empty: it is labelled as not recorded and
        nothing is inferred from other fields or other records."""

        e, ar = self.engine, lang == "ar"
        lab = {
            "title": ("العنوان", "Title"),
            "year": ("السنة", "Year"),
            "supervisors": ("المشرفون", "Supervisors"),
            "students": ("الطلاب", "Students"),
            "subjects": ("التخصص", "Subject"),
            "call_number": ("رقم التصنيف", "Call number"),
            "extent": ("عدد الصفحات", "Extent"),
            "dimension": ("المقاس", "Dimensions"),
        }
        not_rec = "غير مسجّل في قاعدة البيانات" if ar else "not recorded in the dataset"
        show = attrs or list(lab)
        lines = []

        for k in show:
            name = lab[k][0 if ar else 1]

            if k == "students" and not self.s.expose_students:
                lines.append(
                    f"{name}: " + ("غير معروض (إعداد الخصوصية)" if ar else "not shown (privacy setting)")
                )
                continue

            if k == "title":
                v = rec.title or None
            elif k == "year":
                if rec.year is not None:
                    v = str(rec.year)
                elif rec.year_raw:
                    v = None
                    lines.append(
                        f"{name}: " + (
                            f"القيمة المسجّلة ({rec.year_raw}) غير صالحة كسنة" if ar
                            else f"the recorded value ({rec.year_raw}) is not a valid year"
                        )
                    )
                    continue
                else:
                    v = None
            elif k == "supervisors":
                v = " | ".join(e.sup_display(s.key) for s in rec.supervisors) or None
            elif k == "students":
                v = " | ".join(rec.students) or None
            elif k == "subjects":
                v = " | ".join(rec.subjects) or None
            elif k == "call_number":
                v = rec.call_number
            elif k == "extent":
                v = rec.extent_raw
            else:
                v = rec.dimension_raw

            lines.append(f"{name}: {v if v else not_rec}")

        return lines

    def _id_answer(self, a, wanted: list[str], st, ev, done) -> AskResponse:
        """Exact BOOK_CODE lookup. The record is read straight from the database by primary key; the answer is
        assembled only from that record's stored values. A missing ID is reported as missing - no substitute."""

        lang, ar = a.lang, a.lang == "ar"
        attrs = requested_attributes(a.question)
        st["strategy"].append("exact_project_id_lookup")

        found, missing = [], []

        for rid in wanted:
            rec = self.engine.store.get(rid)    # database read by primary key
            (found if rec is not None else missing).append((rid, rec))

        missing_ids = [rid for rid, _ in missing]
        sources = [
            self._source_from_record(n, rec, reason=f"exact project ID match (BOOK_CODE = {rec.record_id})")
            for n, (_, rec) in enumerate(found, start=1)
        ]

        if not found:
            msg = " ".join(M.id_not_found(lang, rid) for rid in missing_ids)

            return done(
                "abstained", msg, "policy", [], retrieved=[], reason="record_not_found",
            )

        # The record exists but the question is about content the dataset does not hold (findings, abstract...).
        if a.unavailable and not attrs:
            rec = found[0][1]
            msg = M.id_found_but_unavailable(lang, rec.record_id, rec.title, a.unavailable)
            st["facts"].append(f"Project {rec.record_id} exists; requested content not in dataset: {', '.join(a.unavailable)}")

            return done(
                "abstained", msg, "policy", [], retrieved=sources, reason="content_not_available",
            )

        parts = []

        for (rid, rec), src in zip(found, sources):
            lines = self._field_lines(rec, attrs, lang)
            head = f"المشروع رقم {rid}" if ar else f"Project #{rid}"
            parts.append(f"{head} — " + ("؛ ".join(lines) if ar else "; ".join(lines)))

        for rid in missing_ids:
            parts.append(M.id_not_found(lang, rid))

        body = "\n".join(parts)

        if a.unavailable:
            body += "\n" + M.content_unavailable(lang, a.unavailable)

        st["facts"].append(
            "Exact ID lookup (primary key): found " + ", ".join(r for r, _ in found)
            + (("; not found " + ", ".join(missing_ids)) if missing_ids else "")
        )
        ev.unavailable_from_dataset = list(a.unavailable)

        mism = [m_ for _, rec in found[:1] if len(found) == 1 for m_ in _premise_mismatches(a.question, rec, lang, parse_years(a.question))]
        if mism:
            body += "\n" + "\n".join(mism)
            st["facts"].append("Question premise contradicts the stored record: " + "; ".join(mism))

        resp = done("answered_from_catalog", body, "catalog", sources)
        resp.resolved_id = found[0][0]
        if mism:
            resp.warnings = list(resp.warnings) + mism

        return resp

    # ------------------------------------------------------------------
    # Deterministic structured aggregation: counts and breakdowns (SQL)
    # ------------------------------------------------------------------

    def _student_filter(self, a) -> tuple[list[str], set[str]] | None:
        """Student names written in the question (>= 2 words, exact normalised match). None when not applicable."""

        if not self.s.expose_students:
            return None

        padded = f" {normalize_text(a.question)} "

        # Text already explained as a SUPERVISOR name must not be re-read as a student ("سمير محمد" is inside the
        # supervisor "سمير محمد فريد"). With a supervisor present, a student filter needs an explicit student cue.
        for b in a.supervisors:
            padded = padded.replace(f" {b.key} ", " ")

        cue = re.search(r"(?:^|\s)(?:طالب|الطالب|للطالب|الطالبه|للطالبه|طلاب|student|students|author|by student)(?:\s|$)", padded)

        if a.supervisors and not cue:
            return None

        keys = sorted((k for k in self.engine.by_stu if " " in k and f" {k} " in padded), key=lambda k: -len(k))

        if not keys:
            return None

        ids: set[str] | None = None

        for k in keys[:1]:                       # the longest exact name; names are never merged or guessed
            ids = set(self.engine.by_stu[k])

        return keys[:1], ids or set()

    # English topic words -> stem of the (Arabic) SUBJECT spelling used in this dataset's subject field.
    _SUBJECT_ALIASES = (("market", "تسويق"), ("bank", "بنوك"), ("petrol", "بترول"), ("econom", "اقتصاد"), ("account", "محاسب"),
                        ("financ", "تمويل"), ("invest", "استثمار"), ("comput", "حاسب"))

    @staticmethod
    def _stem_ar(word: str) -> str:
        return word[2:] if word.startswith("ال") and len(word) > 4 else word

    def _sibling_subject_note(self, subject: str, filters: dict, ar: bool) -> str:
        """Subject spellings that CONTAIN the chosen subject's stem (e.g. «التسويق» vs «تسويق وتجارة إلكترونية») are different
        subject values; the exact count above does not include them, so say so with their SQL count."""
        stem = self._stem_ar(normalize_text(subject))
        names = [n for n, _ in self.engine.store.subject_counts() if stem in normalize_text(n) and normalize_text(n) != normalize_text(subject)]
        if not names:
            return ""
        yf = {k: v for k, v in filters.items() if k in ("years", "year_from", "year_to")}
        extra = self.engine.store.topic_counts(subject_stems=[stem], **yf)["subject_n"] or 0
        lst = "، ".join(f"«{n}»" for n in names) if ar else ", ".join(f'"{n}"' for n in names)
        return (f"تنبيه: يوجد تخصص مسجّل بصيغة أخرى تحتوي «{stem}»: {lst}؛ لم يُحتسب أعلاه لأنه قيمة تخصص مختلفة. "
                f"مجموع السجلات في أي تخصص يحتوي «{stem}» ضمن نفس الشروط: {extra}."
                if ar else
                f"Note: another subject value contains \"{stem}\": {lst}. It is a different subject value and is NOT counted above. "
                f"Records in ANY subject containing \"{stem}\" under the same conditions: {extra}.")

    def _topic_year_route(self, a, st, done):
        """Topic + year questions answered from the stored fields (subject, title, year) by SQL, with the definition stated.
        Returns None when the question has no year, has a supervisor/student filter, or has no topical term."""
        ys = parse_years(a.question)

        if not ys.present or a.supervisors or a.unavailable:
            return None

        year_tokens = {str(y) for y in ys.years} | {str(y) for y in (ys.year_from, ys.year_to) if y}
        terms = [t for t in self._topical_terms(a) if t not in _DROP_STEMS_COUNT and t not in year_tokens]
        terms = [t for t in self._leftover_terms(a, terms)] if not a.subjects else terms
        terms = list(dict.fromkeys(terms))

        if not terms or len(terms) > 4 or (self._student_filter(a) is not None):
            return None

        store, lang = self.engine.store, a.lang
        ar = lang == "ar"
        yf: dict = {}
        if ys.years:
            yf["years"] = ys.years
        if ys.year_from is not None:
            yf["year_from"] = ys.year_from
        if ys.year_to is not None:
            yf["year_to"] = ys.year_to

        stems: list[str] = []
        alts: list[list[str]] = []

        for t in terms:
            alt = [t]
            for pre, ar_stem in self._SUBJECT_ALIASES:
                if t.startswith(pre):
                    alt += [pre, ar_stem]                       # "marketing" -> also "market" (market/marketer) and the Arabic stem
                    stems.append(ar_stem)
                elif self._stem_ar(t).startswith(ar_stem):      # Arabic question -> the English titles of the same topic
                    alt.append(pre)
            if re.search(r"[\u0600-\u06FF]", t):
                stems.append(self._stem_ar(t))
            alts.append(alt)

        for nm in a.subjects:                     # recognised subject names are subject stems too
            stems.append(self._stem_ar(normalize_text(nm)))

        res = store.topic_counts(subject_stems=list(dict.fromkeys(stems)), term_alternatives=alts, **yf)
        mention, subj = res["mention_n"] or 0, res["subject_n"]
        label = ys.label(ar).split(": ", 1)[-1]
        topic = " ".join(terms)
        st["strategy"].append("deterministic_topic_year_sql")
        st["total"] = mention
        st["facts"].append(f"SQL over rag_records/rag_record_subjects: year filter {label}; terms {terms}; subject-field count {subj}; title-or-subject count {mention}")

        if ar:
            msg = f"الموضوع «{topic}» في {label}:"
            if subj is not None:
                br = "، ".join(f"{n}: {c}" for n, c in res["subjects"])
                msg += f" {subj} مشروعًا مسجّلًا ضمن تخصص يتضمن هذا الموضوع في حقل التخصص ({br})؛" if br else f" {subj} مشروعًا ضمن تخصص يتضمن هذا الموضوع؛"
            msg += (f" و{mention} مشروعًا يرد الموضوع في عنوانه أو تخصصه (العدد الأوسع، ويشمل الأول وعناوين تتناول الموضوع تحت تخصصات أخرى)."
                    if subj is not None else f" {mention} مشروعًا يرد الموضوع في عنوانه أو تخصصه.")
            msg += " الحساب من حقلي التخصص والسنة والعنوان المسجّلة فقط، ولا يعني أن كل سجل يدرس الموضوع بعمق."
            if mention == 0:
                msg += " لا توجد سجلات مطابقة؛ هذه نتيجة صحيحة من قاعدة البيانات وليست خطأً تقنيًا."
        else:
            msg = f'Topic "{topic}" in {label}:'
            if subj is not None:
                br = ", ".join(f"{n}: {c}" for n, c in res["subjects"])
                msg += f" {subj} project(s) are recorded under a subject containing this topic ({br})," if br else f" {subj} project(s) under a matching subject,"
            msg += (f" and {mention} project(s) mention it in the title or subject (the broader count: it includes the first and titles about the topic filed under other subjects)."
                    if subj is not None else f" {mention} project(s) mention it in the title or subject.")
            msg += " Counted from the stored subject, year and title fields only; it does not mean every record studies the topic in depth."
            if mention == 0:
                msg += " No records match; this is a valid database result, not a technical error."

        sources = [self._source_from_record(i, store.get(rid), reason="matches the topic and year filters (sample of up to 10)", mt="exact")
                   for i, rid in enumerate(res["ids"], start=1) if store.get(rid) is not None]
        for s_ in sources:
            s_.support = "listed"
        return done("answered_from_catalog", msg, "catalog", sources)

    def _structured_route(self, a, st, done):
        """Counts / breakdowns computed by SQL. Returns None when the question is not a pure structured one
        (the normal pipeline then continues)."""

        e, store = self.engine, self.engine.store
        lang, ar = a.lang, a.lang == "ar"
        grp = group_by_request(a.question)
        is_count = a.intent == "count"

        if not (is_count or grp):
            return None

        ys = parse_years(a.question)
        year_tokens = {str(y) for y in ys.years} | {str(y) for y in (ys.year_from, ys.year_to) if y}
        terms = [t for t in self._topical_terms(a) if t not in _DROP_STEMS_COUNT and t not in year_tokens]

        if terms:                                # topical words remain -> evidence-checked path, not an exact count
            return None

        sup_keys = [b.key for b in a.supervisors]
        subj_norms = [normalize_text(a.subjects[0])] if a.subjects else []
        stu = self._student_filter(a)

        filters: dict = {}
        bits: list[tuple[str, str]] = []

        if ys.years:
            filters["years"] = ys.years
            bits.append(("year" if len(ys.years) == 1 else "years", ", ".join(map(str, ys.years))))
        if ys.year_from is not None:
            filters["year_from"] = ys.year_from
        if ys.year_to is not None:
            filters["year_to"] = ys.year_to
        if ys.year_from is not None or ys.year_to is not None:
            bits.append(("years", ys.label(False).split(": ", 1)[-1] if ys.year_from and ys.year_to else ys.label(False)))
        if sup_keys:
            filters["supervisor_keys"] = sup_keys
            bits += [("supervisor", b.name) for b in a.supervisors]
        if subj_norms:
            filters["subject_norms"] = subj_norms
            bits.append(("subject", a.subjects[0]))
        if stu is not None:
            filters["record_ids"] = stu[1]
            bits.append(("student", e.stu_display(stu[0][0])))

        has_filter = bool(filters)

        if not has_filter and not grp and not mentions_project_noun(a.question):
            return None                          # "how many tigers?" is not a question about this dataset

        lab_ar = {"supervisor": "المشرف", "subject": "التخصص", "year": "السنة", "years": "السنوات", "student": "الطالب"}
        cond = "; ".join(f"{(lab_ar if ar else {}).get(k, k)}: {v}" for k, v in bits)

        st["strategy"].append("deterministic_sql_aggregation")

        # ---- breakdown (per year / per subject)
        if grp:
            if grp == "year":
                rows = store.year_counts(**filters)
                missing_year = store.count_missing_year() if not has_filter else 0
                lines = [f"{y}: {n}" for y, n in rows]
                total = sum(n for _, n in rows)
                title = "عدد المشروعات المسجلة لكل سنة" if ar else "Projects recorded per year"
                note = (f" (بالإضافة إلى {missing_year} سجل بلا سنة صالحة)" if ar else f" (plus {missing_year} record(s) without a valid year)") if missing_year else ""
            else:
                rows = store.subject_counts()
                lines = [f"{label}: {n}" for label, n in rows[:25]]
                total = store.count_where(**filters)
                title = "عدد المشروعات لكل تخصص (أعلى 25)" if ar else "Projects per subject (top 25)"
                note = ""
                if len(rows) > 25:
                    note = f" — {len(rows)} " + ("تخصصًا في المجموع" if ar else "subjects in total")
                note += (" — قد يحمل المشروع الواحد أكثر من تخصص" if ar else " — a project can carry more than one subject")
            if not lines:
                st["facts"].append("Breakdown: 0 matching records")
            st["facts"].append(f"SQL group-by over rag_records ({grp}); matching records counted: {total}")
            st["total"] = total

            return done(
                "answered_from_catalog",
                f"{title}{(' (' + cond + ')') if cond else ''}{note}:\n" + "\n".join(lines) if lines
                else (M.no_results(lang)),
                "catalog",
                [],
            )

        # ---- plain count (a legitimate 0 is an ANSWER, not an abstention and not an error)
        n = store.count_where(**filters)
        st["total"] = n
        st["facts"].append(
            "SQL count over rag_records"
            + (f" where {'; '.join(f'{k} = {v}' for k, v in bits)}" if bits else " (no filter = all records)")
            + f": {n}"
        )

        if ys.years and len(ys.years) > 1:
            per = store.year_counts(**filters)
            br = "، ".join(f"{y}: {c}" for y, c in per) if ar else ", ".join(f"{y}: {c}" for y, c in per)
        else:
            br = ""

        if has_filter:
            msg = (
                f"عدد المشروعات المسجلة في قاعدة البيانات ({cond}): {n}."
                if ar
                else f"Number of projects recorded in the database ({cond}): {n}."
            )
        else:
            msg = (
                f"إجمالي عدد المشروعات المسجلة في قاعدة البيانات: {n}."
                if ar
                else f"Total number of projects recorded in the database: {n}."
            )

        if subj_norms and has_filter:
            sib = self._sibling_subject_note(a.subjects[0], filters, ar)
            if sib:
                msg += " " + sib

        if n == 0:
            msg += (" لا توجد سجلات مطابقة؛ هذه نتيجة صحيحة من قاعدة البيانات وليست خطأً تقنيًا." if ar
                    else " No records match; this is a valid database result, not a technical error.")
        if br:
            msg += (f" التفصيل: {br}." if ar else f" Breakdown: {br}.")

        shown_ids = store.ids_where(limit=10, **filters) if n else []
        sources = [
            self._source_from_record(i, store.get(rid), reason="matches the counted filter (sample of up to 10)", mt="exact")
            for i, rid in enumerate(shown_ids, start=1)
            if store.get(rid) is not None
        ]

        for s in sources:
            s.support = "listed"

        if sup_keys:
            st["complete"] = {
                "endpoint": "/supervisors/records",
                "params": {"key": sup_keys[0]},
                "note": "complete, paginated list of this supervisor's records",
            }

        return done("answered_from_catalog", msg, "catalog", sources)

    # ------------------------------------------------------------------
    # Record answers (deterministic)
    # ------------------------------------------------------------------

    def _record_answer(
        self,
        a,
        ids,
        st,
        ev,
        done,
    ) -> AskResponse:
        e, lang = self.engine, a.lang
        attrs = a.attributes

        src = self._sources(
            ids,
            "explicit",
            {i: "exact normalised title match" for i in ids},
            {i: "exact" for i in ids},
        )

        lines = [
            f"[{s.ref}] {s.title} — "
            f"{self._record_text(s.record_id, attrs, lang)}"
            for s in src
        ]

        conflicts = find_conflicts(e, ids)
        st["conflicts"] = conflicts
        head = ""

        if len(ids) > 1:
            attrs_diff = sorted(
                {c["attribute"] for c in conflicts}
            )

            if lang == "ar":
                head = (
                    f"يوجد {len(ids)} سجلات بنفس العنوان بالضبط. "
                )
                head += (
                    f"تختلف بياناتها في: {', '.join(attrs_diff)}؛ "
                    "قد تكون أعمالًا مختلفة أو إدخالات مكررة، ولذلك أعرضها "
                    "جميعًا دون اختيار أحدها:\n"
                    if conflicts
                    else "وهي متطابقة في الحقول المطلوبة:\n"
                )
            else:
                head = (
                    f"{len(ids)} records share this exact title. "
                )
                head += (
                    f"They differ in: {', '.join(attrs_diff)}. They may be "
                    "different works or duplicate entries, so all are listed "
                    "and none is chosen:\n"
                    if conflicts
                    else "They agree on the requested fields:\n"
                )

        body = head + "\n".join(lines)

        if a.unavailable:
            body += "\n" + M.content_unavailable(lang, a.unavailable)

        st["strategy"].append("deterministic_record_answer")

        return done(
            "answered_from_catalog",
            body,
            "catalog",
            src,
        )

    # ------------------------------------------------------------------
    # Entity answers (deterministic)
    # ------------------------------------------------------------------

    def _entity_answer(
        self,
        a,
        ids,
        bits,
        st,
        ev,
        done,
    ) -> AskResponse:
        e, lang, s = self.engine, a.lang, self.s
        ar = lang == "ar"

        lab_ar = {
            "supervisor": "المشرف",
            "subject": "التخصص",
            "year": "السنة",
            "years": "السنوات",
        }

        cond = "; ".join(
            f"{(lab_ar if ar else {}).get(k, k)}: {v}"
            for k, v in bits
        )

        st["strategy"].append("structured_entities")
        st["facts"].append(
            "Catalogue records matching "
            f"({'; '.join(f'{k} = {v}' for k, v in bits)}): "
            f"{len(ids)} (exact count from the database)."
        )
        st["total"] = len(ids)

        if a.supervisors:
            key = a.supervisors[0].key
            st["complete"] = {
                "endpoint": "/supervisors/records",
                "params": {"key": key},
                "note": (
                    "complete, paginated list of this supervisor's records"
                ),
            }

        shown = ids[: s.rag_max_context_records]
        src = self._sources(
            shown,
            "listed",
            mts={i: "exact" for i in shown},
        )

        if not ids:
            return done(
                "abstained",
                M.no_results(lang),
                "policy",
                [],
                reason="no_results",
            )

        if a.unavailable:
            return done(
                "abstained",
                M.content_unavailable(lang, a.unavailable)
                + (
                    f" عدد السجلات المطابقة ({cond}): {len(ids)}؛ "
                    f"يُعرض أدناه {len(shown)} منها."
                    if ar
                    else f" Matching records ({cond}): {len(ids)}; "
                    f"{len(shown)} are shown below."
                ),
                "policy",
                [],
                retrieved=src,
                reason="content_not_available",
            )

        trunc_ar = (
            f" المعروض أدناه أحدث {len(shown)} سجلًا؛ "
            "استخدم البحث بالمشرف للقائمة الكاملة مع ترقيم الصفحات."
            if len(ids) > len(shown)
            else ""
        )

        trunc_en = (
            f" The {len(shown)} most recent are shown below; "
            "use supervisor search for the full paginated list."
            if len(ids) > len(shown)
            else ""
        )

        if a.intent == "profile":
            subj = Counter(
                x
                for i in ids
                for x in e.records[i].subjects
            )

            yrs = [
                e.records[i].year
                for i in ids
                if e.records[i].year
            ]

            bd = ", ".join(
                f"{k}: {v}"
                for k, v in subj.most_common(8)
            )

            yr = f"{min(yrs)}–{max(yrs)}" if yrs else "—"

            if ar:
                msg = (
                    f"وفقًا للفهرس: {len(ids)} سجلًا ({cond}). "
                    f"توزيع التخصصات المسجّلة: {bd}. "
                    f"سنوات النشر: {yr}. "
                    "هذا ملخص لبيانات الفهرس فقط ولا يصف محتوى الأبحاث."
                    + trunc_ar
                )
            else:
                msg = (
                    f"According to the catalogue: {len(ids)} record(s) "
                    f"({cond}). Recorded subjects: {bd}. Years: {yr}. "
                    "This summarises catalogue metadata only and does not "
                    "describe the content of the works."
                    + trunc_en
                )

            return done(
                "answered_from_catalog",
                msg,
                "catalog",
                src,
            )

        if a.intent == "count":
            msg = (
                f"عدد السجلات المطابقة ({cond}): {len(ids)}."
                if ar
                else f"Number of matching records ({cond}): {len(ids)}."
            )

            return done(
                "answered_from_catalog",
                msg,
                "catalog",
                src,
            )

        titles = []

        for i in shown:
            record = e.records[i]
            title = getattr(record, "title", "") or (
                "عنوان غير مسجل" if ar else "Untitled"
            )
            year = getattr(record, "year", None)

            if ar:
                year_text = str(year) if year else "غير مسجلة"
                titles.append(f"- {title} (السنة: {year_text})")
            else:
                year_text = str(year) if year else "not recorded"
                titles.append(f"- {title} (year: {year_text})")

        if ar:
            msg = (
                f"عدد السجلات المطابقة ({cond}): {len(ids)}. "
                f"المعروض {len(shown)} سجلًا:\n"
                + "\n".join(titles)
                + trunc_ar
            )
        else:
            msg = (
                f"Matching records ({cond}): {len(ids)}. "
                f"Showing {len(shown)} record(s):\n"
                + "\n".join(titles)
                + trunc_en
            )

        return done(
            "answered_from_catalog",
            msg,
            "catalog",
            src,
        )
