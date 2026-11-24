"""v16: a book the answer names in bold without its [S#] tag is still shown (only added, never removed)."""
import pandas as pd

from sams_rag.answer import _books_used, _named_without_tag

TITLES = ["Designing Organizations: Strategy, Structure, and Process", "Strategize", "Public administration",
          "Management: An Introduction", "Organizational behavior"]
PACKAGE = {"num_sources": 5, "sources": pd.DataFrame({"source": [f"S{i}" for i in range(1, 6)], "title": TITLES})}


def _out(answer, cited):
    inferred = _named_without_tag(answer, PACKAGE, cited)
    return {"package": PACKAGE, "citations": {"cited": cited, "inferred": inferred, "is_refusal": False}}


def test_one_word_title_named_in_bold_comes_back():
    a = ("1. **Designing Organizations** by Galbraith [S1]\n2. **Strategize**, by Siciliano\n"
         "3. **Public administration** [S3]")
    assert _books_used(_out(a, ["S1", "S3"])) == ["S1", "S2", "S3"]


def test_one_word_in_bold_is_not_a_longer_title():
    a = "Books in **Management** and **Strategy**: **Public administration** [S3]"
    assert _books_used(_out(a, ["S3"])) == ["S3"]          # not S4 (Management: ...), not S2 (Strategize)


def test_long_title_close_enough_comes_back():
    a = "**Public administration** [S3] and **Organizational behaviour** by McShane"
    assert _books_used(_out(a, ["S3"])) == ["S3", "S5"]


def test_nothing_changes_when_every_book_is_tagged():
    a = "**Strategize** [S2] and **Public administration** [S3]"
    assert _books_used(_out(a, ["S2", "S3"])) == ["S2", "S3"]


def test_text_not_in_bold_is_not_used():
    a = "**Public administration** [S3]; see also Strategize."
    assert _books_used(_out(a, ["S3"])) == ["S3"]
