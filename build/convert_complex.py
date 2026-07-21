#!/usr/bin/env python3
# Convert a Sefaria "complex text" (named schema.nodes tree, e.g. Siddur Sefard's
# Weekday Shacharit / Birchat HaMazon / ... sections) into the same bilingual book
# format convert_bilingual.py produces: CR.book(id, {t, c, bi:1, en:1, sec:[{l,segs},...]}).
#
# convert_bilingual.py's flatten_sections() assumes numbered-array texts (Mishnah
# perek:mishnah, Gemara daf:line). Siddur-type texts instead have a schema tree of
# *named* sections, and merged.json's "text" is an object keyed by those names, not
# a nested array — so it needs its own walker.
#
# Usage:
#   python convert_complex.py --he he.json --en en.json --id 100500 \
#       --title "Siddur Sefard" --cat "Liturgy / Siddur" --out ../usb-root/Library-Web/books

import os, json, argparse


def get_path(obj, path):
    for k in path:
        if not isinstance(obj, dict) or k not in obj:
            return None
        obj = obj[k]
    return obj


def walk_schema(node, he_text, en_text, path, out_sections):
    """node: schema node {heTitle, enTitle, nodes:[...]}; leaf nodes have no 'nodes'."""
    label = node.get("heTitle") or node.get("enTitle") or ""
    key = node.get("enTitle") or node.get("heTitle") or ""
    new_path = path + [key]
    children = node.get("nodes")
    if children:
        for child in children:
            walk_schema(child, he_text, en_text, new_path, out_sections)
        return
    he_leaf = get_path(he_text, new_path)
    en_leaf = get_path(en_text, new_path)
    if not isinstance(he_leaf, list) and not isinstance(en_leaf, list):
        return
    n = max(len(he_leaf) if isinstance(he_leaf, list) else 0,
            len(en_leaf) if isinstance(en_leaf, list) else 0)
    segs = []
    for i in range(n):
        h = he_leaf[i] if isinstance(he_leaf, list) and i < len(he_leaf) else ""
        e = en_leaf[i] if isinstance(en_leaf, list) and i < len(en_leaf) else ""
        if isinstance(h, list):
            h = " ".join(str(x) for x in h)
        if isinstance(e, list):
            e = " ".join(str(x) for x in e)
        if h or e:
            segs.append([h or "", e or ""])
    if segs:
        out_sections.append({"l": label, "segs": segs})


def convert_complex(he_path, en_path, bid, title, cat, out_dir, en_title=""):
    with open(he_path, "r", encoding="utf-8") as f:
        he = json.load(f)
    en = {}
    if en_path and os.path.exists(en_path):
        with open(en_path, "r", encoding="utf-8") as f:
            en = json.load(f)
    he_text = he.get("text", {}) or {}
    en_text = en.get("text", {}) or {}
    schema_nodes = (he.get("schema", {}) or {}).get("nodes") or (en.get("schema", {}) or {}).get("nodes") or []
    sections = []
    for node in schema_nodes:
        walk_schema(node, he_text, en_text, [], sections)
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
    ap.add_argument("--en-title", default="")
    a = ap.parse_args()
    r = convert_complex(a.he, a.en, a.id, a.title, a.cat, a.out, en_title=a.en_title)
    print(json.dumps(r, ensure_ascii=False))
