#!/usr/bin/env python
"""Browser check of the running Streamlit app (Playwright + Chromium): desktop / tablet / phone viewports, Arabic RTL and
English LTR, navigation, language toggle, assistant (AR + EN exact-ID, count, no-match, unsupported), project search,
details, statistics, about. Writes screenshots and a JSON report; exit code 1 if any check fails.

    streamlit run app.py --server.port 8765 --server.headless true &
    python scripts/ui_check.py --url http://localhost:8765 --out ui_report

Requires:  pip install playwright && playwright install chromium     (a check that cannot run is reported, never faked)
The expected values (#1113 -> 2007, 2023 -> 165) are read from the workbook, not typed in, when it is present.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIEWPORTS = {"desktop": (1440, 900), "tablet": (820, 1100), "phone": (390, 844)}
NAV = {"ar": {"assistant": "المساعد الذكي", "search": "البحث في المشروعات", "stats": "الإحصائيات", "about": "المصادر وحول المشروع", "home": "الصفحة الرئيسية"},
       "en": {"assistant": "Smart Assistant", "search": "Project Search", "stats": "Statistics", "about": "Sources & About", "home": "Home"}}


def expected_from_workbook() -> dict:
    out = {"title": "Development and analysis of sadat academy's Digital library", "year": "2007", "count2023": None}
    x = ROOT / "data" / "raw" / "Project.xlsx"
    if x.exists():
        import openpyxl
        rows = list(openpyxl.load_workbook(x, read_only=True).worksheets[0].iter_rows(values_only=True))
        for r in rows[1:]:
            if str(r[0]).strip() == "1113":
                out["title"], out["year"] = str(r[1]).strip(), str(r[4]).strip()
        out["count2023"] = str(sum(1 for r in rows[1:] if str(r[4]).strip() == "2023"))
        y23 = [r for r in rows[1:] if str(r[4]).strip() == "2023"]
        hay = lambda r: (str(r[1]) + " | " + str(r[8])).lower()   # noqa: E731
        out["mkt_subject"] = str(sum(1 for r in y23 if "تسويق" in str(r[8])))
        out["mkt_mention"] = str(sum(1 for r in y23 if "market" in hay(r) or "تسويق" in hay(r)))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8765")
    ap.add_argument("--out", default="ui_report")
    ap.add_argument("--viewports", default="desktop,tablet,phone")
    a = ap.parse_args()
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("NOT TESTED: playwright is not installed (pip install playwright && playwright install chromium)")
        return 2
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    exp = expected_from_workbook()
    results: list[dict] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        results.append({"check": name, "ok": bool(ok), "detail": detail})
        print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""))

    with sync_playwright() as p:
        browser = p.chromium.launch()
        for vp in a.viewports.split(","):
            w, h = VIEWPORTS[vp]
            for lang in ("ar", "en"):
                if lang == "en" and vp == "tablet":
                    continue
                tag = f"{vp}/{lang}"
                pg = browser.new_page(viewport={"width": w, "height": h})
                pg.goto(a.url)
                pg.wait_for_selector(".hero", timeout=90000)
                pg.wait_for_timeout(1200)

                def overflow() -> int:
                    return pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")

                def shot(name: str) -> None:
                    pg.screenshot(path=str(out / f"{vp}_{lang}_{name}.png"), full_page=True)

                def go(page: str) -> None:
                    label = NAV[lang][page]
                    scope = ".st-key-topnav " if w <= 1000 else '[data-testid="stSidebar"] '   # narrow screens use the top bar
                    loc = pg.locator(f'{scope}[data-testid="stRadioOption"]:has-text("{label}")').first
                    loc.click()
                    pg.wait_for_timeout(1500)

                if lang == "en":
                    pg.locator('.st-key-topbar [data-testid="stRadioOption"]:has-text("English")').click()
                    pg.wait_for_timeout(1800)
                d = pg.evaluate("getComputedStyle(document.querySelector('.block-container')).direction")
                check(f"{tag} language toggle sets direction", d == ("rtl" if lang == "ar" else "ltr"), d)
                check(f"{tag} home: stat cards from the database", pg.locator(".stat").count() == 4 and "3,983" in pg.inner_text(".stats"), pg.inner_text(".stats")[:80])
                check(f"{tag} home: no horizontal overflow", overflow() <= 1, str(overflow()))
                shot("home")

                # ---- assistant
                go("assistant")
                box = pg.get_by_role("textbox").last
                q_id = "ما عنوان المشروع رقم 1113، وفي أي سنة تم نشره؟" if lang == "ar" else "What is the title of project number 1113 and in which year was it published?"
                box.fill(q_id)
                pg.keyboard.press("Enter")
                pg.wait_for_selector(".answer", timeout=30000)
                txt = pg.inner_text(".answer")
                check(f"{tag} assistant: #1113 answer has exact title+year", exp["title"] in txt and exp["year"] in txt, txt[:160])
                check(f"{tag} assistant: source card is #1113", "1113" in pg.inner_text(".card"))
                check(f"{tag} assistant: no overflow", overflow() <= 1, str(overflow()))
                shot("assistant_id")
                for q, must, name in [
                    ("كم عدد المشروعات المسجلة في سنة 2023؟" if lang == "ar" else "How many projects were registered in 2023?", exp["count2023"], "count"),
                    ("كم عدد مشروعات التسويق في سنة 2023؟" if lang == "ar" else "How many marketing projects were completed in 2023?", exp.get("mkt_subject"), "topic"),
                    ("ما عنوان المشروع رقم 99999؟" if lang == "ar" else "What is the title of project number 99999?", None, "nomatch"),
                    ("ما نتائج المشروع رقم 1113؟" if lang == "ar" else "What were the findings of project number 1113?", None, "unavailable")]:
                    pg.get_by_role("textbox").last.fill(q)
                    pg.keyboard.press("Enter")
                    pg.wait_for_timeout(2500)
                    last = pg.locator(".answer").last.inner_text()
                    if name == "count" and must:
                        check(f"{tag} assistant: 2023 count = workbook ({must})", must in last, last[:120])
                    elif name == "topic" and must:
                        check(f"{tag} assistant: marketing+2023 = subject {must} / title-or-subject {exp['mkt_mention']} (workbook)",
                              re.search(rf"(?<!\d){must}(?!\d)", last) is not None and re.search(rf"(?<!\d){exp['mkt_mention']}(?!\d)", last) is not None, last[:200])
                    elif name == "nomatch":
                        check(f"{tag} assistant: nonexistent id -> no match, no substitute", ("لا يوجد مشروع برقم 99999" in last) or ("no project with number 99999" in last), last[:120])
                    else:
                        check(f"{tag} assistant: unsupported info -> stated as unavailable", re.search(r"غير متوفر|not part of the dataset", last) is not None and "Development" in last, last[:160])
                shot("assistant_all")
                check(f"{tag} assistant: no overflow after 5 answers", overflow() <= 1, str(overflow()))

                # ---- search by number -> details
                go("search")
                pg.locator('input[aria-label="' + ("رقم المشروع" if lang == "ar" else "Project number") + '"]').fill("1113")
                pg.get_by_role("button", name=re.compile("بحث$|^Search$")).first.click()
                pg.wait_for_timeout(2500)
                body = pg.inner_text("body")
                check(f"{tag} search: exact number shows the record", exp["title"] in body)
                check(f"{tag} search: no overflow", overflow() <= 1, str(overflow()))
                shot("search_id")
                pg.get_by_role("button", name=re.compile("عرض التفاصيل|View details")).first.click()
                pg.wait_for_timeout(2000)
                body = pg.inner_text("body")
                check(f"{tag} details: stored fields shown", exp["title"] in body and exp["year"] in body and ("غير متوفرة في مجموعة البيانات" in body or "not part of the current dataset" in body))
                check(f"{tag} details: no overflow", overflow() <= 1, str(overflow()))
                shot("details")

                # ---- statistics
                go("stats")
                try:
                    pg.wait_for_selector(".vega-embed, canvas", timeout=20000)   # wait for the charts instead of a fixed sleep
                except Exception:  # noqa: BLE001 - the check below reports the failure
                    pass
                pg.wait_for_timeout(1500)
                check(f"{tag} stats: charts rendered", pg.locator(".vega-embed, canvas").count() >= 2, str(pg.locator(".vega-embed, canvas").count()))
                check(f"{tag} stats: no overflow", overflow() <= 1, str(overflow()))
                shot("stats")
                # ---- about
                go("about")
                check(f"{tag} about: renders", ("MD" not in pg.inner_text("body")) and len(pg.inner_text("body")) > 400)
                check(f"{tag} about: no overflow", overflow() <= 1, str(overflow()))
                shot("about")
                pg.close()
        browser.close()
    (out / "report.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    bad = [r for r in results if not r["ok"]]
    print(f"\n{len(results) - len(bad)}/{len(results)} UI checks passed")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
