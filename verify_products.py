"""
verify_products.py — run from project root.

Checks that backend/data/processed/products.json (the single source of
truth — see CONSISTENCY.md) and frontend/src/lib/products.ts define exactly
the same products: same IDs, and matching name/price for a sample of them.
backend/seed_db.py isn't checked directly since it seeds straight from
products.json at run time rather than declaring its own product list.

Exit 0 on success, exit 1 on mismatch.
"""
import json
import re
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

with open("backend/data/processed/products.json", encoding="utf-8") as f:
    catalog = {p["id"]: p for p in json.load(f)}

with open("frontend/src/lib/products.ts", encoding="utf-8") as f:
    ts_source = f.read()

frontend = {}
for m in re.finditer(
    r"\{\s*id:\s*(\d+),\s*name:\s*'((?:[^'\\]|\\.)*)'.*?price:\s*([\d.]+).*?\}",
    ts_source,
):
    fid, name, price = m.groups()
    frontend[int(fid)] = {"name": name.replace("\\'", "'"), "price": float(price)}

backend_ids = sorted(catalog.keys())
frontend_ids = sorted(frontend.keys())

print(f"products.json             : {len(backend_ids)} products, IDs {backend_ids[0]}–{backend_ids[-1]}")
print(f"frontend/src/lib/products.ts: {len(frontend_ids)} products, IDs {frontend_ids[0]}–{frontend_ids[-1]}")

ok = True

if backend_ids != frontend_ids:
    ok = False
    only_backend  = sorted(set(backend_ids)  - set(frontend_ids))
    only_frontend = sorted(set(frontend_ids) - set(backend_ids))
    print("\n❌  ID MISMATCH")
    if only_backend:  print(f"  In products.json only:  {only_backend[:10]}{' ...' if len(only_backend) > 10 else ''}")
    if only_frontend: print(f"  In products.ts only:    {only_frontend[:10]}{' ...' if len(only_frontend) > 10 else ''}")

# Spot-check name/price on a sample of shared IDs — catches a stale/hand-edited
# products.ts even when the ID sets happen to still line up.
shared = sorted(set(backend_ids) & set(frontend_ids))
sample = shared[:: max(1, len(shared) // 25)][:25]
mismatches = []
for pid in sample:
    b, f_ = catalog[pid], frontend[pid]
    if b["name"] != f_["name"] or abs(b["price"] - f_["price"]) > 0.01:
        mismatches.append((pid, b["name"], b["price"], f_["name"], f_["price"]))

if mismatches:
    ok = False
    print(f"\n❌  FIELD MISMATCH on {len(mismatches)}/{len(sample)} sampled IDs:")
    for pid, bname, bprice, fname, fprice in mismatches[:10]:
        print(f"  id {pid}: products.json='{bname}' (₹{bprice}) vs products.ts='{fname}' (₹{fprice})")

if ok:
    print(f"\n✅  PASS — {len(backend_ids)} products, IDs and sampled fields aligned")
    sys.exit(0)
else:
    print("\nFix before deploying — run backend/generate_large_catalog.py to regenerate both files together.")
    sys.exit(1)
