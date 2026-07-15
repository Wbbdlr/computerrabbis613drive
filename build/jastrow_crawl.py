#!/usr/bin/env python3
# Crawl the full Jastrow dictionary from Sefaria's public API (Public Domain,
# digitized by Sefaria) by walking next-links start to finish. Resumable.
#
#   python jastrow_crawl.py
#
# Output: downloads/jastrow_raw.jsonl  (one entry per line: {"hw","he","html"})
#         downloads/jastrow_resume.txt (last completed ref, for resume)

import json, os, time, urllib.request, urllib.parse, sys

OUT = os.path.join(os.path.dirname(__file__), "..", "downloads")
RAW = os.path.join(OUT, "jastrow_raw.jsonl")
RESUME = os.path.join(OUT, "jastrow_resume.txt")
START = "Jastrow, א"
DELAY = 0.12
MAX = 45000

def get(ref):
    u = "https://www.sefaria.org/api/texts/" + urllib.parse.quote(ref) + "?commentary=0&context=0"
    for attempt in range(4):
        try:
            req = urllib.request.Request(u, headers={"User-Agent": "computer-rabbis-offline-drive"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except Exception as e:
            if attempt == 3:
                raise
            time.sleep(1.5 * (attempt + 1))

def flatten(t):
    if t is None: return ""
    if isinstance(t, str): return t
    if isinstance(t, list): return "\n".join(flatten(x) for x in t)
    return str(t)

def main():
    done = set()
    cur = START
    if os.path.exists(RESUME):
        last = open(RESUME, encoding="utf-8").read().strip()
        if last:
            try:
                d = get(last)
                cur = d.get("next") or None
            except Exception:
                cur = START
        # rebuild done-set from existing file to avoid dupes
        if os.path.exists(RAW):
            for line in open(RAW, encoding="utf-8"):
                try: done.add(json.loads(line)["hw"])
                except Exception: pass
    mode = "a" if os.path.exists(RAW) else "w"
    f = open(RAW, mode, encoding="utf-8")
    n = len(done)
    while cur and n < MAX:
        try:
            d = get(cur)
        except Exception as e:
            print("STOP error at", cur, ":", e, flush=True); break
        ref = d.get("ref", cur)
        hw = ref[len("Jastrow, "):] if ref.startswith("Jastrow, ") else ref
        if hw not in done:
            he = d.get("heRef", "")
            he = he[len("מילון יסטרוב, "):] if he.startswith("מילון יסטרוב, ") else he
            entry = {"hw": hw, "he": he, "html": flatten(d.get("text"))}
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
            done.add(hw); n += 1
            if n % 200 == 0:
                f.flush(); open(RESUME, "w", encoding="utf-8").write(ref); print("  %d entries (%s)" % (n, hw), flush=True)
        nxt = d.get("next")
        if not nxt or nxt == cur:
            print("END of dictionary at", ref, flush=True); break
        cur = nxt
        time.sleep(DELAY)
    f.close()
    open(RESUME, "w", encoding="utf-8").write(cur or "DONE")
    print("CRAWL_DONE entries=%d" % n, flush=True)

if __name__ == "__main__":
    main()
