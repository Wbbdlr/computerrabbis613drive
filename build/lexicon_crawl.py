#!/usr/bin/env python3
"""Crawl Sefaria lexicons (BDB, BDB Aramaic, Klein Dictionary) by walking
next-links, same pattern as jastrow_crawl.py.  Resumable per-lexicon.

    python lexicon_crawl.py              # crawl all three
    python lexicon_crawl.py BDB          # crawl just BDB

Output per lexicon: downloads/<slug>_raw.jsonl  +  downloads/<slug>_resume.txt
"""

import json, os, sys, time, urllib.request, urllib.parse

OUT = os.path.join(os.path.dirname(__file__), "..", "downloads")
DELAY = 0.12
MAX = 50000

LEXICONS = {
    "bdb": {
        "name": "BDB",
        "start": "BDB, א",
        "prefix": "BDB, ",
        "he_prefix": "BDB, ",
        "license": "Public Domain",
    },
    "bdb_aramaic": {
        "name": "BDB Aramaic",
        "start": "BDB Aramaic, אַב",
        "prefix": "BDB Aramaic, ",
        "he_prefix": "BDB Aramaic, ",
        "license": "Public Domain",
    },
    "klein": {
        "name": "Klein Dictionary",
        "start": "Klein Dictionary, א",
        "prefix": "Klein Dictionary, ",
        "he_prefix": "מילון קליין, ",
        "license": "CC-BY-NC",
    },
}


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
    if t is None:
        return ""
    if isinstance(t, str):
        return t
    if isinstance(t, list):
        return "\n".join(flatten(x) for x in t)
    return str(t)


def crawl_lexicon(slug):
    cfg = LEXICONS[slug]
    name = cfg["name"]
    prefix = cfg["prefix"]
    he_prefix = cfg["he_prefix"]

    raw_path = os.path.join(OUT, slug + "_raw.jsonl")
    resume_path = os.path.join(OUT, slug + "_resume.txt")

    done = set()
    cur = cfg["start"]

    if os.path.exists(resume_path):
        last = open(resume_path, encoding="utf-8").read().strip()
        if last and last != "DONE":
            try:
                d = get(last)
                cur = d.get("next") or None
            except Exception:
                cur = cfg["start"]
        elif last == "DONE":
            print("[%s] Already complete, skipping." % name, flush=True)
            return
        if os.path.exists(raw_path):
            for line in open(raw_path, encoding="utf-8"):
                try:
                    done.add(json.loads(line)["hw"])
                except Exception:
                    pass

    mode = "a" if os.path.exists(raw_path) else "w"
    f = open(raw_path, mode, encoding="utf-8")
    n = len(done)
    print("[%s] Starting crawl at %d entries, cur=%s" % (name, n, cur), flush=True)

    while cur and n < MAX:
        try:
            d = get(cur)
        except Exception as e:
            print("[%s] STOP error at %s: %s" % (name, cur, e), flush=True)
            break

        if d.get("error"):
            print("[%s] API error at %s: %s" % (name, cur, d["error"]), flush=True)
            break

        ref = d.get("ref", cur)
        hw = ref[len(prefix):] if ref.startswith(prefix) else ref
        if hw not in done:
            he_ref = d.get("heRef", "")
            he = he_ref[len(he_prefix):] if he_ref.startswith(he_prefix) else he_ref
            entry = {"hw": hw, "he": he, "html": flatten(d.get("text"))}
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
            done.add(hw)
            n += 1
            if n % 200 == 0:
                f.flush()
                open(resume_path, "w", encoding="utf-8").write(ref)
                print("[%s]   %d entries (%s)" % (name, n, hw), flush=True)

        nxt = d.get("next")
        if not nxt or nxt == cur:
            print("[%s] END of dictionary at %s" % (name, ref), flush=True)
            break
        cur = nxt
        time.sleep(DELAY)

    f.close()
    open(resume_path, "w", encoding="utf-8").write("DONE" if (not cur or not d.get("next") or d.get("next") == cur) else (cur or "DONE"))
    print("[%s] CRAWL_DONE entries=%d" % (name, n), flush=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    targets = sys.argv[1:] if len(sys.argv) > 1 else list(LEXICONS.keys())
    for slug in targets:
        slug = slug.lower().replace(" ", "_").replace("-", "_")
        if slug not in LEXICONS:
            for k, v in LEXICONS.items():
                if slug in v["name"].lower():
                    slug = k
                    break
        if slug not in LEXICONS:
            print("Unknown lexicon: %s (available: %s)" % (slug, ", ".join(LEXICONS.keys())))
            continue
        crawl_lexicon(slug)


if __name__ == "__main__":
    main()
