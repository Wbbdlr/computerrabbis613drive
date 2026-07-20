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

  // ---------- citation references (perek/daf jump-to) ----------
  var GEMATRIA = { "א":1,"ב":2,"ג":3,"ד":4,"ה":5,"ו":6,"ז":7,"ח":8,"ט":9,"י":10,"כ":20,"ך":20,"ל":30,"מ":40,"ם":40,
    "נ":50,"ן":50,"ס":60,"ע":70,"פ":80,"ף":80,"צ":90,"ץ":90,"ק":100,"ר":200,"ש":300,"ת":400 };
  function hebToInt(s) {
    var sum = 0, any = false;
    for (var i = 0; i < s.length; i++) { var v = GEMATRIA[s[i]]; if (v) { sum += v; any = true; } }
    return any ? sum : null;
  }
  function intToHeb(n) {
    if (!n || n < 1) return String(n);
    var ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
    var tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
    var hundreds = ["", "ק", "ר", "ש", "ת"];
    var h = Math.floor(n / 100), rem = n % 100;
    var out = "";
    while (h > 4) { out += "ת"; h -= 4; }
    out += hundreds[h];
    if (rem === 15) out += "טו";
    else if (rem === 16) out += "טז";
    else out += tens[Math.floor(rem / 10)] + ones[rem % 10];
    return out.length > 1 ? out.slice(0, -1) + "״" + out.slice(-1) : out + "׳";
  }
  // Parses a trailing chapter/daf reference off a search query, e.g. "ברכות ב" or "בראשית פרק ג".
  // Returns {title, num, amud} or null if the query has no trailing numeral token.
  function parseQueryRef(q) {
    var m = q.match(/^(.*\S)\s+(\d+|[א-ת][א-ת''"״׳]{0,4})([.:]?)\s*$/);
    if (!m) return null;
    var num = /^\d+$/.test(m[2]) ? parseInt(m[2], 10) : hebToInt(m[2].replace(/[''"״׳]/g, ""));
    if (!num) return null;
    return { title: m[1], num: num, amud: m[3] || "" };
  }
  // Parses a rendered heading's own text (e.g. "פרק יב" or "דף עח.") back into {num, amud}.
  function parseHeadingRef(text) {
    var m = (text || "").trim().match(/([א-ת][א-ת''"״׳]*)\s*([.:]?)\s*$/);
    if (!m) return null;
    var num = hebToInt(m[1].replace(/[''"״׳]/g, ""));
    if (!num) return null;
    return { num: num, amud: m[2] || "" };
  }
  // Scans the rendered book for a perek/daf heading matching ref, scrolls it into view.
  function jumpToRef(container, ref) {
    if (!ref) return false;
    var art = container.querySelector("article.book"); if (!art) return false;
    var heads = art.querySelectorAll("h2, h3"), fallback = null;
    for (var i = 0; i < heads.length; i++) {
      var hr = parseHeadingRef(heads[i].textContent);
      if (!hr || hr.num !== ref.num) continue;
      if (!fallback) fallback = heads[i];
      if (!ref.amud || hr.amud === ref.amud) { heads[i].scrollIntoView({ block: "start" }); flash("→ " + heads[i].textContent.trim()); return true; }
    }
    if (fallback) { fallback.scrollIntoView({ block: "start" }); flash("→ " + fallback.textContent.trim()); return true; }
    return false;
  }
  // Today's Daf Yomi (Bavli), resolved to a book id in this library, if KosherZmanim is loaded.
  function todaysDafYomi() {
    try {
      if (!window.KosherZmanim) return null;
      var KZ = window.KosherZmanim;
      var daf = KZ.YomiCalculator.getDafYomiBavli(new KZ.JewishCalendar(new Date()));
      var masechta = daf.getMasechta(), dafNum = daf.getDaf();
      var id = null;
      for (var i = 0; i < CR.titles.length; i++) {
        if (CR.titles[i][1] === masechta && CR.titles[i][2] && CR.titles[i][2].indexOf("תלמוד בבלי") !== -1) { id = CR.titles[i][0]; break; }
      }
      if (id == null) return null;
      return { id: id, label: masechta + " " + intToHeb(dafNum), ref: { num: dafNum, amud: "." } };
    } catch (e) { return null; }
  }

  function findTitleByExactHebrew(hebrewTitle, categorySubstr) {
    for (var i = 0; i < CR.titles.length; i++) {
      if (CR.titles[i][1] === hebrewTitle && CR.titles[i][2] && CR.titles[i][2].indexOf(categorySubstr) !== -1) return CR.titles[i][0];
    }
    return null;
  }
  function firstIntFromPerek(perek) {
    var m = String(perek).match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  // English section name (as used by @hebcal/learning's Rambam-3 cycle) -> this
  // library's "משנה תורה, <hilchos name>" title. Cross-checked entry-by-entry
  // against the 88 sections of the Mishneh Torah and against hebcal.com's own
  // Hebrew rendering of the same cycle.
  var RAMBAM_HE = {
    "Transmission of the Oral Law": "משנה תורה, מסירת תורה שבעל פה",
    "Positive Mitzvot": "משנה תורה, מצוות עשה",
    "Negative Mitzvot": "משנה תורה, מצוות לא תעשה",
    "Overview of Mishneh Torah Contents": "משנה תורה, תוכן החיבור",
    "Foundations of the Torah": "משנה תורה, הלכות יסודי התורה",
    "Human Dispositions": "משנה תורה, הלכות דעות",
    "Torah Study": "משנה תורה, הלכות תלמוד תורה",
    "Foreign Worship and Customs of the Nations": "משנה תורה, הלכות עבודה זרה וחוקות הגויים",
    "Repentance": "משנה תורה, הלכות תשובה",
    "Reading the Shema": "משנה תורה, הלכות קריאת שמע",
    "Prayer and the Priestly Blessing": "משנה תורה, הלכות תפילה וברכת כהנים",
    "Tefillin, Mezuzah and the Torah Scroll": "משנה תורה, הלכות תפילין ומזוזה וספר תורה",
    "Fringes": "משנה תורה, הלכות ציצית",
    "Blessings": "משנה תורה, הלכות ברכות",
    "Circumcision": "משנה תורה, הלכות מילה",
    "The Order of Prayer": "משנה תורה, סדר התפילה",
    "Sabbath": "משנה תורה, הלכות שבת",
    "Eruvin": "משנה תורה, הלכות עירובין",
    "Rest on the Tenth of Tishrei": "משנה תורה, הלכות שביתת עשור",
    "Rest on a Holiday": "משנה תורה, הלכות שביתת יום טוב",
    "Leavened and Unleavened Bread": "משנה תורה, הלכות חמץ ומצה",
    "Shofar, Sukkah and Lulav": "משנה תורה, הלכות שופר וסוכה ולולב",
    "Sheqel Dues": "משנה תורה, הלכות שקלים",
    "Sanctification of the New Month": "משנה תורה, הלכות קידוש החודש",
    "Fasts": "משנה תורה, הלכות תעניות",
    "Scroll of Esther and Hanukkah": "משנה תורה, הלכות מגילה וחנוכה",
    "Marriage": "משנה תורה, הלכות אישות",
    "Divorce": "משנה תורה, הלכות גירושין",
    "Levirate Marriage and Release": "משנה תורה, הלכות יבום וחליצה",
    "Virgin Maiden": "משנה תורה, הלכות נערה בתולה",
    "Woman Suspected of Infidelity": "משנה תורה, הלכות סוטה",
    "Forbidden Intercourse": "משנה תורה, הלכות איסורי ביאה",
    "Forbidden Foods": "משנה תורה, הלכות מאכלות אסורות",
    "Ritual Slaughter": "משנה תורה, הלכות שחיטה",
    "Oaths": "משנה תורה, הלכות שבועות",
    "Vows": "משנה תורה, הלכות נדרים",
    "Nazariteship": "משנה תורה, הלכות נזירות",
    "Appraisals and Devoted Property": "משנה תורה, הלכות ערכים וחרמין",
    "Diverse Species": "משנה תורה, הלכות כלאים",
    "Gifts to the Poor": "משנה תורה, הלכות מתנות עניים",
    "Heave Offerings": "משנה תורה, הלכות תרומות",
    "Tithes": "משנה תורה, הלכות מעשרות",
    "Second Tithes and Fourth Year's Fruit": "משנה תורה, הלכות מעשר שני ונטע רבעי",
    "First Fruits and other Gifts to Priests Outside the Sanctuary": "משנה תורה, הלכות ביכורים ושאר מתנות כהונה שבגבולין",
    "Sabbatical Year and the Jubilee": "משנה תורה, הלכות שמיטה ויובל",
    "The Chosen Temple": "משנה תורה, הלכות בית הבחירה",
    "Vessels of the Sanctuary and Those who Serve Therein": "משנה תורה, הלכות כלי המקדש והעובדין בו",
    "Admission into the Sanctuary": "משנה תורה, הלכות ביאת מקדש",
    "Things Forbidden on the Altar": "משנה תורה, הלכות איסורי המזבח",
    "Sacrificial Procedure": "משנה תורה, הלכות מעשה הקרבנות",
    "Daily Offerings and Additional Offerings": "משנה תורה, הלכות תמידים ומוספין",
    "Sacrifices Rendered Unfit": "משנה תורה, הלכות פסולי המוקדשין",
    "Service on the Day of Atonement": "משנה תורה, הלכות עבודת יום הכפורים",
    "Trespass": "משנה תורה, הלכות מעילה",
    "Paschal Offering": "משנה תורה, הלכות קרבן פסח",
    "Festival Offering": "משנה תורה, הלכות חגיגה",
    "Firstlings": "משנה תורה, הלכות בכורות",
    "Offerings for Unintentional Transgressions": "משנה תורה, הלכות שגגות",
    "Offerings for Those with Incomplete Atonement": "משנה תורה, הלכות מחוסרי כפרה",
    "Substitution": "משנה תורה, הלכות תמורה",
    "Defilement by a Corpse": "משנה תורה, הלכות טומאת מת",
    "Red Heifer": "משנה תורה, הלכות פרה אדומה",
    "Defilement by Leprosy": "משנה תורה, הלכות טומאת צרעת",
    "Those Who Defile Bed or Seat": "משנה תורה, הלכות מטמאי משכב ומושב",
    "Other Sources of Defilement": "משנה תורה, הלכות שאר אבות הטומאות",
    "Defilement of Foods": "משנה תורה, הלכות טומאת אוכלים",
    "Vessels": "משנה תורה, הלכות כלים",
    "Immersion Pools": "משנה תורה, הלכות מקואות",
    "Damages to Property": "משנה תורה, הלכות נזקי ממון",
    "Theft": "משנה תורה, הלכות גניבה",
    "Robbery and Lost Property": "משנה תורה, הלכות גזילה ואבידה",
    "One Who Injures a Person or Property": "משנה תורה, הלכות חובל ומזיק",
    "Murderer and the Preservation of Life": "משנה תורה, הלכות רוצח ושמירת נפש",
    "Sales": "משנה תורה, הלכות מכירה",
    "Ownerless Property and Gifts": "משנה תורה, הלכות זכייה ומתנה",
    "Neighbors": "משנה תורה, הלכות שכנים",
    "Agents and Partners": "משנה תורה, הלכות שלוחין ושותפין",
    "Slaves": "משנה תורה, הלכות עבדים",
    "Hiring": "משנה תורה, הלכות שכירות",
    "Borrowing and Deposit": "משנה תורה, הלכות שאלה ופיקדון",
    "Creditor and Debtor": "משנה תורה, הלכות מלווה ולווה",
    "Plaintiff and Defendant": "משנה תורה, הלכות טוען ונטען",
    "Inheritances": "משנה תורה, הלכות נחלות",
    "The Sanhedrin and the Penalties within their Jurisdiction": "משנה תורה, הלכות סנהדרין והעונשין המסורין להם",
    "Testimony": "משנה תורה, הלכות עדות",
    "Rebels": "משנה תורה, הלכות ממרים",
    "Mourning": "משנה תורה, הלכות אבל",
    "Kings and Wars": "משנה תורה, הלכות מלכים ומלחמות"
  };
  function todaysRambamCycle(cycleId) {
    try {
      if (!window.hebcal || !hebcal.DailyLearning) return null;
      var hd = new hebcal.HDate(new Date());
      var ev = hebcal.DailyLearning.lookup(cycleId, hd);
      if (!ev || !ev.readings || !ev.readings.length) return null;
      var first = ev.readings[0];
      var heTitle = RAMBAM_HE[first.name];
      if (!heTitle) return null;
      var id = findTitleByExactHebrew(heTitle, "משנה תורה");
      if (id == null) return null;
      var num = firstIntFromPerek(first.perek);
      var ref = num ? { num: num, amud: "" } : null;
      var shortHe = heTitle.replace(/^משנה תורה, /, "");
      return { id: id, label: shortHe + (num ? " " + intToHeb(num) : ""), ref: ref };
    } catch (e) { return null; }
  }

  // Sephardic transliteration (as used by @hebcal/learning's Mishna Yomi) -> this
  // library's "משנה <tractate>" title.
  var MISHNA_HE = {
    "Berakhot": "משנה ברכות", "Peah": "משנה פאה", "Demai": "משנה דמאי", "Kilayim": "משנה כלאים",
    "Sheviit": "משנה שביעית", "Terumot": "משנה תרומות", "Maasrot": "משנה מעשרות", "Maaser Sheni": "משנה מעשר שני",
    "Challah": "משנה חלה", "Orlah": "משנה ערלה", "Bikkurim": "משנה ביכורים",
    "Shabbat": "משנה שבת", "Eruvin": "משנה עירובין", "Pesachim": "משנה פסחים", "Shekalim": "משנה שקלים",
    "Yoma": "משנה יומא", "Sukkah": "משנה סוכה", "Beitzah": "משנה ביצה", "Rosh Hashanah": "משנה ראש השנה",
    "Taanit": "משנה תענית", "Megillah": "משנה מגילה", "Moed Katan": "משנה מועד קטן", "Chagigah": "משנה חגיגה",
    "Yevamot": "משנה יבמות", "Ketubot": "משנה כתובות", "Nedarim": "משנה נדרים", "Nazir": "משנה נזיר",
    "Sotah": "משנה סוטה", "Gittin": "משנה גיטין", "Kiddushin": "משנה קידושין",
    "Bava Kamma": "משנה בבא קמא", "Bava Metzia": "משנה בבא מציעא", "Bava Batra": "משנה בבא בתרא",
    "Sanhedrin": "משנה סנהדרין", "Makkot": "משנה מכות", "Shevuot": "משנה שבועות", "Eduyot": "משנה עדיות",
    "Avodah Zarah": "משנה עבודה זרה", "Avot": "משנה אבות", "Horayot": "משנה הוריות",
    "Zevachim": "משנה זבחים", "Menachot": "משנה מנחות", "Chullin": "משנה חולין", "Bekhorot": "משנה בכורות",
    "Arakhin": "משנה ערכין", "Temurah": "משנה תמורה", "Keritot": "משנה כריתות", "Meilah": "משנה מעילה",
    "Tamid": "משנה תמיד", "Middot": "משנה מדות", "Kinnim": "משנה קינים",
    "Kelim": "משנה כלים", "Oholot": "משנה אהלות", "Negaim": "משנה נגעים", "Parah": "משנה פרה",
    "Taharot": "משנה טהרות", "Mikvaot": "משנה מקואות", "Niddah": "משנה נדה", "Makhshirin": "משנה מכשירין",
    "Zavim": "משנה זבים", "Tevul Yom": "משנה טבול יום", "Yadayim": "משנה ידים", "Uktzin": "משנה עוקצים"
  };
  function todaysMishnaYomi() {
    try {
      if (!window.hebcal || !hebcal.DailyLearning) return null;
      var hd = new hebcal.HDate(new Date());
      var ev = hebcal.DailyLearning.lookup("mishnaYomi", hd);
      if (!ev || !ev.mishnaYomi || !ev.mishnaYomi.length) return null;
      var first = ev.mishnaYomi[0];
      var heTitle = MISHNA_HE[first.k];
      if (!heTitle) return null;
      var id = findTitleByExactHebrew(heTitle, "משנה");
      if (id == null) return null;
      var num = firstIntFromPerek(first.v);
      var ref = num ? { num: num, amud: "" } : null;
      var shortHe = heTitle.replace(/^משנה /, "");
      return { id: id, label: shortHe + (num ? " " + intToHeb(num) : ""), ref: ref };
    } catch (e) { return null; }
  }

  // Today's Daf Yomi (Yerushalmi), same pattern as Bavli above but the Jerusalem Talmud cycle.
  function todaysYerushalmiDafYomi() {
    try {
      if (!window.KosherZmanim) return null;
      var KZ = window.KosherZmanim;
      var daf = KZ.YerushalmiYomiCalculator.getDafYomiYerushalmi(new KZ.JewishCalendar(new Date()));
      var masechta = daf.getMasechta(), dafNum = daf.getDaf();
      var id = findTitleByExactHebrew("תלמוד ירושלמי " + masechta, "תלמוד ירושלמי");
      if (id == null) return null;
      return { id: id, label: masechta + " " + intToHeb(dafNum), ref: { num: dafNum, amud: "" } };
    } catch (e) { return null; }
  }

  // English book names (as used by @hebcal/learning's Nach Yomi and "929" cycles) -> this
  // library's Tanach titles. Verified against the actual bundle's output across full cycles.
  var TANACH_HE = {
    "Genesis": "בראשית", "Exodus": "שמות", "Leviticus": "ויקרא", "Numbers": "במדבר", "Deuteronomy": "דברים",
    "Joshua": "יהושע", "Judges": "שופטים", "I Samuel": "שמואל א", "II Samuel": "שמואל ב",
    "I Kings": "מלכים א", "II Kings": "מלכים ב", "Isaiah": "ישעיהו", "Jeremiah": "ירמיהו", "Ezekiel": "יחזקאל",
    "Hosea": "הושע", "Joel": "יואל", "Amos": "עמוס", "Obadiah": "עובדיה", "Jonah": "יונה", "Micah": "מיכה",
    "Nachum": "נחום", "Habakkuk": "חבקוק", "Zephaniah": "צפניה", "Haggai": "חגי", "Zechariah": "זכריה", "Malachi": "מלאכי",
    "Psalms": "תהילים", "Proverbs": "משלי", "Job": "איוב", "Song of Songs": "שיר השירים", "Ruth": "רות",
    "Lamentations": "איכה", "Ecclesiastes": "קהלת", "Esther": "אסתר", "Daniel": "דניאל", "Ezra": "עזרא",
    "Nehemiah": "נחמיה", "I Chronicles": "דברי הימים א", "II Chronicles": "דברי הימים ב"
  };
  function todaysNachYomi() {
    try {
      if (!window.hebcal || !hebcal.DailyLearning) return null;
      var hd = new hebcal.HDate(new Date());
      var ev = hebcal.DailyLearning.lookup("nachYomi", hd);
      if (!ev || !ev.k) return null;
      var heTitle = TANACH_HE[ev.k]; if (!heTitle) return null;
      var id = findTitleByExactHebrew(heTitle, "תנך");
      if (id == null) return null;
      var num = ev.v;
      return { id: id, label: heTitle + (num ? " " + intToHeb(num) : ""), ref: num ? { num: num, amud: "" } : null };
    } catch (e) { return null; }
  }
  function todaysNine29() {
    try {
      if (!window.hebcal || !hebcal.DailyLearning) return null;
      var hd = new hebcal.HDate(new Date());
      var ev = hebcal.DailyLearning.lookup("929", hd);
      if (!ev || !ev.reading || !ev.reading.book) return null;
      var heTitle = TANACH_HE[ev.reading.book]; if (!heTitle) return null;
      var id = findTitleByExactHebrew(heTitle, "תנך");
      if (id == null) return null;
      var num = ev.reading.bookChap;
      return { id: id, label: heTitle + (num ? " " + intToHeb(num) : ""), ref: num ? { num: num, amud: "" } : null };
    } catch (e) { return null; }
  }
  function todaysPsalms() {
    try {
      if (!window.hebcal || !hebcal.DailyLearning) return null;
      var hd = new hebcal.HDate(new Date());
      var ev = hebcal.DailyLearning.lookup("psalms", hd);
      if (!ev || !ev.reading || !ev.reading.length) return null;
      var id = findTitleByExactHebrew("תהילים", "תנך");
      if (id == null) return null;
      var num = ev.reading[0], num2 = ev.reading[1];
      var label = "תהילים " + intToHeb(num) + (num2 && num2 !== num ? "–" + intToHeb(num2) : "");
      return { id: id, label: label, ref: { num: num, amud: "" } };
    } catch (e) { return null; }
  }
  function todaysPerekYomi() {
    try {
      if (!window.hebcal || !hebcal.DailyLearning) return null;
      var hd = new hebcal.HDate(new Date());
      var ev = hebcal.DailyLearning.lookup("perekYomi", hd);
      if (!ev || !ev.k) return null;
      var heTitle = MISHNA_HE[ev.k]; if (!heTitle) return null;
      var id = findTitleByExactHebrew(heTitle, "משנה");
      if (id == null) return null;
      var num = ev.v;
      var shortHe = heTitle.replace(/^משנה /, "");
      return { id: id, label: shortHe + (num ? " " + intToHeb(num) : ""), ref: num ? { num: num, amud: "" } : null };
    } catch (e) { return null; }
  }
  // Kitzur Shulchan Aruch is a single, sequentially-numbered work (simanim 1-221, no
  // chelek split), so a plain siman number is unambiguous -- unlike Arukh HaShulchan or
  // the Chofetz Chaim's own sefer, which pack multiple independently-numbered sections
  // into one book file and aren't included here to avoid jumping to the wrong section.
  function todaysKitzurSA() {
    try {
      if (!window.hebcal || !hebcal.DailyLearning) return null;
      var hd = new hebcal.HDate(new Date());
      var ev = hebcal.DailyLearning.lookup("kitzurShulchanAruch", hd);
      if (!ev || !ev.reading || !ev.reading.b) return null;
      var num = firstIntFromPerek(ev.reading.b);
      if (!num) return null;
      return { id: 1940, label: "קיצור שלחן ערוך " + intToHeb(num), ref: { num: num, amud: "" } };
    } catch (e) { return null; }
  }

  // Registry of daily-learning cycles offered on the Home screen, with a user-toggleable
  // on/off preference per cycle (persisted). Order here controls display order.
  var LEARNING_CYCLES = [
    { key: "dafYomi", label: "Daf Yomi (Bavli)", fn: todaysDafYomi },
    { key: "yerushalmi", label: "Daf Yomi (Yerushalmi)", fn: todaysYerushalmiDafYomi },
    { key: "rambam3", label: "Rambam Yomi (3 perakim)", fn: function () { return todaysRambamCycle("rambam3"); } },
    { key: "rambam1", label: "Rambam Yomi (1 perek)", fn: function () { return todaysRambamCycle("rambam1"); } },
    { key: "mishnaYomi", label: "Mishna Yomi", fn: todaysMishnaYomi },
    { key: "perekYomi", label: "Perek Yomi (Mishna)", fn: todaysPerekYomi },
    { key: "nachYomi", label: "Nach Yomi", fn: todaysNachYomi },
    { key: "nine29", label: "929 (Tanach)", fn: todaysNine29 },
    { key: "psalms", label: "Tehillim (monthly cycle)", fn: todaysPsalms },
    { key: "kitzurSA", label: "Kitzur Shulchan Aruch", fn: todaysKitzurSA }
  ];
  var DEFAULT_LEARNING_ON = ["dafYomi", "yerushalmi", "rambam3", "mishnaYomi", "nachYomi"];
  var learningPrefs = load("cr-learning-prefs", null);
  if (!learningPrefs) {
    learningPrefs = {};
    LEARNING_CYCLES.forEach(function (c) { learningPrefs[c.key] = DEFAULT_LEARNING_ON.indexOf(c.key) !== -1; });
  }
  function persistLearningPrefs() { store("cr-learning-prefs", learningPrefs); }
  function renderLearnChips(lrow, tabId) {
    lrow.innerHTML = "";
    var anyOn = false, anyShown = false;
    LEARNING_CYCLES.forEach(function (c) {
      if (!learningPrefs[c.key]) return;
      anyOn = true;
      var item = c.fn();
      if (!item) return;
      anyShown = true;
      var lchip = cE("div", "chip chip-daf");
      lchip.appendChild(document.createTextNode(c.label + ": "));
      lchip.appendChild(cE("b", "he-val", item.label));
      lchip.addEventListener("click", function () { loadIntoTab(tabId, item.id, item.ref); });
      lrow.appendChild(lchip);
    });
    if (!anyShown) lrow.appendChild(cE("div", "muted", anyOn ? "Nothing to show today for your selected cycles." : "No daily-learning cycles selected — click “Customize” to choose some."));
  }

  // ---------- settings ----------
  var HL_COLORS = ["#ffe08a", "#a6e3a1", "#9ec5ff", "#f6a5c0", "#f6b26b", "#d5b3ff"];
  var settings = { fontSize: 20, nikud: true, lang: "both", theme: "light",
    font: "frankruehl", textColor: null, bgColor: null, hlColor: HL_COLORS[0] };
  Object.assign(settings, load("cr-reader", {}));
  function persist() { store("cr-reader", settings); }
  var pins = load("cr-pins", []);
  var recent = load("cr-recent", []);
  var readPos = load("cr-pos", {}); // bookId -> last-read paragraph index, so reopening resumes nearby

  // ---------- research tabs (up to 2 shown at once: left pane, optional right/split pane) ----------
  var tabs = load("cr-tabs", null);
  if (!tabs || !tabs.length) tabs = [{ id: 1, bookId: null, title: "Home" }];
  var nextTabId = load("cr-next-tab-id", 2);
  var leftTabId = load("cr-left-tab", tabs[0].id);
  var rightTabId = load("cr-right-tab", null);
  if (!getTab(leftTabId)) leftTabId = tabs[0].id;
  if (rightTabId != null && (!getTab(rightTabId) || rightTabId === leftTabId)) rightTabId = null;
  var focusedSide = "left";

  function getTab(id) { for (var i = 0; i < tabs.length; i++) if (tabs[i].id === id) return tabs[i]; return null; }
  function focusedTabId() { return focusedSide === "right" ? rightTabId : leftTabId; }
  function focusedTab() { return getTab(focusedTabId()); }
  function paneEl(side) { return side === "right" ? $("#reader2") : $("#reader"); }
  function focusedContainer() { return paneEl(focusedSide); }
  function persistTabs() {
    store("cr-tabs", tabs); store("cr-next-tab-id", nextTabId);
    store("cr-left-tab", leftTabId); store("cr-right-tab", rightTabId);
  }
  function tabTitle(tab) { return tab.bookId == null ? "Home" : (tab.title || titleOf(tab.bookId)); }

  function setFocusedSide(side) {
    if (focusedSide === side) return;
    focusedSide = side;
    document.querySelectorAll(".pane").forEach(function (p) { p.classList.toggle("focused", p.getAttribute("data-side") === side); });
    syncToolbarForFocused();
  }

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

  // ---------- tab strip ----------
  function renderTabStrip() {
    var bar = $("#tabstrip"); if (!bar) return;
    bar.innerHTML = "";
    tabs.forEach(function (tab) {
      var chip = cE("div", "tab-chip");
      if (tab.id === leftTabId) chip.classList.add("side-left");
      if (tab.id === rightTabId) chip.classList.add("side-right");
      chip.appendChild(cE("span", "tt", tabTitle(tab)));
      var x = cE("span", "x", "✕"); x.title = "Close tab";
      x.addEventListener("click", function (e) { e.stopPropagation(); closeTab(tab.id); });
      chip.appendChild(x);
      chip.addEventListener("click", function () { assignTabToFocusedSide(tab.id); });
      bar.appendChild(chip);
    });
    var add = cE("button", "tab-add", "+ New tab");
    add.title = "Open a new research tab";
    add.addEventListener("click", newTab);
    bar.appendChild(add);
  }
  function assignTabToFocusedSide(tabId) {
    if (focusedSide === "right") { if (tabId === leftTabId) return; rightTabId = tabId; }
    else { if (tabId === rightTabId) rightTabId = null; leftTabId = tabId; }
    persistTabs();
    renderPane(focusedSide);
    renderTabStrip();
  }
  function newTab() {
    var t = { id: nextTabId++, bookId: null, title: "Home" };
    tabs.push(t);
    assignTabToFocusedSide(t.id);
  }
  function closeTab(tabId) {
    var idx = -1;
    for (var i = 0; i < tabs.length; i++) if (tabs[i].id === tabId) { idx = i; break; }
    if (idx === -1) return;
    tabs.splice(idx, 1);
    if (!tabs.length) tabs.push({ id: nextTabId++, bookId: null, title: "Home" });
    function fallbackId() { return (tabs[Math.max(0, idx - 1)] || tabs[0]).id; }
    if (leftTabId === tabId) leftTabId = fallbackId();
    if (rightTabId === tabId) rightTabId = tabs.length > 1 ? fallbackId() : null;
    if (rightTabId === leftTabId) rightTabId = null;
    persistTabs();
    applySplitUI();
    renderPane("left");
    renderTabStrip();
  }

  // ---------- split view ----------
  function toggleSplit() {
    if (rightTabId != null) { rightTabId = null; }
    else {
      var other = null;
      for (var i = 0; i < tabs.length; i++) if (tabs[i].id !== leftTabId) { other = tabs[i].id; break; }
      if (other == null) { var t = { id: nextTabId++, bookId: null, title: "Home" }; tabs.push(t); other = t.id; }
      rightTabId = other;
    }
    persistTabs();
    applySplitUI();
    renderTabStrip();
  }
  function applySplitUI() {
    var wrap = $("#main-panes"); var on = rightTabId != null;
    if (wrap) wrap.classList.toggle("split", on);
    var pr = $("#pane-right"); if (pr) pr.style.display = on ? "" : "none";
    var btn = $("#btn-split"); if (btn) btn.classList.toggle("on", on);
    if (on) renderPane("right");
    if (!on && focusedSide === "right") setFocusedSide("left");
  }

  // ---------- render a pane (home or a book) ----------
  function renderHomeInto(side) {
    var tabId = side === "right" ? rightTabId : leftTabId;
    var tab = getTab(tabId); if (tab) { tab.bookId = null; tab.title = "Home"; }
    var container = paneEl(side); if (!container) return;
    container.innerHTML = "";
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
          chip.addEventListener("click", function () { loadIntoTab(tabId, id); });
          row.appendChild(chip);
        });
        s.appendChild(row);
      }
      w.appendChild(s);
    }
    var ls = cE("div", "home-sec");
    var lhead = cE("div", "home-sec-head");
    lhead.appendChild(cE("h3", null, "Today's Learning"));
    var custBtn = cE("button", "learn-customize", "Customize");
    lhead.appendChild(custBtn);
    ls.appendChild(lhead);
    var lrow = cE("div", "chip-row");
    renderLearnChips(lrow, tabId);
    ls.appendChild(lrow);
    var pop = cE("div", "learn-popover");
    var popHint = cE("div", "learn-pop-hint", "Choose which daily-learning cycles appear above:");
    pop.appendChild(popHint);
    LEARNING_CYCLES.forEach(function (c) {
      var row = cE("label", "learn-pop-row");
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!learningPrefs[c.key];
      cb.addEventListener("change", function () {
        learningPrefs[c.key] = cb.checked; persistLearningPrefs(); renderLearnChips(lrow, tabId);
      });
      row.appendChild(cb);
      row.appendChild(document.createTextNode(" " + c.label));
      pop.appendChild(row);
    });
    ls.appendChild(pop);
    custBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      pop.classList.toggle("open");
    });
    w.appendChild(ls);
    section("Saved seforim", pins, "Open a sefer and press “Save” to keep it here for quick access.");
    section("Recently viewed", recent.slice(0, 16), "Seforim you open will appear here.");
    container.appendChild(w);
    if (side === focusedSide) syncToolbarForFocused();
    persistTabs(); renderTabStrip();
  }

  function openBook(id, ref) { loadIntoTab(focusedTabId(), id, ref); }
  CR.openAt = function (bookId, paraIdx) { loadIntoTab(focusedTabId(), bookId, null, paraIdx); };
  function loadIntoTab(tabId, bookId, ref, paraIdx) {
    var tab = getTab(tabId); if (!tab) return;
    hideHlMenu(); hideLookup();
    tab.bookId = bookId; tab.__data = null; tab.__pendingRef = ref || null;
    tab.__pendingPara = paraIdx == null ? null : paraIdx;
    persistTabs();
    renderPane(tabId === rightTabId ? "right" : "left");
    renderTabStrip();
  }
  function jumpToParagraph(container, paraIdx) {
    var art = container.querySelector("article.book"); if (!art) return false;
    var units = art.querySelectorAll(art.querySelector(".seg-row") ? ".seg-row" : "p");
    var el = units[paraIdx]; if (!el) return false;
    el.scrollIntoView({ block: "center" });
    el.classList.add("fts-hit");
    setTimeout(function () { el.classList.remove("fts-hit"); }, 2200);
    return true;
  }
  function nearestUnitIdx(container) {
    var art = container.querySelector("article.book"); if (!art) return null;
    var units = art.querySelectorAll(art.querySelector(".seg-row") ? ".seg-row" : "p");
    if (!units.length) return null;
    var top = container.getBoundingClientRect().top, best = 0, bestDist = Infinity;
    units.forEach(function (u, i) {
      var d = Math.abs(u.getBoundingClientRect().top - top);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }
  // best-effort "where am I" string for the focused pane: sefer title + the deepest
  // headings currently scrolled to the top of the pane (works for any sefer's heading structure)
  function currentLocationText(side) {
    var s = side || focusedSide;
    var container = paneEl(s); if (!container) return null;
    var art = container.querySelector("article.book"); if (!art) return null;
    var tab = getTab(s === "right" ? rightTabId : leftTabId);
    var title = tab ? tab.title : null;
    var isBi = !!art.querySelector(".sec-label");
    var nodes = isBi ? art.querySelectorAll(".sec-label") : art.querySelectorAll("h1, h2, h3");
    var top = container.getBoundingClientRect().top;
    var byLvl = {};
    nodes.forEach(function (h) {
      if (h.getBoundingClientRect().top - top > 24) return;
      var lvl = isBi ? 2 : +h.tagName.charAt(1);
      byLvl[lvl] = h.textContent.trim();
    });
    var lvls = Object.keys(byLvl).map(Number).sort(function (a, b) { return a - b; });
    if (lvls.length && lvls[0] === 1 && byLvl[1] === title) lvls.shift();
    var path = lvls.map(function (l) { return byLvl[l]; }).join(" · ");
    if (!title) return path || null;
    return path ? title + ", " + path : title;
  }
  function copyCurrentLocation() {
    var text = currentLocationText();
    if (!text) { flash("Nothing open to copy."); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flash("Copied: " + text); }, function () { flash("Could not copy — clipboard access denied."); });
    } else { flash("Clipboard not available in this browser."); }
  }
  function saveScrollPos(side) {
    var tab = getTab(side === "right" ? rightTabId : leftTabId);
    if (!tab || tab.bookId == null) return;
    var idx = nearestUnitIdx(paneEl(side));
    if (idx == null) return;
    readPos[tab.bookId] = idx;
    store("cr-pos", readPos);
  }
  function renderPane(side) {
    var tabId = side === "right" ? rightTabId : leftTabId;
    var container = paneEl(side); if (!container) return;
    var tab = getTab(tabId);
    if (!tab || tab.bookId == null) { renderHomeInto(side); return; }
    container.innerHTML = "<div class='muted' style='padding:24px'>Loading…</div>";
    var bookId = tab.bookId;
    CR.load(bookId, function (data) {
      if (!data) { container.innerHTML = "<div class='errbox'>Could not load this text from the drive.</div>"; return; }
      if (tab.bookId !== bookId) return; // superseded by a newer open in this tab
      tab.title = data.t || titleOf(bookId);
      tab.__data = data;
      recent = [bookId].concat(recent.filter(function (x) { return x !== bookId; })).slice(0, 24); store("cr-recent", recent);
      var art = cE("article", "book");
      art.style.fontSize = settings.fontSize + "px";
      if (data.bi) art.appendChild(renderBilingual(data));
      else { var c = cE("div"); setHTML(c, data.h); art.appendChild(c); }
      container.innerHTML = "";
      if (data.c) container.appendChild(cE("div", "crumb", data.c));
      container.appendChild(art);
      if (!settings.nikud) stripNikudDOM(art);
      applyFont();
      container.scrollTop = 0;
      document.body.classList.toggle("has-book", true);
      var prevActive = document.querySelector(".book-item.active"); if (prevActive) prevActive.classList.remove("active");
      if (side === focusedSide) {
        var cur = document.querySelector('.book-item[data-id="' + bookId + '"]'); if (cur) cur.classList.add("active");
        $("#inbook").value = "";
        syncToolbarForFocused();
      }
      applyHighlightsInto(container, bookId);
      if (tab.__pendingRef) { jumpToRef(container, tab.__pendingRef); tab.__pendingRef = null; }
      else if (tab.__pendingPara != null) { jumpToParagraph(container, tab.__pendingPara); tab.__pendingPara = null; }
      else if (readPos[bookId] != null) { jumpToParagraph(container, readPos[bookId]); }
      persistTabs(); renderTabStrip();
    });
  }

  function renderBilingual(data) {
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

  // ---------- language toggle (applies to every visible bilingual pane) ----------
  var LANGS = [["he", "עברית"], ["both", "Both"], ["side", "Side by side"], ["en", "English"]];
  function buildLangbar(hasEn) {
    var lb = $("#langbar"); lb.innerHTML = "";
    if (!hasEn) { lb.style.display = "none"; return; }
    lb.style.display = "flex";
    LANGS.forEach(function (o) {
      var b = cE("button", null, o[1]); b.setAttribute("data-lang", o[0]);
      b.addEventListener("click", function () { setLang(o[0]); });
      lb.appendChild(b);
    });
    syncLangbar();
  }
  function setLang(l) {
    settings.lang = l; persist();
    document.querySelectorAll(".bi-wrap").forEach(function (w) { w.className = "bi-wrap lang-" + l; });
    syncLangbar();
  }
  function syncLangbar() {
    document.querySelectorAll("#langbar button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-lang") === settings.lang); });
  }

  // ---------- table of contents (for the focused pane) ----------
  function buildToc(art, data) {
    var toc = $("#toc"); toc.innerHTML = "";
    var entries = [];
    if (data.bi) { art.querySelectorAll(".sec-label").forEach(function (el) { entries.push({ el: el, lvl: 1 }); }); }
    else {
      art.querySelectorAll("h1, h2, h3").forEach(function (el, i) { if (!el.id) el.id = "h-" + i; entries.push({ el: el, lvl: +el.tagName.charAt(1) }); });
      if (entries.length && entries[0].lvl === 1) entries.shift();
    }
    if (entries.length < 2) { $("#toc-btn").style.display = "none"; toc.style.display = "none"; return; }
    $("#toc-btn").style.display = "inline-flex";
    entries.forEach(function (e) {
      var it = cE("div", "toc-item lvl" + e.lvl, e.el.textContent);
      it.addEventListener("click", function () { e.el.scrollIntoView({ block: "start" }); toc.style.display = "none"; });
      toc.appendChild(it);
    });
  }

  // ---------- toolbar sync (reflects whichever pane is focused) ----------
  function syncToolbarForFocused() {
    var tab = focusedTab();
    var container = focusedContainer();
    var art = container ? container.querySelector("article.book") : null;
    var data = tab ? tab.__data : null;
    if (art && data) { buildToc(art, data); buildLangbar(!!(data.bi && data.en)); }
    else { $("#toc-btn").style.display = "none"; $("#langbar").style.display = "none"; }
    updatePinBtn();
  }

  // ---------- title search ----------
  function titleHits(q, cap) {
    cap = cap || 60;
    var lc = q.toLowerCase(), hits = [];
    for (var i = 0; i < CR.titles.length && hits.length < cap; i++) if (CR.titles[i][1].toLowerCase().indexOf(lc) !== -1) hits.push(CR.titles[i]);
    return hits;
  }
  function runSearch(q) {
    var res = $("#searchres"); q = (q || "").trim();
    if (q.length < 2) { res.style.display = "none"; res.innerHTML = ""; return; }
    var hits = titleHits(q), ref = null;
    if (!hits.length) {
      var parsed = parseQueryRef(q);
      if (parsed && parsed.title.length >= 2) {
        var hits2 = titleHits(parsed.title, Infinity);
        if (hits2.length) {
          hits2.sort(function (a, b) { return (b[1] === parsed.title ? 1 : 0) - (a[1] === parsed.title ? 1 : 0); });
          hits = hits2.slice(0, 60); ref = parsed;
        }
      }
    }
    res.innerHTML = "";
    if (!hits.length) res.appendChild(cE("div", "muted", "No titles match."));
    hits.forEach(function (t) {
      var it = cE("div", "sr-item");
      it.appendChild(cE("div", "sr-title", t[1]));
      var catTxt = t[2] || "";
      if (ref) catTxt += (catTxt ? " · " : "") + "→ " + intToHeb(ref.num) + (ref.amud || "");
      if (catTxt) it.appendChild(cE("div", "sr-cat", catTxt));
      it.addEventListener("click", function () { openBook(t[0], ref); res.style.display = "none"; $("#search").value = ""; });
      res.appendChild(it);
    });
    res.style.display = "block";
  }

  // ---------- in-book find (focused pane) ----------
  function inBookFind(q) {
    var container = focusedContainer();
    var art = container ? container.querySelector("article.book") : null; if (!art) return;
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

  // ---------- nikud handling ----------
  function isNikud(ch) { return ch >= "֑" && ch <= "ׇ"; }
  function stripNikud(s) { return s.replace(/[֑-ׇ]/g, ""); }
  function mapStrippedToRaw(raw, sIdx) {
    var count = 0, i = 0;
    for (; i < raw.length && count < sIdx; i++) if (!isNikud(raw[i])) count++;
    while (i < raw.length && isNikud(raw[i])) i++;
    return i;
  }
  function stripNikudDOM(root) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n, nodes = [];
    while ((n = w.nextNode())) nodes.push(n);
    nodes.forEach(function (nd) { var s = stripNikud(nd.nodeValue); if (s !== nd.nodeValue) nd.nodeValue = s; });
  }
  function reloadFocusedForNikud() {
    var tab = focusedTab(); if (!tab || tab.bookId == null) return;
    renderPane(focusedSide);
  }

  // ---------- highlights + notes (offset-based, nikud-independent, colored, per book) ----------
  function hlKey(id) { return "cr-hl-" + id; }
  function textOffset(root, container, offset) {
    var r = document.createRange();
    r.setStart(root, 0);
    try { r.setEnd(container, offset); } catch (e) { return 0; }
    return stripNikud(r.toString()).length;
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
  function wrapRange(root, start, end, idx, hl, bookId) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), pos = 0, n, jobs = [];
    while ((n = w.nextNode())) {
      var raw = n.nodeValue, len = stripNikud(raw).length, ns = pos, ne = pos + len;
      if (ne > start && ns < end && n.parentNode.tagName !== "MARK") {
        var s = mapStrippedToRaw(raw, Math.max(start, ns) - ns), e = mapStrippedToRaw(raw, Math.min(end, ne) - ns);
        jobs.push({ node: n, s: s, e: e });
      }
      pos = ne; if (pos >= end) break;
    }
    jobs.forEach(function (j) {
      var mid = j.node.splitText(j.s); mid.splitText(j.e - j.s);
      var mk = document.createElement("mark"); mk.className = "hl" + (hl.note ? " has-note" : ""); mk.setAttribute("data-hl", idx);
      mk.style.background = hl.color || HL_COLORS[0];
      mid.parentNode.replaceChild(mk, mid); mk.appendChild(mid);
      mk.addEventListener("click", function (ev) { ev.stopPropagation(); openHlMenu(idx, mk, bookId); });
    });
  }
  function applyHighlightsInto(container, bookId) {
    var art = container.querySelector("article.book"); if (!art) return;
    var hls = load(hlKey(bookId), []);
    hls.forEach(function (h, i) { if (h) wrapRange(art, h.start, h.end, i, h, bookId); });
  }
  function addHighlight() {
    var tab = focusedTab(); if (!tab || tab.bookId == null) return;
    var container = focusedContainer();
    var root = container ? container.querySelector("article.book") : null; if (!root) return;
    var r = selectionRange(root); if (!r) { flash("Select some text in the sefer first, then press Highlight."); return; }
    var bookId = tab.bookId;
    var hls = load(hlKey(bookId), []);
    hls.push({ start: r.start, end: r.end, note: "", color: settings.hlColor });
    store(hlKey(bookId), hls);
    var idx = hls.length - 1;
    wrapRange(root, r.start, r.end, idx, hls[idx], bookId);
    window.getSelection().removeAllRanges();
    hideLookup();
    var mk = root.querySelector('mark.hl[data-hl="' + idx + '"]');
    if (mk) openHlMenu(idx, mk, bookId);
  }

  // ---------- highlight menu (color swatches + note + remove) ----------
  var hlIdx = -1, hlBookId = null, hlContainer = null;
  function buildHlSwatches() {
    var box = $("#hl-swatches"); box.innerHTML = "";
    HL_COLORS.forEach(function (c) {
      var sw = cE("span", "sw"); sw.style.background = c; sw.setAttribute("data-c", c);
      sw.addEventListener("click", function () { setHlColor(c); });
      box.appendChild(sw);
    });
  }
  function openHlMenu(idx, mk, bookId) {
    hlIdx = idx; hlBookId = bookId; hlContainer = mk.closest("#reader, #reader2") || mk.closest(".pane");
    var hls = load(hlKey(bookId), []); var h = hls[idx]; if (!h) return;
    $("#hl-note").value = h.note || "";
    document.querySelectorAll("#hl-swatches .sw").forEach(function (s) { s.classList.toggle("sel", s.getAttribute("data-c") === (h.color || HL_COLORS[0])); });
    var menu = $("#hl-menu");
    var main = $(".main").getBoundingClientRect();
    var rect = mk.getBoundingClientRect();
    menu.style.display = "block";
    var top = rect.bottom - main.top + 6, left = rect.left - main.left;
    menu.style.top = top + "px";
    menu.style.left = Math.max(6, Math.min(left, main.width - 244)) + "px";
    $("#hl-note").focus();
  }
  function hideHlMenu() { var m = $("#hl-menu"); if (m) m.style.display = "none"; hlIdx = -1; hlBookId = null; hlContainer = null; }
  function setHlColor(c) {
    settings.hlColor = c; persist();
    document.querySelectorAll("#hl-swatches .sw").forEach(function (s) { s.classList.toggle("sel", s.getAttribute("data-c") === c); });
    if (hlIdx < 0 || !hlBookId || !hlContainer) return;
    var hls = load(hlKey(hlBookId), []); if (!hls[hlIdx]) return;
    hls[hlIdx].color = c; store(hlKey(hlBookId), hls);
    hlContainer.querySelectorAll('mark.hl[data-hl="' + hlIdx + '"]').forEach(function (m) { m.style.background = c; });
  }
  function saveHlNote() {
    if (hlIdx < 0 || !hlBookId || !hlContainer) { hideHlMenu(); return; }
    var hls = load(hlKey(hlBookId), []); if (!hls[hlIdx]) { hideHlMenu(); return; }
    hls[hlIdx].note = $("#hl-note").value; store(hlKey(hlBookId), hls);
    hlContainer.querySelectorAll('mark.hl[data-hl="' + hlIdx + '"]').forEach(function (m) { m.classList.toggle("has-note", !!hls[hlIdx].note); });
    hideHlMenu();
  }
  function removeHl() {
    if (hlIdx < 0 || !hlBookId) { hideHlMenu(); return; }
    var hls = load(hlKey(hlBookId), []); if (!hls[hlIdx]) { hideHlMenu(); return; }
    var bookId = hlBookId;
    hls[hlIdx] = null; store(hlKey(bookId), hls);
    hideHlMenu();
    var lt = getTab(leftTabId), rt = getTab(rightTabId);
    if (lt && lt.bookId === bookId) renderPane("left");
    if (rt && rt.bookId === bookId) renderPane("right");
  }

  // ---------- select-to-look-up (dictionary) ----------
  function firstHebrewWord(s) { var m = (s || "").match(/[א-ת֑-ׇ]{2,}/); return m ? m[0] : ""; }
  function showLookup() {
    setTimeout(function () {
      var sel = window.getSelection();
      var txt = sel && sel.rangeCount ? sel.toString().trim() : "";
      var word = firstHebrewWord(txt);
      var fab = $("#lookup-fab");
      if (word && txt.length <= 60 && sel.rangeCount) {
        var main = $(".main").getBoundingClientRect();
        var rect = sel.getRangeAt(0).getBoundingClientRect();
        fab.style.display = "block";
        fab.style.top = (rect.bottom - main.top + 6) + "px";
        fab.style.left = Math.max(6, Math.min(rect.left - main.left, main.width - 110)) + "px";
        fab._word = word;
      } else { fab.style.display = "none"; }
    }, 10);
  }
  function hideLookup() { var f = $("#lookup-fab"); if (f) f.style.display = "none"; }

  // ---------- saved seforim ("Save" — formerly "pin") ----------
  function updatePinBtn() {
    var tab = focusedTab(); var id = tab ? tab.bookId : null;
    var btn = $("#btn-pin");
    if (id == null) { btn.style.display = "none"; return; }
    btn.style.display = "inline-flex";
    var p = pins.indexOf(id) !== -1;
    $("#pin-label").textContent = p ? "Saved" : "Save";
    btn.classList.toggle("on", p);
    btn.title = p ? "Remove this sefer from your Home page" : "Save this sefer to your Home page";
  }
  function togglePin() {
    var tab = focusedTab(); if (!tab || tab.bookId == null) return;
    var id = tab.bookId;
    var i = pins.indexOf(id);
    if (i === -1) pins.unshift(id); else pins.splice(i, 1);
    pins = pins.slice(0, 40); store("cr-pins", pins); updatePinBtn();
  }

  // ---------- theme / fonts / colors ----------
  var FONTS = {
    frankruehl: '"FrankRuehl","NotoHe",serif', noto: '"NotoHe","FrankRuehl",serif',
    david: '"David Libre","David","FrankRuehl","NotoHe",serif', narkisim: '"Narkisim","FrankRuehl","NotoHe",serif',
    times: '"Times New Roman",Times,"FrankRuehl",serif', georgia: 'Georgia,"Times New Roman",serif',
    arial: 'Arial,Helvetica,sans-serif', tahoma: 'Tahoma,Arial,sans-serif'
  };
  function applyTheme() { document.body.setAttribute("data-theme", settings.theme); }
  function applyFont() { var f = FONTS[settings.font] || FONTS.frankruehl; document.querySelectorAll("article.book, .bi-wrap").forEach(function (el) { el.style.fontFamily = f; }); }
  function applyReadColors() {
    ["#reader", "#reader2"].forEach(function (sel) {
      var rd = $(sel); if (!rd) return;
      if (settings.textColor) rd.style.setProperty("--readink", settings.textColor); else rd.style.removeProperty("--readink");
      if (settings.bgColor) rd.style.setProperty("--readbg", settings.bgColor); else rd.style.removeProperty("--readbg");
    });
  }
  function setTheme(t) { settings.theme = t; settings.textColor = null; settings.bgColor = null; persist(); applyTheme(); applyReadColors(); syncSettingsUI(); }
  function toggleFull() { if (!document.fullscreenElement) { (document.documentElement.requestFullscreen || function () {}).call(document.documentElement); } else { document.exitFullscreen && document.exitFullscreen(); } }

  var TEXT_SWATCHES = ["#22252b", "#000000", "#433422", "#1b2a4a", "#3a2f22", "#e2e2e2"];
  var BG_SWATCHES = ["#ffffff", "#faf7f0", "#f4ecd8", "#eaf3ea", "#e9eef6", "#1c2028"];
  function buildColorSwatches() {
    var t = $("#sp-textswatches"); t.innerHTML = "";
    TEXT_SWATCHES.forEach(function (c) { var s = cE("span", "sp-sw"); s.style.background = c; s.title = c; s.addEventListener("click", function () { settings.textColor = c; persist(); applyReadColors(); syncSettingsUI(); }); t.appendChild(s); });
    var b = $("#sp-bgswatches"); b.innerHTML = "";
    BG_SWATCHES.forEach(function (c) { var s = cE("span", "sp-sw"); s.style.background = c; s.title = c; s.addEventListener("click", function () { settings.bgColor = c; persist(); applyReadColors(); syncSettingsUI(); }); b.appendChild(s); });
  }
  function syncSettingsUI() {
    document.querySelectorAll(".sp-theme").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-theme") === settings.theme); });
    var sel = $("#sp-font"); if (sel) sel.value = settings.font || "frankruehl";
    var fs = $("#sp-fontsize-val"); if (fs) fs.textContent = settings.fontSize + "px";
    var rd = $("#reader"); var cs = rd ? getComputedStyle(rd) : null;
    if ($("#sp-textcolor") && cs) $("#sp-textcolor").value = settings.textColor || hexOf(cs.getPropertyValue("--readink")) || "#22252b";
    if ($("#sp-bgcolor") && cs) $("#sp-bgcolor").value = settings.bgColor || hexOf(cs.getPropertyValue("--readbg")) || "#ffffff";
  }
  function hexOf(v) { v = (v || "").trim(); return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : ""; }
  function toggleSettings() {
    var p = $("#settings-panel"); if (!p) return;
    var show = p.style.display !== "block";
    p.style.display = show ? "block" : "none";
    if (show) syncSettingsUI();
  }

  // ---------- data export / import ----------
  // Opens a real "Save As" dialog on browsers that support the File System Access API
  // (Chrome/Edge), so the file can be saved straight back onto this drive. Falls back to
  // a normal silent download (Firefox/Safari, or any file:// context that lacks the API).
  async function saveBlob(blob, suggestedName, description, mimeType, extensions) {
    if (window.showSaveFilePicker) {
      try {
        var accept = {}; accept[mimeType] = extensions;
        var handle = await window.showSaveFilePicker({ suggestedName: suggestedName, types: [{ description: description, accept: accept }] });
        var writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch (e) {
        if (e && e.name === "AbortError") return false; // user cancelled the save dialog — don't also silently download
        // otherwise fall through to the legacy download below
      }
    }
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = suggestedName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 100);
    return true;
  }
  async function exportData() {
    var data = { _cr_export: true, _date: new Date().toISOString() };
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf("cr-") === 0) data[k] = localStorage.getItem(k);
    }
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    await saveBlob(blob, "computer-rabbis-data.json", "JSON data file", "application/json", [".json"]);
  }
  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data._cr_export) { flash("This does not appear to be a Computer Rabbis data file."); return; }
        var count = 0;
        for (var k in data) { if (k.indexOf("cr-") === 0) { localStorage.setItem(k, data[k]); count++; } }
        flash("Imported " + count + " items. Reloading…");
        setTimeout(function () { location.reload(); }, 700);
      } catch (e) { flash("Could not read this file: " + e.message); }
    };
    reader.readAsText(file);
  }

  function flash(msg) {
    var f = $("#cr-flash");
    if (!f) { f = cE("div"); f.id = "cr-flash"; f.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--navy);color:#fff;padding:10px 16px;border-radius:8px;z-index:200;box-shadow:0 6px 20px rgba(0,0,0,.3);font-size:.9rem"; document.body.appendChild(f); }
    f.textContent = msg; f.style.display = "block";
    clearTimeout(f._t); f._t = setTimeout(function () { f.style.display = "none"; }, 2600);
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
    applyReadColors();
    buildHlSwatches();
    buildColorSwatches();
    $("#fontsize").value = settings.fontSize;
    $("#nikud").checked = settings.nikud;
    syncSettingsUI();

    // title search (persistent, collapsible — independent of the sidebar)
    $("#search").addEventListener("input", function () { runSearch(this.value); });
    var sw = $("#search-wrap"), searchInp = $("#search");
    function setSearchOpen(open) {
      sw.classList.toggle("open", open);
      if (open) searchInp.focus(); else { searchInp.value = ""; $("#searchres").style.display = "none"; }
    }
    $("#btn-search").addEventListener("click", function (e) {
      e.stopPropagation();
      setSearchOpen(!sw.classList.contains("open"));
    });

    // in-book find
    $("#inbook").addEventListener("input", function () { inBookFind(this.value); });

    // toc
    $("#toc-btn").addEventListener("click", function (e) { e.stopPropagation(); var t = $("#toc"); t.style.display = t.style.display === "block" ? "none" : "block"; });

    // sidebar toggle (button + arrow)
    function toggleSidebar() { document.body.classList.toggle("nosidebar"); }
    $("#btn-sidebar").addEventListener("click", toggleSidebar);
    var arrow = $("#sidebar-arrow"); if (arrow) arrow.addEventListener("click", toggleSidebar);

    // settings
    $("#btn-settings").addEventListener("click", function (e) { e.stopPropagation(); toggleSettings(); });
    document.querySelectorAll(".sp-theme").forEach(function (b) { b.addEventListener("click", function () { setTheme(b.getAttribute("data-theme")); }); });
    $("#sp-font").addEventListener("change", function () { settings.font = this.value; persist(); applyFont(); });
    $("#fontsize").addEventListener("input", function () {
      settings.fontSize = +this.value; persist();
      document.querySelectorAll("article.book").forEach(function (a) { a.style.fontSize = settings.fontSize + "px"; });
      var fs = $("#sp-fontsize-val"); if (fs) fs.textContent = settings.fontSize + "px";
    });
    $("#nikud").addEventListener("change", function () { settings.nikud = this.checked; persist(); reloadFocusedForNikud(); });
    $("#sp-textcolor").addEventListener("input", function () { settings.textColor = this.value; persist(); applyReadColors(); });
    $("#sp-bgcolor").addEventListener("input", function () { settings.bgColor = this.value; persist(); applyReadColors(); });
    $("#sp-textreset").addEventListener("click", function () { settings.textColor = null; persist(); applyReadColors(); syncSettingsUI(); });
    $("#sp-bgreset").addEventListener("click", function () { settings.bgColor = null; persist(); applyReadColors(); syncSettingsUI(); });

    // export / import
    $("#btn-export").addEventListener("click", exportData);
    var impFile = $("#import-file");
    $("#btn-import").addEventListener("click", function () { impFile.click(); });
    impFile.addEventListener("change", function () { if (this.files[0]) importData(this.files[0]); });

    // reader actions (apply to the focused pane)
    $("#btn-full").addEventListener("click", toggleFull);
    $("#btn-home").addEventListener("click", function () { loadIntoTab(focusedTabId(), null); });
    $("#btn-highlight").addEventListener("click", function (e) { e.stopPropagation(); addHighlight(); });
    $("#btn-pin").addEventListener("click", togglePin);
    $("#btn-copyloc").addEventListener("click", copyCurrentLocation);
    $("#btn-print").addEventListener("click", function () { window.print(); });

    // highlight menu
    $("#hl-save").addEventListener("click", saveHlNote);
    $("#hl-remove").addEventListener("click", removeHl);

    // dictionary panel
    $("#btn-dict").addEventListener("click", function () { if (window.CRDict) CRDict.togglePanel(); });
    $("#dict-close").addEventListener("click", function () { if (window.CRDict) CRDict.closePanel(); });

    // full-text search panel
    $("#btn-fts").addEventListener("click", function () { if (window.CRSearch) CRSearch.togglePanel(); });
    $("#lookup-btn").addEventListener("click", function () {
      var word = $("#lookup-fab")._word;
      hideLookup();
      if (word && window.CRDict) CRDict.lookup(word);
    });

    // research tabs + split view
    $("#btn-split").addEventListener("click", toggleSplit);
    var paneLeft = $("#pane-left"), paneRight = $("#pane-right");
    paneLeft.addEventListener("mousedown", function () { setFocusedSide("left"); });
    paneRight.addEventListener("mousedown", function () { setFocusedSide("right"); });

    // remember reading position per sefer, so reopening it (Home, pins, next session) resumes nearby
    var scrollSaveT = { left: null, right: null };
    ["left", "right"].forEach(function (side) {
      paneEl(side).addEventListener("scroll", function () {
        clearTimeout(scrollSaveT[side]);
        scrollSaveT[side] = setTimeout(function () { saveScrollPos(side); }, 700);
      });
    });

    // selection -> look-up affordance (both panes)
    ["#reader", "#reader2"].forEach(function (sel) {
      var pane = $(sel); if (!pane) return;
      pane.addEventListener("mouseup", showLookup);
      pane.addEventListener("mousedown", function (e) { if (!e.target.closest("#lookup-fab")) hideLookup(); });
      pane.addEventListener("scroll", function () { hideLookup(); hideHlMenu(); });
    });

    // global click: close popovers
    document.addEventListener("click", function (e) {
      if (!e.target.closest("#search-wrap")) $("#searchres").style.display = "none";
      if (!e.target.closest("#toc") && e.target.id !== "toc-btn" && !e.target.closest("#toc-btn")) $("#toc").style.display = "none";
      if (!e.target.closest("#hl-menu") && !(e.target.tagName === "MARK" && e.target.classList.contains("hl"))) hideHlMenu();
      if (!e.target.closest("#settings-panel") && e.target.id !== "btn-settings" && !e.target.closest("#btn-settings")) { var sp = $("#settings-panel"); if (sp) sp.style.display = "none"; }
      if (!e.target.closest(".learn-popover") && !e.target.closest(".learn-customize")) {
        document.querySelectorAll(".learn-popover.open").forEach(function (p) { p.classList.remove("open"); });
      }
    });

    // keyboard shortcuts
    document.addEventListener("keydown", function (e) {
      var tag = (e.target.tagName || "").toLowerCase();
      var typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;

      if (e.key === "Escape") {
        if (typing) e.target.blur();
        if (document.fullscreenElement) document.exitFullscreen && document.exitFullscreen();
        setSearchOpen(false);
        $("#toc").style.display = "none";
        hideHlMenu();
        hideLookup();
        var sp = $("#settings-panel"); if (sp) sp.style.display = "none";
        document.querySelectorAll(".learn-popover.open").forEach(function (p) { p.classList.remove("open"); });
        if (window.CRDict) CRDict.closePanel();
        if (window.CRSearch) CRSearch.closePanel();
        return;
      }

      if (typing) {
        if (e.key === "Enter" && e.target === searchInp) {
          var first = $("#searchres .sr-item");
          if (first) first.click();
        }
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "f" || e.key === "F") {
        toggleFull();
      }
    });

    if (CR.tree.length) CR.ready();
    applySplitUI();
    renderPane("left");
    renderTabStrip();
  });
})();
