# Linux amd64 / CPython 3.12.16. No models, credentials, map or generated store.
FROM python:3.12-slim-bookworm@sha256:e697c81897302a4c4333bade000d98038fbb21eb064f8ee1fd42d02ebcd9d337
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 HF_HUB_DISABLE_TELEMETRY=1 \
    LLM_PROVIDER=extractive HOME=/tmp
WORKDIR /service
COPY requirements-linux.lock ./
RUN python -m pip install --no-cache-dir --require-hashes --only-binary=:all: -r requirements-linux.lock \
    && mkdir /store && chown 10001:10001 /store
COPY app/ ./app/
COPY sams_rag/ ./sams_rag/
COPY MODEL_PROVENANCE.json ./
USER 10001:10001
EXPOSE 8000
ENTRYPOINT ["python", "-m", "app.container_entry"]
