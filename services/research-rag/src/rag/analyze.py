"""Question analysis: entity linking, intent, and requested information.
Deterministic, no LLM.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from src.data.normalize_ar import detect_language, normalize_text
from src.retrieval.engine import SearchEngine
from src.retrieval.types import SupervisorBrief


COUNT_WORDS = {
    "كم", "عدد", "how many", "number of", "count", "total number",
}

LIST_WORDS = {
    "اعرض", "عرض", "قائمه", "قائمة", "جميع", "كل",
    "عناوين", "عنوان",
    "ما المشروعات", "ما المشاريع", "ما الابحاث",
    "الابحاث المسجلة", "المشروعات المسجلة", "المشاريع المسجلة",
    "المشروعات في عام", "المشاريع في عام",
    "الابحاث في عام", "الابحاث المسجلة في عام",
    "ما الابحاث المتعلقة", "ما الابحاث المرتبطة",
    "list", "show all", "all projects", "all research",
    "give me all", "show me",
}

SUPERVISOR_LIST_WORDS = {
    "تحت اشراف",
    "الابحاث المسجلة تحت اشراف",
    "الابحاث التي يشرف عليها",
    "الابحاث اللي يشرف عليها",
    "الابحاث التي تحت اشراف",
    "اعمال المشرف",
    "supervised by",
    "research supervised by",
    "papers supervised by",
    "works supervised by",
}

PROFILE_WORDS = {
    "مجال", "مجالات", "ماذا يشرف", "ماذا اشرف",
    "what topics", "what does", "areas", "fields",
    "profile", "works on", "work on",
}

UNAVAILABLE_PATTERNS: dict[str, set[str]] = {
    "findings": {
        "نتائج", "نتيجة", "ماذا وجد", "ماذا توصل", "توصل",
        "findings", "results", "outcome", "outcomes", "discovered",
        "what did", "found that", "show that", "reveal",
    },
    "conclusions": {
        "خلاصة", "استنتاج", "استنتاجات", "توصيات",
        "conclusion", "conclusions", "recommendation",
        "recommendations", "limitations", "implications",
    },
    "methodology": {
        "منهج", "منهجية", "عينة", "حجم العينة", "استبيان",
        "استبانة", "أدوات", "methodology", "methods", "method",
        "sample", "sample size", "questionnaire", "survey",
        "interviews", "research design", "regression",
        "data collection",
    },
    "statistics": {
        "إحصاءات", "احصائيات", "إحصائية", "نسبة مئوية",
        "statistics", "statistical", "percentage", "p-value",
        "correlation", "coefficient", "how much", "what percent",
    },
    "abstract_summary": {
        "ملخص", "مستخلص", "لخص", "تلخيص", "abstract", "summary",
        "summarize", "summarise", "summarizes",
        "explain the research", "explain this research",
        "main idea", "contribution", "contributions",
    },
    "full_text": {
        "النص الكامل", "الفصل", "الفصول", "المراجع",
        "الدراسات السابقة", "الإطار النظري", "full text",
        "chapter", "chapters", "references", "bibliography",
        "table of contents", "literature review", "pdf",
    },
    "hypotheses": {
        "فروض", "فرضيات", "فرضية", "hypothesis", "hypotheses",
    },
}

ATTRIBUTE_PATTERNS: dict[str, set[str]] = {
    "supervisors": {
        "مشرف", "المشرف", "اشرف", "أشرف", "المشرفين",
        "supervisor", "supervisors", "supervised", "advisor",
        "who supervised",
    },
    "year": {
        "سنة", "عام", "متى", "year", "when", "published",
        "publication date",
    },
    "subjects": {
        "تخصص", "التخصص", "موضوع", "subject", "subjects",
        "category", "department",
    },
    "call_number": {
        "رقم التصنيف", "رقم الطلب", "call number",
        "classification number", "call no",
    },
    "extent": {
        "عدد الصفحات", "صفحات", "pages", "extent",
        "how long", "page count",
    },
    "dimension": {
        "مقاس", "أبعاد", "dimensions", "size of the",
    },
    "students": {
        "طالب", "طلاب", "الطلاب", "المؤلف", "كتب", "من أعد",
        "author", "authors", "student", "students",
        "who wrote", "written by",
    },
}

_QUOTE = re.compile(
    r'"([^"]{4,})"|“([^”]{4,})”|«([^»]{4,})»'
)


@dataclass
class QuestionAnalysis:
    question: str
    qn: str
    language: str
    intent: str = "search"
    supervisors: list[SupervisorBrief] = field(default_factory=list)
    subjects: list[str] = field(default_factory=list)
    year: int | None = None
    year_from: int | None = None
    year_to: int | None = None
    quoted: list[str] = field(default_factory=list)
    unavailable: list[str] = field(default_factory=list)
    attributes: list[str] = field(default_factory=list)
    residual_query: str = ""

    @property
    def lang(self) -> str:
        if self.language == "en":
            return "en"
        if self.language == "mixed":
            ar = len(re.findall(r"[؀-ۿ]", self.question))
            en = len(re.findall(r"[A-Za-z]", self.question))
            return "en" if en > ar else "ar"
        return "ar"

    @property
    def content_question(self) -> bool:
        return bool(self.unavailable)


def _has(qn: str, words: set[str]) -> bool:
    padded = f" {qn} "
    return any(
        f" {normalize_text(word)} " in padded
        for word in words
    )


def analyze_question(
    engine: SearchEngine,
    question: str,
) -> QuestionAnalysis:
    """Analyse the question without using an LLM."""

    outside = _QUOTE.sub(" ", question).strip()
    qn = normalize_text(question)
    nq = normalize_text(outside)

    a = QuestionAnalysis(
        question=question,
        qn=qn,
        language=detect_language(outside or question),
    )

    padded = f" {nq} "

    found = sorted(
        (
            key for key in engine.by_sup
            if f" {key} " in padded
        ),
        key=lambda key: -len(key),
    )

    taken = padded
    for key in found:
        if f" {key} " in taken:
            a.supervisors.append(engine._brief(key))
            taken = taken.replace(f" {key} ", " ", 1)

    for name in engine.by_subject:
        if f" {name} " in padded and len(name) > 2:
            a.subjects.append(
                engine.subject_names[name].most_common(1)[0][0]
            )

    years = [
        int(year)
        for year in re.findall(r"\b((?:19|20)\d{2})\b", nq)
    ]

    if len(years) == 1:
        a.year = years[0]
    elif len(years) >= 2:
        a.year_from = min(years)
        a.year_to = max(years)

    for match in _QUOTE.finditer(question):
        a.quoted.append(
            next(group for group in match.groups() if group).strip()
        )

    a.unavailable = [
        category
        for category, words in UNAVAILABLE_PATTERNS.items()
        if _has(nq, words)
    ]

    a.attributes = [
        category
        for category, words in ATTRIBUTE_PATTERNS.items()
        if _has(nq, words)
    ]

    # Classify intent deterministically.
    if _has(nq, COUNT_WORDS):
        a.intent = "count"
    elif _has(nq, PROFILE_WORDS):
        a.intent = "profile"
    elif (
        _has(nq, LIST_WORDS)
        or (
            bool(a.supervisors)
            and _has(nq, SUPERVISOR_LIST_WORDS)
        )
    ):
        a.intent = "list"

    residual = padded

    for brief in a.supervisors:
        residual = residual.replace(f" {brief.key} ", " ")

    residual = re.sub(r"\b(?:19|20)\d{2}\b", " ", residual)
    a.residual_query = re.sub(r"\s+", " ", residual).strip()

    return a
