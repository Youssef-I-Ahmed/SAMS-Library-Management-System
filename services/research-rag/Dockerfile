# Standalone FastAPI RAG backend (no Streamlit). Build:  docker build -t sadat-rag .
# Registry-less environments: docker build --build-arg BASE_IMAGE=<locally available Python 3.13 image> ...
# Optional neural embeddings: docker build --build-arg WITH_EMBEDDINGS=1 -t sadat-rag .
ARG BASE_IMAGE=python:3.13-slim
FROM ${BASE_IMAGE}
ARG WITH_EMBEDDINGS=0
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt requirements-embeddings.txt ./
RUN pip install -r requirements.txt \
 && if [ "$WITH_EMBEDDINGS" = "1" ]; then pip install -r requirements-embeddings.txt; fi
COPY api ./api
COPY src ./src
COPY scripts ./scripts
# Precomputed passage embeddings (content-hash keyed, no names/text): avoids re-embedding 3,983 records at start-up
COPY data/cache ./data/cache
RUN useradd -m -u 10001 rag && mkdir -p /app/data/store /work && chown -R rag /app/data /work
USER rag
# Index/DB lives on a volume so it survives container restarts
VOLUME ["/app/data/store"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD python -c "import urllib.request,sys;sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=4).status==200 else 1)"
# --no-access-log: access logs would contain search query strings
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
