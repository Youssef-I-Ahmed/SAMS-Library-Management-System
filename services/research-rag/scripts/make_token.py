#!/usr/bin/env python
"""Mint a short-lived service JWT for local testing / the curl examples in docs/INTEGRATION.md.
Uses SERVICE_JWT_SECRET/ISSUER/AUDIENCE from the environment or .env. Production tokens are minted by Express.

    python scripts/make_token.py            # read token
    python scripts/make_token.py --admin    # admin token (scope rag:admin, role ADMIN)
"""
import argparse
import sys
import time
from pathlib import Path

import jwt

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.config.settings import get_settings  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--admin", action="store_true")
ap.add_argument("--ttl", type=int, default=300)
a = ap.parse_args()
s = get_settings()
if not s.service_jwt_secret or s.service_jwt_secret.startswith("change-me"):
    sys.exit("Set a real SERVICE_JWT_SECRET first (e.g. `openssl rand -hex 32`).")
n = int(time.time())
claims = {"iss": s.service_jwt_issuer, "aud": s.service_jwt_audience, "sub": "dev-user", "iat": n, "exp": n + min(a.ttl, 600),
          "scope": "rag:read rag:admin" if a.admin else "rag:read", "role": "ADMIN" if a.admin else "USER"}
print(jwt.encode(claims, s.service_jwt_secret, algorithm="HS256"))
