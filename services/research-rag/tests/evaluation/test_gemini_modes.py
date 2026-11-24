"""Gemini ON vs OFF, REAL dataset, REAL GeminiProvider code (URL, headers, body, response parsing, retries, error mapping).

The Gemini *server* is a local fake (httpx.MockTransport): these tests prove how the application behaves around Gemini
(what it sends, what it accepts, what happens when Gemini is missing/failing/lying). They do NOT prove the quality of
Gemini's own text and they are NOT a live call to Google (see docs/GEMINI.md: live test = scripts/llm_smoke.py)."""
import json

import httpx
import pytest

from src.config.settings import ROOT
from src.data.loader import read_raw_rows, rows_to_records
from src.data.supervisors import apply_display_map, canonical_display_map
from src.rag.answer import AnswerService
from src.rag.llm import GeminiProvider, get_provider
from src.retrieval.embeddings import HashingEmbedder
from src.service import build_services
from tests.conftest import make_settings

RAW = ROOT / "data" / "raw" / "Project.xlsx"
pytestmark = [pytest.mark.realdata, pytest.mark.skipif(not RAW.exists(), reason="data/raw/Project.xlsx not present")]
TOPIC_Q = "Which projects deal with banking service quality?"
KEY = "TEST-KEY-NOT-A-REAL-KEY"


class FakeGemini:
    """Records every request and answers like the Gemini REST API (Interactions API)."""

    def __init__(self, text="Records [R1] concern this topic.", status=200, error=None):
        self.requests, self.text, self.status, self.error = [], text, status, error

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if self.error:
            raise self.error
        self.requests.append(request)
        if self.status != 200:
            return httpx.Response(self.status, json={"error": {"message": "API key not valid. Please pass a valid API key." if self.status == 400 else "x"}})
        return httpx.Response(200, json={"status": "completed", "steps": [{"type": "model_output", "content": [{"type": "text", "text": self.text}]}]})

    @property
    def transport(self):
        return httpx.MockTransport(self)

    def body(self, i=0):
        return json.loads(self.requests[i].content)


@pytest.fixture(scope="module")
def sv(tmp_path_factory):
    _, rows, _ = read_raw_rows(RAW)
    recs, _ = rows_to_records(rows, min_year=1950, max_year=2100)
    apply_display_map(recs, canonical_display_map(recs))
    s = build_services(make_settings(tmp_path_factory.mktemp("gem"), llm_provider="gemini", llm_model="gemini-test", llm_api_key=KEY,
                                     llm_max_retries=0), load=False, embedder=HashingEmbedder(256))
    s.indexer.full_rebuild(recs)
    s.engine.load()
    return s


def svc_with(sv, fake, **over):
    s = sv.settings.model_copy(update=over)
    prov = get_provider(s, transport=fake.transport)
    assert prov is None or isinstance(prov, GeminiProvider)
    return AnswerService(sv.engine, prov, s), prov


# ------------------------------------------------------------------------------- Gemini ENABLED
def test_enabled_gemini_generates_the_answer_from_retrieved_records_only(sv):
    fake = FakeGemini()
    a, prov = svc_with(sv, fake)
    r = a.ask(TOPIC_Q)
    assert prov.name == "gemini" and len(fake.requests) == 1
    assert r.status == "ok" and r.generated_by == "llm" and r.citations_valid is True
    req = fake.requests[0]
    assert req.url.path.endswith("/v1beta/interactions")
    assert req.headers["x-goog-api-key"] == KEY and KEY not in str(req.url)       # key in a header, never in the URL
    body = fake.body()
    prompt = body["input"]
    sys_prompt = body["system_instruction"].lower()
    assert body["store"] is False
    assert "<record ref=\"R1\"" in prompt and "supervisors:" not in prompt         # records only; names withheld by default
    assert "use only the information" in sys_prompt and "never invent" in sys_prompt and "not available in the catalogue" in sys_prompt
    retrieved_titles = {s_.title for s_ in r.sources}
    assert retrieved_titles and all(t in prompt for t in list(retrieved_titles)[:3])
    assert KEY not in json.dumps(r.model_dump(), default=str)                       # the key never reaches the response


def test_enabled_gemini_cannot_add_unsupported_facts(sv):
    for lie, problem in [("The study found that banking quality improves loyalty [R1].", "content_claim_not_in_metadata"),
                         ("هناك سجل [R1] نشر سنة 1987.", "unsupported_number:1987"),
                         ("سجل [R1] بعنوان «دراسة غير موجودة عن البيتكوين».", "unsupported_title")]:
        fake = FakeGemini(text=lie)
        a, _ = svc_with(sv, fake)
        r = a.ask(TOPIC_Q)
        assert len(fake.requests) == 1
        assert r.status == "answer_withheld" and r.generated_by == "catalog", lie
        assert problem in r.evidence.verification_problems and lie not in r.answer
        assert r.sources                                                              # the verified record list is still returned


def test_enabled_gemini_is_not_called_when_there_is_no_evidence(sv):
    for q in ("What were the findings of the quantum chemistry thesis on dinosaurs?", "ما نتائج دراسة عن الديناصورات في المصارف؟"):
        fake = FakeGemini()
        a, _ = svc_with(sv, fake)
        r = a.ask(q)
        assert fake.requests == [] and r.status in ("abstained", "answered_from_catalog"), q
        assert r.generated_by in (None, "catalog", "none") or r.status == "abstained"


def test_enabled_gemini_is_never_used_for_structured_questions(sv):
    fake = FakeGemini()
    a, _ = svc_with(sv, fake)
    for q in ("ما عنوان المشروع رقم 1113، وفي أي سنة تم نشره؟", "كم عدد المشروعات المسجلة في سنة 2023؟",
              "How many marketing projects were completed in 2023?", "ما نتائج المشروع رقم 1113؟"):
        a.ask(q)
    assert fake.requests == []


# ------------------------------------------------------------------------------- Gemini configured but UNAVAILABLE
@pytest.mark.parametrize("label,fake,over", [
    ("no key", FakeGemini(), dict(llm_api_key="")),
    ("key rejected (HTTP 400)", FakeGemini(status=400), {}),
    ("key rejected (HTTP 403)", FakeGemini(status=403), {}),
    ("quota (HTTP 429)", FakeGemini(status=429), {}),
    ("Google down (HTTP 503)", FakeGemini(status=503), {}),
    ("network error", FakeGemini(error=httpx.ConnectError("offline")), {}),
    ("timeout", FakeGemini(error=httpx.ReadTimeout("slow")), {}),
])
def test_gemini_unavailable_falls_back_to_the_retrieved_records_without_crashing(sv, label, fake, over):
    a, _ = svc_with(sv, fake, **over)
    r = a.ask(TOPIC_Q)
    assert r.status in ("llm_unavailable", "llm_error"), (label, r.status)      # not_configured vs a failed call: both graceful
    assert r.sources and r.answer, label                       # evidence still shown
    assert r.generated_by in ("catalog", None, "none")
    assert any(("language model" in w.lower()) or ("النموذج" in w) or ("LLM" in w) for w in r.warnings), (label, r.warnings)
    # structured operations are unaffected by the same broken configuration
    assert "2007" in a.ask("ما عنوان المشروع رقم 1113، وفي أي سنة تم نشره؟").answer
    assert "165" in a.ask("كم عدد المشروعات المسجلة في سنة 2023؟").answer


# ------------------------------------------------------------------------------- Gemini DISABLED
def test_disabled_gemini_answers_from_records_and_says_so(sv):
    s = sv.settings.model_copy(update=dict(llm_provider="none"))
    assert get_provider(s) is None
    r = AnswerService(sv.engine, None, s).ask(TOPIC_Q)
    assert r.status == "llm_unavailable" and r.sources
    assert "165" in AnswerService(sv.engine, None, s).ask("كم عدد المشروعات المسجلة في سنة 2023؟").answer
