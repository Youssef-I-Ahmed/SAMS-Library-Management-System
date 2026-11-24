"""v16: a question naming an author the catalog spells differently lists every book of that author (not the closest N)."""
from sams_rag.answer import author_list
from sams_rag.catalog import books_df


def _ids(name):
    return [b for b, a in zip(books_df.index, books_df["authors"]) if name in a]


def test_misspelled_names_list_every_book_of_the_authors():
    used = _ids("نيفين غراب") + _ids("مكرم عبد المسيح باسيلى")[:2]
    names, ids = author_list("كتب دكتور نفين مكرم", used)
    assert set(names) == {"نيفين غراب", "مكرم عبد المسيح باسيلى"}
    assert set(ids) == set(_ids("نيفين غراب")) | set(_ids("مكرم عبد المسيح باسيلى"))
    assert not set(ids) & set(_ids("نيفين كمال حامد")) - set(_ids("نيفين غراب"))   # another نيفين is not added


def test_a_book_by_someone_else_means_not_an_author_question():
    other = next(b for b, a in zip(books_df.index, books_df["authors"]) if "نيفين غراب" not in a and "مكرم" not in str(a))
    assert author_list("كتب دكتور نفين مكرم", _ids("نيفين غراب") + [other]) is None


def test_topic_words_do_not_match_author_names():
    assert author_list("كتب عن التسويق", _ids("نيفين غراب")) is None
    assert author_list("كتب دكتور", _ids("نيفين غراب")) is None          # title words alone are not a name


def test_prompt_has_the_misspelled_author_rule():
    # v16: an author name not in the catalog -> say so clearly and list close names (no refusal); variants = same name
    from sams_rag.generation import SYSTEM_PROMPT
    assert "13. If the user asks for books by an author" in SYSTEM_PROMPT
    assert "Spelling variants are the SAME name" in SYSTEM_PROMPT and "see rule 13 first" in SYSTEM_PROMPT
