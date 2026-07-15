#!/usr/bin/env python3
# Curated frum-preferred bilingual build. For each Sefaria title, pick a TRUSTED
# English edition (William Davidson for Shas, Touger for Rambam, Silbermann for
# Rashi, Metsudah/JPS for Chumash, etc.), pair it with the Hebrew, and convert.
# KJV / crowd-sourced (Community, Open Mishnah, Wikisource) are excluded. Titles
# with no acceptable English are left to the Hebrew-only library.
#
#   python build_translations.py --books ../downloads/books.json --out ../usb-root/Library-Web [--limit N] [--only "Genesis,Berakhot"]

import os, sys, json, argparse, urllib.parse, urllib.request, re, time
from convert_bilingual import convert_pair

BASE = "https://storage.googleapis.com/sefaria-export/json"
ID_START = 100001

# TIER 1 — trusted frum named editions (first match wins, in this order)
PREFERRED = [
    "William Davidson",                 # Talmud Bavli (Steinsaltz)
    "Touger",                           # Rambam, Mishneh Torah (Moznaim)
    "Silbermann", "Rosenbaum",          # Rashi on Chumash
    "Feldheim",                         # frum publisher (e.g. Mishnah Berurah)
    "Metsudah",                         # Chumash, Rashi, Kitzur (frum publisher)
    "Kaplan",                           # R. Aryeh Kaplan
    "Artscroll", "Moznaim",             # frum publishers
    "Bartenura", "Kehati",              # Mishnah commentaries
    "Kulp",                             # Mishnah Yomit (widely used)
    "JPS", "Jewish Publication",        # Tanakh (standard Jewish translation)
    "Sefaria Edition", "Sefaria Translation",  # Sefaria in-house (traditional)
    "Soncino",
]
# TIER 2 — acceptable when no frum named edition exists (keeps the text bilingual)
ACCEPTABLE = ["Sefaria Community Translation", "Wikisource", "Wiki Translation", "Sefaria"]
# Christian / partial-fragment / junk — never use
EXCLUDE = [
    "king james", "authorized version", "old testament", "new testament", "douay", "webster",
    "rodkinson", "my version", "temp", "wired to", "mi yodeya", "jerusalem anthology",
]
EXCLUDE_RE = re.compile(r"(chapter|section|siman|hilkhot|perek)\s+\d|^\s*\d", re.I)  # single-chapter fragments
LANG_TAG = re.compile(r"\[(fr|de|es|pt|it|ru|yi|ar|nl|pl|fa|lad|eo|fi|tr|hu|ro|sr|ca|shona|zulu|zh)\]\s*$", re.I)

def enc(parts):
    return "/".join(urllib.parse.quote(p) for p in parts)

def fetch(url, dest, retries=3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "cr-offline-drive"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            with open(dest, "wb") as f:
                f.write(data)
            return True
        except Exception:
            if i == retries - 1:
                return False
            time.sleep(1.2)
    return False

def excluded(vt):
    low = vt.lower()
    if any(x in low for x in EXCLUDE):
        return True
    if EXCLUDE_RE.search(vt):  # single chapter/siman fragments
        return True
    return False

def choose_english(versions, cats):
    """Return the best English versionTitle: frum named edition, else an acceptable
    fallback, else the 'merged' compilation (except for Tanakh, to avoid Christian
    translations leaking in). Returns None only if nothing usable exists."""
    cand = [v for v in versions if not LANG_TAG.search(v) and not excluded(v)]
    if not cand:
        return None
    # tier 1: trusted frum named editions
    for pref in PREFERRED:
        for v in cand:
            if pref.lower() in v.lower():
                return v
    is_tanakh = cats and cats[0] == "Tanakh"
    # tier 2: acceptable published/community editions
    for acc in ACCEPTABLE:
        for v in cand:
            if acc.lower() in v.lower() and v.lower() != "merged":
                return v
    # any other non-junk named edition
    named = [v for v in cand if v.lower() != "merged"]
    if named:
        return named[0]
    # last resort: the merged compilation (best coverage) — but never for Tanakh
    if not is_tanakh and "merged" in [v.lower() for v in cand]:
        return "merged"
    return None

def build_index(books):
    from collections import defaultdict
    info = {}
    en_versions = defaultdict(list)
    for b in books:
        info.setdefault(b["title"], b["categories"])
        if b["language"] == "English":
            en_versions[b["title"]].append(b.get("versionTitle", ""))
    return info, en_versions

SEFARIA_ORDER = {
    "__top__": ["Tanakh", "Mishnah", "Tosefta", "Talmud", "Midrash", "Halakhah",
                "Kabbalah", "Chasidut", "Jewish Thought", "Musar", "Liturgy",
                "Responsa", "Reference", "Second Temple"],
    "Tanakh": ["Torah", "Prophets", "Writings"],
    "Torah": ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"],
    "Prophets": ["Joshua", "Judges", "I Samuel", "II Samuel", "I Kings", "II Kings",
                 "Isaiah", "Jeremiah", "Ezekiel", "Hosea", "Joel", "Amos", "Obadiah",
                 "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai",
                 "Zechariah", "Malachi"],
    "Writings": ["Psalms", "Proverbs", "Job", "Song of Songs", "Ruth", "Lamentations",
                 "Ecclesiastes", "Esther", "Daniel", "Ezra", "Nehemiah",
                 "I Chronicles", "II Chronicles"],
    "__seder__": ["Seder Zeraim", "Seder Moed", "Seder Nashim", "Seder Nezikin",
                  "Seder Kodashim", "Seder Tahorot"],
    "Seder Zeraim": ["Berakhot", "Peah", "Demai", "Kilayim", "Sheviit", "Terumot",
                     "Maasrot", "Maaser Sheni", "Challah", "Orlah", "Bikkurim"],
    "Seder Moed": ["Shabbat", "Eruvin", "Pesachim", "Shekalim", "Yoma", "Sukkah",
                   "Beitzah", "Rosh Hashanah", "Taanit", "Megillah", "Moed Katan", "Chagigah"],
    "Seder Nashim": ["Yevamot", "Ketubot", "Nedarim", "Nazir", "Sotah", "Gittin", "Kiddushin"],
    "Seder Nezikin": ["Bava Kamma", "Bava Metzia", "Bava Batra", "Sanhedrin", "Makkot",
                      "Shevuot", "Eduyot", "Avodah Zarah", "Pirkei Avot", "Avot", "Horayot"],
    "Seder Kodashim": ["Zevachim", "Menachot", "Chullin", "Bekhorot", "Arakhin", "Temurah",
                       "Keritot", "Meilah", "Tamid", "Middot", "Kinnim"],
    "Seder Tahorot": ["Kelim", "Oholot", "Negaim", "Parah", "Tahorot", "Mikvaot",
                      "Niddah", "Makhshirin", "Zavim", "Tevul Yom", "Yadayim", "Oktzin"],
    "Shulchan Arukh": ["Orach Chaim", "Yoreh Deah", "Even HaEzer", "Choshen Mishpat"],
}

def sefaria_sort_key(name, parent_name=""):
    order = SEFARIA_ORDER.get(parent_name, [])
    if not order and parent_name in ("Mishnah", "Talmud", "Tosefta"):
        order = SEFARIA_ORDER.get("__seder__", [])
    if parent_name == "" or parent_name is None:
        order = SEFARIA_ORDER.get("__top__", [])
    for i, canon in enumerate(order):
        if name == canon or name.startswith(canon):
            return (0, i, name)
    return (1, 0, name)

def add_to_tree(children, cats, title, bid):
    cur = children
    parent = None
    for c in cats:
        found = next((ch for ch in cur if ch.get("name") == c), None)
        if not found:
            found = {"name": c, "children": [], "books": []}
            cur.append(found)
        parent = found
        cur = found["children"]
    parent.setdefault("books", []).append({"id": bid, "t": title})

def clean_tree(children, parent_name=""):
    out = []
    for ch in children:
        kids = clean_tree(ch.get("children", []), ch.get("name", ""))
        books = ch.get("books", [])
        if kids or books:
            books_sorted = sorted(books, key=lambda b: sefaria_sort_key(b["t"], ch.get("name", "")))
            out.append({"name": ch["name"], "children": kids, "books": books_sorted})
    out.sort(key=lambda c: sefaria_sort_key(c["name"], parent_name))
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--books", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--only", default="")
    a = ap.parse_args()

    books = json.load(open(a.books, encoding="utf-8"))["books"]
    info, en_versions = build_index(books)

    only = set(x.strip() for x in a.only.split(",") if x.strip())
    names = sorted(en_versions.keys())
    if only:
        names = [t for t in names if t in only]
    if a.limit:
        names = names[:a.limit]

    out_books = os.path.join(a.out, "books")
    os.makedirs(out_books, exist_ok=True)
    tmp = os.path.join(os.path.dirname(a.books) or ".", "_tl_tmp")
    os.makedirs(tmp, exist_ok=True)

    tree_children = []
    titles_index = []
    bid = ID_START
    ok = skip_no_en = skip_no_he = skip_empty = 0
    used_pref = 0
    total = len(names)
    for i, title in enumerate(names):
        cats = info[title]
        chosen = choose_english(en_versions[title], cats)
        if not chosen:
            skip_no_en += 1; continue
        he_f = os.path.join(tmp, "he.json"); en_f = os.path.join(tmp, "en.json")
        if not fetch(BASE + "/" + enc(cats + [title, "Hebrew", "merged.json"]), he_f):
            skip_no_he += 1; continue
        if not fetch(BASE + "/" + enc(cats + [title, "English", chosen + ".json"]), en_f):
            skip_no_en += 1; continue
        try:
            r = convert_pair(he_f, en_f, bid, title, " / ".join(cats), out_books, en_title=chosen)
        except Exception:
            skip_empty += 1; continue
        if r["segs"] == 0 or not r["hasEn"]:
            skip_empty += 1
            try: os.remove(os.path.join(out_books, "%d.js" % bid))
            except OSError: pass
            continue
        add_to_tree(tree_children, cats, title, bid)
        titles_index.append([bid, title, " / ".join(cats)])
        bid += 1; ok += 1
        if any(p.lower() in chosen.lower() for p in PREFERRED):
            used_pref += 1
        if (i + 1) % 50 == 0:
            print("  %d/%d ok=%d (pref=%d) skipNoEn=%d skipNoHe=%d" % (i + 1, total, ok, used_pref, skip_no_en, skip_no_he), flush=True)

    branch = {"name": "With English translation · עם תרגום",
              "children": clean_tree(tree_children), "books": []}
    with open(os.path.join(a.out, "tree-bilingual.js"), "w", encoding="utf-8") as f:
        f.write("(function(){\nCR.tree.unshift(" + json.dumps(branch, ensure_ascii=False) + ");\n")
        f.write("CR.titles = CR.titles.concat(" + json.dumps(titles_index, ensure_ascii=False) + ");\n")
        f.write("if(CR.ready) CR.ready();\n})();\n")
    print("DONE titles=%d ok=%d (preferred=%d, fallback=%d) noEnglish=%d noHebrew=%d empty=%d ids=%d..%d"
          % (total, ok, used_pref, ok - used_pref, skip_no_en, skip_no_he, skip_empty, ID_START, bid - 1))

if __name__ == "__main__":
    main()
