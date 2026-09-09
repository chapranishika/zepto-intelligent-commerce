# ⚡ Zepto — Full-Stack ML Recommendation Platform

> A quick-commerce experience that understands what a customer is trying to accomplish, not just what they typed.

[![CI/CD](https://github.com/chapranishika/instantdeliverycloneapp/actions/workflows/ci.yml/badge.svg)](https://github.com/chapranishika/instantdeliverycloneapp/actions)
[![Python](https://img.shields.io/badge/Python-3.11-blue.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-green.svg)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**[Live Demo →](https://zeptoclone-nishika.vercel.app)** | **[API Docs →](https://instantdeliverycloneapp.onrender.com/docs)**

## Why I built this

I did not want to build another recommendation demo that stops when the model returns a list. I wanted to explore what quick commerce is missing: an assistant that understands what someone is trying to *do*, not just what they searched for.

If someone wants to make pasta tonight, they should not have to remember every ingredient, search for each one, and add them separately. The better experience is simple: tell the app what you want to cook, let it identify the ingredients, match them to the catalogue, and add the selected items to an editable cart. The goal is to turn fifteen minutes of planning and searching into a few seconds of intent.

That is not a feature I bolted on. It is the reason I built this project.

## What is actually built and live

- **Ingredient-to-cart assistant:** Describe a supported dish and the assistant returns the ingredients, preparation steps, and matching catalogue products that can be added together.
- **Three-layer recommendation engine:** TruncatedSVD collaborative filtering for behavioural similarity, TF-IDF plus FAISS or exact cosine retrieval for product content, and a LightGBM LambdaMART ranker that combines the signals.
- **Honest evaluation:** Popularity, CF, CBF, and hybrid systems are compared with Precision@10, Recall@10, NDCG@10, and user-level bootstrap 95% confidence intervals.
- **Production-oriented foundation:** The app includes a 5,060-product catalogue, cold-start handling, implicit-feedback weighting, event tracking, caching, API endpoints, and a responsive React experience.

The design principle is that AI should complete useful work, not just produce chat. A good response should end in an understandable recommendation, an editable ingredient list, or a cart action.

## Where I would take it next

- **Recipe video links:** Add a carefully selected cooking video beside the ingredient list so the flow covers both what to buy and how to prepare it.
- **Mood and craving discovery:** Let someone say they want comforting, light, spicy, familiar, or indulgent food and receive choices that fit the moment.
- **Taste-profile learning:** Learn preferred flavours over time and introduce new brands for a reason, rather than repeatedly showing only the most popular items.
- **Diet-aware suggestions:** Adapt recommendations to stated goals such as higher protein or balanced meals while avoiding medical claims.
- **Persona-driven discovery:** A gym-focused shopper and someone who wants to discover something new every week should not experience the same recommendation strategy.

These extensions are not presented as shipped features. The recommendation engine, evaluation work, and ingredient-to-cart foundation are the first step toward building them honestly.


## Catalogue And Experience

The app uses a generated 5,060-product catalogue across everyday grocery, fresh produce, household, snacks, drinks, dairy, and cafe categories. Product cards use real Zepto CDN imagery where available, with category-aware fallbacks for the larger research catalogue. The goal is to make the catalogue large enough to expose real recommendation challenges while keeping the product experience easy to explore.


## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│  HomePage  │  CategoryPage  │  ProductPage  │  CartPage          │
│                                                                   │
│  Intent-led shopping · Zustand state · React Router             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST / SSE
┌──────────────────────────▼──────────────────────────────────────┐
│               FastAPI Backend (Render)                           │
│  Auth · events · Redis cache · Background tasks (Celery)        │
└─────┬──────────────────┬────────────────────────┬───────────────┘
      │                  │                         │
┌─────▼──────┐  ┌────────▼─────────┐  ┌──────────▼──────────┐
│ CF (SVD)   │  │ CBF (FAISS/exact)│  │ LLM (Claude API)    │
│ SVD rank   │  │ Sentence-BERT    │  │ Query expansion     │
│ cold-start │  │ TF-IDF fallback  │  │ Re-ranking          │
└─────┬──────┘  └────────┬─────────┘  └──────────┬──────────┘
      └─────────────────┬┘───────────────────────┘
                        │
              ┌─────────▼────────┐
              │  Hybrid Ranker   │
              │  LightGBM        │
              │  LambdaMART      │
              │  A/B test router │
              └─────────┬────────┘
                        │
      ┌─────────────────┼─────────────────┐
 ┌────▼────┐     ┌──────▼──────┐    ┌────▼────┐
 │Postgres │     │   Redis     │    │  FAISS  │
 │Users    │     │Rec cache    │    │5k vecs  │
 │Orders   │     │5 min TTL    │    │ANN/exact│
 │Events   │     └─────────────┘    └─────────┘
 └─────────┘
```


## ML Evaluation

These numbers are computed by running the pipeline, not hardcoded. The
benchmark uses 1,000 synthetic users generated from seven category-preference
personas, 30–60 interactions per user, and a held-out 20% of each user's
interactions. Models rank the full remaining 5,060-product catalogue. The
ranker uses an 80/20 user split and reports user-level bootstrap 95% confidence
intervals from 2,000 resamples.

| Model | Precision@10 | Recall@10 | NDCG@10 |
|-------|-------------|-----------|---------|
| Popularity baseline | 0.0025 [0.0005, 0.0050] | 0.0024 [0.0005, 0.0047] | 0.0027 [0.0006, 0.0054] |
| CF only (TruncatedSVD) | 0.0045 [0.0020, 0.0075] | 0.0054 [0.0022, 0.0092] | 0.0051 [0.0020, 0.0091] |
| CBF only (FAISS + TF-IDF) | **0.0055 [0.0025, 0.0090]** | **0.0065 [0.0032, 0.0104]** | **0.0060 [0.0027, 0.0103]** |
| Hybrid (LightGBM LambdaMART) | **0.0055 [0.0025, 0.0090]** | 0.0062 [0.0030, 0.0102] | 0.0057 [0.0024, 0.0095] |

**What the result says:** CBF is the strongest individual signal on this
sparse, large-catalogue benchmark. The hybrid matches CBF Precision@10 and
improves NDCG@10 over popularity, but does not yet beat CBF on Recall@10 or
NDCG@10. The overlapping intervals are a reason to avoid claiming statistical
significance without larger real interaction logs. The leading ranker signals
are `cbf_score`, `price_norm`, and `popularity`.

**Caveat:** the interactions are synthetic persona-based data, not real user
data, so absolute @10 values are low. The pipeline is designed so the
synthetic generator can be replaced with real interaction logs without
changing the evaluation interface. See `ml_research/05_ab_testing_simulation.py`
for sample sizing and sequential-testing methodology.


## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript, Zustand, React Router |
| Backend | FastAPI, SQLAlchemy async, Pydantic v2 |
| Database | PostgreSQL (asyncpg), Redis |
| Product Images | Real Zepto CDN (`cdn.zeptonow.com`) |
| CF | `scikit-learn` TruncatedSVD (implemented & runnable) — `implicit` ALS as documented upgrade path |
| CBF | TF-IDF + exact cosine / `faiss-cpu` acceleration (implemented & runnable) — `sentence-transformers` (all-MiniLM-L6-v2) as documented upgrade path |
| Ranking | `lightgbm` LambdaMART (implemented & runnable) |
| LLM | Anthropic Claude API (Gopi Bahu assistant) |
| Data | Synthetic persona-based interactions over a generated 5,060-product catalogue — see `02_collaborative_filtering.py`; Instacart-data loader documented as upgrade path |
| Deploy | Vercel (frontend), Render (backend + Postgres + Redis) |
| CI/CD | GitHub Actions |


## Reproducible Research

The research pipeline is intentionally executable rather than decorative:

```bash
cd ml_research
python 01_eda.py                     # EDA + interaction matrix
python 02_collaborative_filtering.py  # Generate synthetic interactions + train TruncatedSVD (CF)
python 03_content_embeddings.py       # Build TF-IDF + FAISS index (CBF)
python 04_hybrid_ranker.py            # Train LightGBM LambdaMART, evaluate vs baselines
python 05_ab_testing_simulation.py    # A/B testing methodology demo (sample sizing, sequential tests)
```

The result is a complete loop from customer events and product content to
candidate generation, ranking, evaluation, and product decisions. The
frontend and API are available through the links above for product review.


## 📁 Project Structure

```
zepto-clone/
├── frontend/                    # React + Vite → Vercel
│   └── src/
│       ├── lib/
│       │   ├── products.ts      # Catalogue products + CDN imagery
│       │   └── api.ts           # Typed FastAPI client
│       ├── pages/
│       │   ├── HomePage.tsx     # Hero + rails + dept grid
│       │   ├── CategoryPage.tsx # Sidebar + product grid
│       │   ├── ProductPage.tsx  # Detail + similar products
│       │   ├── CartPage.tsx     # Cart + promo codes + checkout
│       │   ├── AIPage.tsx       # Gopi Bahu streaming chat
│       │   ├── SearchPage.tsx   # Real-time semantic search
│       │   └── ProfilePage.tsx  # Orders + wishlist + settings
│       ├── components/
│       │   ├── ui/ProductCard.tsx          # Real CDN images + qty ctrl
│       │   ├── ui/RecommendationRail.tsx   # Horizontal product shelf
│       │   └── layout/BottomNav.tsx        # Tab navigation
│       ├── store/index.ts       # Zustand: cart, wishlist, user, toast
│       └── styles.css           # Complete production CSS
│
├── backend/                     # FastAPI → Render
│   └── app/
│       ├── api/routes.py        # 15+ endpoints
│       ├── ml/
│       │   ├── collaborative/   # CF engine (ALS + SVD)
│       │   ├── content/         # CBF engine (FAISS + TF-IDF)
│       │   ├── llm/             # Gopi Bahu (Claude API)
│       │   └── ranker/          # Hybrid LightGBM + A/B router
│       ├── models/              # SQLAlchemy ORM
│       └── db/                  # PostgreSQL + Redis
│
└── ml_research/                 # Training notebooks (portfolio-ready)
    ├── 01_eda.py
    ├── 02_collaborative_filtering.py
    ├── 03_content_embeddings.py
    ├── 04_hybrid_ranker.py
    └── 05_ab_testing_simulation.py
```


## 🔑 Key Engineering Decisions

**Real CDN images** — Product images are loaded directly from `cdn.zeptonow.com` with `object-fit: contain` to preserve the white-background product photography style used by Zepto.

**Cold Start** — New users get global top-products until 5 interactions, then transition to personalised CF. Implemented via `cold_start.pkl` with per-category and global top-lists.

**Implicit Feedback** — Purchase counts converted to `log(1 + count)` confidence weights before factorisation (`02_collaborative_filtering.py`, TruncatedSVD). Standard industry approach for e-commerce implicit signals; the same weighting scheme carries over directly if you swap in `implicit`'s ALS.

**LambdaMART** — LightGBM's ranking objective optimises NDCG directly, unlike classifiers that optimise accuracy. This matters enormously for ranked list quality.

**A/B Testing** — Deterministic bucket assignment via MD5 hash of `user_id % 100`. Same user always gets same variant. Sequential testing with Bonferroni correction prevents false positives.

**Event Loop** — Every click, view, and add-to-cart fires to `/events`. Celery rebuilds the interaction matrix every night. This is the loop that makes recommendations improve over time.



## 📄 License

MIT — use freely, attribution appreciated.


*Built with ❤️ · [LinkedIn](https://linkedin.com/in/nc002) · [Portfolio](https://nishika-chapra.vercel.app)*
