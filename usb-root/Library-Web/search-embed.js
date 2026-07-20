// Computer Rabbis — full-text search across every book in the library.
// Lazy-loads the search index (search/index.js + chunks) the first time the panel
// opens. Data loads via <script> injection (file://-safe): index.js sets SRCH.vocab,
// chunk files call SRCH.chunk(id, {word: flatPostings}). No snippet text is stored in
// the index -- results load the matched book's own data on demand (CR.load, already
// used to open books normally) and extract a live snippet.
window.SRCH = window.SRCH || {};
window.CRSearch = (function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  SRCH._chunks = SRCH._chunks || {};
  SRCH.chunk = SRCH.chunk || function (id, obj) { SRCH._chunks[id] = obj; };

  var loaded = false, loading = false, pending = [];
  var lastQuery = "";

  function ensureLoaded(cb) {
    if (loaded) { cb(true); return; }
    pending.push(cb);
    if (loading) return;
    loading = true;
    var s = document.createElement("script");
    s.src = "search/index.js";
    s.onload = function () { loaded = true; loading = false; pending.forEach(function (p) { p(true); }); pending = []; };
    s.onerror = function () { loading = false; pending.forEach(function (p) { p(false); }); pending = []; };
    document.body.appendChild(s);
  }
  function loadChunk(id, cb) {
    if (SRCH._chunks[id]) { cb(SRCH._chunks[id]); return; }
    var s = document.createElement("script");
    s.src = "search/data-" + id + ".js";
    s.onload = function () { cb(SRCH._chunks[id] || null); };
    s.onerror = function () { cb(null); };
    document.body.appendChild(s);
  }

  var NIKUD = /[֑-ׇֽֿׁׂׅׄ]/g;
  var WORDSEP = /[־׀׃׆]/g;
  var WORD = /[א-ת]{2,}/g;
  var STOPWORDS = {};
  ("את של על אל עם אם כי לא הוא היא הם הן אני אתה אתם אנחנו זה זאת זו אלה אלו " +
   "כל גם רק יש אין לו לה להם לנו לך לכם בו בה בהם בנו בך בכם כן לכן אשר או ולא " +
   "מן מכל עד כאשר כמו הזה הזאת האלה אותו אותה אותם אותי אותך אותנו איזה איזו " +
   "מה מי איך למה כמה היכן פה שם הנה כך ככה איפה מאין").split(" ").forEach(function (w) { if (w) STOPWORDS[w] = 1; });

  function stripNikud(s) { return (s || "").replace(NIKUD, ""); }
  function tokenize(q) {
    var t = stripNikud(q).replace(WORDSEP, " ");
    var out = [], seen = {}, m; WORD.lastIndex = 0;
    while ((m = WORD.exec(t))) { var w = m[0]; if (!STOPWORDS[w] && !seen[w]) { seen[w] = 1; out.push(w); } }
    return out;
  }

  function decodePostings(flat) {
    var out = {}, i = 0;
    while (i < flat.length) { var b = flat[i++], n = flat[i++]; out[b] = flat.slice(i, i + n); i += n; }
    return out;
  }

  // Finds books+paragraphs containing every query word (intersected at the paragraph level).
  function searchText(q, cb) {
    var words = tokenize(q);
    if (!words.length) { cb([]); return; }
    ensureLoaded(function (ok) {
      if (!ok) { cb(null); return; }
      var chunkIds = {};
      words.forEach(function (w) { var c = SRCH.vocab[w]; if (c != null) chunkIds[c] = 1; });
      var ids = Object.keys(chunkIds);
      if (!ids.length) { cb([]); return; }
      var remaining = ids.length;
      ids.forEach(function (id) { loadChunk(+id, function () { if (--remaining === 0) finish(); }); });
      function finish() {
        var sets = words.map(function (w) {
          var c = SRCH.vocab[w], set = {};
          var flat = c != null && SRCH._chunks[c] ? SRCH._chunks[c][w] : null;
          if (flat) { var p = decodePostings(flat); Object.keys(p).forEach(function (b) { p[b].forEach(function (pi) { set[b + ":" + pi] = 1; }); }); }
          return set;
        });
        if (sets.some(function (s) { return !Object.keys(s).length; })) { cb([]); return; }
        // Intersect starting from the smallest set -- a common word's set can be huge on the full index.
        var base = sets.reduce(function (a, b) { return Object.keys(b).length < Object.keys(a).length ? b : a; });
        var keys = Object.keys(base).filter(function (k) { return sets.every(function (s) { return s[k]; }); });
        var byBook = {};
        keys.forEach(function (k) {
          var idx = k.indexOf(":"), b = +k.slice(0, idx), pi = +k.slice(idx + 1);
          (byBook[b] = byBook[b] || []).push(pi);
        });
        var books = Object.keys(byBook).map(function (b) { return { id: +b, paras: byBook[b].sort(function (x, y) { return x - y; }) }; });
        books.sort(function (a, b) { return b.paras.length - a.paras.length; });
        cb({ words: words, books: books.slice(0, 40), truncated: books.length > 40 });
      }
    });
  }

  function extractUnits(data) {
    var units = [];
    if (data.bi) {
      (data.sec || []).forEach(function (sec) { (sec.segs || []).forEach(function (pair) { units.push(pair && pair[0] ? pair[0] : ""); }); });
    } else {
      var tpl = document.createElement("template");
      tpl.innerHTML = data.h || "";
      tpl.content.querySelectorAll("p").forEach(function (p) { units.push(p.textContent); });
    }
    return units;
  }

  function snippet(rawText, words) {
    var stripped = stripNikud(rawText);
    var hits = [];
    words.forEach(function (w) { var p = stripped.indexOf(w); if (p !== -1) hits.push(p); });
    if (!hits.length) hits.push(0);
    // Window around the earliest match; widen toward the latest match too, so a second
    // query word within reach of the first still shows up in the same snippet.
    var lo = Math.min.apply(null, hits), hi = Math.max.apply(null, hits);
    var pos = hi - lo <= 160 ? Math.floor((lo + hi) / 2) : lo;
    // rawText and stripped differ only by removed combining marks, so a raw index a
    // little past the stripped index safely covers the same visible text.
    var start = Math.max(0, pos - 70), end = Math.min(rawText.length, pos + 100);
    var s = rawText.slice(start, end).replace(/^\S*\s/, "").trim();
    return (start > 0 ? "…" : "") + s + (end < rawText.length ? "…" : "");
  }

  // ---------- panel ----------
  var titleMap = null;
  function titleOf(id) {
    if (!titleMap) { titleMap = {}; (window.CR && CR.titles || []).forEach(function (t) { titleMap[t[0]] = t[1]; }); }
    return titleMap[id] || ("#" + id);
  }
  function renderResults(result, panelBody) {
    panelBody.innerHTML = "";
    if (!result) { panelBody.appendChild(cE("div", "muted fts-msg", "Could not load the search index from the drive.")); return; }
    if (!result.books.length) { panelBody.appendChild(cE("div", "muted fts-msg", "No results.")); return; }
    var summary = cE("div", "muted fts-summary", result.books.length + (result.truncated ? "+ " : " ") + "seforim" + (result.truncated ? " (showing top 40)" : ""));
    panelBody.appendChild(summary);
    result.books.forEach(function (b) {
      var box = cE("div", "fts-book");
      var head = cE("div", "fts-book-head");
      head.appendChild(cE("span", "fts-book-title", titleOf(b.id)));
      head.appendChild(cE("span", "fts-book-count", String(b.paras.length)));
      box.appendChild(head);
      var list = cE("div", "fts-hits");
      box.appendChild(list);
      var shown = 0;
      function showMore(n) {
        var slice = b.paras.slice(shown, shown + n);
        if (!slice.length) return;
        slice.forEach(function (pi) {
          var row = cE("div", "fts-hit muted", "…");
          row.addEventListener("click", function () { CR.openAt(b.id, pi); closePanel(); });
          list.appendChild(row);
          CR.load(b.id, function (data) {
            if (!data) { row.textContent = "(could not load)"; return; }
            var units = extractUnits(data);
            row.textContent = units[pi] ? snippet(units[pi], result.words) : "…";
          });
        });
        shown += slice.length;
        more.style.display = shown < b.paras.length ? "block" : "none";
      }
      var more = cE("div", "fts-more", "Show more in this sefer ›");
      more.addEventListener("click", function () { showMore(6); });
      box.appendChild(more);
      showMore(3);
      panelBody.appendChild(box);
    });
  }

  function cE(t, cls, txt) { var e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  var debounceT = null;
  function onInput(q) {
    clearTimeout(debounceT);
    lastQuery = q;
    var body = $("#fts-results");
    if (!q || q.trim().length < 2) { body.innerHTML = ""; return; }
    debounceT = setTimeout(function () {
      body.innerHTML = "<div class='muted fts-msg'>" + (loaded ? "Searching…" : "Loading the search index (first search only, a few seconds)…") + "</div>";
      searchText(q, function (result) { if (q === lastQuery) renderResults(result, body); });
    }, 250);
  }

  function openPanel() {
    document.body.classList.add("fts-open");
    ensureLoaded(function () {}); // warm the index while the user is still typing their query
    var inp = $("#fts-in"); if (inp) inp.focus();
  }
  function closePanel() { document.body.classList.remove("fts-open"); }
  function togglePanel() { if (document.body.classList.contains("fts-open")) closePanel(); else openPanel(); }

  document.addEventListener("DOMContentLoaded", function () {
    var inp = $("#fts-in");
    if (inp) inp.addEventListener("input", function () { onInput(this.value); });
    var closeBtn = $("#fts-close");
    if (closeBtn) closeBtn.addEventListener("click", closePanel);
  });

  return { openPanel: openPanel, closePanel: closePanel, togglePanel: togglePanel };
})();
