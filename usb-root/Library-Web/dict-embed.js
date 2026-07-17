// Computer Rabbis — in-reader dictionary side panel.
// Lazy-loads the shared lexicon data (dictionaries/index.js + chunks) the first time
// the panel is opened, then provides lookup/browse over Jastrow, BDB & Klein.
// Data loads via <script> injection (file://-safe): index.js sets LEX.idx_*, chunk
// files call LEX.chunk(slug,id,rows).
window.LEX = window.LEX || {};
window.CRDict = (function () {
  "use strict";
  var LEX = window.LEX;
  LEX._chunks = LEX._chunks || {};
  LEX._cb = LEX._cb || {};
  var $ = function (s) { return document.querySelector(s); };
  var NIKUD = /[֑-ׇ]/g, NONHEB = /[^א-ת]/g;
  function norm(s) { return (s || "").replace(NIKUD, "").replace(NONHEB, ""); }

  var loaded = false, loading = false, activeDict = "all", pending = null;

  LEX.chunk = LEX.chunk || function (slug, id, rows) {
    var key = slug + ":" + id; LEX._chunks[key] = rows;
    var cb = LEX._cb[key]; if (cb) { delete LEX._cb[key]; cb(rows); }
  };
  function loadChunk(slug, id, cb) {
    var key = slug + ":" + id;
    if (LEX._chunks[key]) { cb(LEX._chunks[key]); return; }
    LEX._cb[key] = cb;
    var s = document.createElement("script");
    s.src = "dictionaries/" + slug + "/data-" + id + ".js";
    s.onerror = function () { delete LEX._cb[key]; cb(null); };
    document.body.appendChild(s);
  }
  function getIndex(slug) { return LEX["idx_" + slug] || []; }

  function ensureLoaded(cb) {
    if (loaded) { cb(true); return; }
    if (loading) { pending = cb; return; }
    loading = true;
    var entry = $("#dp-entry");
    entry.innerHTML = "<div class='muted' style='direction:ltr'>Loading dictionaries…</div>";
    var s = document.createElement("script");
    s.src = "dictionaries/index.js";
    s.onload = function () { loaded = true; loading = false; buildFilters(); entry.innerHTML = "<div class='muted' style='direction:ltr'>Type a word above, or select a word in a sefer, to look it up.</div>"; cb(true); if (pending) { var p = pending; pending = null; p(true); } };
    s.onerror = function () { loading = false; entry.innerHTML = "<div class='muted' style='direction:ltr'>Could not load the dictionary data from the drive.</div>"; cb(false); };
    document.body.appendChild(s);
  }

  var ABBR = { jastrow: "Jas", bdb: "BDB", bdb_aramaic: "BDB-A", klein: "Klein" };
  function buildFilters() {
    var bar = $("#dp-filters"); if (!bar || !LEX.dicts) return;
    bar.innerHTML = "";
    var all = mkFilter("all", "All");
    bar.appendChild(all);
    LEX.dicts.forEach(function (d) { bar.appendChild(mkFilter(d.slug, ABBR[d.slug] || d.name)); });
  }
  function mkFilter(slug, label) {
    var b = document.createElement("button");
    b.className = "dp-fbtn" + (slug === activeDict ? " active" : "");
    b.textContent = label;
    b.addEventListener("click", function () {
      activeDict = slug;
      document.querySelectorAll("#dp-filters .dp-fbtn").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      search($("#dp-in").value);
    });
    return b;
  }

  // Grammatical stems: a selected word is usually inflected (prefixes ו/ה/ב/כ/ל/מ/ש/ד,
  // suffixes ים/ות/ה/ת) while dictionaries are keyed by root/lemma. Generate a few
  // candidate stems to fall back on when the exact word isn't a headword.
  var PFX1 = "והבכלמשד";
  function stems(k) {
    var out = [], seen = {};
    function add(s) { if (s.length >= 2 && !seen[s]) { seen[s] = 1; out.push(s); } }
    add(k);
    if (k.length >= 3 && PFX1.indexOf(k[0]) !== -1) add(k.slice(1));
    if (k.length >= 4 && PFX1.indexOf(k[0]) !== -1 && PFX1.indexOf(k[1]) !== -1) add(k.slice(2));
    ["ים", "ות", "ת", "ה", "י"].forEach(function (sfx) { if (k.length >= sfx.length + 2 && k.slice(-sfx.length) === sfx) add(k.slice(0, -sfx.length)); });
    return out;
  }
  function matchKey(k, cap, dicts) {
    var hits = [];
    for (var di = 0; di < dicts.length; di++) {
      var idx = getIndex(dicts[di]);
      for (var i = 0; i < idx.length && hits.length < cap; i++) {
        var sk = idx[i][0];
        if (sk === k || sk.indexOf(k) === 0) hits.push({ slug: dicts[di], id: i, hw: idx[i][1], rank: sk === k ? 0 : 1 });
      }
    }
    if (hits.length < cap && k.length >= 2) {
      for (var d2 = 0; d2 < dicts.length; d2++) {
        var idx2 = getIndex(dicts[d2]);
        for (var j = 0; j < idx2.length && hits.length < cap; j++) if (idx2[j][0].indexOf(k) > 0) hits.push({ slug: dicts[d2], id: j, hw: idx2[j][1], rank: 2 });
      }
    }
    return hits;
  }
  function search(q) {
    var res = $("#dp-res"); res.innerHTML = "";
    var k = norm(q);
    if (k.length < 1) { res.innerHTML = ""; return; }
    var cap = 80;
    var dicts = activeDict === "all" ? LEX.dicts.map(function (d) { return d.slug; }) : [activeDict];
    var cands = stems(k), hits = [], usedStem = null;
    for (var c = 0; c < cands.length; c++) { hits = matchKey(cands[c], cap, dicts); if (hits.length) { usedStem = c > 0 ? cands[c] : null; break; } }
    hits.sort(function (a, b) { return a.rank - b.rank; });
    if (!hits.length) { res.innerHTML = "<div class='muted' style='padding:10px;direction:ltr'>No entry found. Dictionaries are listed by root — try the שורש (root) form.</div>"; return; }
    if (usedStem) { var note = document.createElement("div"); note.className = "muted"; note.style.cssText = "padding:6px 10px;direction:rtl;font-size:.8rem"; note.textContent = "מציג לפי: " + usedStem; res.appendChild(note); }
    hits.forEach(function (h) {
      var it = document.createElement("div"); it.className = "dp-item";
      var hw = document.createElement("span"); hw.textContent = h.hw; it.appendChild(hw);
      if (activeDict === "all") { var s = document.createElement("span"); s.className = "src"; s.textContent = ABBR[h.slug] || h.slug; it.appendChild(s); }
      it.addEventListener("click", function () {
        var a = document.querySelector("#dp-res .dp-item.active"); if (a) a.classList.remove("active");
        it.classList.add("active"); showEntry(h.slug, h.id);
      });
      res.appendChild(it);
    });
    if (hits[0].rank === 0) { res.firstChild.classList.add("active"); showEntry(hits[0].slug, hits[0].id); }
  }

  function showEntry(slug, gid) {
    var chunkId = Math.floor(gid / LEX.CHUNK), pos = gid % LEX.CHUNK;
    var meta = (LEX.dicts || []).filter(function (d) { return d.slug === slug; })[0];
    loadChunk(slug, chunkId, function (rows) {
      var box = $("#dp-entry");
      if (!rows || !rows[pos]) { box.innerHTML = "<span class='muted' style='direction:ltr'>Could not load this entry.</span>"; return; }
      var e = rows[pos];
      box.innerHTML = "<div class='hw'>" + e[0] + "</div><div class='src2'>" + (meta ? meta.name : slug) + "</div><div class='def'>" + e[2] + "</div>";
      box.scrollTop = 0;
    });
  }

  // Cross-reference links inside entries point at online Sefaria paths; turn them
  // into in-panel lookups of the referenced word instead of dead navigations.
  function wireEntryLinks() {
    var entry = $("#dp-entry");
    entry.addEventListener("click", function (e) {
      var a = e.target.closest("a"); if (!a || !entry.contains(a)) return;
      e.preventDefault();
      var word = (a.getAttribute("data-ref") || a.textContent || "").trim();
      var comma = word.indexOf(",");
      if (comma !== -1 && a.getAttribute("data-ref")) word = word.slice(comma + 1).replace(/\s+\d+$/, "").trim();
      if (!norm(word)) return;
      $("#dp-in").value = word; search(word);
    });
  }

  function openPanel() {
    document.body.classList.add("dict-open");
    ensureLoaded(function () { $("#dp-in").focus(); });
  }
  function closePanel() { document.body.classList.remove("dict-open"); }
  function togglePanel() { if (document.body.classList.contains("dict-open")) closePanel(); else openPanel(); }
  function lookup(word) {
    openPanel();
    ensureLoaded(function (ok) { if (!ok) return; $("#dp-in").value = word; search(word); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var inp = $("#dp-in");
    if (inp) inp.addEventListener("input", function () { if (loaded) search(this.value); else ensureLoaded(function () { search(inp.value); }); });
    wireEntryLinks();
  });

  return { openPanel: openPanel, closePanel: closePanel, togglePanel: togglePanel, lookup: lookup };
})();
