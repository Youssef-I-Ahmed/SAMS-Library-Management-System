"""v13 cross-language expansion of topic questions (sams_rag/expansion.py)."""
import numpy as np

from sams_rag.expansion import expand_query, expansion_weight, should_expand
from sams_rag.text import normalize_text


def test_other_language_terms_are_added():
    assert "الحاسب" in expand_query("books about computer science")
    assert "computer" in expand_query("كتب عن الحاسب الآلي")
    assert "التسويق" in expand_query("كتب عن الـ Marketing الإلكتروني")


def test_no_expansion_for_authors_titles_or_unknown_words():
    no_titles = np.zeros(3, dtype=bool)
    assert not should_expand("كتب أحمد ماهر", {"detected_authors": ["أحمد ماهر"]}, no_titles, [])
    assert not should_expand("ادارة جودة الخدمة في الضيافة", {}, no_titles, [normalize_text("إدارة جودة الخدمة في الضيافة والفنادق")])
    assert not should_expand("x", {}, np.array([True]), [])
    assert expand_query("كتب عن الفلسفة اليونانية") == ""
    assert expand_query("income tax and sales tax laws") == "الضرائب"     # "sales" / "laws" are not expanded


def test_lower_weight_when_the_question_is_a_heading():
    assert expansion_weight("الضرائب", {"detected_topics": ["الضرائب"]}, 1.0, 0.3) == 0.3
    assert expansion_weight("how to be an effective leader", {"detected_topics": []}, 1.0, 0.3) == 1.0
