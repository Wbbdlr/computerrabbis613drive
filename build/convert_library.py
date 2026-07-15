#!/usr/bin/env python3
# Convert the Otzaria .txt library into script-injectable .js files for the
# no-exe browser reader (works from file:// where fetch() is blocked).
#
# Output layout (under --out):
#   tree.js            -> CR.tree = [...nested categories...]; CR.titles = [[id,"title","catpath"],...]
#   books/<id>.js      -> CR.book(<id>, {"t":title,"h":"<html content>"})
#
# Usage:
#   python convert_library.py --src "<...>/Library/אוצריא" --out "<...>/Library-Web" [--only תנך,משנה] [--limit N]

import os, sys, json, argparse, html

SKIP_DIRS = {"אודות התוכנה"}

# Canonical ordering for Jewish texts — items not listed fall back to alphabetical after listed ones.
CANON_ORDER = {
    # Top-level categories
    "__top__": ["תנ\"ך", "תנך", "משנה", "תוספתא", "תלמוד בבלי", "תלמוד ירושלמי",
                "מדרש", "הלכה", "קבלה", "חסידות", "מחשבת ישראל", "ספרי מוסר",
                "סדר התפילה", "שו\"ת", "ספרות עזר"],
    # Tanach sub-categories: chumash/navi/ketuvim first, then commentaries
    "תנ\"ך": ["תורה", "נביאים", "כתובים", "תרגומים", "ראשונים", "אחרונים"],
    "תנך": ["תורה", "נביאים", "כתובים", "תרגומים", "ראשונים", "אחרונים"],
    # Torah
    "תורה": ["בראשית", "שמות", "ויקרא", "במדבר", "דברים"],
    # Nevi'im
    "נביאים": ["יהושע", "שופטים", "שמואל א", "שמואל ב", "מלכים א", "מלכים ב",
               "ישעיהו", "ירמיהו", "יחזקאל", "הושע", "יואל", "עמוס", "עובדיה",
               "יונה", "מיכה", "נחום", "חבקוק", "צפניה", "חגי", "זכריה", "מלאכי",
               "תרי עשר"],
    # Ketuvim
    "כתובים": ["תהלים", "משלי", "איוב", "שיר השירים", "רות", "איכה", "קהלת",
               "אסתר", "דניאל", "עזרא", "נחמיה", "דברי הימים א", "דברי הימים ב"],
    # Mishnah sub-categories: sedarim first, then commentaries
    "משנה": ["סדר זרעים", "סדר מועד", "סדר נשים", "סדר נזיקין", "סדר קדשים", "סדר טהרות",
             "ראשונים", "אחרונים"],
    # Talmud sub-categories
    "תלמוד בבלי": ["סדר זרעים", "סדר מועד", "סדר נשים", "סדר נזיקין", "סדר קדשים", "סדר טהרות",
                    "מסכתות קטנות", "ראשונים", "אחרונים", "מפרשים על המסכתות הקטנות",
                    "מחברי זמננו", "ספרות עזר"],
    "תלמוד ירושלמי": ["סדר זרעים", "סדר מועד", "סדר נשים", "סדר נזיקין", "סדר קדשים", "סדר טהרות",
                       "מפרשים"],
    # Halakhah sub-categories
    "הלכה": ["שולחן ערוך", "טור", "משנה תורה", "ספרי מצוות", "ראשונים", "אחרונים",
             "מפרשים", "מחברי זמננו", "מערכות ועניינים"],
    # Mishnah / Talmud sedarim
    "__seder__": ["זרעים", "מועד", "נשים", "נזיקין", "קדשים", "טהרות", "טהרה"],
    # Mishnah tractates by seder
    "זרעים": ["ברכות", "פאה", "דמאי", "כלאים", "שביעית", "תרומות", "מעשרות",
              "מעשר שני", "חלה", "ערלה", "ביכורים"],
    "מועד": ["שבת", "עירובין", "פסחים", "שקלים", "יומא", "סוכה", "ביצה",
             "ראש השנה", "תענית", "מגילה", "מועד קטן", "חגיגה"],
    "נשים": ["יבמות", "כתובות", "נדרים", "נזיר", "סוטה", "גיטין", "קידושין"],
    "נזיקין": ["בבא קמא", "בבא מציעא", "בבא בתרא", "סנהדרין", "מכות", "שבועות",
               "עדיות", "עבודה זרה", "אבות", "הוריות"],
    "קדשים": ["זבחים", "מנחות", "חולין", "בכורות", "ערכין", "תמורה", "כריתות",
              "מעילה", "תמיד", "מידות", "קינים"],
    "טהרות": ["כלים", "אהלות", "נגעים", "פרה", "טהרות", "מקוואות", "נידה",
              "מכשירין", "זבים", "טבול יום", "ידיים", "עוקצים"],
    # Rambam
    "רמב\"ם": ["מדע", "אהבה", "זמנים", "נשים", "קדושה", "הפלאה", "זרעים",
               "עבודה", "קרבנות", "טהרה", "נזיקין", "קנין", "משפטים", "שופטים"],
    # Shulchan Aruch
    "שולחן ערוך": ["אורח חיים", "יורה דעה", "אבן העזר", "חושן משפט"],
}

def canon_sort_key(name, parent_name=""):
    """Sort key that puts canonically-ordered items first, then alphabetical."""
    if parent_name == "" or parent_name is None:
        order_list = CANON_ORDER.get("__top__", [])
    else:
        order_list = CANON_ORDER.get(parent_name, [])
        if not order_list and parent_name.startswith("סדר "):
            order_list = CANON_ORDER.get("__seder__", [])
    for i, canon_name in enumerate(order_list):
        if name == canon_name or name.startswith(canon_name):
            return (0, i, name)
    return (1, 0, name)

def clean_content(raw: str) -> str:
    # The source is already lightweight HTML (<h1>/<h2>/<h3> + text lines).
    # Keep it, but neutralize any raw </script> that would break injection,
    # and wrap bare text lines in <p> for readable rendering.
    out_lines = []
    for line in raw.splitlines():
        s = line.rstrip()
        if not s:
            out_lines.append("")
            continue
        low = s.lower()
        if low.startswith("<h1") or low.startswith("<h2") or low.startswith("<h3") \
           or low.startswith("<h4") or low.startswith("<h5") or low.startswith("<h6") \
           or low.startswith("<p") or low.startswith("<div") or low.startswith("<ul") \
           or low.startswith("<ol") or low.startswith("<table") or low.startswith("<br"):
            out_lines.append(s)
        else:
            out_lines.append("<p>" + s + "</p>")
    return "\n".join(out_lines)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    src = os.path.abspath(args.src)
    out = os.path.abspath(args.out)
    only = set(x for x in args.only.split(",") if x)
    books_dir = os.path.join(out, "books")
    os.makedirs(books_dir, exist_ok=True)

    next_id = [1]
    titles = []   # [id, title, catpath]
    total_bytes = [0]

    def walk(dirpath, relparts):
        node = {"name": relparts[-1] if relparts else "", "books": [], "children": []}
        parent_name = relparts[-1] if relparts else ""
        try:
            entries = sorted(os.listdir(dirpath), key=lambda n: canon_sort_key(n, parent_name))
        except OSError:
            return node
        for name in entries:
            full = os.path.join(dirpath, name)
            if os.path.isdir(full):
                if not relparts and name in SKIP_DIRS:
                    continue
                child = walk(full, relparts + [name])
                if child["books"] or child["children"]:
                    node["children"].append(child)
            elif name.lower().endswith(".txt"):
                if args.limit and next_id[0] > args.limit:
                    continue
                title = name[:-4]
                bid = next_id[0]; next_id[0] += 1
                try:
                    with open(full, "r", encoding="utf-8", errors="replace") as f:
                        raw = f.read()
                except OSError:
                    continue
                content = clean_content(raw)
                catpath = " / ".join(relparts)
                payload = json.dumps({"t": title, "c": catpath, "h": content}, ensure_ascii=False)
                payload = payload.replace("</", "<\\/")  # keep </script> etc. inert
                js = "CR.book(%d,%s);\n" % (bid, payload)
                data = js.encode("utf-8")
                total_bytes[0] += len(data)
                with open(os.path.join(books_dir, "%d.js" % bid), "w", encoding="utf-8") as f:
                    f.write(js)
                node["books"].append({"id": bid, "t": title})
                titles.append([bid, title, catpath])
        return node

    roots = []
    for name in sorted(os.listdir(src), key=lambda n: canon_sort_key(n, "")):
        full = os.path.join(src, name)
        if not os.path.isdir(full):
            continue
        if name in SKIP_DIRS:
            continue
        if only and name not in only:
            continue
        node = walk(full, [name])
        if node["books"] or node["children"]:
            roots.append(node)

    with open(os.path.join(out, "tree.js"), "w", encoding="utf-8") as f:
        f.write("CR.tree = " + json.dumps(roots, ensure_ascii=False) + ";\n")
        f.write("CR.titles = " + json.dumps(titles, ensure_ascii=False) + ";\n")
        f.write("CR.ready && CR.ready();\n")

    print("books=%d  data_MB=%.1f  titles=%d" % (next_id[0] - 1, total_bytes[0] / 1048576.0, len(titles)))

if __name__ == "__main__":
    main()
