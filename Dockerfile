# Galla: one container serving the FastAPI backend + built React UI + follow-up scheduler.
# Build:  docker build -t galla .
# Run:    docker run --env-file .env -p 8000:8000 galla

# ---------- 1. build the React frontend ----------
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
# `npm install` (not `npm ci`): the lockfile is generated on macOS and lacks some Linux-only optional
# packages (@emnapi/* for the bundler), which makes `npm ci` refuse. Versions still follow the lockfile.
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---------- 2. Python runtime ----------
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install -r requirements.txt
COPY backend/ backend/
COPY --from=web /web/dist web/dist

# SQLite lives at /app/galla.db by default (resets on redeploy).
# For persistence, mount a volume at /data and set DB_PATH=/data/galla.db.
# Runs as root so platform volumes (e.g. Railway) are writable without extra config.
EXPOSE 8000
# PaaS hosts inject $PORT; proxy headers keep https URLs correct behind their load balancer.
CMD ["sh", "-c", "exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
