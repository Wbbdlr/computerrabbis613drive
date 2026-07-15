// ComputerRabbis Offline Jewish Calendar & Zmanim Toolkit
// Calendar/date/holiday/yahrzeit features are powered by @hebcal/core (GPLv2).
// Precise zmanim are powered by KosherZmanim (LGPL-2.1).
// 100% offline: both engines are plain <script> includes; no network is used.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var HC = window.hebcal;
  var KZ = window.KosherZmanim;
  if (!HC || !KZ) {
    var f = $("fatal"); f.style.display = "block";
    f.textContent = "Error: a calculation engine failed to load. The Zmanim folder must contain kosher-zmanim.min.js, hebcal.bundle.min.js, cities.js and toolkit.js together.";
    return;
  }
  var HDate = HC.HDate, HebrewCalendar = HC.HebrewCalendar, months = HC.months, gematriya = HC.gematriya;

  // ---------------- tabs ----------------
  var tabs = ["zmanim", "converter", "holidays", "yahrzeit", "learning", "omer", "molad", "shiurim", "gematria"];
  function showTab(name) {
    tabs.forEach(function (t) {
      $("tab-" + t).classList.toggle("active", t === name);
      $("panel-" + t).style.display = (t === name) ? "block" : "none";
    });
    try { localStorage.setItem("cr-tab", name); } catch (e) {}
  }
  tabs.forEach(function (t) { $("tab-" + t).addEventListener("click", function () { showTab(t); }); });

  // ---------------- shared state (zmanim) ----------------
  var state = { cityIdx: 0, date: new Date(), candles: 18, useElev: false, custom: null };
  try {
    var saved = JSON.parse(localStorage.getItem("cr-luach") || "{}");
    if (typeof saved.cityIdx === "number") state.cityIdx = saved.cityIdx;
    if (saved.candles) state.candles = saved.candles;
    state.useElev = !!saved.useElev; if (saved.custom) state.custom = saved.custom;
  } catch (e) {}
  function persist() { try { localStorage.setItem("cr-luach", JSON.stringify(state)); } catch (e) {} }
  function loc() { return state.custom || window.CITIES[state.cityIdx] || window.CITIES[0]; }

  // ---------------- tz helpers ----------------
  function tzOffsetMin(tz, utcMillis) {
    var dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    var p = {}; dtf.formatToParts(new Date(utcMillis)).forEach(function (x) { p[x.type] = x.value; });
    return (Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second) - utcMillis) / 60000;
  }
  function noonInstant(tz, y, m, d) {
    var guess = Date.UTC(y, m - 1, d, 12, 0, 0);
    var off = tzOffsetMin(tz, guess); off = tzOffsetMin(tz, guess - off * 60000);
    return Date.UTC(y, m - 1, d, 12, 0, 0) - off * 60000;
  }
  function fmtTime(dt, tz) { if (!dt) return "—"; try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(dt); } catch (e) { return "—"; } }
  function ymd(d) { return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }; }
  function toJs(x) { if (!x) return null; if (x instanceof Date) return isNaN(x.getTime()) ? null : x; if (typeof x.toJSDate === "function") { var d = x.toJSDate(); return isNaN(d.getTime()) ? null : d; } return null; }
  function safeCall(o, m) { var a = [].slice.call(arguments, 2); try { if (o && typeof o[m] === "function") return o[m].apply(o, a); } catch (e) {} return null; }

  // ================= ZMANIM TAB =================
  function makeCzc(p) {
    var L = loc();
    var gl = new KZ.GeoLocation(L.name, L.lat, L.lon, state.useElev ? (L.elev || 0) : 0, L.tz);
    var czc = new KZ.ComplexZmanimCalendar(gl);
    try { if (czc.setUseElevation) czc.setUseElevation(state.useElev); } catch (e) {}
    try { czc.setCandleLightingOffset(state.candles); } catch (e) {}
    czc.setDate(new Date(noonInstant(L.tz, p.y, p.m, p.d)));
    return czc;
  }
  function z(czc, m) { try { if (typeof czc[m] === "function") return toJs(czc[m]()); } catch (e) {} return null; }
  function jcal(p) { var L = loc(); var jc = new KZ.JewishCalendar(new Date(noonInstant(L.tz, p.y, p.m, p.d))); try { jc.setInIsrael(L.tz === "Asia/Jerusalem"); } catch (e) {} return jc; }

  var ZROWS = [
    { g: "Morning · בוקר" },
    { l: "Alos (72 min)", he: "עלות השחר עב' דק'", m: "getAlos72" },
    { l: "Alos (16.1°)", he: "עלות השחר 16.1°", m: "getAlos16Point1Degrees" },
    { l: "Misheyakir (11.5°)", he: "משיכיר", m: "getMisheyakir11Point5Degrees" },
    { l: "Netz (sunrise)", he: "הנץ החמה", m: "getSunrise" },
    { l: "Sof Zman Shma — MG\"A", he: "סוזק\"ש מג\"א", m: "getSofZmanShmaMGA" },
    { l: "Sof Zman Shma — GR\"A", he: "סוזק\"ש גר\"א", m: "getSofZmanShmaGRA" },
    { l: "Sof Zman Tfila — MG\"A", he: "סוז\"ת מג\"א", m: "getSofZmanTfilaMGA" },
    { l: "Sof Zman Tfila — GR\"A", he: "סוז\"ת גר\"א", m: "getSofZmanTfilaGRA" },
    { g: "Midday & afternoon · צהריים" },
    { l: "Chatzos", he: "חצות", m: "getChatzos" },
    { l: "Mincha Gedola", he: "מנחה גדולה", m: "getMinchaGedola" },
    { l: "Mincha Ketana", he: "מנחה קטנה", m: "getMinchaKetana" },
    { l: "Plag HaMincha", he: "פלג המנחה", m: "getPlagHamincha" },
    { g: "Evening · ערב" },
    { l: "Shkia (sunset)", he: "שקיעה", m: "getSunset" },
    { l: "Tzeis (8.5°)", he: "צאת הכוכבים", m: "getTzaisGeonim8Point5Degrees" },
    { l: "Tzeis — Rabbeinu Tam (72)", he: "צאת ר\"ת", m: "getTzais72" }
  ];

  function renderZmanim() {
    var L = loc(), tz = L.tz, p = ymd(state.date);
    var czc = makeCzc(p), jc = jcal(p);
    var hdf = null; try { hdf = new KZ.HebrewDateFormatter(); hdf.setHebrewFormat(true); } catch (e) {}
    var civil = new Intl.DateTimeFormat("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date(p.y, p.m - 1, p.d));
    var heDate = (hdf && safeCall(hdf, "format", jc)) || "";
    var strip = '<div class="item"><b>' + civil + "</b></div>";
    if (heDate) strip += '<div class="he">' + heDate + "</div>";
    var base = new Date(p.y, p.m - 1, p.d);
    var shab = new Date(base); shab.setDate(base.getDate() + ((6 - base.getDay() + 7) % 7));
    var parsha = (hdf && safeCall(hdf, "formatParsha", jcal(ymd(shab)))) || "";
    if (parsha) strip += '<div class="item">Parshas <b style="direction:rtl">' + parsha + "</b></div>";
    var daf = safeCall(jc, "getDafYomiBavli"); if (!daf && KZ.YomiCalculator) daf = safeCall(KZ.YomiCalculator, "getDafYomiBavli", jc);
    var dafStr = daf && hdf ? safeCall(hdf, "formatDafYomiBavli", daf) : null;
    if (dafStr) strip += '<div class="item">Daf Yomi: <b style="direction:rtl">' + dafStr + "</b></div>";
    var omer = safeCall(jc, "getDayOfOmer"); if (omer && omer > 0) strip += '<div class="item">Omer: <b>' + omer + "</b></div>";
    var yt = (hdf && safeCall(hdf, "formatYomTov", jc)) || ""; if (yt) strip += '<span class="flag">' + yt + "</span>";
    if (safeCall(jc, "isRoshChodesh")) strip += '<span class="flag">ראש חודש</span>';
    $("todaystrip").innerHTML = strip;

    var html = "";
    ZROWS.forEach(function (r) {
      if (r.g) { html += '<tr class="group"><td colspan="3">' + r.g + "</td></tr>"; return; }
      html += "<tr><td>" + r.l + '</td><td class="he">' + r.he + '</td><td class="time">' + fmtTime(z(czc, r.m), tz) + "</td></tr>";
    });
    $("ztable").innerHTML = html;

    var fri = new Date(base); fri.setDate(base.getDate() + ((5 - base.getDay() + 7) % 7));
    var sat = new Date(fri); sat.setDate(fri.getDate() + 1);
    var friCandle = z(makeCzc(ymd(fri)), "getCandleLighting");
    var satCzc = makeCzc(ymd(sat));
    var friFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(fri);
    var sh = "<h3>שבת קודש — Parshas " + (parsha || "") + "</h3>";
    sh += '<div>Candle lighting (Fri ' + friFmt + ", " + state.candles + ' min): <span class="big">' + fmtTime(friCandle, tz) + "</span></div>";
    sh += '<div style="margin-top:6px">Havdalah (8.5°): <b>' + fmtTime(z(satCzc, "getTzaisGeonim8Point5Degrees"), tz) + "</b></div>";
    sh += '<div>Motzaei Shabbos — Rabbeinu Tam: <b>' + fmtTime(z(satCzc, "getTzais72"), tz) + "</b></div>";
    $("shabboscard").innerHTML = sh;
  }

  function renderMonth() {
    var L = loc(), tz = L.tz, p = ymd(state.date);
    var dim = new Date(p.y, p.m, 0).getDate();
    $("monthtitle").textContent = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(p.y, p.m - 1, 1)) + " — " + L.name + " (candles " + state.candles + " min)";
    var hdf = null; try { hdf = new KZ.HebrewDateFormatter(); hdf.setHebrewFormat(true); } catch (e) {}
    var html = "<table class='month'><tr><th>Date</th><th>Day</th><th>עברי</th><th>Alos 72</th><th>Netz</th><th>Shma גר\"א</th><th>Chatzos</th><th>Plag</th><th>Candles</th><th>Shkia</th><th>Tzeis 8.5°</th><th>ר\"ת</th></tr>";
    for (var d = 1; d <= dim; d++) {
      var dp = { y: p.y, m: p.m, d: d }, czc = makeCzc(dp), dow = new Date(p.y, p.m - 1, d).getDay(), jc = jcal(dp), heDay = "";
      try { heDay = hdf ? hdf.formatHebrewNumber(jc.getJewishDayOfMonth()) : jc.getJewishDayOfMonth(); } catch (e) { try { heDay = jc.getJewishDayOfMonth(); } catch (e2) {} }
      var candle = (dow === 5) ? z(czc, "getCandleLighting") : null;
      var cls = (dow === 6 || safeCall(jc, "isYomTov")) ? " class='shabbosrow'" : "";
      html += "<tr" + cls + "><td>" + p.m + "/" + d + "</td><td>" + ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Shab"][dow] + "</td><td>" + heDay + "</td><td>" + fmtTime(z(czc, "getAlos72"), tz) + "</td><td>" + fmtTime(z(czc, "getSunrise"), tz) + "</td><td>" + fmtTime(z(czc, "getSofZmanShmaGRA"), tz) + "</td><td>" + fmtTime(z(czc, "getChatzos"), tz) + "</td><td>" + fmtTime(z(czc, "getPlagHamincha"), tz) + "</td><td><b>" + (candle ? fmtTime(candle, tz) : "") + "</b></td><td>" + fmtTime(z(czc, "getSunset"), tz) + "</td><td>" + fmtTime(z(czc, "getTzaisGeonim8Point5Degrees"), tz) + "</td><td>" + fmtTime(z(czc, "getTzais72"), tz) + "</td></tr>";
    }
    $("monthwrap").innerHTML = html + "</table>";
    $("monthcard").style.display = "block";
  }

  // ================= CONVERTER TAB =================
  var HMONTHS = [
    { v: months.NISAN, n: "Nisan / ניסן" }, { v: months.IYYAR, n: "Iyar / אייר" }, { v: months.SIVAN, n: "Sivan / סיון" },
    { v: months.TAMUZ, n: "Tamuz / תמוז" }, { v: months.AV, n: "Av / אב" }, { v: months.ELUL, n: "Elul / אלול" },
    { v: months.TISHREI, n: "Tishrei / תשרי" }, { v: months.CHESHVAN, n: "Cheshvan / חשון" }, { v: months.KISLEV, n: "Kislev / כסלו" },
    { v: months.TEVET, n: "Teves / טבת" }, { v: months.SHVAT, n: "Shvat / שבט" }, { v: months.ADAR_I, n: "Adar (I) / אדר א" }, { v: months.ADAR_II, n: "Adar II / אדר ב" }
  ];
  function hebMonthHe(hd) {
    // extract the (nikud) Hebrew month name from the engine's Hebrew rendering
    try { var parts = hd.render("he").split(" "); return parts.length >= 2 ? parts[1].replace(/[,،]/g, "") : hd.getMonthName(); }
    catch (e) { return hd.getMonthName(); }
  }
  function hebFull(hd) {
    return gematriya(hd.getDate()) + " " + hebMonthHe(hd) + " " + gematriya(hd.getFullYear());
  }
  function convGreg() {
    var v = $("cg-date").value; if (!v) return;
    var pr = v.split("-"); var d = new Date(+pr[0], +pr[1] - 1, +pr[2]);
    var hd = new HDate(d);
    var jc = new KZ.JewishCalendar(d);
    var out = "<div class='big he'>" + hebFull(hd) + "</div>";
    out += "<div>" + hd.render("en") + "</div>";
    var hol = HebrewCalendar.getHolidaysOnDate(hd, false) || [];
    if (hol.length) out += "<div class='muted'>" + hol.map(function (e) { return e.render("en"); }).join(", ") + "</div>";
    var dow = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(d);
    out += "<div class='muted'>" + dow + "</div>";
    $("cg-out").innerHTML = out;
  }
  function convHeb() {
    var y = parseInt($("ch-year").value, 10), mo = parseInt($("ch-month").value, 10), da = parseInt($("ch-day").value, 10);
    if (!y || !mo || !da) return;
    try {
      var hd = new HDate(da, mo, y);
      var g = hd.greg();
      var out = "<div class='big'>" + new Intl.DateTimeFormat("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(g) + "</div>";
      out += "<div class='he'>" + hebFull(hd) + "</div>";
      var hol = HebrewCalendar.getHolidaysOnDate(hd, false) || [];
      if (hol.length) out += "<div class='muted'>" + hol.map(function (e) { return e.render("en"); }).join(", ") + "</div>";
      $("ch-out").innerHTML = out;
    } catch (e) { $("ch-out").innerHTML = "<div class='muted'>That Hebrew date does not exist in that year (e.g. Adar II in a non-leap year, or day 30 of a 29-day month).</div>"; }
  }

  // ================= HOLIDAYS TAB =================
  function renderHolidays() {
    var gy = parseInt($("hol-year").value, 10); if (!gy) return;
    var il = $("hol-israel").checked;
    var minor = $("hol-minor").checked;
    var evts = HebrewCalendar.calendar({ year: gy, isHebrewYear: false, numYears: 1, il: il, sedrot: false, omer: false });
    var rows = "";
    evts.forEach(function (e) {
      var f = e.getFlags();
      var isMajor = (f & HC.flags.CHAG) || (f & HC.flags.YOM_TOV_ENDS) || (f & HC.flags.MAJOR_FAST) || /Rosh Hashana|Yom Kippur|Sukkot|Pesach|Shavuot|Chanukah|Purim|Tish|Fast|Rosh Chodesh/.test(e.render("en"));
      if (!minor && !isMajor) return;
      var d = e.getDate().greg();
      var g = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(d);
      rows += "<tr><td>" + g + "</td><td>" + e.render("en") + "</td><td class='he'>" + e.render("he") + "</td></tr>";
    });
    $("hol-out").innerHTML = "<table class='ztable'><tr class='group'><td>Civil date</td><td>Holiday</td><td class='he'>עברית</td></tr>" + rows + "</table>";
  }

  // ================= YAHRZEIT TAB =================
  function computeYahrzeit() {
    var mode = $("yz-mode").value;
    var deathHd;
    try {
      if (mode === "greg") {
        var v = $("yz-gdate").value; if (!v) { return; }
        var pr = v.split("-"); var gd = new Date(+pr[0], +pr[1] - 1, +pr[2]);
        if ($("yz-aftersunset").checked) gd.setDate(gd.getDate() + 1); // after nightfall = next Hebrew day
        deathHd = new HDate(gd);
      } else {
        var y = parseInt($("yz-hyear").value, 10), mo = parseInt($("yz-hmonth").value, 10), da = parseInt($("yz-hday").value, 10);
        deathHd = new HDate(da, mo, y);
      }
    } catch (e) { $("yz-out").innerHTML = "<div class='muted'>Please enter a valid date.</div>"; return; }
    var startY = deathHd.getFullYear() + 1;
    var n = Math.max(1, Math.min(60, parseInt($("yz-count").value, 10) || 20));
    var kind = $("yz-kind").value; // yahrzeit | birthday
    var rows = "";
    var icsRows = [];
    var heHead = gematriya(deathHd.getDate()) + " " + hebMonthHe(deathHd);
    var kindLabel = (kind === "yahrzeit") ? "Yahrzeit" : "Hebrew anniversary";
    for (var i = 0; i < n; i++) {
      var hy = startY + i;
      var obsHd;
      try {
        obsHd = (kind === "yahrzeit")
          ? HebrewCalendar.getYahrzeit(hy, deathHd)
          : HebrewCalendar.getBirthdayOrAnniversary(hy, deathHd);
      } catch (e) { obsHd = null; }
      if (!obsHd) continue;
      var g = obsHd.greg();
      icsRows.push(vAllDay(g, kindLabel + " — " + heHead, "Observed " + gematriya(obsHd.getDate()) + " " + hebMonthHe(obsHd) + " " + gematriya(hy) + ". Begins the previous evening."));
      var gStr = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" }).format(g);
      var eveStr = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(g.getFullYear(), g.getMonth(), g.getDate() - 1));
      rows += "<tr><td>" + gematriya(hy) + "</td><td class='he'>" + gematriya(obsHd.getDate()) + " " + hebMonthHe(obsHd) + "</td><td>" + gStr + "</td><td class='muted'>from prev. eve " + eveStr + "</td></tr>";
    }
    var title = (kind === "yahrzeit") ? "Yahrzeit" : "Hebrew birthday / anniversary";
    $("yz-out").innerHTML = "<p class='muted'>" + title + " of <b class='he'>" + heHead + "</b> — observed each year on:</p><table class='ztable'><tr class='group'><td>Year</td><td class='he'>עברית</td><td>Civil date (the day)</td><td>note</td></tr>" + rows + "</table><p class='muted'>The observance begins the preceding evening at nightfall. For the first year and any halachic questions, consult your Rav.</p>";
    var btn = $("yz-export"); if (btn) { btn.style.display = "inline-block"; btn.onclick = function () { exportYahrzeit(icsRows); }; }
  }

  // ================= DAILY LEARNING TAB =================
  var lrnDate = new Date();
  function renderLearning() {
    var p = ymd(lrnDate);
    var jc = new KZ.JewishCalendar(new Date(noonInstant("UTC", p.y, p.m, p.d)));
    var hdf = new KZ.HebrewDateFormatter(); hdf.setHebrewFormat(true);
    var rows = [];
    var civil = new Intl.DateTimeFormat("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date(p.y, p.m - 1, p.d));
    rows.push(["Date", civil + " · " + safeCall(hdf, "format", jc)]);
    // parsha of the coming Shabbos
    var base = new Date(p.y, p.m - 1, p.d);
    var shab = new Date(base); shab.setDate(base.getDate() + ((6 - base.getDay() + 7) % 7));
    var sp = ymd(shab);
    var jcS = new KZ.JewishCalendar(new Date(noonInstant("UTC", sp.y, sp.m, sp.d)));
    var parsha = safeCall(hdf, "formatParsha", jcS);
    if (parsha) rows.push(["Parsha (this Shabbos)", parsha]);
    try { rows.push(["Daf Yomi — Bavli", hdf.formatDafYomiBavli(KZ.YomiCalculator.getDafYomiBavli(jc))]); } catch (e) {}
    try { rows.push(["Daf Yomi — Yerushalmi", hdf.formatDafYomiYerushalmi(KZ.YerushalmiYomiCalculator.getDafYomiYerushalmi(jc))]); } catch (e) {}
    var omer = safeCall(jc, "getDayOfOmer"); if (omer && omer > 0) rows.push(["Sefiras HaOmer", "Day " + omer]);
    var html = "<table class='zmanim'>";
    rows.forEach(function (r) { html += "<tr><td>" + r[0] + "</td><td class='time' style='direction:rtl'>" + r[1] + "</td></tr>"; });
    html += "</table>";
    $("lrn-out").innerHTML = html;
  }

  // ================= SEFIRAS HAOMER TAB =================
  var omerDate = new Date();
  function omerDayFor(hd) {
    var y = hd.getFullYear();
    var pesach16 = new HDate(16, months.NISAN, y);
    var d = hd.abs() - pesach16.abs() + 1;
    return (d >= 1 && d <= 49) ? d : 0;
  }
  function omerText(day) {
    try { var oe = new HC.OmerEvent(new HDate(), day); return { he: oe.render("he"), en: oe.render("en"), sefirah: (oe.sefira ? oe.sefira("he") : "") }; }
    catch (e) {
      var weeks = Math.floor(day / 7), days = day % 7;
      var en = "Today is " + day + " day" + (day > 1 ? "s" : "") + (weeks ? ", which is " + weeks + " week" + (weeks > 1 ? "s" : "") + (days ? " and " + days + " day" + (days > 1 ? "s" : "") : "") : "") + " of the Omer.";
      return { he: "", en: en, sefirah: "" };
    }
  }
  function renderOmer() {
    var p = ymd(omerDate);
    var todayHd = new HDate(new Date(p.y, p.m - 1, p.d));
    var tonightHd = new HDate(new Date(p.y, p.m - 1, p.d + 1)); // Hebrew day that begins tonight
    var dToday = omerDayFor(todayHd), dTonight = omerDayFor(tonightHd);
    var html = "";
    var civil = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(p.y, p.m - 1, p.d));
    html += "<div class='muted'>" + civil + "</div>";
    if (!dToday && !dTonight) {
      html += "<p class='big'>This date is outside Sefiras HaOmer (which runs from 16 Nisan to 5 Sivan).</p>";
    } else {
      if (dToday) { var t = omerText(dToday); html += "<div class='outbox'><b>During today (daytime): day " + dToday + " of the Omer.</b>" + (t.he ? "<div class='big' style='direction:rtl'>" + t.he + "</div>" : "") + "<div>" + t.en + "</div></div>"; }
      if (dTonight) { var t2 = omerText(dTonight); html += "<div class='outbox' style='margin-top:10px'><b>Tonight, after nightfall, count: day " + dTonight + ".</b>" + (t2.he ? "<div class='big' style='direction:rtl'>" + t2.he + "</div>" : "") + "<div>" + t2.en + "</div></div>"; }
    }
    $("omer-out").innerHTML = html;
  }

  // ================= MOLAD TAB =================
  function renderMolad() {
    var y = parseInt($("molad-year").value, 10), mo = parseInt($("molad-month").value, 10);
    if (!y || !mo) return;
    var molad = null;
    try { molad = HC.calculateMolad(y, mo); } catch (e) {}
    var monthName = hebMonthHe(new HDate(1, mo, y));
    if (!molad) { $("molad-out").innerHTML = "<p class='muted'>Could not compute the molad for that month.</p>"; return; }
    var mhd = new HDate(molad.hdate.dd, molad.hdate.mm, molad.hdate.yy);
    var dowNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
    var dow = dowNames[mhd.getDay()];
    var dowEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Shabbos"][mhd.getDay()];
    // molad.hour is counted from 6pm (18:00); convert to a civil clock time
    var clock = (18 + molad.hour) % 24;
    var ampm = clock < 12 ? "AM" : "PM"; var h12 = clock % 12; if (h12 === 0) h12 = 12;
    var clockStr = h12 + ":" + String(molad.minutes).padStart(2, "0") + " " + ampm;
    var html = "<div class='outbox'><div class='big' style='direction:rtl'>מולד חודש " + monthName + " " + gematriya(y) + "</div>";
    html += "<table class='zmanim' style='margin-top:8px'>";
    html += "<tr><td>Day</td><td class='time'>" + dowEn + " · <span style='direction:rtl'>יום " + dow + "</span></td></tr>";
    html += "<tr><td>Clock time</td><td class='time'>" + clockStr + "</td></tr>";
    html += "<tr><td>Traditional</td><td class='time'>" + molad.hour + "h " + molad.minutes + "m " + molad.chalakim + " chalakim (from 6:00 PM)</td></tr>";
    html += "</table></div>";
    $("molad-out").innerHTML = html;
  }

  // ================= SHIURIM TAB =================
  // [label, hebrew, unit-type, Rav Chaim Naeh value, Chazon Ish value]
  var SHIURIM = [
    ["Length · אורך"],
    ["Etzba (fingerbreadth)", "אצבע", "2.0 cm", "2.4 cm"],
    ["Tefach (handbreadth)", "טפח", "8.0 cm", "9.6 cm"],
    ["Zeret (span)", "זרת", "24 cm", "28.8 cm"],
    ["Amah (cubit)", "אמה", "48 cm", "57.6 cm"],
    ["Distance · מרחק"],
    ["Mil", "מיל", "960 m (~0.6 mi)", "1152 m (~0.72 mi)"],
    ["Techum Shabbos (2000 amos)", "תחום שבת", "960 m", "1152 m"],
    ["Volume · נפח"],
    ["Revi'is", "רביעית", "86 ml (2.9 oz)", "150 ml (5.1 oz)"],
    ["Kezayis (≈½ kebeitzah)", "כזית", "~28 ml", "~50 ml"],
    ["Kebeitzah (egg)", "כביצה", "~57 ml", "~100 ml"],
    ["Weight (approx. use) · משקל"],
    ["Kezayis matzah/maror (approx.)", "כזית", "~17–28 g", "~28–50 g"],
    ["Challah shiur (flour, with bracha)", "שיעור חלה", "~1.2 kg", "~1.67 kg"]
  ];
  var UNIT_VALUES = {
    "revi'is": { naeh: 86, ci: 150, u: "ml" }, "kezayis": { naeh: 28, ci: 50, u: "ml" },
    "kebeitzah": { naeh: 57, ci: 100, u: "ml" }, "tefach": { naeh: 8.0, ci: 9.6, u: "cm" },
    "amah": { naeh: 48, ci: 57.6, u: "cm" }, "mil": { naeh: 960, ci: 1152, u: "m" }
  };
  function renderShiurim() {
    var html = "<table class='zmanim'><tr class='group'><td>Measure</td><td class='he'>עברית</td><td>Rav Chaim Naeh</td><td>Chazon Ish</td></tr>";
    SHIURIM.forEach(function (r) {
      if (r.length === 1) { html += "<tr class='group'><td colspan='4'>" + r[0] + "</td></tr>"; return; }
      html += "<tr><td>" + r[0] + "</td><td class='he'>" + r[1] + "</td><td class='time'>" + r[2] + "</td><td class='time'>" + r[3] + "</td></tr>";
    });
    html += "</table>";
    $("shiur-out").innerHTML = html;
  }
  function calcShiur() {
    var q = parseFloat($("sh-qty").value) || 0, unit = $("sh-unit").value, v = UNIT_VALUES[unit];
    if (!v) return;
    var n = (q * v.naeh), c = (q * v.ci);
    var fmt = function (x) { return (Math.round(x * 10) / 10) + " " + v.u; };
    $("sh-result").innerHTML = "<b>" + q + " " + unit + "</b> ≈ <b>" + fmt(n) + "</b> (Rav Chaim Naeh) &nbsp;·&nbsp; <b>" + fmt(c) + "</b> (Chazon Ish)";
  }

  // ================= GEMATRIA TAB =================
  var GEM = { "א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6, "ז": 7, "ח": 8, "ט": 9, "י": 10, "כ": 20, "ל": 30, "מ": 40, "נ": 50, "ס": 60, "ע": 70, "פ": 80, "צ": 90, "ק": 100, "ר": 200, "ש": 300, "ת": 400, "ך": 20, "ם": 40, "ן": 50, "ף": 80, "ץ": 90 };
  var GEM_SOFIT = { "ך": 500, "ם": 600, "ן": 700, "ף": 800, "ץ": 900 };
  function calcGematria() {
    var s = $("gm-in").value.replace(/[֑-ׇ]/g, ""); // strip nikud/te'amim
    var std = 0, sofit = 0, ordinal = 0, count = 0;
    var ordMap = "אבגדהוזחטיכלמנסעפצקרשת";
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (GEM[ch] != null) {
        std += GEM[ch];
        sofit += (GEM_SOFIT[ch] != null ? GEM_SOFIT[ch] : GEM[ch]);
        var base = ch.replace(/[ךםןףץ]/, function (m) { return { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" }[m]; });
        var oi = ordMap.indexOf(base); if (oi >= 0) ordinal += oi + 1;
        count++;
      }
    }
    var katan = std; while (katan > 9) { katan = String(katan).split("").reduce(function (a, b) { return a + (+b); }, 0); }
    if (!count) { $("gm-out").innerHTML = "<span class='muted'>Enter Hebrew letters.</span>"; return; }
    var sEsc = s.replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
    $("gm-out").innerHTML =
      "<div class='big' style='direction:rtl'>" + sEsc + "</div>" +
      "<table class='zmanim' style='margin-top:8px'>" +
      "<tr><td>Standard (hechrachi)</td><td class='time'>" + std + "</td></tr>" +
      "<tr><td>With sofios (gadol)</td><td class='time'>" + sofit + "</td></tr>" +
      "<tr><td>Ordinal (siduri)</td><td class='time'>" + ordinal + "</td></tr>" +
      "<tr><td>Reduced (katan)</td><td class='time'>" + katan + "</td></tr>" +
      "<tr><td>Letters</td><td class='time'>" + count + "</td></tr></table>";
  }

  // ---------------- ICS export (offline .ics calendar files) ----------------
  function pad(n) { return String(n).padStart(2, "0"); }
  function icsUTC(d) { return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + "00Z"; }
  function icsDay(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
  function icsEsc(s) { return String(s).replace(/([\\;,])/g, "\\$1").replace(/\n/g, "\\n"); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + "@computerrabbis"; }
  function vTimed(dt, summary, desc) {
    return ["BEGIN:VEVENT", "UID:" + uid(), "DTSTAMP:" + icsUTC(new Date()), "DTSTART:" + icsUTC(dt), "DURATION:PT5M", "SUMMARY:" + icsEsc(summary)].concat(desc ? ["DESCRIPTION:" + icsEsc(desc)] : []).concat(["END:VEVENT"]).join("\r\n");
  }
  function vAllDay(d, summary, desc) {
    var end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    return ["BEGIN:VEVENT", "UID:" + uid(), "DTSTAMP:" + icsUTC(new Date()), "DTSTART;VALUE=DATE:" + icsDay(d), "DTEND;VALUE=DATE:" + icsDay(end), "SUMMARY:" + icsEsc(summary)].concat(desc ? ["DESCRIPTION:" + icsEsc(desc)] : []).concat(["END:VEVENT"]).join("\r\n");
  }
  function downloadICS(filename, vevents, calName) {
    if (!vevents.length) { alert("Nothing to export for that selection."); return; }
    var head = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ComputerRabbis//Offline Torah Drive//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:" + icsEsc(calName || "Jewish Calendar")];
    var ics = head.concat(vevents, ["END:VCALENDAR"]).join("\r\n");
    var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 100);
  }
  function slug(s) { return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, ""); }

  function hcLocation() {
    var L = loc();
    return new HC.Location(L.lat, L.lon, L.tz === "Asia/Jerusalem", L.tz, L.name, undefined, undefined, state.useElev ? (L.elev || 0) : 0);
  }
  function exportCandles() {
    var L = loc(), gy = state.date.getFullYear();
    var evts = HebrewCalendar.calendar({ year: gy, isHebrewYear: false, numYears: 1, location: hcLocation(), candlelighting: true, candleLightingMins: state.candles });
    var v = [];
    evts.forEach(function (e) {
      var t = e.eventTime; if (!t) return;
      v.push(vTimed(t, e.render("en"), L.name));
    });
    downloadICS("candle-lighting-" + slug(L.name) + "-" + gy + ".ics", v, "Candle Lighting " + gy + " — " + L.name);
  }
  function exportHolidays() {
    var gy = parseInt($("hol-year").value, 10); if (!gy) return;
    var il = $("hol-israel").checked, minor = $("hol-minor").checked;
    var evts = HebrewCalendar.calendar({ year: gy, isHebrewYear: false, numYears: 1, il: il });
    var v = [];
    evts.forEach(function (e) {
      var f = e.getFlags();
      var isMajor = (f & HC.flags.CHAG) || (f & HC.flags.YOM_TOV_ENDS) || (f & HC.flags.MAJOR_FAST) || /Rosh Hashana|Yom Kippur|Sukkot|Pesach|Shavuot|Chanukah|Purim|Tish|Fast|Rosh Chodesh/.test(e.render("en"));
      if (!minor && !isMajor) return;
      v.push(vAllDay(e.getDate().greg(), e.render("en"), e.render("he")));
    });
    downloadICS("jewish-holidays-" + gy + (il ? "-israel" : "") + ".ics", v, "Jewish Holidays " + gy);
  }
  function exportYahrzeit(rows) {
    downloadICS("yahrzeit.ics", rows, "Yahrzeit / Anniversary");
  }

  // ---------------- wiring ----------------
  function fillCities(filter) {
    var sel = $("city"); sel.innerHTML = ""; var f = (filter || "").toLowerCase();
    window.CITIES.forEach(function (c, i) {
      if (f && c.name.toLowerCase().indexOf(f) === -1) return;
      var o = document.createElement("option"); o.value = i; o.textContent = c.name;
      if (i === state.cityIdx && !state.custom) o.selected = true; sel.appendChild(o);
    });
  }
  function setDateInput() { var p = ymd(state.date); $("date").value = p.y + "-" + String(p.m).padStart(2, "0") + "-" + String(p.d).padStart(2, "0"); }

  // populate hebrew-month selects
  function fillHMonths(sel) { HMONTHS.forEach(function (m) { var o = document.createElement("option"); o.value = m.v; o.textContent = m.n; sel.appendChild(o); }); }
  fillHMonths($("ch-month")); fillHMonths($("yz-hmonth"));

  $("citycount").textContent = window.CITIES.length;
  fillCities(""); setDateInput();
  $("candlemin").value = state.candles; $("useelev").checked = state.useElev;

  // zmanim events
  $("cityfilter").addEventListener("input", function () { fillCities(this.value); });
  $("city").addEventListener("change", function () { state.cityIdx = +this.value; state.custom = null; persist(); renderZmanim(); });
  $("date").addEventListener("change", function () { var v = this.value.split("-"); if (v.length === 3) { state.date = new Date(+v[0], +v[1] - 1, +v[2]); renderZmanim(); } });
  $("prevday").addEventListener("click", function () { state.date.setDate(state.date.getDate() - 1); setDateInput(); renderZmanim(); });
  $("nextday").addEventListener("click", function () { state.date.setDate(state.date.getDate() + 1); setDateInput(); renderZmanim(); });
  $("todaybtn").addEventListener("click", function () { state.date = new Date(); setDateInput(); renderZmanim(); });
  $("candlemin").addEventListener("change", function () { state.candles = Math.max(0, Math.min(60, +this.value || 18)); persist(); renderZmanim(); });
  $("useelev").addEventListener("change", function () { state.useElev = this.checked; persist(); renderZmanim(); });
  $("usecustom").addEventListener("click", function () {
    var lat = parseFloat($("clat").value), lon = parseFloat($("clon").value), tz = $("ctz").value.trim();
    if (isNaN(lat) || isNaN(lon) || !tz) { alert("Fill latitude, longitude, and an IANA timezone (e.g. America/New_York)."); return; }
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch (e) { alert("Unknown timezone: " + tz); return; }
    state.custom = { name: "Custom (" + lat.toFixed(3) + ", " + lon.toFixed(3) + ")", lat: lat, lon: lon, tz: tz, elev: 0 };
    persist(); renderZmanim();
  });
  $("showmonth").addEventListener("click", renderMonth);
  $("printmonth").addEventListener("click", function () { renderMonth(); setTimeout(function () { window.print(); }, 150); });
  $("export-candles").addEventListener("click", exportCandles);
  $("hol-export").addEventListener("click", exportHolidays);

  // converter events
  var todayStr = (function () { var p = ymd(new Date()); return p.y + "-" + String(p.m).padStart(2, "0") + "-" + String(p.d).padStart(2, "0"); })();
  $("cg-date").value = todayStr;
  var htoday = new HDate(new Date());
  $("ch-year").value = htoday.getFullYear(); $("ch-month").value = htoday.getMonth(); $("ch-day").value = htoday.getDate();
  $("cg-date").addEventListener("change", convGreg);
  $("cg-go").addEventListener("click", convGreg);
  $("ch-go").addEventListener("click", convHeb);

  // holidays events
  $("hol-year").value = new Date().getFullYear();
  $("hol-go").addEventListener("click", renderHolidays);
  $("hol-israel").addEventListener("change", renderHolidays);
  $("hol-minor").addEventListener("change", renderHolidays);

  // yahrzeit events
  $("yz-gdate").value = todayStr;
  $("yz-hyear").value = htoday.getFullYear(); $("yz-hmonth").value = htoday.getMonth(); $("yz-hday").value = htoday.getDate();
  function syncYzMode() { var g = $("yz-mode").value === "greg"; $("yz-greg-row").style.display = g ? "flex" : "none"; $("yz-heb-row").style.display = g ? "none" : "flex"; }
  $("yz-mode").addEventListener("change", syncYzMode); syncYzMode();
  $("yz-go").addEventListener("click", computeYahrzeit);

  // daily learning
  function lrnSet() { var p = ymd(lrnDate); $("lrn-date").value = p.y + "-" + String(p.m).padStart(2, "0") + "-" + String(p.d).padStart(2, "0"); }
  lrnSet();
  $("lrn-date").addEventListener("change", function () { var v = this.value.split("-"); if (v.length === 3) { lrnDate = new Date(+v[0], +v[1] - 1, +v[2]); renderLearning(); } });
  $("lrn-prev").addEventListener("click", function () { lrnDate.setDate(lrnDate.getDate() - 1); lrnSet(); renderLearning(); });
  $("lrn-next").addEventListener("click", function () { lrnDate.setDate(lrnDate.getDate() + 1); lrnSet(); renderLearning(); });
  $("lrn-today").addEventListener("click", function () { lrnDate = new Date(); lrnSet(); renderLearning(); });
  // sefiras haomer
  function omerSet() { var p = ymd(omerDate); $("omer-date").value = p.y + "-" + String(p.m).padStart(2, "0") + "-" + String(p.d).padStart(2, "0"); }
  omerSet();
  $("omer-date").addEventListener("change", function () { var v = this.value.split("-"); if (v.length === 3) { omerDate = new Date(+v[0], +v[1] - 1, +v[2]); renderOmer(); } });
  $("omer-prev").addEventListener("click", function () { omerDate.setDate(omerDate.getDate() - 1); omerSet(); renderOmer(); });
  $("omer-next").addEventListener("click", function () { omerDate.setDate(omerDate.getDate() + 1); omerSet(); renderOmer(); });
  $("omer-today").addEventListener("click", function () { omerDate = new Date(); omerSet(); renderOmer(); });
  $("omer-nusach").addEventListener("change", renderOmer);
  // molad
  fillHMonths($("molad-month"));
  $("molad-year").value = htoday.getFullYear(); $("molad-month").value = htoday.getMonth();
  $("molad-go").addEventListener("click", renderMolad);
  // shiurim
  $("sh-calc").addEventListener("click", calcShiur);
  // gematria
  $("gm-go").addEventListener("click", calcGematria);
  $("gm-in").addEventListener("keydown", function (e) { if (e.key === "Enter") calcGematria(); });

  // initial render
  try {
    renderZmanim(); convGreg(); convHeb(); renderHolidays();
    renderLearning(); renderOmer(); renderMolad(); renderShiurim(); calcShiur();
    var lastTab = null; try { lastTab = localStorage.getItem("cr-tab"); } catch (e) {}
    showTab(tabs.indexOf(lastTab) >= 0 ? lastTab : "zmanim");
  } catch (e) {
    var ff = $("fatal"); ff.style.display = "block"; ff.textContent = "Unexpected error: " + e.message;
  }
})();
