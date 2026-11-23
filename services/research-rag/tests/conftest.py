"""Shared fixtures. The synthetic corpus contains NO real people or student data; it mimics the real dataset's
quirks: '|' multi-supervisors, title prefixes (د/), alef/ya/ta-marbuta spelling variants, repeated titles with
different attributes, missing / invalid fields, English titles, and one supervisor with >100 records (pagination)."""
from __future__ import annotations

import time
from pathlib import Path

import jwt
import pytest
from fastapi.testclient import TestClient

from api.main import create_app
from src.config.settings import Settings
from src.data.loader import rows_to_records
from src.data.supervisors import apply_display_map, canonical_display_map
from src.rag.answer import AnswerService
from src.rag.llm import LLMError, LLMProvider, LLMResult
from src.retrieval.embeddings import HashingEmbedder
from src.service import build_services

SECRET = "t" * 48

_COLS = ["BOOK_CODE", "TITLE", "Students", "Supervisor", "WORK | PUBLISHING_DATE", "WORK | CALL_NUM",
         "WORK | EXTENT", "WORK | DIMENSION", "SUBJECTS_ALL"]


def row(i, title, sup="NA", year="2010", subj="بنوك", students="NA", call="332", ext="NA", dim="NA"):
    return dict(zip(_COLS, [str(i), title, students, sup, str(year), call, ext, dim, subj]))


def synthetic_rows() -> list[dict]:
    r = [
        row(1, "دور الجهاز المصرفى فى منح التسهيلات الائتمانية", "سامي منصور | ليلى حسن", 2003, "بنوك", "طالب أ | طالب ب", ext="198 ص"),
        row(2, "الاندماج المصرفى", "د/ سامي منصور", 2009, "بنوك"),
        row(3, "الاندماج المصرفى", "ليلى حسن", 2012, "بنوك"),              # same title, different year/supervisor
        row(4, "الإندماج المصرفي", "سامى منصور", 2010, "بنوك"),             # spelling variant of the same title
        row(5, "أثر التكنولوجيا على الخدمات المصرفية", "د/ سامي منصور | د/ ليلى حسن", 2004, "بنوك"),
        row(6, "تأثير الأزمات السياسية على أسواق البترول العالمية", "ليلى حسين", 2006, "بترول", call="338.27"),  # similar but DIFFERENT person
        row(7, "الغاز الطبيعى كمصدر للطاقة", "نادر فتحي", 2016, "بترول", call="338.27"),
        row(8, "إدارة الموارد البشرية كميزة تنافسية", "منى رشاد", 2011, "موارد بشرية", call="658.3"),
        row(9, "ضغوط العمل واثرها على الرضا الوظيفى", "د/منى رشاد", 2012, "موارد بشرية", call="658.3"),
        row(10, "Internet Security", "نادر فتحي", 2005, "حاسب آلى", call="004", ext="85ص", dim="30*20 سم"),
        row(11, "The Impact of Social Media on Consumer Buying Behavior", "منى رشاد", 2019, "تسويق وتجارة إلكترونية", call="658.8"),
        row(12, "the effect of social media advertisement on consumer behavior", "نادر فتحي", 2020, "تسويق وتجارة إلكترونية", call="658.8"),
        row(13, "Online Banking System", "NA", 2009, "حاسب آلى", call="004"),     # no supervisor
        row(14, "تقييم الأداء المالي للشركات", "سامي منصور", "NA", "NA"),          # no year, no subject
        row(15, "تحليل مالي للبنوك", "سامي منصور", 2103, "بنوك"),                # invalid year
        row(16, "حاسب آلي وأمن المعلومات   في البنوك", "نادر فتحي", 2015, "حاسب آلى | بنوك", call="004"),  # multi-subject + spaces
        row(17, "الاستثمار في سوق الأوراق المالية", "ريم عادل", 2013, "تمويل واستثمار", call="332.6"),
        row(18, "الاستثمار فى سوق الاوراق المالية", "ريم عادل", 2013, "تمويل واستثمار", call="332.6"),   # likely duplicate entry
        row("ب19", "دور صناديق الاستثمار فى تطوير أسواق المال", "ريم عادل | نادر فتحي", 2014, "تمويل واستثمار"),
    ]
    # one prolific supervisor with 130 records -> pagination / completeness tests
    topics = ["التسويق الرقمى", "إدارة المخاطر", "الحوكمة", "التمويل الإسلامى", "الابتكار", "سلاسل الإمداد", "ريادة الأعمال",
              "الجودة الشاملة", "التحول الرقمى", "المسؤولية الاجتماعية"]
    sectors = ["البنوك", "الشركات الصغيرة", "قطاع الطاقة", "الجامعات", "المستشفيات", "شركات التأمين", "السياحة", "الصناعة",
               "التعليم الفنى", "التجارة الخارجية", "النقل", "الاتصالات", "العقارات"]
    n = 100
    for t in topics:
        for s in sectors:
            r.append(row(n, f"{t} فى {s}", "د/ كريم فؤاد" if n % 2 else "كريم فؤاد", 2000 + (n % 26), "إدارة أعمال دولية", call="658.4"))
            n += 1
    return r


@pytest.fixture(scope="session")
def rows() -> list[dict]:
    return synthetic_rows()


@pytest.fixture()
def records(rows):
    recs, rej = rows_to_records(rows)
    assert not rej
    apply_display_map(recs, canonical_display_map(recs))
    return recs


def make_settings(tmp_path: Path, **kw) -> Settings:
    d = dict(database_url=f"sqlite:///{tmp_path / 'rag.db'}", hashing_dim=256, service_jwt_secret=SECRET,
             refresh_interval_s=0.0, supervisor_aliases_path=tmp_path / "none.csv")
    d.update(kw)
    return Settings(_env_file=None, **d)


@pytest.fixture()
def settings(tmp_path):
    return make_settings(tmp_path)


@pytest.fixture()
def svc(settings, records):
    s = build_services(settings, load=False, embedder=HashingEmbedder(256))
    s.indexer.full_rebuild(records)
    s.engine.load()
    return s


@pytest.fixture()
def engine(svc):
    return svc.engine


class FakeLLM(LLMProvider):
    """Scripted provider: returns `reply`, or raises LLMError(kind)."""
    name = "fake"

    def __init__(self, reply: str | None = None, error: str | None = None):
        super().__init__("fake-model", "k", "", 5, 0)
        self.reply, self.error, self.calls = reply, error, 0

    def generate(self, system, user, max_tokens=1024, temperature=0.1):
        self.calls += 1
        self.last_user = user
        if self.error:
            raise LLMError(self.error, f"simulated {self.error}")
        return LLMResult(self.reply, "fake", "fake-model", 1)


@pytest.fixture()
def fake_llm():
    return FakeLLM


@pytest.fixture()
def answers(svc):
    return AnswerService(svc.engine, None, svc.settings)


def token(settings: Settings, scope="rag:read", role=None, ttl=60, **over) -> dict:
    n = int(time.time())
    claims = {"iss": settings.service_jwt_issuer, "aud": settings.service_jwt_audience, "sub": "user-1", "role": role,
              "scope": scope, "iat": n, "exp": n + ttl}
    claims.update(over)
    secret = over.pop("_secret", settings.service_jwt_secret) if False else settings.service_jwt_secret
    return {"Authorization": "Bearer " + jwt.encode({k: v for k, v in claims.items() if v is not None}, secret, algorithm="HS256")}


@pytest.fixture()
def client(svc):
    with TestClient(create_app(services=svc)) as c:
        c.settings = svc.settings
        c.svc = svc
        yield c


@pytest.fixture()
def read_h(client):
    return token(client.settings)


@pytest.fixture()
def admin_h(client):
    return token(client.settings, "rag:read rag:admin", "ADMIN")
