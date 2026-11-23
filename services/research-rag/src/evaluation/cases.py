"""Abstention / faithfulness test cases built from the REAL dataset (seeded, deterministic).

answer groups  (the system SHOULD answer):  record_fact, supervisor_count, topical
abstain groups (the system MUST abstain) :  findings, methodology_summary, off_domain, fake_title, partial_overlap

Preconditions are checked against the data when cases are built, e.g. a 'fake_title' case is only emitted if the
modified title does not exist in the dataset, an 'off_domain' case only if none of its key terms occurs in any title.
"""
from __future__ import annotations

import random
import re
from dataclasses import dataclass, field

from src.evaluation.oracle import norm


@dataclass
class Case:
    group: str
    question: str
    expect: str                      # "answer" | "abstain"
    expect_reason: str | None = None
    record_id: str | None = None     # for record_fact / topical: the record that must be among the sources
    meta: dict = field(default_factory=dict)


OFF_DOMAIN = [
    "ما هي أسباب انقراض الديناصورات؟", "كيف تعمل مفاعلات الاندماج النووي؟", "ما هو تاريخ الإمبراطورية الرومانية؟",
    "اشرح نظرية الكم والجسيمات الأولية", "ما هي أفضل طرق علاج مرض السكري؟", "من فاز بكأس العالم لكرة القدم؟",
    "ما هي خصائص الشعر الأندلسي؟", "كيف يتم تصنيع الأقمار الصناعية؟", "ما هي أنواع الصخور البركانية؟",
    "ما تأثير الاحتباس الحراري على القطب الشمالي؟", "كيف أطبخ الكشري المصري؟", "ما هي أعراض الأنفلونزا الموسمية؟",
    "dinosaur extinction causes", "quantum entanglement experiments", "how to treat diabetes with insulin",
    "history of the roman empire", "volcanic rocks classification", "football world cup winners",
    "deep sea marine biology", "medieval european poetry", "astronomy of black holes", "organic chemistry reactions",
    "tell me about Shakespeare's tragedies", "genetic engineering of crops", "ancient egyptian hieroglyphs decoding",
    "ما هي لغة البرمجة التي ابتكرها جوزيف ويزنباوم", "rocket propulsion physics", "ما هو علاج الصداع النصفي",
    "photosynthesis in desert plants", "ما هي أنواع الطيور المهاجرة؟",
]
FILLER = ["كوانتم", "ديناصورات", "بركاني", "fusion", "dinosaur", "volcanic"]


def _tokens(t: str) -> list[str]:
    return [w for w in norm(t).split() if len(w) > 2]


def build_cases(orc: dict, seed: int = 13, n_each: int = 40) -> list[Case]:
    rng = random.Random(seed)
    recs = orc["records"]
    by_title, by_sup = orc["by_title"], orc["by_sup"]
    all_title_tokens = {w for r in recs.values() for w in _tokens(r["title"])}
    ids = sorted(recs)
    cases: list[Case] = []

    # --- ANSWER: record facts (unique titles only, so exactly one record is the right evidence)
    uniq = [i for i in ids if len(by_title[recs[i]["title_norm"]]) == 1 and len(recs[i]["title_norm"]) >= 12
            and '"' not in recs[i]["title"] and "«" not in recs[i]["title"] and "»" not in recs[i]["title"]]
    for rid in rng.sample(uniq, n_each):
        cases.append(Case("record_fact", f"من المشرف على «{recs[rid]['title']}»؟", "answer", record_id=rid,
                          meta={"sups": sorted(recs[rid]["sups"])}))
    # --- ANSWER: supervisor counts
    sups = sorted(by_sup)
    for k in rng.sample(sups, min(n_each, len(sups))):
        cases.append(Case("supervisor_count", f"كم مشروع أشرف عليه {k}؟", "answer", meta={"count": len(by_sup[k]), "key": k}))
    # --- ANSWER: topical (3 distinctive words of a real title; the record itself must be retrieved)
    df = {}
    for r in recs.values():
        for w in set(_tokens(r["title"])):
            df[w] = df.get(w, 0) + 1
    cand = [i for i in ids if len([w for w in _tokens(recs[i]["title"]) if df[w] / len(recs) < 0.05]) >= 3 and len(by_title[recs[i]["title_norm"]]) <= 3]
    for rid in rng.sample(cand, n_each * 2):
        words = [w for w in _tokens(recs[rid]["title"]) if df[w] / len(recs) < 0.05][:3]
        cases.append(Case("topical", "ما المشاريع التي تتناول " + " ".join(words) + "؟", "answer", record_id=rid, meta={"terms": words}))

    # --- ABSTAIN: findings / methodology / summary requests about real, existing records
    for rid in rng.sample(uniq, n_each):
        cases.append(Case("findings", f"ما نتائج دراسة «{recs[rid]['title']}»؟", "abstain", "content_not_available", rid))
    for rid in rng.sample(uniq, n_each // 2):
        cases.append(Case("findings", f"What were the findings of \"{recs[rid]['title']}\"?", "abstain", "content_not_available", rid))
    for rid, tpl in zip(rng.sample(uniq, n_each), ["ما منهجية بحث «{t}» وحجم العينة؟", "لخص بحث «{t}»", "What methodology does \"{t}\" use?",
                                                  "ما هي توصيات «{t}»؟"] * n_each):
        cases.append(Case("methodology_summary", tpl.format(t=recs[rid]["title"]), "abstain", "content_not_available", rid))
    # --- ABSTAIN: off-domain (precondition: no key token of the question occurs in any title)
    for q in OFF_DOMAIN:
        key = [w for w in _tokens(q) if len(w) > 4]
        if sum(w in all_title_tokens for w in key) <= max(0, len(key) // 4):
            cases.append(Case("off_domain", q, "abstain"))
    # --- ABSTAIN: misleadingly similar / non-existent title (one distinctive word swapped; verified absent)
    pool = [w for w in sorted(all_title_tokens) if 5 <= len(w) <= 9]
    made = 0
    for rid in rng.sample(uniq, len(uniq)):
        if made >= n_each:
            break
        toks = norm(recs[rid]["title"]).split()
        dist = [i for i, w in enumerate(toks) if len(w) > 4]
        if len(toks) < 4 or not dist:
            continue
        j = rng.choice(dist)
        new = toks.copy(); new[j] = rng.choice(pool)
        fake = " ".join(new)
        if fake in by_title or fake == norm(recs[rid]["title"]):
            continue
        cases.append(Case("fake_title", f"من المشرف على «{fake}»؟", "abstain", "record_not_found", meta={"source": rid}))
        made += 1
    # --- ABSTAIN: topical question mixing real terms with one term absent from the whole dataset
    for rid in rng.sample(cand, n_each):
        words = [w for w in _tokens(recs[rid]["title"]) if df[w] / len(recs) < 0.05][:2]
        filler = rng.choice(FILLER)
        cases.append(Case("partial_overlap", "ما المشاريع التي تتناول " + " ".join(words + [filler]) + "؟", "abstain", meta={"filler": filler}))
    return cases
