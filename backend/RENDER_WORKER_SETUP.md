# Setting up the Celery worker on Render

This is dashboard-only work — nothing here can be done via API/CLI from
this repo, so these are exact click-by-click steps.

The worker runs `app/tasks/celery_tasks.py`'s three scheduled jobs (nightly
interaction-matrix rebuild + ALS retrain, weekly new-product embedding,
10-minutely stale-cache flush) using `backend/Dockerfile.worker`. It's a
**separate, always-on paid Render service** from the existing web service —
Render's free tier doesn't support Background Workers.

## 1. Redis — required, and not just for this

The web service's `/search`/`/recommend` caching and this worker's
`flush_stale_cache` job both need a **real** `REDIS_URL`. If you haven't set
one on the web service yet, `REDIS_URL` there is currently defaulting to
`redis://localhost:6379/0` (see `backend/app/db/database.py`), which doesn't
exist in Render's container — caching has been silently disabled in
production this whole time (harmless: every `cache_get`/`cache_set` call is
wrapped in try/except and no-ops on failure, so nothing crashes, it's just
not caching).

Cheapest fix — Upstash (free tier, serverless Redis, already documented in
`backend/.env.example`):

1. Go to **upstash.com** → sign in (GitHub SSO is fine) → **Create Database**.
2. Name it anything (e.g. `zepto-cache`), pick a region close to your
   Render/Supabase region (`ap-south-1`-adjacent if available), **Create**.
3. On the database's page, copy the **`rediss://` connection string** shown
   under "Connect" (note the extra `s` — TLS).
4. Add it as `REDIS_URL` on **both** the existing web service and the new
   worker service (step 3 below has the worker's env var list).

## 2. Create the Background Worker service

1. Render dashboard → **New +** → **Background Worker**.
2. **Connect a repository** → pick `chapranishika/zepto-intelligent-commerce`
   (same repo as the web service).
3. Configure:
   - **Name**: `zepto-worker` (or anything)
   - **Region**: same as the web service (keeps DB/Redis latency low)
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Docker`
   - **Dockerfile Path**: `backend/Dockerfile.worker` (Render may show this
     relative to Root Directory — if so, just `Dockerfile.worker`)
   - **Instance Type**: at least the smallest **paid** tier — sentence-
     transformers/torch need more RAM than the free tier's 512MB allows
     comfortably alongside `implicit`'s training step. Start on the
     cheapest paid tier and watch the Logs tab after the first nightly run;
     bump it if you see OOM kills.
4. **Environment Variables** (Environment tab), add:
   - `DATABASE_URL` — same value as the web service's (Supabase transaction
     pooler URL)
   - `REDIS_URL` — the Upstash `rediss://...` URL from step 1
   - `OPENBLAS_NUM_THREADS` = `1`
   - `OMP_NUM_THREADS` = `1`
   (No `SUPABASE_JWT_SECRET`/`SUPABASE_URL`/`ANTHROPIC_API_KEY` needed — the
   worker never verifies JWTs or calls the LLM.)
5. **Create Background Worker**. First build will take longer than the web
   service's (torch download) — expect several minutes.

## 3. Verify it's actually running

Render's Logs tab for the worker service should show Celery's startup
banner (`[tasks]` listing `app.tasks.celery_tasks.rebuild_interaction_matrix`,
`...refresh_product_embeddings`, `...flush_stale_cache`) and, within ~10
minutes, a `flush_stale_cache` beat tick (`Received task: ...flush_stale_cache`)
since that one runs every 10 minutes — that's the fastest way to confirm
beat + worker are both alive without waiting for the nightly/weekly jobs.

## 4. A persistent disk matters for the retrained artifacts

`rebuild_interaction_matrix`/`refresh_product_embeddings` write back into
`data/processed/models/` inside the worker's container — on Render, a
container's local filesystem is ephemeral (wiped on every redeploy/restart).
Without a persistent disk, every deploy silently reverts the worker back to
the artifacts baked into the image at build time, discarding retraining
between deploys (not between restarts of the *same* deploy — just across
redeploys). If you want retraining to actually accumulate over time:
**Settings → Disks → Add Disk**, mount path `/app/data`, and re-deploy.
This is optional to get the worker running at all — it only matters for
retraining to compound rather than reset on each deploy.
