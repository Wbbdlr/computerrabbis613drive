#!/usr/bin/env python3
# Turn downloads/jastrow_raw.jsonl into script-injectable chunks + a search index
# for the offline Jastrow lookup tool (works from file://).
#
#   python jastrow_build.py
#
# Output under usb-root/Library-Web/jastrow/:
#   index.js        -> JAS.index = [[searchkey, displayHeadword], ...]  (id = position)
#   data-<n>.js     -> JAS.chunk(<n>, [[displayHw, he, html], ...])     (500 entries/chunk)

import json, os, re

HERE = os.path.dirname(__file__)
RAW = os.path.join(HERE, "..", "downloads", "jastrow_raw.jsonl")
OUT = os.path.join(HERE, "..", "usb-root", "Library-Web", "jastrow")
CHUNK = 500
NIKUD = re.compile(r"[֑-ׇ]")           # cantillation + vowel points
ROMAN = re.compile(r"\s+[IVX]+$")                 # trailing homonym numeral " I", " II"
NONHEB = re.compile(r"[^א-ת]")          # keep only base Hebrew letters

def searchkey(hw):
    s = NIKUD.sub("", hw)
    s = ROMAN.sub("", s)
    s = NONHEB.sub("", s)
    return s

def main():
    os.makedirs(OUT, exist_ok=True)
    entries = []
    with open(RAW, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                e = json.loads(line)
            except Exception:
                continue
            if e.get("html"):
                entries.append(e)
    index = []
    for i, e in enumerate(entries):
        index.append([searchkey(e["hw"]), e["hw"]])
    # write chunks
    nchunks = 0
    for c in range(0, len(entries), CHUNK):
        cid = c // CHUNK
        rows = [[e["hw"], e.get("he", ""), e["html"]] for e in entries[c:c + CHUNK]]
        payload = json.dumps(rows, ensure_ascii=False).replace("</", "<\\/")
        with open(os.path.join(OUT, "data-%d.js" % cid), "w", encoding="utf-8") as f:
            f.write("JAS.chunk(%d,%s);\n" % (cid, payload))
        nchunks += 1
    with open(os.path.join(OUT, "index.js"), "w", encoding="utf-8") as f:
        f.write("JAS.CHUNK=%d;\n" % CHUNK)
        f.write("JAS.index=" + json.dumps(index, ensure_ascii=False) + ";\n")
        f.write("JAS.ready&&JAS.ready();\n")
    print("jastrow_build: entries=%d chunks=%d" % (len(entries), nchunks))

if __name__ == "__main__":
    main()
