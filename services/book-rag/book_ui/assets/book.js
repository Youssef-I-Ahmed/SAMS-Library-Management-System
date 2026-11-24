(function () {
  "use strict";
  // fonts: the first frame of a session carries them and installs them in the page; later frames copy them back
  (function shareFonts() {
    var own = document.getElementById("sams-fonts"), css = own.textContent.trim();
    try {
      var pd = window.parent && window.parent.document, ps = pd && pd.getElementById("sams-fonts");
      if (!pd) return;
      if (css && !ps) { ps = pd.createElement("style"); ps.id = "sams-fonts"; ps.textContent = css; pd.head.appendChild(ps); }
      else if (!css && ps) { own.textContent = ps.textContent; }
    } catch (e) { /* page not reachable: the system Arabic fonts are used */ }
  })();
  var P = JSON.parse(document.getElementById("book-data").textContent);
  var stage = document.getElementById("stage");
  if (P.animate) document.body.classList.add("anim");

  // ------------------------------------------------------------ helpers
  var DIG = "٠١٢٣٤٥٦٧٨٩";
  function ar(s) { return String(s).replace(/[0-9]/g, function (d) { return DIG[+d]; }); }
  function svg(str) { var t = document.createElement("template"); t.innerHTML = str.trim(); return t.content.firstChild; }
  function el(tag, a) {
    var n = document.createElement(tag);
    a = a || {};
    if (a.cls) n.className = a.cls;
    if (a.id) n.id = a.id;
    if (a.text != null) n.textContent = a.text;
    if (a.dir) n.setAttribute("dir", a.dir);
    if (a.style) n.setAttribute("style", a.style);
    if (a.t != null) n.style.setProperty("--t", a.t + "s");
    if (a.title) n.title = a.title;
    if (a.label) n.setAttribute("aria-label", a.label);
    if (a.onclick) n.addEventListener("click", a.onclick);
    for (var i = 2; i < arguments.length; i++) {
      var k = arguments[i];
      if (k == null || k === false) continue;
      n.appendChild(typeof k === "string" ? document.createTextNode(k) : k);
    }
    return n;
  }
  function langDir(s) { return /[\u0600-\u06FF]/.test(s || "") ? "rtl" : "ltr"; }

  var ORN = '<svg class="orn" width="140" height="14" viewBox="0 0 180 16" aria-hidden="true"><path d="M0 8h70M110 8h70" stroke="#B8923C" stroke-width="1"/><path d="M90 1l7 7-7 7-7-7z" fill="none" stroke="#B8923C" stroke-width="1.2"/><circle cx="78" cy="8" r="2" fill="#B8923C"/><circle cx="102" cy="8" r="2" fill="#B8923C"/></svg>';
  var STAR = '<svg class="bul" viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="4.5" width="11" height="11" fill="none" stroke="#B8923C" stroke-width="1.2"/><rect x="4.5" y="4.5" width="11" height="11" fill="none" stroke="#B8923C" stroke-width="1.2" transform="rotate(45 10 10)"/><circle cx="10" cy="10" r="1.8" fill="#B8923C"/></svg>';
  var STAR_S = '<svg width="12" height="12" viewBox="0 0 20 20" aria-hidden="true" style="vertical-align:-1px"><rect x="4.5" y="4.5" width="11" height="11" fill="none" stroke="#B8923C" stroke-width="1.4"/><rect x="4.5" y="4.5" width="11" height="11" fill="none" stroke="#B8923C" stroke-width="1.4" transform="rotate(45 10 10)"/></svg>';
  var SPARK = '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path class="twk" d="M6 0 L7.2 4.8 L12 6 L7.2 7.2 L6 12 L4.8 7.2 L0 6 L4.8 4.8 Z" fill="#C9A24A"/></svg>';
  var LEAF = '<svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><path d="M1 13 C4 4 10 1 17 1 C15 8 9 12 1 13 Z" fill="none" stroke="#8A6A1F" stroke-width="1"/><path d="M1 13 C6 9 10 6 14 3" stroke="#8A6A1F" stroke-width=".8" fill="none"/></svg>';
  var USER = '<svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#8E1F2B"/><circle cx="16" cy="12.5" r="5.5" fill="#FBF6EA"/><path d="M6.5 27 a10 8 0 0 1 19 0" fill="#FBF6EA"/></svg>';
  var PEN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A6A1F" stroke-width="1.5" aria-hidden="true"><path d="M20 3C12 4 7 9 5 17l-1 4 4-1c8-2 13-7 12-17z"/><path d="M5 19L14 10"/></svg>';
  var CORNER = '<svg class="corner" viewBox="0 0 26 26" aria-hidden="true"><path d="M2 2 H22 M2 2 V22 M2 2 Q12 4 14 14 Q4 12 2 2 Z M7 2 q3 6 0 10" fill="none" stroke="#B8923C" stroke-width="1"/><circle cx="14" cy="14" r="1.5" fill="#B8923C"/></svg>';
  function corners(page) {
    [["top:6px;right:6px", "scale(-1,1)"], ["top:6px;left:6px", "none"], ["bottom:6px;right:6px", "scale(-1,-1)"], ["bottom:6px;left:6px", "scale(1,-1)"]]
      .forEach(function (c) { var s = svg(CORNER); s.setAttribute("style", c[0] + ";transform:" + c[1]); page.appendChild(s); });
  }

  var LABELS = { "Title": "العنوان", "Authors": "المؤلفون", "Topics": "الموضوعات", "Subject codes": "أكواد الموضوعات",
    "Publishing date": "سنة النشر", "Publisher": "الناشر", "Publisher country": "بلد النشر", "Edition": "الطبعة",
    "Edition remarks": "ملاحظات الطبعة", "ISBN": "ISBN", "Book code": "كود الكتاب", "Call number": "رقم الاستدعاء",
    "Section number": "رقم القسم", "Extent": "الصفحات", "Dimensions": "المقاس", "Number of copies": "عدد النسخ",
    "Number of volumes": "عدد المجلدات", "Note": "ملاحظة", "Series": "السلسلة", "Copy codes": "أكواد النسخ",
    "Copy general numbers": "الأرقام العامة للنسخ", "Copy other numbers": "أرقام أخرى للنسخ" };
  var FKEYS = { author: "المؤلف", language: "اللغة", year_from: "من سنة", year_to: "إلى سنة", subject: "الموضوع", title: "العنوان", publisher: "الناشر" };
  var LANGV = { ar: "عربي", en: "إنجليزي" };
  function filtersText(f) {
    if (!f) return "";
    var parts = [];
    Object.keys(f).forEach(function (k) {
      var v = f[k]; if (v == null || v === "" || (Array.isArray(v) && !v.length)) return;
      v = Array.isArray(v) ? v.join("، ") : String(v);
      if (k === "language") v = LANGV[v] || v;
      parts.push((FKEYS[k] || k) + " = " + v);
    });
    return parts.length ? "فلتر: " + parts.join(" · ") : "";
  }
  function clean(v) { return v != null && String(v).trim() !== "" && String(v).trim().toUpperCase() !== "NA" && String(v) !== "nan"; }
  function spineColor(call) {
    var c = String(call || "").trim();
    if (/^6/.test(c)) return "#3E5274";
    if (/^3/.test(c)) return "#B39B6A";
    if (/^[0-9]/.test(c)) return "#5E7A6E";
    return "#6E5E80";
  }

  // ------------------------------------------------------------ book shell
  var state = { cur: P.current, mode: "answer", sel: null };
  var book, right, left;

  function shell() {
    stage.innerHTML = "";
    book = el("div", { cls: "book" });
    right = el("section", { cls: "page right", label: "الصفحة اليمنى" });
    left = el("section", { cls: "page left", label: "الصفحة اليسرى" });
    book.appendChild(right); book.appendChild(left);
    book.appendChild(el("div", { cls: "ribbon" }));
    stage.appendChild(book);
    drawTabs();
  }
  function resetPage(p) { p.innerHTML = ""; corners(p); }

  function drawTabs() {
    var old = book.querySelector(".tabs"); if (old) old.remove();
    var H = P.history || [];
    if (H.length < 2 || P.view !== "answer") return;
    var cols = ["#0E2547", "#8E1F2B", "#3E6B5C", "#B8923C", "#5B4A7A", "#6B5636"];
    var tabs = el("div", { cls: "tabs" });
    H.forEach(function (h, i) {
      var b = el("button", { cls: "tab" + (i === state.cur ? " on" : ""), text: h.q, title: h.q, style: "background:" + cols[i % cols.length],
        label: "السؤال: " + h.q, onclick: function () { if (i !== state.cur) { var dir = i > state.cur ? 1 : -1; state.cur = i; state.mode = "answer"; state.sel = null; turn(dir, drawAnswer); } } });
      tabs.appendChild(b);
    });
    book.appendChild(tabs);
  }

  // page turn: the left page lifts and falls on the right page (forward); dir -1 = backwards
  function turn(dir, draw) {
    var leaf = el("div", { cls: "leaf go" + (dir < 0 ? " back" : ""), style: "--d:1.15s" },
      el("div", { cls: "face f" }, el("div", { cls: "shade" })), el("div", { cls: "face b" }, el("div", { cls: "shade" })));
    book.appendChild(leaf);
    document.body.classList.add("anim");
    draw(true);
    setTimeout(function () { leaf.remove(); }, 1250);
  }

  // ------------------------------------------------------------ markdown (escaped) -> DOM
  function inline(text, parent, onTag) {
    var re = /\*\*([^*]+)\*\*|\[((?:S\d+)(?:\s*[,،]\s*S\d+)*)\]/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      if (m[1] != null) parent.appendChild(el("b", { text: m[1] }));
      else m[2].split(/\s*[,،]\s*/).forEach(function (tag) {
        parent.appendChild(el("sup", { cls: "tag", text: " " + tag, title: "اعرض بطاقة المصدر " + tag, onclick: function () { onTag && onTag(tag); } }));
      });
      last = re.lastIndex;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }
  function renderMarkdown(md, dir, onTag) {
    var box = el("div", { cls: "ans", dir: dir });
    var lines = String(md || "").replace(/\r/g, "").split("\n");
    var list = null, para = null, t = 0.5, n = 0, lastLi = null, blank = false;
    var TAGS_ONLY = /^\s*(\[(?:S\d+)(?:\s*[,،]\s*S\d+)*\]\s*)+[.،]?\s*$/;
    lines.forEach(function (raw) {
      var line = raw.replace(/^#{1,6}\s*/, "").trimEnd();
      if (!line.trim()) { para = null; blank = true; return; }
      var indented = /^(\s{2,}|\t)/.test(raw);
      var mo = line.match(/^\s*(\d+)[.)]\s+(.*)$/), mu = line.match(/^\s*[-*•]\s+(.*)$/);
      // a line with only source tags ("[S1]") belongs to the item / paragraph above it
      if (TAGS_ONLY.test(line) && (lastLi || para)) { inline(" " + line.trim(), lastLi || para, onTag); blank = false; return; }
      // details of a book written under it ("   - المؤلف: ...", or a plain line right under the item)
      if (lastLi && (indented && (mu || !mo) || (!blank && !mo && !mu))) {
        var sub = el("span", { cls: "sub" });
        inline(mu ? mu[1] : line.trim(), sub, onTag);
        lastLi.appendChild(el("br")); lastLi.appendChild(sub);
        blank = false; return;
      }
      if (mo || mu) {
        if (!list || (mo ? list.tagName !== "OL" : list.tagName !== "UL")) { list = el(mo ? "ol" : "ul"); box.appendChild(list); }
        para = null;
        var li = el("li", { cls: "a-fd", t: (t += 0.45) });
        var star = svg(STAR); star.classList.add("a-star"); star.style.setProperty("--t", t + "s"); li.appendChild(star);
        if (mo) li.appendChild(el("span", { cls: "num", text: (dir === "rtl" ? ar(mo[1]) : mo[1]) + "." }));
        inline(mo ? mo[2] : mu[1], li, onTag);
        list.appendChild(li); n++; lastLi = li; blank = false;
        return;
      }
      list = null; lastLi = null;
      if (!para) { para = el("p", { cls: "a-fd", t: (t += 0.35) }); box.appendChild(para); }
      else para.appendChild(el("br"));
      inline(line, para, onTag);
      blank = false;
    });
    // Gemini may list the books in any order: show list items in search order (S1 = closest first) and renumber
    Array.prototype.forEach.call(box.querySelectorAll("ol,ul"), function (lst) {
      var items = Array.prototype.slice.call(lst.children).map(function (li, i) {
        var tg = li.querySelector("sup.tag"), m = tg && tg.textContent.match(/S(\d+)/);
        return { li: li, k: m ? +m[1] : 1e9, i: i };
      });
      if (items.filter(function (x) { return x.k < 1e9; }).length < 2) return;
      items.sort(function (a, b) { return a.k - b.k || a.i - b.i; });
      items.forEach(function (x, n) {
        x.li.style.setProperty("--t", (0.95 + n * 0.45) + "s");
        x.li.querySelector(".a-star") && x.li.querySelector(".a-star").style.setProperty("--t", (0.95 + n * 0.45) + "s");
        var num = x.li.querySelector(".num");
        if (num) num.textContent = (dir === "rtl" ? ar(n + 1) : String(n + 1)) + ".";
        lst.appendChild(x.li);
      });
    });
    box._endT = t;
    return box;
  }

  // ------------------------------------------------------------ views
  function header(page, a, b, userIcon) {
    var left = el("span", { cls: "who" }); if (userIcon) left.appendChild(svg(USER)); left.appendChild(document.createTextNode(a));
    page.appendChild(el("div", { cls: "hdr" }, left, el("span", { text: b || "" })));
  }
  function title(page, text, small) {
    var d = langDir(text);
    var wrap = el("div", { cls: "ttl" + (small ? " small" : "") }, el("span", { cls: "a-wr", dir: d, text: text }));
    page.appendChild(wrap);
    page.appendChild(svg(ORN));
  }
  function pageNo(page, n) { page.appendChild(el("div", { cls: "pageno", text: "— " + ar(n) + " —" })); }

  function drawWelcome() {
    resetPage(right); resetPage(left);
    header(right, "سؤالك", "", true);
    right.appendChild(el("div", { cls: "waiting a-fd", text: "الصفحة في انتظار سؤالك…" }));
    pageNo(right, 1);
    header(left, "المصادر", "من فهرس المكتبة فقط");
    left.appendChild(el("div", { cls: "waiting a-fd", text: "الفهرس في انتظار سؤالك…" }));
    pageNo(left, 2);
  }

  function drawSearching() {
    var pd = P.pending || {}, pv = pd.preview || {};
    resetPage(right); resetPage(left);
    header(right, "سؤالك", filtersText(pv.filters_applied), true);
    title(right, pd.q || "");
    var books = pv.books || [];
    right.appendChild(el("div", { style: "text-align:center" }, el("span", { cls: "chip a-pop", t: 0.8,
      text: books.length ? "لقيت " + ar(books.length) + " كتب قريبة · يجهّز الإجابة" : "يبحث في الفهرس…" })));
    right.appendChild(el("div", { cls: "waiting a-fd", t: 1.2 }, svg(PEN), " المساعد يكتب الرد…"));
    pageNo(right, 1);

    header(left, "المصادر", "من فهرس المكتبة فقط");
    left.appendChild(el("div", { cls: "h2", text: "يقلّب في الفهرس…" }));
    var sc = el("div", { cls: "scroll" });
    books.forEach(function (b, i) { sc.appendChild(idxRow(b, i, null, false)); });
    left.appendChild(sc);
    pageNo(left, 2);
    // riffling pages over the left page while Gemini writes
    for (var k = 0; k < 3; k++) {
      book.appendChild(el("div", { cls: "leaf riffle", style: "animation-delay:" + (0.4 + k * 0.7) + "s" },
        el("div", { cls: "face f" }), el("div", { cls: "face b" })));
    }
  }

  function idxRow(b, i, onclick, on) {
    var tag = el("span", { cls: "stag", text: b.tag || "" });
    if (P.view === "answer" && b.tag) tag.appendChild(svg(SPARK));
    return el(onclick ? "button" : "div", { cls: "idx a-sr" + (on ? " on" : ""), t: 0.3 + i * 0.3, onclick: onclick, title: b.title },
      el("span", { cls: "spine", style: "background:" + spineColor(b.call_number) }),
      tag,
      el("span", { cls: "itl", dir: langDir(b.title), text: b.title }),
      el("span", { cls: "dots" }),
      el("span", { cls: "cnum", text: b.call_number || "" }));
  }

  function entry() { return (P.history || [])[state.cur]; }

  function drawAnswer(noAnim) {
    var e = entry(); if (!e) { drawWelcome(); return; }
    var d = e.data || {}, src = d.sources || [];
    if (state.sel == null && src.length) state.sel = src[0].tag;
    resetPage(right); resetPage(left);
    drawTabs();
    // right page: the answer
    header(right, "سؤالك", filtersText(d.filters_applied), true);
    title(right, e.q);
    var sc = el("div", { cls: "scroll" });
    if (d.notice) sc.appendChild(el("div", { cls: "note warn a-fd", t: 0.4, dir: langDir(d.notice), text: d.notice }));
    var md = renderMarkdown(d.answer, langDir(String(d.answer || "").slice(0, 300)), function (tag) { state.sel = tag; drawLeftAnswer(true); });
    sc.appendChild(md);
    var t = (md._endT || 1) + 0.4;
    if (d.coverage_note) { var nd = langDir(d.coverage_note), n1 = el("div", { cls: "note a-in", t: t, dir: nd }); n1.appendChild(svg(LEAF)); n1.appendChild(document.createTextNode((nd === "rtl" ? "حاشية: " : "Note: ") + d.coverage_note)); sc.appendChild(n1); }
    if (d.hint) sc.appendChild(el("div", { cls: "note a-in", t: t + 0.2, dir: langDir(d.hint), text: d.hint }));
    right.appendChild(sc);
    var meta = [d.provider, d.model, d.latency_s != null ? d.latency_s + " ث" : null].filter(Boolean).join(" · ");
    right.appendChild(el("div", { cls: "foot" }, el("span", { cls: "a-fd", t: t, text: meta ? "كُتب بواسطة " + meta : "" }), el("span", { text: "— " + ar(state.cur * 2 + 1) + " —", style: "font-family:var(--serif);font-size:15px" })));
    drawLeftAnswer(false);
  }

  function drawLeftAnswer(reselect) {
    var e = entry(), d = e.data || {};
    var src = (d.sources || []).slice().sort(function (a, b) { return (+String(a.tag).slice(1) || 0) - (+String(b.tag).slice(1) || 0); });
    resetPage(left);
    header(left, "المصادر", "بطاقات الكتب المذكورة في الرد");
    left.appendChild(el("div", { cls: "h2", text: "فهرس المصادر" }));
    var sc = el("div", { cls: "scroll" });
    if (!src.length) {
      sc.appendChild(el("div", { cls: "waiting a-fd", t: 0.5, style: "margin:30px auto", text: "لا توجد كتب مذكورة في هذا الرد." }));
    }
    src.forEach(function (s, i) {
      sc.appendChild(idxRow(s, reselect ? 0 : i, function () { state.sel = s.tag; drawLeftAnswer(true); }, s.tag === state.sel));
    });
    var s = src.filter(function (x) { return x.tag === state.sel; })[0];
    if (s) sc.appendChild(plate(s, reselect));
    left.appendChild(sc);
    var ab = d.all_books, foot = el("div", { cls: "foot" });
    if (ab && ab.items && ab.items.length) {
      var lbl = listTitle(ab, ab.items) + " ←";
      foot.appendChild(el("button", { cls: "allbtn a-pop", t: reselect ? 0 : 1.6, text: lbl, onclick: function () { state.mode = "all"; turn(1, drawAll); } }));
    } else foot.appendChild(el("span"));
    foot.appendChild(el("span", { text: "— " + ar(state.cur * 2 + 2) + " —", style: "font-family:var(--serif);font-size:15px" }));
    left.appendChild(foot);
  }

  function plate(s, quick) {
    var c = s.card || {};
    var p = el("div", { cls: "plate" + (quick ? "" : " a-stamp") });
    if (!quick) p.style.animationDelay = "1.8s";
    var cap = el("span", { cls: "cap" }); cap.appendChild(svg(STAR_S)); cap.appendChild(document.createTextNode(" من مقتنيات المكتبة · " + s.tag + " ")); cap.appendChild(svg(STAR_S));
    p.appendChild(cap);
    p.appendChild(el("div", { cls: "pt", dir: langDir(s.title), text: s.title }));
    var g = el("div", { cls: "grid" });
    [["سنة النشر", c["Publishing date"] || s.year], ["عدد النسخ", c["Number of copies"]], ["رقم الاستدعاء", c["Call number"] || s.call_number],
     ["المؤلف", c["Authors"] || s.author], ["الناشر", c["Publisher"]], ["الصفحات", c["Extent"]]].forEach(function (kv) {
      if (!clean(kv[1])) return;
      g.appendChild(el("div", null, el("span", { cls: "k", text: kv[0] }), el("span", { cls: "v", text: String(kv[1]) })));
    });
    p.appendChild(g);
    p.appendChild(el("div", { style: "text-align:center" }, el("button", { cls: "linkbtn", text: "كل حقول البطاقة", onclick: function () { showCard(c, s.title, s.tag); } })));
    return p;
  }

  function drawAll() {
    var e = entry(), d = e.data || {}, items = (d.all_books && d.all_books.items) || [];
    var half = Math.ceil(items.length / 2);
    resetPage(right); resetPage(left);
    var isTopic = d.all_books && d.all_books.topic_count != null;
    header(right, "القائمة الكاملة", "✓ = مذكور في الرد" + (isTopic ? " · ◆ = مصنّف تحت الموضوع" : ""));
    var t = listTitle(d.all_books || {}, items);
    right.appendChild(el("div", { cls: "ttl small", text: t }));
    right.appendChild(svg(ORN));
    var sr = el("div", { cls: "scroll" });
    items.slice(0, half).forEach(function (it, i) { sr.appendChild(listRow(it, i, e)); });
    right.appendChild(sr);
    pageNo(right, state.cur * 2 + 3);
    header(left, "تابع القائمة", "اضغط على أي كتاب لعرض بطاقته");
    left.appendChild(el("div", { style: "height:8px" }));
    var sl = el("div", { cls: "scroll" });
    items.slice(half).forEach(function (it, i) { sl.appendChild(listRow(it, i, e)); });
    left.appendChild(sl);
    left.appendChild(el("div", { cls: "foot" },
      el("button", { cls: "allbtn", text: "→ العودة للإجابة", onclick: function () { state.mode = "answer"; turn(-1, drawAnswer); } }),
      el("span", { text: "— " + ar(state.cur * 2 + 4) + " —", style: "font-family:var(--serif);font-size:15px" })));
  }

  function listTitle(ab, items) {
    // topic list: "16 books in the subject + 25 related"; else as before
    if (ab.topic_count != null) {
      var s = "كتب الموضوع (" + ar(ab.topic_count) + ")";
      return ab.related_count ? s + " + " + ar(ab.related_count) + " كتابًا قريبًا" : s;
    }
    if (ab.complete) return "كل الكتب المطابقة (" + ar(items.length) + ")";
    return ab.relevant_only ? "الكتب ذات الصلة (" + ar(items.length) + ")" : "أقرب " + ar(items.length) + " كتابًا لسؤالك";
  }

  function listRow(it, i, e) {
    var cards = (e.data && e.data.cards) || {};
    return el("button", { cls: "row a-fd", t: 0.6 + i * 0.06, title: it.title, onclick: function () {
        var code = (it.book_codes || [])[0], c = cards[String(code)];
        if (!c) c = { "Title": it.title, "Authors": it.author, "Publishing date": it.year, "Call number": it.call_number, "Number of copies": it.copies };
        showCard(c, it.title, null);
      } },
      el("span", { cls: "n", text: ar(it.n) }),
      el("span", { cls: "ok", text: it.in_answer ? "✓" : "" }),
      (e.data && e.data.all_books && e.data.all_books.topic_count != null)
        ? el("span", { cls: "tp", title: it.in_topic ? "مصنّف تحت الموضوع" : "", text: it.in_topic ? "◆" : "" }) : null,
      el("span", { cls: "t" + (it.in_answer ? " b" : ""), dir: langDir(it.title), text: it.title }),
      el("span", { cls: "dots" }),
      el("span", { cls: "y", text: (it.year != null ? String(it.year) : "") + (it.score != null ? "  ·  " + it.score : "") }),
      el("span", { cls: "cnum", text: it.call_number || "" }));
  }

  function showCard(card, ttl, tag) {
    var m = el("div", { cls: "modal", onclick: function (ev) { if (ev.target === m) m.remove(); } });
    var box = el("div", { cls: "cardbox a-pop", label: "بطاقة الكتاب" });
    box.appendChild(el("button", { cls: "x", text: "×", label: "إغلاق", onclick: function () { m.remove(); } }));
    box.appendChild(el("div", { cls: "sub", text: tag ? "بطاقة الفهرس · " + tag : "بطاقة الفهرس" }));
    box.appendChild(el("h3", { dir: langDir(ttl), text: ttl }));
    box.appendChild(svg(ORN));
    var dl = el("dl");
    Object.keys(card || {}).forEach(function (k) {       // all 22 fields; empty ones are shown as NA
      var has = clean(card[k]);
      dl.appendChild(el("dt", { text: LABELS[k] || k }));
      dl.appendChild(el("dd", { cls: has ? null : "na", text: has ? String(card[k]) : "NA" }));
    });
    box.appendChild(dl);
    m.appendChild(box);
    book.appendChild(m);
    document.addEventListener("keydown", function esc(ev) { if (ev.key === "Escape") { m.remove(); document.removeEventListener("keydown", esc); } });
  }

  // ------------------------------------------------------------ intro (first visit only)
  function intro(done) {
    var brand = P.brand || {};
    var ov = el("div", { id: "intro" });
    var wrap = el("div", { cls: "ib-wrap" });
    var s = Math.min(1, (window.innerWidth - 40) / 700, (window.innerHeight - 20) / 470);
    wrap.style.setProperty("--s", s.toFixed(3));
    var bookEl = el("div", { cls: "ib" });
    var page = el("div", { cls: "ib-page" }, el("div", { cls: "ib-title" },
      el("span", { style: "font-family:var(--sans);font-size:11px;color:#8A6A1F", text: brand.sub || "" }),
      svg(ORN),
      el("span", { style: "font-family:var(--ruqaa);font-weight:700;font-size:34px;line-height:1.5;color:#0E2547" }, "البحث الذكي", el("br"), "في فهرس المكتبة"),
      svg(ORN),
      el("span", { style: "font-size:15px;color:#6B5636", text: P.books_total ? ar(Number(P.books_total).toLocaleString("en-US").replace(/,/g, "٬")) + " كتابًا" : "" })));
    var front = el("div", { cls: "ib-front" }, el("div", { style: "display:flex;flex-direction:column;align-items:center;gap:18px;position:relative" },
      svg('<svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="#D9B865" stroke-width="1.1" aria-hidden="true"><path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/></svg>'),
      el("span", { style: "font-family:var(--ruqaa);font-weight:700;font-size:40px;color:#E1C06A;text-shadow:0 1px 0 #6E5214", text: brand.name || "" }),
      svg(ORN)));
    var back = el("div", { cls: "ib-back" }, el("div", { cls: "exlib" },
      el("span", { style: "font-family:var(--ruqaa);font-size:22px;color:#8A6A1F", text: "من مقتنيات" }),
      el("span", { style: "font-family:var(--ruqaa);font-size:24px;color:#0E2547", text: brand.name || "" })));
    var cover = el("div", { cls: "ib-cover" }, front, back);
    bookEl.appendChild(page); bookEl.appendChild(cover);
    wrap.appendChild(bookEl); ov.appendChild(wrap);
    document.body.appendChild(ov);
    book.style.opacity = "0";
    setTimeout(function () { ov.classList.add("out"); book.style.transition = "opacity .8s"; book.style.opacity = "1"; }, 4200);
    setTimeout(function () { ov.remove(); done && done(); }, 4900);
  }

  // ------------------------------------------------------------ start
  shell();
  if (P.view === "searching") drawSearching();
  else if (P.view === "answer" && entry()) {
    if (P.animate) {               // a new answer: one page turns, then the ink appears
      drawAnswer();
      var leaf = el("div", { cls: "leaf go", style: "--d:1.2s" }, el("div", { cls: "face f" }, el("div", { cls: "shade" })), el("div", { cls: "face b" }, el("div", { cls: "shade" })));
      book.appendChild(leaf); setTimeout(function () { leaf.remove(); }, 1300);
    } else drawAnswer();
  } else drawWelcome();
  if (P.intro) intro();
})();
