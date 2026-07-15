#!/usr/bin/env python3
"""Reorder tree-bilingual.js (and optionally tree.js) to use canonical Jewish text ordering
instead of alphabetical. Reads the existing file, reorders, writes back.

    python reorder_tree.py
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from build_translations import SEFARIA_ORDER, sefaria_sort_key
from convert_library import CANON_ORDER, canon_sort_key

HERE = os.path.dirname(__file__)
LIB_WEB = os.path.join(HERE, "..", "usb-root", "Library-Web")

def reorder_sefaria(node, parent_name=""):
    if "children" in node:
        for ch in node["children"]:
            reorder_sefaria(ch, node.get("name", ""))
        node["children"].sort(key=lambda c: sefaria_sort_key(c["name"], node.get("name", "")))
    if "books" in node:
        node["books"].sort(key=lambda b: sefaria_sort_key(b["t"], node.get("name", "")))

def reorder_hebrew(node, parent_name=""):
    if "children" in node:
        for ch in node["children"]:
            reorder_hebrew(ch, node.get("name", ""))
        node["children"].sort(key=lambda c: canon_sort_key(c["name"], node.get("name", "")))
    if "books" in node:
        node["books"].sort(key=lambda b: canon_sort_key(b["t"], node.get("name", "")))

def fix_bilingual():
    path = os.path.join(LIB_WEB, "tree-bilingual.js")
    if not os.path.exists(path):
        print("tree-bilingual.js not found, skipping"); return
    raw = open(path, encoding="utf-8").read()
    m = re.search(r"CR\.tree\.unshift\((.+?)\);\n", raw, re.DOTALL)
    if not m:
        print("Could not parse tree-bilingual.js"); return
    branch = json.loads(m.group(1))
    for ch in branch.get("children", []):
        reorder_sefaria(ch)
    branch["children"].sort(key=lambda c: sefaria_sort_key(c["name"]))
    new_json = json.dumps(branch, ensure_ascii=False)
    new_raw = raw[:m.start(1)] + new_json + raw[m.end(1):]
    open(path, "w", encoding="utf-8").write(new_raw)
    print("tree-bilingual.js reordered")

def fix_hebrew():
    path = os.path.join(LIB_WEB, "tree.js")
    if not os.path.exists(path):
        print("tree.js not found, skipping"); return
    raw = open(path, encoding="utf-8").read()
    m = re.search(r"CR\.tree\s*=\s*(\[.+?\]);\n", raw, re.DOTALL)
    if not m:
        print("Could not parse tree.js"); return
    roots = json.loads(m.group(1))
    for r in roots:
        reorder_hebrew(r)
    roots.sort(key=lambda c: canon_sort_key(c["name"]))
    new_json = json.dumps(roots, ensure_ascii=False)
    new_raw = raw[:m.start(1)] + new_json + raw[m.end(1):]
    open(path, "w", encoding="utf-8").write(new_raw)
    print("tree.js reordered")

if __name__ == "__main__":
    fix_bilingual()
    fix_hebrew()
