#!/usr/bin/env python3
"""Build an offline full-text search index over every book in the library.

Scans usb-root/Library-Web/books/*.js (each a `CR.book(id, {...})` call),
tokenizes the Hebrew text of every paragraph (plain books) or segment
(bilingual books), and writes a chunked, nikud-independent, stopword-filtered
inverted index: word -> {bookId -> [paragraph indices]}.

No snippet text is stored in the index — search results load the matched
book's own already-chunked data on demand (same as opening it normally) and
extract a live snippet, exactly like citation jump-to locates a paragraph.

    python search_build.py [--limit N]

Output under usb-root/Library-Web/search/:
    index.js       -> SRCH.vocab = {word: chunkId}, SRCH.meta
    data-<n>.js    -> SRCH.chunk(n, {word: [bookId, count, pos, pos, ..., bookId, count, ...]})
"""

import json, os, pickle, re, shutil, sys, time

HERE = os.path.dirname(__file__)
BOOKS_DIR = os.path.join(HERE, "..", "usb-root", "Library-Web", "books")
FINAL_DIR = os.path.join(HERE, "..", "usb-root", "Library-Web", "search")
OUT_DIR = FINAL_DIR + "_build"  # write to a scratch dir, swap in atomically at the end
CHECKPOINT = os.path.join(HERE, "search_build.checkpoint.pkl")
CHECKPOINT_EVERY = 800  # books between checkpoint saves -- survives an interrupted run
CHUNK_BYTES = 1_400_000  # target serialized size per postings chunk file

NIKUD = re.compile(r"[֑-ׇֽֿׁׂׅׄ]")  # true combining marks -- strip
WORDSEP = re.compile(r"[־׀׃׆]")  # maqaf/paseq/sof-pasuq/nun-hafukha -- these join or end words visually; treat as a break, not a blank
TAG = re.compile(r"<[^>]+>")
BR = re.compile(r"<br\s*/?>", re.IGNORECASE)
ENTITY = re.compile(r"&[a-zA-Z#0-9]+;")
PASUK_PREFIX = re.compile(r"^\s*\(\s*[א-ת]+\s*\)\s*")
WORD = re.compile(r"[א-ת]{2,}")
P_TAG = re.compile(r"<p\b[^>]*>(.*?)</p>", re.DOTALL | re.IGNORECASE)
BOOK_CALL = re.compile(r"^CR\.book\(\d+,(.*)\);\s*$", re.DOTALL)

# Closed-class grammatical words only (pronouns/prepositions/conjunctions) -- not
# merely "frequent" content words, which stay searchable regardless of frequency.
STOPWORDS = set("""
את של על אל עם אם כי לא הוא היא הם הן אני אתה אתם אנחנו זה זאת זו אלה אלו
כל גם רק יש אין לו לה להם לנו לך לכם בו בה בהם בנו בך בכם כן לכן אשר או ולא
מן מכל עד כאשר כמו הזה הזאת האלה אותו אותה אותם אותי אותך אותנו איזה איזו
מה מי איך למה כמה היכן פה שם הנה כך ככה איפה מאין
""".split())

MIN_WORD_LEN = 2


def html_to_text(html):
    if not html:
        return ""
    html = BR.sub(" ", html)
    text = TAG.sub(" ", html)
    text = ENTITY.sub(" ", text)
    return text


def tokenize(text):
    text = NIKUD.sub("", text)
    text = WORDSEP.sub(" ", text)
    out = []
    for w in WORD.findall(text):
        if len(w) < MIN_WORD_LEN or w in STOPWORDS:
            continue
        out.append(w)
    return out


def extract_units(data):
    """Plain text per scrollable unit, in the exact order the reader renders them."""
    units = []
    if data.get("bi"):
        for sec in data.get("sec") or []:
            for pair in sec.get("segs") or []:
                he = pair[0] if pair else ""
                units.append(html_to_text(he))
    else:
        h = data.get("h") or ""
        for m in P_TAG.finditer(h):
            units.append(html_to_text(m.group(1)))
    return units


def load_book(path):
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    m = BOOK_CALL.match(raw)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except Exception:
        return None


def save_checkpoint(postings, start_at, n_books):
    tmp = CHECKPOINT + ".tmp"
    with open(tmp, "wb") as f:
        pickle.dump({"postings": postings, "start_at": start_at, "n_books": n_books}, f, protocol=pickle.HIGHEST_PROTOCOL)
    os.replace(tmp, CHECKPOINT)  # atomic on both Windows and POSIX


def main():
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    fresh = "--fresh" in sys.argv

    files = sorted(os.listdir(BOOKS_DIR), key=lambda f: int(f[:-3]))
    if limit:
        files = files[:limit]

    postings = {}  # word -> {bookId: [paraIdx,...]}
    n_books = 0
    start_at = 0
    if not fresh and os.path.exists(CHECKPOINT):
        with open(CHECKPOINT, "rb") as f:
            saved = pickle.load(f)
        postings, start_at, n_books = saved["postings"], saved["start_at"], saved["n_books"]
        print("resuming from checkpoint: %d/%d books already done, %d words so far" % (start_at, len(files), len(postings)))

    if os.path.exists(OUT_DIR):
        shutil.rmtree(OUT_DIR)
    os.makedirs(OUT_DIR)

    t0 = time.time()
    for fi in range(start_at, len(files)):
        fname = files[fi]
        book_id = int(fname[:-3])
        data = load_book(os.path.join(BOOKS_DIR, fname))
        if data:
            n_books += 1
            units = extract_units(data)
            for pi, text in enumerate(units):
                text = PASUK_PREFIX.sub("", text)
                seen = set()
                for w in tokenize(text):
                    if w in seen:
                        continue
                    seen.add(w)
                    slot = postings.get(w)
                    if slot is None:
                        postings[w] = slot = {}
                    lst = slot.get(book_id)
                    if lst is None:
                        slot[book_id] = [pi]
                    else:
                        lst.append(pi)
        if (fi + 1) % 500 == 0:
            print("  %d/%d books, %d unique words so far, %.0fs" % (fi + 1, len(files), len(postings), time.time() - t0))
        if (fi + 1) % CHECKPOINT_EVERY == 0:
            save_checkpoint(postings, fi + 1, n_books)
            print("  checkpoint saved at book %d" % (fi + 1))

    print("indexed %d books, %d unique words in %.0fs" % (n_books, len(postings), time.time() - t0))

    words = sorted(postings.keys())
    vocab = {}
    chunk_id = 0
    cur = {}
    cur_size = 2  # "{}"

    def flush():
        nonlocal cur, cur_size, chunk_id
        if not cur:
            return
        payload = json.dumps(cur, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
        with open(os.path.join(OUT_DIR, "data-%d.js" % chunk_id), "w", encoding="utf-8") as f:
            f.write("SRCH.chunk(%d,%s);\n" % (chunk_id, payload))
        chunk_id += 1
        cur = {}
        cur_size = 2

    for w in words:
        flat = []
        for book_id, positions in postings[w].items():
            positions.sort()
            flat.append(book_id)
            flat.append(len(positions))
            flat.extend(positions)
        entry_json = json.dumps(flat, separators=(",", ":"))
        entry_size = len(w.encode("utf-8")) + len(entry_json) + 4
        if cur and cur_size + entry_size > CHUNK_BYTES:
            flush()
        cur[w] = flat
        cur_size += entry_size
        vocab[w] = chunk_id
    flush()

    with open(os.path.join(OUT_DIR, "index.js"), "w", encoding="utf-8") as f:
        f.write("window.SRCH=window.SRCH||{};\n")
        f.write("SRCH.vocab=" + json.dumps(vocab, ensure_ascii=False, separators=(",", ":")) + ";\n")
        f.write("SRCH.meta={\"books\":%d,\"words\":%d,\"chunks\":%d};\n" % (n_books, len(words), chunk_id))
        f.write("SRCH.ready&&SRCH.ready();\n")

    print("wrote %d chunks" % chunk_id)

    if os.path.exists(FINAL_DIR):
        shutil.rmtree(FINAL_DIR)
    os.rename(OUT_DIR, FINAL_DIR)
    print("swapped into place: %s" % FINAL_DIR)

    if os.path.exists(CHECKPOINT):
        os.remove(CHECKPOINT)


if __name__ == "__main__":
    main()
