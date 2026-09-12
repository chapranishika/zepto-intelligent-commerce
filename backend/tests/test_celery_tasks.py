"""
tests/test_celery_tasks.py — Celery worker task tests.

These call celery_tasks.py's task FUNCTIONS directly (not through a real
Celery broker/worker) — each is a plain function decorated with
@celery_app.task, callable like any other function. Each one does its own
`asyncio.run(...)` internally (production-correct: a real Celery worker
process has no event loop of its own already running), which is exactly why
these are plain sync `def test_...` functions rather than `async def` ones —
running them under pytest-asyncio would leave a loop already running, and
`asyncio.run()` raises when called from inside one.

`implicit`, `sentence-transformers`, `faiss`, and `pyarrow` are only imported
*inside* the task functions (see celery_tasks.py), never at module import
time — so this whole file, and the module under test, import cleanly even
in the fast CI job that only installs requirements.txt. The tests that
actually exercise those code paths self-skip via `pytest.importorskip` when
requirements-worker.txt isn't installed; run `pip install -r
requirements-worker.txt` locally (or add a dedicated worker CI job) to run
them for real.
"""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture
def worker_db(monkeypatch):
    """
    A fresh, throwaway SQLite engine/sessionmaker patched in as
    app.db.database.AsyncSessionLocal, for exactly one task-function call.

    Deliberately NOT conftest.py's shared `test_engine`/`test_db` fixtures:
    those live inside a pytest-asyncio-managed event loop, while the task
    functions under test spin up their OWN event loop via `asyncio.run()` —
    reusing one aiosqlite engine across two different event loops is exactly
    the failure mode this sidesteps. Everything here — table creation, the
    task call, and teardown — runs inside its own fresh `asyncio.run()`.
    """
    import app.db.database as database
    from app.models.db_models import Base

    engine = create_async_engine(TEST_DB_URL, echo=False)
    session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async def _create_all():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    _run(_create_all())
    monkeypatch.setattr(database, "AsyncSessionLocal", session_factory)

    yield session_factory

    _run(engine.dispose())


def _insert(session_factory, obj):
    async def _do():
        async with session_factory() as s:
            s.add(obj)
            await s.commit()
    _run(_do())


# ── flush_stale_cache — no heavy deps, always runs ───────────────────────────

def test_flush_stale_cache_no_recent_purchases(worker_db, monkeypatch):
    """No purchase events in the last 15 minutes -> nothing to flush, no error."""
    from app.tasks.celery_tasks import flush_stale_cache
    import app.db.database as database

    monkeypatch.setattr(database, "get_redis", lambda: None)
    flush_stale_cache()  # should not raise even with no redis client and no rows


def test_flush_stale_cache_flushes_recent_purchasers(worker_db, monkeypatch):
    """A recent purchase event -> that user's rec cache key gets deleted."""
    from app.models.db_models import UserEvent
    from app.tasks.celery_tasks import flush_stale_cache
    import app.db.database as database

    user_id = "cccccccc-cccc-cccc-cccc-cccccccccccc"
    _insert(worker_db, UserEvent(
        user_id=user_id, event_type="purchase",
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    ))
    # An old purchase (outside the 15-minute window) must NOT be included.
    _insert(worker_db, UserEvent(
        user_id="dddddddd-dddd-dddd-dddd-dddddddddddd", event_type="purchase",
        created_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=2),
    ))

    deleted_keys = {}

    class FakeRedis:
        async def delete(self, *keys):
            deleted_keys["keys"] = keys

    monkeypatch.setattr(database, "get_redis", lambda: FakeRedis())
    flush_stale_cache()

    assert deleted_keys.get("keys") == (f"rec:{user_id}:20",)


# ── rebuild_interaction_matrix — guard paths need no heavy deps ──────────────

def test_rebuild_interaction_matrix_skips_with_no_events(worker_db):
    from app.tasks.celery_tasks import rebuild_interaction_matrix
    assert rebuild_interaction_matrix() is None


def test_rebuild_interaction_matrix_below_retrain_threshold(worker_db, monkeypatch, tmp_path):
    """
    Fewer than 1,000 interaction rows -> the parquet snapshot is written but
    ALS retraining is skipped (see the `if len(df) > 1000:` guard) — this
    path needs pyarrow (for to_parquet) but never `implicit`, and must not
    touch the real backend/data/processed/models/ directory.
    """
    pytest.importorskip("pyarrow")
    from app.models.db_models import UserEvent
    from app.tasks.celery_tasks import rebuild_interaction_matrix

    for i in range(5):
        _insert(worker_db, UserEvent(
            user_id=f"eeeeeeee-eeee-eeee-eeee-{i:012d}", product_id=i,
            event_type="view",
            created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        ))

    (tmp_path / "data" / "processed" / "models").mkdir(parents=True)
    monkeypatch.chdir(tmp_path)

    result = rebuild_interaction_matrix()
    assert result["status"] == "done"
    assert result["interactions"] == 5
    assert (tmp_path / "data" / "processed" / "user_item_interactions.parquet").exists()
    # Below the 1,000-row threshold: no ALS artifacts should appear.
    assert not (tmp_path / "data" / "processed" / "models" / "als_model.npz").exists()


def test_rebuild_interaction_matrix_retrains_above_threshold(worker_db, monkeypatch, tmp_path):
    """Above the 1,000-row threshold, ALS actually retrains and swaps in new factors."""
    pytest.importorskip("implicit")
    pytest.importorskip("pyarrow")
    from app.models.db_models import UserEvent
    from app.tasks.celery_tasks import rebuild_interaction_matrix

    # >1000 *distinct* (user_id, product_id) pairs — the retrain threshold is
    # on len(df) *after* the query's GROUP BY, not on raw row count. A small
    # modulus on both user_id and product_id would collapse into far fewer
    # than 1000 distinct pairs (e.g. mod 50 and mod 30 repeats every
    # lcm(50,30)=150 rows); using a unique user_id per row guarantees each
    # row is its own group.
    for i in range(1100):
        _insert(worker_db, UserEvent(
            user_id=f"user-{i}", product_id=i % 30,
            event_type="view",
            created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        ))

    (tmp_path / "data" / "processed" / "models").mkdir(parents=True)
    monkeypatch.chdir(tmp_path)

    result = rebuild_interaction_matrix()
    assert result["status"] == "done"
    assert (tmp_path / "data" / "processed" / "models" / "als_model.npz").exists()
    assert (tmp_path / "data" / "processed" / "models" / "cf_mappings.pkl").exists() is False  # this task writes index_mappings.pkl, not cf_mappings.pkl
    assert (tmp_path / "data" / "processed" / "models" / "index_mappings.pkl").exists()


# ── refresh_product_embeddings ───────────────────────────────────────────────

def test_refresh_product_embeddings_no_new_products(worker_db):
    """
    Every product id already present in the real committed
    faiss_product_ids.npy -> nothing to embed. Read-only against the real
    artifact (existing_ids lookup only), so no chdir/isolation needed.
    """
    from app.tasks.celery_tasks import refresh_product_embeddings
    result = refresh_product_embeddings()
    assert result == {"status": "skipped", "new_products": 0}


def test_refresh_product_embeddings_adds_new_product(worker_db, monkeypatch, tmp_path):
    pytest.importorskip("sentence_transformers")
    pytest.importorskip("faiss")
    import shutil
    from pathlib import Path
    from app.models.db_models import Department, Product
    from app.tasks.celery_tasks import refresh_product_embeddings

    real_models_dir = Path(__file__).resolve().parent.parent / "data" / "processed" / "models"
    tmp_models_dir = tmp_path / "data" / "processed" / "models"
    tmp_models_dir.mkdir(parents=True)
    for name in ("faiss_product_index.bin", "faiss_product_ids.npy"):
        shutil.copy(real_models_dir / name, tmp_models_dir / name)

    new_id = 999999  # guaranteed not in the committed faiss_product_ids.npy
    async def _seed():
        async with worker_db() as s:
            dept = Department(name="Test Dept")
            s.add(dept)
            await s.flush()
            s.add(Product(
                id=new_id, name="Brand New Test Product", department_id=dept.id,
                price=10, is_available=True, stock_count=5,
            ))
            await s.commit()
    _run(_seed())

    monkeypatch.chdir(tmp_path)
    result = refresh_product_embeddings()

    assert result["status"] == "done"
    assert result["new_products"] == 1

    import numpy as np
    ids_after = np.load(tmp_models_dir / "faiss_product_ids.npy")
    assert new_id in ids_after.tolist()
