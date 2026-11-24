"""Cross-language query expansion for topic questions (v13).

Why: the catalog mixes Arabic and English records. A topic question in one language ("books about computer
science") found mostly the records written in that language, although the catalog has many books on the same topic
in the other language ("الحاسب الآلي"). The notebook evaluation showed it: mixed_lang 0.749 and concept 0.764 were
the weakest families.

What: a small hand-written bilingual glossary of the library's subject areas (management, business, finance,
computing...). When a topic question contains a glossary term, the term's equivalents in the OTHER language are
searched too, as extra BM25 + vector lists fused by RRF next to the original lists (the original question is never
changed, and the reranker still scores against the original question).

When it does NOT run (so what already works well is left alone):
  - CONFIG["query_expansion"] is False;
  - the question names an author of the catalog (author questions: 0.990);
  - the question matches a book title or is the first words of one (known-item questions: 1.000);
  - no glossary term is in the question.
When the whole question is one subject heading of the catalog, the expansion counts less
(CONFIG["expansion_weight_heading"]), so the books filed under that heading stay first.
Words with several meanings ("sales" in "sales tax", "law", "projects") are left out of the glossary on purpose.

The glossary was written from the library's subject areas, not from the evaluation questions.
"""
from functools import lru_cache

from .text import normalize_text, tokenize

# (English variants, Arabic variants) -- one entry per subject area
GLOSSARY = [
    # computing
    (["computer", "computer science", "computing", "informatics"],
     ["الحاسب", "الحاسبات", "الحاسب الالي", "الحاسوب", "الكمبيوتر"]),
    (["programming", "programmer", "software engineering"], ["البرمجة", "البرمجيات"]),
    (["database", "databases"], ["قواعد البيانات", "قاعدة البيانات"]),
    (["information systems", "information technology"], ["نظم المعلومات", "تكنولوجيا المعلومات"]),
    (["internet", "web"], ["الانترنت", "الشبكة العالمية"]),
    (["network", "networks", "networking"], ["الشبكات"]),
    (["data analysis"], ["تحليل البيانات"]),
    (["electronic government", "e government"], ["الحكومة الالكترونية"]),
    # marketing & sales
    (["marketing"], ["التسويق"]),
    (["electronic marketing", "internet marketing", "digital marketing", "online marketing"],
     ["التسويق الالكتروني", "التسويق عبر الانترنت"]),
    (["electronic commerce", "e commerce", "ecommerce"], ["التجارة الالكترونية"]),
    (["advertising"], ["الاعلان"]),
    (["selling", "sales management", "salesmanship"], ["البيع", "ادارة المبيعات"]),
    (["consumer", "consumers", "consumer behavior"], ["المستهلك", "سلوك المستهلك"]),
    (["customer service", "customers"], ["خدمة العملاء", "العملاء"]),
    # accounting & finance
    (["accounting", "accountant"], ["المحاسبة", "المحاسب"]),
    (["auditing", "audit"], ["المراجعة", "مراجعة الحسابات"]),
    (["finance", "financial management"], ["التمويل", "الادارة المالية"]),
    (["bank", "banks", "banking"], ["البنوك", "البنك", "المصارف"]),
    (["islamic banking", "islamic finance"], ["البنوك الاسلامية", "المصارف الاسلامية"]),
    (["investment", "investments"], ["الاستثمار"]),
    (["stock market", "stock exchange", "stocks", "securities"], ["البورصة", "الاوراق المالية", "الاسهم"]),
    (["insurance"], ["التامين"]),
    (["tax", "taxes", "taxation"], ["الضرائب"]),
    (["economics", "economy"], ["الاقتصاد"]),
    (["statistics", "statistical"], ["الاحصاء"]),
    # people & organizations
    (["human resources", "human resource management", "personnel management"],
     ["الموارد البشرية", "ادارة الافراد"]),
    (["employees", "employee", "staff"], ["الموظفون", "العاملين"]),
    (["training"], ["التدريب"]),
    (["recruitment", "recruiting", "hiring"], ["الاختيار والتعيين", "اختيار الافراد"]),
    (["leadership", "leader", "leaders"], ["القيادة", "القادة"]),
    (["motivation", "incentives"], ["الحوافز", "الدافعية"]),
    (["organizational behavior"], ["السلوك التنظيمي"]),
    (["negotiation"], ["التفاوض"]),
    (["communication"], ["الاتصال"]),
    (["decision making"], ["اتخاذ القرارات"]),
    (["conflict"], ["الصراع"]),
    (["time management"], ["ادارة الوقت"]),
    # management areas
    (["strategic management", "strategic planning", "strategy"], ["الادارة الاستراتيجية", "التخطيط الاستراتيجي"]),
    (["project management", "project planning"], ["ادارة المشروعات", "تخطيط المشروعات"]),
    (["small business"], ["المشروعات الصغيرة"]),
    (["feasibility study", "feasibility studies", "feasibility"], ["دراسة الجدوى", "دراسات الجدوى"]),
    (["quality", "total quality management"], ["الجودة", "ادارة الجودة الشاملة"]),
    (["risk", "risk management"], ["المخاطر", "ادارة المخاطر"]),
    (["crisis management"], ["ادارة الازمات"]),
    (["change management"], ["ادارة التغيير"]),
    (["knowledge management"], ["ادارة المعرفة"]),
    (["operations management", "production management"], ["ادارة العمليات", "ادارة الانتاج"]),
    (["supply chain", "logistics"], ["سلاسل الامداد", "اللوجستيات"]),
    (["public administration"], ["الادارة العامة"]),
    (["entrepreneurship"], ["ريادة الاعمال"]),
    (["international trade", "foreign trade"], ["التجارة الدولية", "التجارة الخارجية"]),
    (["tourism", "hotel management"], ["السياحة", "الفنادق"]),
    (["psychology"], ["علم النفس"]),
    (["mathematics"], ["الرياضيات"]),
]


@lru_cache(maxsize=1)
def _entries():
    # each variant as its token sequence (same tokenizer as BM25: normalized, stopwords out, light stemming)
    out = []
    for en, ar in GLOSSARY:
        en_t = [tuple(tokenize(v)) for v in en if tokenize(v)]
        ar_t = [tuple(tokenize(v)) for v in ar if tokenize(v)]
        out.append((en, ar, en_t, ar_t))
    return out


def _contains(seq, sub):
    n = len(sub)
    return any(tuple(seq[i:i + n]) == sub for i in range(len(seq) - n + 1))


def expand_query(query):
    """Text with the other-language equivalents of the glossary terms in the question ("" if none)."""
    toks = tokenize(query)
    if not toks:
        return ""
    extra = []
    for en, ar, en_t, ar_t in _entries():
        if any(_contains(toks, t) for t in en_t):
            extra += ar
        if any(_contains(toks, t) for t in ar_t):
            extra += en
    seen, out = set(), []
    for v in extra:
        if v not in seen:
            seen.add(v); out.append(v)
    return " ".join(out)


def should_expand(query, analysis, title_hits, titles_norm):
    """Topic questions only: not when the question names a catalog author or is (part of) a book title."""
    if analysis.get("detected_authors") or bool(title_hits.any()):
        return False
    q = normalize_text(query)
    if len(q.split()) >= 3 and any(q in t for t in titles_norm):      # the first words of a title, as typed
        return False
    return True


def expansion_weight(query, analysis, base, heading_weight):
    """Lower weight when the whole question is one subject heading of the catalog: the books filed under that
    heading stay first, the other-language books come after them."""
    core = " ".join(tokenize(query))
    for h in analysis.get("detected_topics") or []:
        if " ".join(tokenize(h)) == core:
            return heading_weight
    return base
