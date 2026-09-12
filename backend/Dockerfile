FROM python:3.11-slim

# System deps for faiss, lightgbm, numpy, asyncpg
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Fixed cache path (not the default user-home one) so the model this image
# downloads below, as root, is still where appuser finds it at runtime after
# the chown near the bottom of this file.
ENV HF_HOME=/app/.cache/huggingface

# Install Python deps first (layer caching — only reruns if requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the sentence-transformer model used for real-time /search
# query embedding (app/ml/content/cbf_engine.py's _embed_query) at BUILD
# time, not first-request time: a cold model download from huggingface.co
# on the first real search could take minutes depending on Render's egress
# to that host, and — since search_by_text runs in a thread via
# asyncio.to_thread — a slow download there just makes that one request
# slow, but a slow download NOT wrapped like that (or before that fix
# shipped) blocked this whole worker's event loop, including /health, for
# as long as it took. Baking the model in removes the network dependency
# (and its variability) entirely; the to_thread fix is defense in depth for
# whatever's still synchronous (the actual CPU inference).
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

# Copy application code
COPY app/ ./app/

# Create the data dir — ML artifacts are mounted via Docker volume in local dev
# and are COPY'd in below for production builds where artifacts exist
RUN mkdir -p ./data/processed/models

# Copy pre-built ML artifacts if they exist (won't fail if dir is empty)
COPY data/ ./data/

# Non-root user for security
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Production: 2 workers. For local dev, docker-compose overrides this with --reload
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
