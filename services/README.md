# AI services

Each model or RAG is a separate Python service with its own virtualenv, port and
README. The web app never calls them directly: `apps/api` is the only client.

| Service | What it does | Origin | Port | Start (from the service folder) |
| --- | --- | --- | --- | --- |
| `book-rag` | Book search and grounded Q&A over the catalog | Zahraa (`sams-library-search`) + SAMS runtime | 8001 | `uvicorn app.main:app --port 8001` |
| `research-rag` | Projects / theses search and Q&A | Alaa (`AlaaResearchRag`) | 8002 | `uvicorn api.main:app --port 8002` |
| `subject-classifier` | Predicts the subject of a title (TF-IDF + Logistic Regression) | Alaa (`model_server_package`) | 8003 | `uvicorn server:app --port 8003` |
| `book-clustering` | Assigns a book to a topic cluster | Alaa (`book_clustering_project`) | 8004 | `uvicorn api:app --port 8004` |

## Common rules

- One virtualenv per service (`python -m venv .venv`, then `pip install -r requirements.txt`).
  The services pin different scikit-learn versions, so they must not share an environment.
- `GET /health` answers without a key. Every other endpoint requires the
  `X-Service-Key` header when the service's key variable is set (`SERVICE_API_KEY`,
  or `API_SERVICE_KEY` for book-rag; research-rag uses a service JWT).
- Settings come from each service's `.env` (copy `.env.example`). Secrets never go in git.
- Datasets live in the repository's `data/raw/` (git-ignored). Large model weights stay
  in each service's git-ignored `models/` folder; the two small trained models are committed.
- Tests: `python -m pytest -q` inside the service folder.

Training code, notebooks and experiment results live in `../ml/`, not here.
