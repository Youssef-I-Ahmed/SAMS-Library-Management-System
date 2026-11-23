# Gemini Interactions API update

The Gemini provider now uses `POST https://generativelanguage.googleapis.com/v1beta/interactions` rather than the legacy `models/{model}:generateContent` route. Requests use `system_instruction`, `generation_config`, and `store: false` so prompts and outputs are not retained server-side by the Interactions service.

Default model: `gemini-3.8-flash`. `LLM_MODEL=auto` still resolves from the visible model list, but only selects a model on the Interactions API allowlist. The live check is `python scripts/gemini_check.py`; it makes actual Arabic and English generation calls and never prints the key.

This update does not alter retrieval, embeddings, dataset, API routes, auth, evidence verification, or the privacy settings that exclude student and supervisor names from Gemini prompts. A live Google call still must be run on a machine with internet access and the academy key.
