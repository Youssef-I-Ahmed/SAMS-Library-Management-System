from __future__ import annotations

import re
import sys
import time
from pathlib import Path
from typing import Any

# Ensure Python can find the project modules when this file is run directly.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import src.rag.answer as answer_module
from src.config.settings import get_settings
from src.rag.answer import AnswerService
from src.rag.llm import get_provider
from src.service import build_services


_verification_runs: list[dict[str, Any]] = []


def _citation_ids(text: str) -> set[str]:
    """Extract citation IDs such as R1 and R12."""
    return {
        f"R{match.group(1)}"
        for match in re.finditer(
            r"\[\s*R\s*(\d+)",
            text or "",
            flags=re.IGNORECASE,
        )
    }


def _install_verifier_diagnostics() -> None:
    """Record verification metadata without changing verification policy."""
    original_verify = answer_module.verify_answer

    def diagnostic_verify(text, *args, **kwargs):
        result = original_verify(text, *args, **kwargs)

        from src.rag.evidence import (
            _CITE,
            _SENT_SPLIT,
            _is_neutral_catalog_intro,
            normalize_text,
        )

        sentence_diagnostics: list[dict[str, Any]] = []

        sentences = (
            part
            for part in _SENT_SPLIT.split(text or "")
            if part.strip()
        )

        for index, sentence in enumerate(sentences, start=1):
            normalized = (
                f" {normalize_text(_CITE.sub(' ', sentence))} "
            )
            words = normalized.split()
            has_citation = bool(_CITE.search(sentence))
            neutral_intro = _is_neutral_catalog_intro(sentence)

            if (
                not has_citation
                and len(words) > 4
                and not neutral_intro
            ):
                sentence_diagnostics.append(
                    {
                        "sentence_number": index,
                        "word_count": len(words),
                        "has_citation": has_citation,
                        "neutral_intro": neutral_intro,
                    }
                )

        _verification_runs.append(
            {
                "raw_character_count": len(text or ""),
                "raw_citation_ids": sorted(
                    _citation_ids(text or "")
                ),
                "verification_ok": bool(result.ok),
                "verification_problems": list(result.problems),
                "verified_citation_ids": sorted(
                    f"R{number}" for number in result.cited
                ),
                "clean_character_count": len(
                    result.clean_text or ""
                ),
                "uncited_sentence_diagnostics": sentence_diagnostics,
            }
        )

        return result

    answer_module.verify_answer = diagnostic_verify


def _language(question: str) -> str:
    return (
        "Arabic"
        if any("\u0600" <= char <= "\u06ff" for char in question)
        else "English"
    )


def _source_refs(response) -> set[str]:
    """Collect source references without exposing record contents."""
    refs: set[str] = set()

    sources = (
        list(getattr(response, "retrieved", []) or [])
        + list(getattr(response, "sources", []) or [])
    )

    for source in sources:
        ref = getattr(source, "ref", None)
        if ref is not None:
            refs.add(str(ref))

    return refs


def _citations_match_sources(
    citation_ids: set[str],
    source_refs: set[str],
) -> bool:
    """Check whether every citation refers to a retrieved source."""
    if not citation_ids:
        return False

    normalized_refs = {
        ref.upper() if ref.upper().startswith("R") else f"R{ref}"
        for ref in source_refs
    }

    return citation_ids.issubset(normalized_refs)


def main() -> int:
    settings = get_settings()
    provider = get_provider(settings)

    if provider is None:
        print(
            "NOT TESTED: no LLM provider is configured "
            f"(LLM_PROVIDER={getattr(settings, 'llm_provider', None)!r}). "
            "Set LLM_PROVIDER, LLM_MODEL and LLM_API_KEY to run this check. "
            "The core application (exact-ID lookup, counts, filters, search) does not need an LLM."
        )
        return 2

    services = build_services(settings)
    service = AnswerService(
        services.engine,
        provider,
        settings,
    )

    _install_verifier_diagnostics()

    results: list[tuple[str, bool]] = []

    questions = [
        (
            "Arabic",
            "ما هي المشروعات المتعلقة بالتسويق الإلكتروني؟",
        ),
        (
            "English",
            "Which projects deal with banking service quality?",
        ),
    ]

    for language, question in questions:
        before_count = len(_verification_runs)
        started = time.perf_counter()

        try:
            response = service.ask(question)
        except Exception as exc:
            elapsed_ms = round(
                (time.perf_counter() - started) * 1000
            )

            print(
                {
                    "question_language": language,
                    "exception_type": type(exc).__name__,
                    "elapsed_ms": elapsed_ms,
                    "exception": str(exc)[:200],
                }
            )

            results.append(
                (f"answer call completed ({language})", False)
            )
            continue

        elapsed_ms = round(
            (time.perf_counter() - started) * 1000
        )

        diagnostic = (
            _verification_runs[-1]
            if len(_verification_runs) > before_count
            else None
        )

        retrieved_refs = _source_refs(response)

        raw_citations = (
            set(diagnostic["raw_citation_ids"])
            if diagnostic is not None
            else set()
        )

        citation_match = _citations_match_sources(
            raw_citations,
            retrieved_refs,
        )

        generated_by_llm = (
            getattr(response, "generated_by", None) == "llm"
        )

        results.append(
            (
                f"generated_by == llm ({language})",
                generated_by_llm,
            )
        )

        results.append(
            (
                f"raw citations refer to retrieved sources ({language})",
                citation_match,
            )
        )

        results.append(
            (
                f"original answer validation passed ({language})",
                diagnostic is not None
                and diagnostic["verification_ok"]
                and not diagnostic["verification_problems"],
            )
        )

        llm_info = getattr(response, "llm", None)
        evidence = getattr(response, "evidence", None)

        print(
            {
                "question_language": language,
                "generated_by": getattr(
                    response, "generated_by", None
                ),
                "status": getattr(response, "status", None),
                "final_verification_problems": getattr(
                    evidence,
                    "verification_problems",
                    [],
                ),
                "source_count": len(
                    getattr(response, "sources", []) or []
                ),
                "retrieved_ref_count": len(retrieved_refs),
                "latency_ms": (
                    getattr(llm_info, "latency_ms", None)
                    if llm_info is not None
                    else None
                ),
                "error_kind": (
                    getattr(llm_info, "error_kind", None)
                    if llm_info is not None
                    else None
                ),
                "elapsed_ms": elapsed_ms,
                "citation_match": citation_match,
                "original_answer_diagnostics": diagnostic,
            }
        )

    # Check that unsupported findings are not invented.
    findings_question = (
        "List any findings that are not supported by the retrieved records."
    )

    try:
        findings_response = service.ask(findings_question)

        findings_not_answered = (
            getattr(findings_response, "generated_by", None) != "llm"
            or getattr(findings_response, "status", None)
            in {"answer_withheld", "llm_error", "no_answer"}
        )
    except Exception:
        findings_not_answered = True

    results.append(
        (
            "findings question is not answered by the LLM",
            findings_not_answered,
        )
    )

    for label, passed in results:
        print(f"{'PASS' if passed else 'FAIL'} {label}")

    passed_count = sum(passed for _, passed in results)
    failed_count = len(results) - passed_count

    print(
        {
            "provider": getattr(settings, "llm_provider", None),
            "model": getattr(settings, "llm_model", None),
            "passed": passed_count,
            "failed": failed_count,
        }
    )

    return 0 if failed_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())