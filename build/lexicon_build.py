#!/usr/bin/env python3
"""Build script-injectable chunks + search index for ALL offline lexicons.
Handles Jastrow, BDB, BDB Aramaic, and Klein Dictionary.

    python lexicon_build.py

Output under usb-root/Library-Web/dictionaries/:
    index.js            -> LEX.index, LEX.dicts metadata
    <slug>/data-<n>.js  -> LEX.chunk(slug, n, rows)
"""

import json, os, re

HERE = os.path.dirname(__file__)
DL = os.path.join(HERE, "..", "downloads")
OUT = os.path.join(HERE, "..", "usb-root", "Library-Web", "dictionaries")
CHUNK = 500

NIKUD = re.compile(r"[֑-ׇ]")
ROMAN = re.compile(r"\s+[IVX]+$")
NONHEB = re.compile(r"[^א-ת]")

LEXICONS = [
    {"slug": "jastrow",      "file": "jastrow_raw.jsonl",      "name": "Jastrow",          "desc": "Talmud, Midrash & Targum", "license": "Public Domain"},
    {"slug": "bdb",           "file": "bdb_raw.jsonl",           "name": "BDB",              "desc": "Biblical Hebrew",           "license": "Public Domain"},
    {"slug": "bdb_aramaic",   "file": "bdb_aramaic_raw.jsonl",   "name": "BDB Aramaic",      "desc": "Biblical Aramaic",          "license": "Public Domain"},
    {"slug": "klein",         "file": "klein_raw.jsonl",         "name": "Klein Dictionary",  "desc": "Etymological Hebrew",       "license": "CC-BY-NC"},
]


def searchkey(hw):
    s = NIKUD.sub("", hw)
    s = ROMAN.sub("", s)
    s = NONHEB.sub("", s)
    return s


def load_entries(path):
    # Dedupe by headword — a resumed/parallel crawl can append the same entry
    # more than once to the raw .jsonl. Keep first occurrence, preserve order.
    entries = []
    seen = set()
    if not os.path.exists(path):
        return entries
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                e = json.loads(line)
            except Exception:
                continue
            hw = e.get("hw")
            if e.get("html") and hw not in seen:
                seen.add(hw)
                entries.append(e)
    return entries


def build_lexicon(lex):
    slug = lex["slug"]
    raw_path = os.path.join(DL, lex["file"])
    out_dir = os.path.join(OUT, slug)
    os.makedirs(out_dir, exist_ok=True)

    entries = load_entries(raw_path)
    if not entries:
        print("  [%s] no data found at %s, skipping" % (slug, raw_path))
        return None

    index = []
    for i, e in enumerate(entries):
        index.append([searchkey(e["hw"]), e["hw"]])

    nchunks = 0
    for c in range(0, len(entries), CHUNK):
        cid = c // CHUNK
        rows = [[e["hw"], e.get("he", ""), e["html"]] for e in entries[c:c + CHUNK]]
        payload = json.dumps(rows, ensure_ascii=False).replace("</", "<\\/")
        with open(os.path.join(out_dir, "data-%d.js" % cid), "w", encoding="utf-8") as f:
            f.write("LEX.chunk('%s',%d,%s);\n" % (slug, cid, payload))
        nchunks += 1

    print("  [%s] entries=%d chunks=%d" % (slug, len(entries), nchunks))
    return {"slug": slug, "name": lex["name"], "desc": lex["desc"],
            "license": lex["license"], "count": len(entries),
            "index": index, "chunks": nchunks}


def main():
    os.makedirs(OUT, exist_ok=True)
    all_index = {}
    dicts_meta = []

    for lex in LEXICONS:
        result = build_lexicon(lex)
        if result:
            all_index[result["slug"]] = result["index"]
            dicts_meta.append({
                "slug": result["slug"], "name": result["name"],
                "desc": result["desc"], "license": result["license"],
                "count": result["count"], "chunks": result["chunks"],
            })

    with open(os.path.join(OUT, "index.js"), "w", encoding="utf-8") as f:
        f.write("window.LEX=window.LEX||{};\n")
        f.write("LEX.CHUNK=%d;\n" % CHUNK)
        f.write("LEX.dicts=" + json.dumps(dicts_meta, ensure_ascii=False) + ";\n")
        for slug, idx in all_index.items():
            f.write("LEX.idx_%s=" % slug + json.dumps(idx, ensure_ascii=False) + ";\n")
        f.write("LEX.ready&&LEX.ready();\n")

    total = sum(d["count"] for d in dicts_meta)
    print("lexicon_build: total=%d across %d dictionaries" % (total, len(dicts_meta)))


if __name__ == "__main__":
    main()
