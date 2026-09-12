"""
One-time (well — occasionally-time) regeneration of the *neural* content
embeddings artifacts: faiss_product_index.bin, faiss_product_ids.npy,
product_embeddings.npy, department_centroids.pkl.

Why this exists: the artifacts committed to backend/data/processed/models/
were 500-dimensional (a TF-IDF-derived vector space — matches
tfidf_vectorizer.pkl's max_features=500 exactly), NOT the 384-dim output of
the sentence-transformers model that app/ml/content/cbf_engine.py's
_embed_query() and app/tasks/celery_tasks.py's refresh_product_embeddings()
actually use at runtime. Every real semantic search query and every new-
product embedding attempt hit a silent FAISS dimension-mismatch
AssertionError — caught by search_by_text()'s try/except (falls back to the
still-dimension-consistent TF-IDF path, so it never crashed, just silently
never did semantic search) and NOT caught in refresh_product_embeddings()
(so it always failed outright). Root cause: no ml_research/ training
pipeline was ever committed to this repo — only pre-built artifact outputs
were (and even those were gitignored until this same cleanup) — so this
mismatch had no way to be caught until the artifacts were actually deployed
and exercised for the first time.

This script re-embeds every product with the SAME model+settings
refresh_product_embeddings() uses (all-MiniLM-L6-v2, normalize_embeddings=
True) so future incremental appends from that task stay dimensionally
consistent with the base index, and rebuilds department_centroids.pkl in the
same 384-dim space (it was computed from the old 500-dim vectors, so it has
to be regenerated alongside the index, not left in place).

TF-IDF artifacts (tfidf_vectorizer.pkl, tfidf_matrix.npz) are untouched —
_tfidf_search()'s fallback path is dimension-independent of the embeddings
and works fine as-is.

Run from backend/:  python scripts/rebuild_content_embeddings.py
Needs requirements-worker.txt installed (sentence-transformers, faiss-cpu
already in requirements.txt).
"""
import json
import pickle
from collections import defaultdict
from pathlib import Path

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

BACKEND_DIR = Path(__file__).resolve().parent.parent
PRODUCTS_JSON = BACKEND_DIR / "data" / "processed" / "products.json"
MODELS_DIR = BACKEND_DIR / "data" / "processed" / "models"


def main():
    products = json.loads(PRODUCTS_JSON.read_text(encoding="utf-8"))
    products.sort(key=lambda p: p["id"])
    print(f"Loaded {len(products)} products from {PRODUCTS_JSON}")

    # Same text shape refresh_product_embeddings() builds for new products
    # (name + department), so incremental appends land in the same space.
    texts = [f"{p['name']} {p['type']}".lower() for p in products]
    ids = np.array([p["id"] for p in products], dtype=np.int64)

    print("Loading all-MiniLM-L6-v2...")
    model = SentenceTransformer("all-MiniLM-L6-v2")

    print(f"Embedding {len(texts)} products (this takes a couple of minutes on CPU)...")
    embeddings = model.encode(
        texts, normalize_embeddings=True, show_progress_bar=True, batch_size=64,
    ).astype(np.float32)
    assert embeddings.shape == (len(products), 384), embeddings.shape

    print("Building FAISS IndexFlatIP (inner product == cosine similarity on normalized vectors)...")
    index = faiss.IndexFlatIP(embeddings.shape[1])
    index.add(embeddings)
    assert index.ntotal == len(products)

    print("Computing department centroids...")
    by_dept = defaultdict(list)
    for p, emb in zip(products, embeddings):
        by_dept[p["type"]].append(emb)
    centroids = {}
    for dept, vecs in by_dept.items():
        centroid = np.mean(np.stack(vecs), axis=0)
        norm = np.linalg.norm(centroid)
        if norm > 0:
            centroid = centroid / norm  # renormalize so IP search stays cosine-comparable
        centroids[dept] = centroid.astype(np.float32)
    print(f"  {len(centroids)} departments: {sorted(centroids.keys())}")

    faiss.write_index(index, str(MODELS_DIR / "faiss_product_index.bin"))
    np.save(MODELS_DIR / "faiss_product_ids.npy", ids)
    np.save(MODELS_DIR / "product_embeddings.npy", embeddings)
    with open(MODELS_DIR / "department_centroids.pkl", "wb") as f:
        pickle.dump(centroids, f)

    print(f"Wrote faiss_product_index.bin (d={index.d}, ntotal={index.ntotal}), "
          f"faiss_product_ids.npy, product_embeddings.npy, department_centroids.pkl "
          f"to {MODELS_DIR}")


if __name__ == "__main__":
    main()
