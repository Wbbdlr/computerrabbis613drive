#!/usr/bin/env python3
# Fetches Sefaria's Siddur Sefard (Hebrew + the Metsudah English translation) and
# converts it into the library. Not part of build_translations.py's bulk books.json
# flow because Sefaria stores this as a named-section schema tree (Weekday Shacharit >
# Morning Blessings > ...), not numbered chapters -- see convert_complex.py.
#
#   python fetch_siddur.py --out ../usb-root/Library-Web

import os, sys, argparse, urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from convert_complex import convert_complex

BASE = "https://storage.googleapis.com/sefaria-export/json/Liturgy/Siddur/Siddur%20Sefard"
EN_VERSION = "Translation based on the Metsudah linear siddur, by Avrohom Davis, 1981"
BOOK_ID = 150001


def fetch(url, dest, retries=3):
    import time
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
                raise
            time.sleep(1.2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="usb-root/Library-Web")
    a = ap.parse_args()

    tmp = os.path.join(os.path.dirname(__file__), "..", "downloads", "_siddur_tmp")
    os.makedirs(tmp, exist_ok=True)
    he_f = os.path.join(tmp, "siddur_sefard_he.json")
    en_f = os.path.join(tmp, "siddur_sefard_en.json")

    print("Fetching Siddur Sefard (Hebrew)...")
    fetch(BASE + "/Hebrew/merged.json", he_f)
    print("Fetching Siddur Sefard (Metsudah English translation)...")
    import urllib.parse
    fetch(BASE + "/English/" + urllib.parse.quote(EN_VERSION) + ".json", en_f)

    r = convert_complex(
        he_f, en_f, BOOK_ID, "Siddur Sefard · סידור ספרד", "Liturgy / Siddur",
        os.path.join(a.out, "books"),
        en_title="Metsudah Linear Siddur, transl. Avrohom Davis, 1981 (CC-BY, via Sefaria)",
    )
    print(r)
    print("Book written. tree-siddur.js (in git) wires it into the library at id %d." % BOOK_ID)


if __name__ == "__main__":
    main()
