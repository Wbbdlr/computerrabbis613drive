// Computer Rabbis — Offline Library reader.
// Book data loads by injecting books/<id>.js (each calls CR.book). Works from file://.
window.CR = window.CR || {};
(function () {
  "use strict";
  var CR = window.CR;
  CR.tree = CR.tree || [];
  CR.titles = CR.titles || [];
  CR._cb = {};
  CR._cache = {};
  CR._titleMap = null;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var cE = function (t, cls, txt) { var e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

  // ---- HTML sanitizer (defense-in-depth for third-party text content) ----
  var ALLOWED = { H1:1,H2:1,H3:1,H4:1,H5:1,H6:1,P:1,BR:1,B:1,STRONG:1,I:1,EM:1,U:1,SPAN:1,DIV:1,
    UL:1,OL:1,LI:1,TABLE:1,THEAD:1,TBODY:1,TR:1,TD:1,TH:1,SMALL:1,SUP:1,SUB:1,BLOCKQUOTE:1,HR:1,SECTION:1 };
  function sanitizeFrag(frag) {
    var els = frag.querySelectorAll("*");
    for (var i = els.length - 1; i >= 0; i--) {
      var el = els[i];
      if (!ALLOWED[el.tagName]) { el.parentNode.replaceChild(document.createTextNode(el.textContent), el); continue; }
      for (var j = el.attributes.length - 1; j >= 0; j--) {
        var nm = el.attributes[j].name.toLowerCase();
        if (nm.indexOf("on") === 0 || nm === "src" || nm === "srcset" || nm === "style" || nm === "href" || nm === "xlink:href" || nm === "formaction")
          el.removeAttribute(el.attributes[j].name);
      }
    }
  }
  // Parse in an inert <template> (no resource loads, no script execution), sanitize, then attach.
  function setHTML(el, html) {
    var tpl = document.createElement("template");
    tpl.innerHTML = html == null ? "" : String(html);
    sanitizeFrag(tpl.content);
    el.textContent = "";
    el.appendChild(tpl.content);
  }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }

  CR.book = function (id, data) { CR._cache[id] = data; var cb = CR._cb[id]; if (cb) { delete CR._cb[id]; cb(data); } };
  CR.load = function (id, cb) {
    if (CR._cache[id]) { cb(CR._cache[id]); return; }
    CR._cb[id] = cb;
    var s = document.createElement("script");
    s.src = "books/" + id + ".js";
    s.onerror = function () { delete CR._cb[id]; cb(null); };
    document.body.appendChild(s);
  };
  function titleOf(id) {
    if (!CR._titleMap) { CR._titleMap = {}; CR.titles.forEach(function (t) { CR._titleMap[t[0]] = t[1]; }); }
    return CR._titleMap[id] || ("#" + id);
  }

  // ---------- settings ----------
  var settings = { fontSize: 20, nikud: true, lastBook: null, lang: "both", theme: "light", font: "frankruehl" };
  Object.assign(settings, load("cr-reader", {}));
  function persist() { store("cr-reader", settings); }
  var pins = load("cr-pins", []);
  var recent = load("cr-recent", []);
  var curData = null, curId = null;

  // ---------- sidebar tree ----------
  function makeNode(node, depth) {
    var wrap = cE("div", "cat");
    if (node.name) {
      var head = cE("div", "cat-head");
      head.style.paddingRight = (8 + depth * 12) + "px";
      var caret = cE("span", "caret", "▸");
      head.appendChild(caret);
      head.appendChild(cE("span", "cat-name", node.name));
      wrap.appendChild(head);
      var body = cE("div", "cat-body"); body.style.display = "none";
      head.addEventListener("click", function () {
        var open = body.style.display === "none";
        body.style.display = open ? "block" : "none";
        caret.textContent = open ? "▾" : "▸";
      });
      (node.children || []).forEach(function (c) { body.appendChild(makeNode(c, depth + 1)); });
      (node.books || []).forEach(function (b) {
        var it = cE("div", "book-item"); it.style.paddingRight = (20 + depth * 12) + "px";
        it.textContent = b.t; it.setAttribute("data-id", b.id);
        it.addEventListener("click", function () { openBook(b.id); });
        body.appendChild(it);
      });
      wrap.appendChild(body);
    }
    return wrap;
  }
  function buildTree() {
    var host = $("#tree"); host.innerHTML = "";
    if (!CR.tree.length) { host.appendChild(cE("div", "muted", "Loading library index…")); return; }
    CR.tree.forEach(function (n) { host.appendChild(makeNode(n, 0)); });
  }

  // ---------- home view (pinned + recent) ----------
  function renderHome() {
    curId = null; curData = null;
    $("#toc-btn").style.display = $("#langbar").style.display = "none";
    ["btn-highlight", "btn-pin", "btn-print"].forEach(function (i) { $("#" + i).style.display = "none"; });
    var a = $(".book-item.active"); if (a) a.classList.remove("active");
    var pane = $("#reader"); pane.innerHTML = "";
    var w = cE("div", "home-wrap");
    w.appendChild(cE("h2", null, "Offline Torah Library"));
    w.appendChild(cE("p", "muted", "Thousands of seforim — Tanach, Shas, Rambam, Shulchan Aruch, Mishnah Berurah, midrash, mussar, chassidus and more — with English translations on the core texts. Everything works with no internet."));
    function section(title, ids, emptyMsg) {
      var s = cE("div", "home-sec"); s.appendChild(cE("h3", null, title));
      if (!ids.length) { s.appendChild(cE("div", "muted", emptyMsg)); }
      else {
        var row = cE("div", "chip-row");
        ids.forEach(function (id) {
          var chip = cE("div", "chip", titleOf(id));
          chip.addEventListener("click", function () { openBook(id); });
          row.appendChild(chip);
        });
        s.appendChild(row);
      }
      w.appendChild(s);
    }
    section("Pinned seforim", pins, "Open a sefer and press “Pin” to keep it here for quick access.");
    section("Recently viewed", recent.slice(0, 16), "Seforim you open will appear here.");
    pane.appendChild(w);
  }

  // ---------- open a book ----------
  function openBook(id) {
    curId = id;
    var pane = $("#reader");
    pane.innerHTML = "<div class='muted' style='padding:24px'>Loading…</div>";
    CR.load(id, function (data) {
      if (!data) { pane.innerHTML = "<div class='errbox'>Could not load this text from the drive.</div>"; return; }
      settings.lastBook = id; persist();
      curData = data;
      recent = [id].concat(recent.filter(function (x) { return x !== id; })).slice(0, 24); store("cr-recent", recent);
      var art = cE("article", "book");
      art.style.fontSize = settings.fontSize + "px";
      art.classList.toggle("no-nikud", !settings.nikud);
      if (data.bi) { art.appendChild(renderBilingual(data)); $("#langbar").style.display = data.en ? "flex" : "none"; }
      else { var c = cE("div"); setHTML(c, data.h); art.appendChild(c); $("#langbar").style.display = "none"; }
      pane.innerHTML = "";
      if (data.c) pane.appendChild(cE("div", "crumb", data.c));
      pane.appendChild(art);
      applyFont();
      pane.scrollTop = 0;
      ["btn-highlight", "btn-pin", "btn-print"].forEach(function (i) { $("#" + i).style.display = "inline-block"; });
      updatePinBtn();
      var prev = $(".book-item.active"); if (prev) prev.classList.remove("active");
      var cur = document.querySelector('.book-item[data-id="' + id + '"]'); if (cur) cur.classList.add("active");
      $("#inbook").value = "";
      buildToc(art, data);
      applyHighlights(art);
    });
  }

  function renderBilingual(data) {
    // Build one HTML string (labels/title escaped; segment content sanitized), parse once.
    var parts = ["<h1>" + esc(data.t) + "</h1>"];
    if (data.v) parts.push('<div class="tr-credit">' + esc("English translation: " + data.v) + "</div>");
    data.sec.forEach(function (sec, si) {
      if (sec.l) parts.push('<h2 class="sec-label" id="sec-' + si + '">' + esc(sec.l) + "</h2>");
      sec.segs.forEach(function (pair, i) {
        parts.push('<div class="seg-row"><span class="seg-num">' + (i + 1) + '</span><div class="seg-body">'
          + (pair[0] ? '<div class="he-seg">' + pair[0] + "</div>" : "")
          + (pair[1] ? '<div class="en-seg">' + pair[1] + "</div>" : "")
          + "</div></div>");
      });
    });
    var wrap = cE("div", "bi-wrap lang-" + settings.lang);
    setHTML(wrap, parts.join(""));
    return wrap;
  }
  function setLang(l) {
    settings.lang = l; persist();
    var w = document.querySelector(".bi-wrap"); if (w) w.className = "bi-wrap lang-" + l;
    document.querySelectorAll("#langbar button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-lang") === l); });
  }

  // ---------- table of contents ----------
  function buildToc(art, data) {
    var toc = $("#toc"); toc.innerHTML = "";
    var entries = [];
    if (data.bi) { art.querySelectorAll(".sec-label").forEach(function (el) { entries.push({ el: el, lvl: 1 }); }); }
    else {
      art.querySelectorAll("h1, h2, h3").forEach(function (el, i) { if (!el.id) el.id = "h-" + i; entries.push({ el: el, lvl: +el.tagName.charAt(1) }); });
      if (entries.length && entries[0].lvl === 1) entries.shift();
    }
    if (entries.length < 2) { $("#toc-btn").style.display = "none"; toc.style.display = "none"; return; }
    $("#toc-btn").style.display = "inline-block";
    entries.forEach(function (e) {
      var it = cE("div", "toc-item lvl" + e.lvl, e.el.textContent);
      it.addEventListener("click", function () { e.el.scrollIntoView({ block: "start" }); toc.style.display = "none"; });
      toc.appendChild(it);
    });
  }

  // ---------- title search ----------
  function runSearch(q) {
    var res = $("#searchres"); q = (q || "").trim();
    if (q.length < 2) { res.style.display = "none"; res.innerHTML = ""; return; }
    var lc = q.toLowerCase(), hits = [];
    for (var i = 0; i < CR.titles.length && hits.length < 60; i++) if (CR.titles[i][1].toLowerCase().indexOf(lc) !== -1) hits.push(CR.titles[i]);
    res.innerHTML = "";
    if (!hits.length) res.appendChild(cE("div", "muted", "No titles match."));
    hits.forEach(function (t) {
      var it = cE("div", "sr-item");
      it.appendChild(cE("div", "sr-title", t[1]));
      if (t[2]) it.appendChild(cE("div", "sr-cat", t[2]));
      it.addEventListener("click", function () { openBook(t[0]); res.style.display = "none"; $("#search").value = ""; });
      res.appendChild(it);
    });
    res.style.display = "block";
  }

  // ---------- in-book find ----------
  function inBookFind(q) {
    var art = $(".book"); if (!art) return;
    art.querySelectorAll("mark.f").forEach(function (m) { var p = m.parentNode; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize(); });
    q = (q || "").trim(); if (q.length < 2) return;
    var first = null, nodes = [], walk = document.createTreeWalker(art, NodeFilter.SHOW_TEXT, null), n;
    while ((n = walk.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      if (node.parentNode && node.parentNode.tagName === "MARK") return;
      var idx = node.nodeValue.indexOf(q); if (idx === -1) return;
      var span = document.createElement("span");
      span.appendChild(document.createTextNode(node.nodeValue.slice(0, idx)));
      var mk = cE("mark", "f", node.nodeValue.slice(idx, idx + q.length)); span.appendChild(mk);
      span.appendChild(document.createTextNode(node.nodeValue.slice(idx + q.length)));
      node.parentNode.replaceChild(span, node);
      if (!first) first = mk;
    });
    if (first) first.scrollIntoView({ block: "center" });
  }

  // ---------- highlights + notes (offset-based, persisted) ----------
  function hlKey(id) { return "cr-hl-" + id; }
  function textOffset(root, container, offset) {
    // char offset within root's text, measured via a Range (handles text OR element containers)
    var r = document.createRange();
    r.setStart(root, 0);
    try { r.setEnd(container, offset); } catch (e) { return 0; }
    return r.toString().length;
  }
  function selectionRange(root) {
    var sel = window.getSelection(); if (!sel || !sel.rangeCount) return null;
    var r = sel.getRangeAt(0);
    if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
    var start = textOffset(root, r.startContainer, r.startOffset);
    var end = textOffset(root, r.endContainer, r.endOffset);
    if (start > end) { var t = start; start = end; end = t; }
    return end > start ? { start: start, end: end } : null;
  }
  function wrapRange(root, start, end, idx, note) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), pos = 0, n, jobs = [];
    while ((n = w.nextNode())) {
      var len = n.nodeValue.length, ns = pos, ne = pos + len;
      if (ne > start && ns < end && n.parentNode.tagName !== "MARK") jobs.push({ node: n, s: Math.max(start, ns) - ns, e: Math.min(end, ne) - ns });
      pos = ne; if (pos >= end) break;
    }
    jobs.forEach(function (j) {
      var mid = j.node.splitText(j.s); mid.splitText(j.e - j.s);
      var mk = document.createElement("mark"); mk.className = "hl" + (note ? " has-note" : ""); mk.setAttribute("data-hl", idx);
      mid.parentNode.replaceChild(mk, mid); mk.appendChild(mid);
      mk.addEventListener("click", function (ev) { ev.stopPropagation(); openNote(idx, mk); });
    });
  }
  function applyHighlights(art) {
    var hls = load(hlKey(curId), []);
    hls.forEach(function (h, i) { if (h) wrapRange(art, h.start, h.end, i, h.note); });
  }
  function addHighlight() {
    var art = $(".book, .bi-wrap"); if (!art) return;
    var r = selectionRange(art.closest(".book") || art); if (!r) { alert("Select some text in the sefer first, then press Highlight."); return; }
    var root = $("article.book");
    var hls = load(hlKey(curId), []);
    hls.push({ start: r.start, end: r.end, note: "" });
    store(hlKey(curId), hls);
    wrapRange(root, r.start, r.end, hls.length - 1, "");
    window.getSelection().removeAllRanges();
  }
  var noteIdx = -1;
  function openNote(idx, mk) {
    noteIdx = idx;
    var hls = load(hlKey(curId), []); var h = hls[idx]; if (!h) return;
    var pop = $("#note-pop"); $("#note-text").value = h.note || "";
    var rect = mk.getBoundingClientRect();
    pop.style.top = (rect.bottom + window.scrollY + 4) + "px";
    pop.style.left = Math.min(rect.left, window.innerWidth - 320) + "px";
    pop.style.display = "block"; $("#note-text").focus();
  }
  function saveNote() {
    var hls = load(hlKey(curId), []); if (!hls[noteIdx]) return;
    hls[noteIdx].note = $("#note-text").value; store(hlKey(curId), hls);
    $("#note-pop").style.display = "none";
    var mk = document.querySelector('mark.hl[data-hl="' + noteIdx + '"]'); if (mk) mk.classList.toggle("has-note", !!hls[noteIdx].note);
  }
  function delNote() {
    var hls = load(hlKey(curId), []); if (!hls[noteIdx]) return;
    hls[noteIdx] = null; store(hlKey(curId), hls);
    $("#note-pop").style.display = "none";
    if (curId != null) openBook(curId); // re-render to drop the mark
  }

  // ---------- pins ----------
  function updatePinBtn() { var p = pins.indexOf(curId) !== -1; $("#btn-pin").textContent = p ? "Unpin" : "Pin"; $("#btn-pin").classList.toggle("on", p); }
  function togglePin() {
    if (curId == null) return;
    var i = pins.indexOf(curId);
    if (i === -1) pins.unshift(curId); else pins.splice(i, 1);
    pins = pins.slice(0, 40); store("cr-pins", pins); updatePinBtn();
  }

  // ---------- theme / fullscreen / sidebar / settings ----------
  var FONTS = { frankruehl: '"FrankRuehl","NotoHe",serif', georgia: 'Georgia,"Times New Roman",serif', arial: 'Arial,Helvetica,sans-serif', times: '"Times New Roman",Times,serif', noto: '"NotoHe","FrankRuehl",serif' };
  function applyTheme() { document.body.setAttribute("data-theme", settings.theme); }
  function applyFont() { var f = FONTS[settings.font] || FONTS.frankruehl; document.querySelectorAll("article.book, .bi-wrap").forEach(function (el) { el.style.fontFamily = f; }); }
  function setTheme(t) { settings.theme = t; persist(); applyTheme(); syncSettingsUI(); }
  function toggleFull() { if (!document.fullscreenElement) { (document.documentElement.requestFullscreen || function () {}).call(document.documentElement); } else { document.exitFullscreen && document.exitFullscreen(); } }
  function syncSettingsUI() {
    document.querySelectorAll(".sp-theme").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-theme") === settings.theme); });
    var sel = $("#sp-font"); if (sel) sel.value = settings.font || "frankruehl";
    var fs = $("#sp-fontsize-val"); if (fs) fs.textContent = settings.fontSize + "px";
  }
  function toggleSettings() {
    var p = $("#settings-panel"); if (!p) return;
    var show = p.style.display === "none";
    p.style.display = show ? "block" : "none";
    if (show) syncSettingsUI();
  }
  function exportData() {
    var data = { _cr_export: true, _date: new Date().toISOString() };
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf("cr-") === 0) data[k] = localStorage.getItem(k);
    }
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "computer-rabbis-data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data._cr_export) { alert("This does not appear to be a Computer Rabbis data file."); return; }
        var count = 0;
        for (var k in data) { if (k.indexOf("cr-") === 0) { localStorage.setItem(k, data[k]); count++; } }
        alert("Imported " + count + " items (notes, highlights, pins, settings). Reloading...");
        location.reload();
      } catch (e) { alert("Could not read this file: " + e.message); }
    };
    reader.readAsText(file);
  }

  // ---------- init ----------
  CR.ready = function () {
    buildTree();
    $("#count").textContent = CR.titles.length.toLocaleString();
  };
  CR._exists = function (id) { for (var i = 0; i < CR.titles.length; i++) if (CR.titles[i][0] === id) return true; return false; };
  CR.openBook = openBook;

  document.addEventListener("DOMContentLoaded", function () {
    applyTheme();
    $("#fontsize").value = settings.fontSize;
    $("#nikud").checked = settings.nikud;
    syncSettingsUI();
    $("#search").addEventListener("input", function () { runSearch(this.value); });
    $("#inbook").addEventListener("input", function () { inBookFind(this.value); });
    document.querySelectorAll("#langbar button").forEach(function (b) { b.addEventListener("click", function () { setLang(b.getAttribute("data-lang")); }); });
    $("#toc-btn").addEventListener("click", function (e) { e.stopPropagation(); var t = $("#toc"); t.style.display = t.style.display === "block" ? "none" : "block"; });
    $("#fontsize").addEventListener("input", function () {
      settings.fontSize = +this.value; persist();
      var a = $(".book"); if (a) a.style.fontSize = settings.fontSize + "px";
      var fs = $("#sp-fontsize-val"); if (fs) fs.textContent = settings.fontSize + "px";
    });
    $("#nikud").addEventListener("change", function () { settings.nikud = this.checked; persist(); var a = $(".book"); if (a) a.classList.toggle("no-nikud", !settings.nikud); });
    // sidebar toggle — both button and arrow
    function toggleSidebar() { document.body.classList.toggle("nosidebar"); }
    $("#btn-sidebar").addEventListener("click", toggleSidebar);
    var arrow = $("#sidebar-arrow"); if (arrow) arrow.addEventListener("click", toggleSidebar);
    // settings panel
    $("#btn-settings").addEventListener("click", function (e) { e.stopPropagation(); toggleSettings(); });
    document.querySelectorAll(".sp-theme").forEach(function (b) { b.addEventListener("click", function () { setTheme(b.getAttribute("data-theme")); }); });
    var spFont = $("#sp-font");
    if (spFont) spFont.addEventListener("change", function () { settings.font = this.value; persist(); applyFont(); });
    // data export/import
    var btnExport = $("#btn-export"); if (btnExport) btnExport.addEventListener("click", exportData);
    var btnImport = $("#btn-import");
    var impFile = $("#import-file");
    if (btnImport && impFile) {
      btnImport.addEventListener("click", function () { impFile.click(); });
      impFile.addEventListener("change", function () { if (this.files[0]) importData(this.files[0]); });
    }
    $("#btn-full").addEventListener("click", toggleFull);
    $("#btn-home").addEventListener("click", renderHome);
    $("#btn-highlight").addEventListener("click", addHighlight);
    $("#btn-pin").addEventListener("click", togglePin);
    $("#btn-print").addEventListener("click", function () { window.print(); });
    $("#note-save").addEventListener("click", saveNote);
    $("#note-del").addEventListener("click", delNote);
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".searchbox")) $("#searchres").style.display = "none";
      if (!e.target.closest("#toc") && e.target.id !== "toc-btn") $("#toc").style.display = "none";
      if (!e.target.closest("#note-pop") && !(e.target.tagName === "MARK" && e.target.classList.contains("hl"))) $("#note-pop").style.display = "none";
      if (!e.target.closest("#settings-panel") && e.target.id !== "btn-settings") { var sp = $("#settings-panel"); if (sp) sp.style.display = "none"; }
    });
    if (CR.tree.length) CR.ready();
    if (settings.lastBook && CR._exists(settings.lastBook)) openBook(settings.lastBook); else renderHome();
  });
})();
