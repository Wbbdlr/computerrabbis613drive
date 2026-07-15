import json, urllib.request, urllib.parse
def g(u):
    return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "cr"}), timeout=30))
LEX = "Jastrow Dictionary"
def comp(prefix):
    u = "https://www.sefaria.org/api/words/completion/" + urllib.parse.quote(prefix) + "/" + urllib.parse.quote(LEX)
    return g(u)
r = comp("אב")
print("prefix 'אב' returned:", len(r), "pairs; sample:", r[:2])
r2 = comp("א")
print("prefix 'א' returned:", len(r2), "pairs (cap check)")
for w in [r[0][0], r[0][1]]:
    try:
        d = g("https://www.sefaria.org/api/texts/" + urllib.parse.quote("Jastrow, " + w))
        ok = bool(d.get("text"))
        print("fetch 'Jastrow, %s' -> %s" % (w, ("OK len=%d" % len(str(d.get("text")))) if ok else d.get("error")))
    except Exception as e:
        print("fetch err", w, e)
