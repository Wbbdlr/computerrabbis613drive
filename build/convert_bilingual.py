#!/usr/bin/env python3
# Convert an aligned Sefaria Hebrew+English merged.json pair into one bilingual
# book file for the browser reader: CR.book(id, {t, c, bi:1, sec:[{l,segs:[[he,en],...]}]})
#
# Usage (single text, for testing):
#   python convert_bilingual.py --he avot_he.json --en avot_en.json --id 90001 \
#       --title "Pirkei Avot" --cat "משנה / סדר נזיקין" --out ../usb-root/Library-Web/books
#
# Batch use is driven by build_translations.py, which calls convert_pair().

import os, sys, json, argparse

HEB_LETTERS = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "יא", "יב", "יג", "יד", "טו", "טז", "יז", "יח", "יט", "כ",
               "כא", "כב", "כג", "כד", "כה", "כו", "כז", "כח", "כט", "ל", "לא", "לב", "לג", "לד", "לה", "לו", "לז", "לח", "לט", "מ"]

def heb_num(n):
    return HEB_LETTERS[n] if 0 < n < len(HEB_LETTERS) else str(n)

def is_list(x):
    return isinstance(x, list)

def depth_of(node):
    d = 0
    while is_list(node):
        d += 1
        node = node[0] if node else None
    return d

def flatten_sections(he, en, label_prefix=""):
    """Return list of sections [{l:label, segs:[[he,en],...]}] from aligned nested arrays."""
    sections = []
    dh = depth_of(he)
    if dh <= 1:
        # single flat list of segments -> one unlabeled section
        segs = []
        n = max(len(he) if is_list(he) else 0, len(en) if is_list(en) else 0)
        for i in range(n):
            h = he[i] if is_list(he) and i < len(he) else ""
            e = en[i] if is_list(en) and i < len(en) else ""
            if isinstance(h, list): h = " ".join(map(str, h))
            if isinstance(e, list): e = " ".join(map(str, e))
            if (h or e):
                segs.append([h or "", e or ""])
        if segs:
            sections.append({"l": label_prefix.strip(), "segs": segs})
        return sections
    if dh == 2:
        n = max(len(he), len(en))
        for i in range(n):
            hh = he[i] if i < len(he) else []
            ee = en[i] if i < len(en) else []
            label = (label_prefix + " " if label_prefix else "") + heb_num(i + 1)
            sub = flatten_sections(hh, ee, "")
            segs = sub[0]["segs"] if sub else []
            if segs:
                sections.append({"l": label.strip(), "segs": segs})
        return sections
    # depth >= 3: recurse, prefixing labels
    n = max(len(he), len(en))
    for i in range(n):
        hh = he[i] if i < len(he) else []
        ee = en[i] if i < len(en) else []
        label = (label_prefix + " " if label_prefix else "") + heb_num(i + 1)
        sections.extend(flatten_sections(hh, ee, label))
    return sections

def convert_pair(he_path, en_path, bid, title, cat, out_dir, en_title=""):
    with open(he_path, "r", encoding="utf-8") as f:
        he = json.load(f).get("text", [])
    en = []
    if en_path and os.path.exists(en_path):
        with open(en_path, "r", encoding="utf-8") as f:
            en = json.load(f).get("text", [])
    sections = flatten_sections(he, en)
    seg_count = sum(len(s["segs"]) for s in sections)
    has_en = any(seg[1] for s in sections for seg in s["segs"])
    obj = {"t": title, "c": cat, "bi": 1, "en": 1 if has_en else 0, "sec": sections}
    if has_en and en_title:
        obj["v"] = en_title
    payload = json.dumps(obj, ensure_ascii=False)
    payload = payload.replace("</", "<\\/")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "%d.js" % bid), "w", encoding="utf-8") as f:
        f.write("CR.book(%d,%s);\n" % (bid, payload))
    return {"segs": seg_count, "sections": len(sections), "hasEn": has_en}

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--he", required=True)
    ap.add_argument("--en", default="")
    ap.add_argument("--id", type=int, required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--cat", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    r = convert_pair(a.he, a.en, a.id, a.title, a.cat, a.out)
    print(json.dumps(r, ensure_ascii=False))
