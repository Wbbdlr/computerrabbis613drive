// Unified offline dictionary lookup. Data loads via script injection (file://-safe):
// dictionaries/index.js sets LEX metadata + per-dict indexes
// dictionaries/<slug>/data-<n>.js calls LEX.chunk(slug, n, rows)
window.LEX = window.LEX || {};
(function () {
  "use strict";
  var LEX = window.LEX;
  LEX.dicts = LEX.dicts || [];
  LEX._chunks = {};
  LEX._cb = {};
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return document.querySelectorAll(s); };
  var NIKUD = /[֑-ׇ]/g, NONHEB = /[^א-ת]/g;
  function norm(s) { return (s || "").replace(NIKUD, "").replace(NONHEB, ""); }

  var activeDict = "all";

  LEX.chunk = function (slug, id, rows) {
    var key = slug + ":" + id;
    LEX._chunks[key] = rows;
    var cb = LEX._cb[key];
    if (cb) { delete LEX._cb[key]; cb(rows); }
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

  function showEntry(slug, globalId) {
    var idx = getIndex(slug);
    if (!idx) return;
    var chunkId = Math.floor(globalId / LEX.CHUNK);
    var pos = globalId % LEX.CHUNK;
    var dictMeta = LEX.dicts.filter(function (d) { return d.slug === slug; })[0];
    loadChunk(slug, chunkId, function (rows) {
      var box = $("#lex-entry");
      if (!rows || !rows[pos]) {
        box.innerHTML = "<span class='muted'>Could not load this entry.</span>";
        return;
      }
      var e = rows[pos];
      var srcLabel = dictMeta ? dictMeta.name : slug;
      box.innerHTML = "<div class='lex-hw'>" + e[0] + "</div>" +
        "<div class='lex-src'>" + srcLabel + "</div>" +
        "<div class='lex-def'>" + e[2] + "</div>";
      box.scrollTop = 0;
    });
  }

  function getIndex(slug) {
    return LEX["idx_" + slug] || [];
  }

  function search(q) {
    var res = $("#lex-res");
    res.innerHTML = "";
    var k = norm(q);
    if (k.length < 1) {
      res.innerHTML = "<div class='muted' style='padding:10px'>Type a Hebrew or Aramaic word (with or without nikud).</div>";
      return;
    }
    var hits = [];
    var cap = 100;
    var searchDicts = activeDict === "all"
      ? LEX.dicts.map(function (d) { return d.slug; })
      : [activeDict];

    for (var di = 0; di < searchDicts.length; di++) {
      var slug = searchDicts[di];
      var idx = getIndex(slug);
      for (var i = 0; i < idx.length && hits.length < cap; i++) {
        var sk = idx[i][0];
        if (sk === k || sk.indexOf(k) === 0) {
          hits.push({ slug: slug, id: i, hw: idx[i][1], exact: sk === k ? 0 : 1 });
        }
      }
    }
    if (hits.length < cap) {
      for (var di2 = 0; di2 < searchDicts.length; di2++) {
        var slug2 = searchDicts[di2];
        var idx2 = getIndex(slug2);
        for (var i2 = 0; i2 < idx2.length && hits.length < cap; i2++) {
          var sk2 = idx2[i2][0];
          if (k.length >= 2 && sk2.indexOf(k) > 0) {
            hits.push({ slug: slug2, id: i2, hw: idx2[i2][1], exact: 2 });
          }
        }
      }
    }
    hits.sort(function (a, b) { return a.exact - b.exact; });

    if (!hits.length) {
      res.innerHTML = "<div class='muted' style='padding:10px'>No entries found.</div>";
      return;
    }
    var abbrev = {};
    LEX.dicts.forEach(function (d) {
      abbrev[d.slug] = d.slug === "jastrow" ? "Jas" :
        d.slug === "bdb" ? "BDB" :
        d.slug === "bdb_aramaic" ? "BDB-A" :
        d.slug === "klein" ? "Klein" : d.slug;
    });
    hits.forEach(function (h) {
      var it = document.createElement("div");
      it.className = "lex-item";
      var hw = document.createElement("span");
      hw.textContent = h.hw;
      var src = document.createElement("span");
      src.className = "src";
      src.textContent = abbrev[h.slug] || h.slug;
      it.appendChild(hw);
      if (activeDict === "all") it.appendChild(src);
      it.addEventListener("click", function () {
        var a = $("#lex-res .lex-item.active");
        if (a) a.classList.remove("active");
        it.classList.add("active");
        showEntry(h.slug, h.id);
      });
      res.appendChild(it);
    });
    if (hits.length && hits[0].exact === 0) {
      res.firstChild.classList.add("active");
      showEntry(hits[0].slug, hits[0].id);
    }
  }

  function buildToolbar() {
    var bar = $("#dict-bar");
    var lbl = document.createElement("label");
    lbl.textContent = "Search in:";
    bar.appendChild(lbl);

    var allBtn = document.createElement("button");
    allBtn.className = "dict-btn active";
    allBtn.textContent = "All Dictionaries";
    allBtn.addEventListener("click", function () { setActive("all", allBtn); });
    bar.appendChild(allBtn);

    LEX.dicts.forEach(function (d) {
      var btn = document.createElement("button");
      btn.className = "dict-btn";
      btn.textContent = d.name + " (" + d.count.toLocaleString() + ")";
      btn.addEventListener("click", function () { setActive(d.slug, btn); });
      bar.appendChild(btn);
    });

    var total = LEX.dicts.reduce(function (s, d) { return s + d.count; }, 0);
    var ct = document.createElement("span");
    ct.className = "dict-count";
    ct.textContent = total.toLocaleString() + " entries total";
    bar.appendChild(ct);
  }

  function setActive(slug, btn) {
    activeDict = slug;
    $$(".dict-btn").forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
    var q = $("#lex-in").value;
    if (q) search(q);
  }

  function buildWelcome() {
    var info = $("#dict-info");
    if (!info) return;
    LEX.dicts.forEach(function (d) {
      var dt = document.createElement("dt");
      dt.textContent = d.name + " (" + d.count.toLocaleString() + " entries)";
      var dd = document.createElement("dd");
      dd.textContent = d.desc + " — " + d.license;
      info.appendChild(dt);
      info.appendChild(dd);
    });
  }

  LEX.ready = function () {
    if (LEX._loaded) return;
    LEX._loaded = true;
    buildToolbar();
    buildWelcome();
    var inp = $("#lex-in");
    inp.addEventListener("input", function () { search(this.value); });
    inp.focus();
  };

  document.addEventListener("DOMContentLoaded", function () {
    if (LEX.dicts && LEX.dicts.length) LEX.ready();
  });
})();
