"""Visual identity: deep navy + antique gold academic palette, white / light-blue surfaces (an original design that follows
the supplied reference's look; it is not an official brand kit). Responsive: desktop, tablet and phone breakpoints."""

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap');
:root{--navy:#0B2447;--navy2:#13376a;--navy3:#1c4a86;--gold:#C9A24B;--gold2:#E3C57B;--gold-soft:#F7EFD9;--ink:#14213a;--muted:#5b6b82;
--line:#dfe6f0;--bg:#EEF3FA;--card:#ffffff;--blue-soft:#E8F0FB;--ok:#1f7a4d;--warn:#9a5b00;--bad:#a33a3a;--r:16px}
html,body,[class*="css"],.stApp,button,input,textarea,select{font-family:'Cairo','Segoe UI',Tahoma,system-ui,sans-serif !important}
.stApp{background:var(--bg);color:var(--ink)}
header[data-testid="stHeader"]{background:transparent}
[data-testid="stToolbar"],[data-testid="stDecoration"],footer,#MainMenu{display:none !important;visibility:hidden}
.block-container{max-width:1180px;padding:3.2rem 2rem 3rem}
h1,h2,h3{color:var(--navy);font-weight:700}
/* ---------------- sidebar */
[data-testid="stSidebar"]{background:linear-gradient(180deg,var(--navy) 0%,#091b38 100%);border:0;min-width:270px}
[data-testid="stSidebar"] *{color:#e8eefb}
[data-testid="stSidebarContent"]{padding:1rem .9rem}
.brand{display:flex;align-items:center;gap:.7rem;padding:.4rem .3rem 1rem;border-bottom:1px solid rgba(255,255,255,.12);margin-bottom:.8rem}
.brand svg{flex:0 0 auto}
.brand b{display:block;color:#fff;font-size:1.05rem;letter-spacing:.2px;line-height:1.25}
.brand small{display:block;color:var(--gold2);font-size:.74rem;line-height:1.3}
[data-testid="stSidebar"] [data-testid="stRadio"] > label{display:none}
[data-testid="stSidebar"] [data-testid="stRadio"] div[role="radiogroup"]{gap:.2rem}
[data-testid="stSidebar"] [data-testid="stRadio"] label{padding:.62rem .8rem;border-radius:12px;cursor:pointer;width:100%;border-inline-start:3px solid transparent;transition:background .15s}
[data-testid="stSidebar"] [data-testid="stRadio"] label:hover{background:rgba(255,255,255,.07)}
[data-testid="stSidebar"] [data-testid="stRadio"] label > div:first-child{display:none}
[data-testid="stRadio"] [data-testid="stRadioOption"] > div > div:first-child{display:none}
[data-testid="stSidebar"] [data-testid="stRadio"] [data-testid="stWidgetLabel"],.st-key-topnav [data-testid="stWidgetLabel"]{display:none}
[data-testid="stSidebar"] [data-testid="stRadioOption"]{width:100%}
[data-testid="stSidebar"] [data-testid="stRadio"] label p{font-size:.97rem;font-weight:600;margin:0}
[data-testid="stSidebar"] [data-testid="stRadio"] label:has(input:checked){background:rgba(201,162,75,.16);border-inline-start-color:var(--gold)}
[data-testid="stSidebar"] [data-testid="stRadio"] label:has(input:checked) p{color:var(--gold2)}
[data-testid="stSidebar"] .stRadio [role="radiogroup"][aria-label="lang"] label{padding:.3rem .6rem}
.side-foot{margin-top:1.4rem;padding-top:.9rem;border-top:1px solid rgba(255,255,255,.12);color:#9fb3d3;font-size:.76rem;line-height:1.6}
/* ---------------- top nav (shown on narrow screens only) */
.st-key-topnav{display:none}
.st-key-topbar{display:flex;justify-content:flex-end;margin:-1.2rem 0 .4rem}
.st-key-topbar [data-testid="stWidgetLabel"]{display:none}
.st-key-topbar [data-testid="stRadio"] div[role="radiogroup"]{gap:.3rem}
.st-key-topbar [data-testid="stRadioOption"]{background:#fff;border:1px solid var(--line);border-radius:999px;padding:.15rem .8rem}
.st-key-topbar [data-testid="stRadioOption"] > div > div:first-child{display:none}
.st-key-topbar [data-testid="stRadioOption"]:has(input:checked){background:var(--navy);border-color:var(--navy)}
.st-key-topbar [data-testid="stRadioOption"]:has(input:checked) p{color:#fff}
.st-key-topbar p{margin:0;font-size:.85rem;font-weight:600}
div.stButton{width:100%}
div.stButton>button{height:auto;white-space:normal;padding:.45rem .9rem;line-height:1.5}
div.stButton>button p{white-space:normal;overflow-wrap:anywhere}
/* ---------------- hero */
.hero{position:relative;overflow:hidden;border-radius:22px;padding:2.2rem 2.4rem 2rem;color:#fff;margin-bottom:1.1rem;
  background:radial-gradient(1200px 400px at 85% -20%,rgba(201,162,75,.35),transparent 60%),linear-gradient(120deg,var(--navy) 0%,var(--navy3) 100%);
  border-bottom:4px solid var(--gold);box-shadow:0 10px 30px rgba(11,36,71,.22)}
.hero:after{content:"";position:absolute;inset-inline-end:-80px;top:-80px;width:340px;height:340px;border-radius:50%;
  border:2px solid rgba(227,197,123,.35);box-shadow:0 0 0 28px rgba(227,197,123,.07),0 0 0 62px rgba(227,197,123,.05)}
.hero .kicker{color:var(--gold2);font-weight:600;font-size:.9rem;letter-spacing:.4px}
.hero h1{color:#fff;font-size:2.05rem;margin:.2rem 0 .5rem;line-height:1.35;max-width:780px;position:relative;z-index:1}
.hero p{color:#d7e3f7;font-size:1.02rem;max-width:720px;line-height:1.85;margin:0;position:relative;z-index:1}
.hero .acad{margin-top:.9rem;color:#bcd0ee;font-size:.88rem;position:relative;z-index:1}
/* ---------------- stat cards */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:.9rem;margin:.4rem 0 .8rem}
.stat{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:1rem 1.1rem;text-align:center;box-shadow:0 2px 8px rgba(11,36,71,.05)}
.stat .ic{width:42px;height:42px;border-radius:12px;margin:0 auto .5rem;display:flex;align-items:center;justify-content:center;background:var(--gold-soft);color:#8a6a1f;font-size:1.25rem}
.stat .n{font-size:1.75rem;font-weight:700;color:var(--navy);line-height:1.2;direction:ltr;unicode-bidi:isolate}
.stat .l{color:var(--muted);font-size:.86rem;margin-top:.15rem}
.note{color:var(--muted);font-size:.8rem;margin:.2rem 0 1rem}
/* ---------------- cards */
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:1rem 1.2rem;margin:.6rem 0;box-shadow:0 2px 8px rgba(11,36,71,.05)}
.card .t{font-weight:700;color:var(--navy);font-size:1.04rem;line-height:1.6;overflow-wrap:anywhere}
.card .meta{color:var(--muted);font-size:.9rem;margin-top:4px;overflow-wrap:anywhere}
.feature h3{margin:.1rem 0 .3rem;font-size:1.15rem}
.feature p{color:var(--muted);margin:0 0 .5rem;line-height:1.8}
.page-title{margin:.1rem 0 .2rem;font-size:1.65rem}
.page-sub{color:var(--muted);margin:0 0 1rem}
.chip{display:inline-block;border-radius:999px;padding:1px 10px;font-size:.78rem;margin:2px 4px 0 0;border:1px solid var(--line);background:#fff;color:var(--ink)}
.chip.gold{background:var(--gold-soft);border-color:#e6d3a0;color:#6b5314}
.chip.navy{background:var(--blue-soft);border-color:#c9d9ee;color:var(--navy)}
.chip.ok{background:#e6f4ec;border-color:#bfe0cd;color:var(--ok)}
.chip.warn{background:#fff3e0;border-color:#f0d3a3;color:var(--warn)}
.banner{border-radius:12px;padding:.6rem .9rem;margin:.5rem 0;font-size:.92rem;border:1px solid;overflow-wrap:anywhere}
.banner.ok{background:#eaf6ef;border-color:#bfe0cd;color:#1d5e3d}
.banner.info{background:#eaf1fa;border-color:#c9d9ee;color:#1d3f6b}
.banner.warn{background:#fff6e8;border-color:#f0d3a3;color:#7a4a00}
.banner.abstain{background:#fdf1f1;border-color:#efc7c7;color:#7d2a2a}
.banner.error{background:#fdecec;border-color:#e8a9a9;color:#7a1f1f}
/* ---------------- chat */
.bubble-user{background:var(--navy);color:#fff;border-radius:18px 18px 4px 18px;padding:.7rem 1.1rem;margin:.9rem 0 .4rem;max-width:min(720px,92%);margin-inline-start:auto;line-height:1.8;overflow-wrap:anywhere;width:fit-content}
.answer{background:#fff;border:1px solid var(--line);border-inline-start:5px solid var(--gold);border-radius:14px;padding:1rem 1.2rem;margin:.4rem 0;line-height:1.95;overflow-wrap:anywhere;white-space:pre-wrap}
.answer .st{display:inline-block;font-size:.74rem;font-weight:700;border-radius:999px;padding:1px 10px;margin-bottom:.4rem}
.answer .st.ok{background:#e6f4ec;color:var(--ok)} .answer .st.warn{background:#fff3e0;color:var(--warn)} .answer .st.bad{background:#fdecec;color:var(--bad)}
.src-label{color:var(--navy);font-weight:700;font-size:.9rem;margin:.7rem 0 .1rem}
/* ---------------- result rows (table look on desktop, stacked cards on phones) */
.rowh{display:grid;grid-template-columns:.7fr 4fr 2fr 2fr .8fr 1.6fr 1.1fr;gap:.6rem;background:var(--navy);color:#fff;border-radius:12px 12px 0 0;padding:.6rem .9rem;font-weight:600;font-size:.86rem;margin-top:.8rem}
[class*="st-key-row_"]{background:#fff;border-bottom:1px solid var(--line);padding:.35rem .9rem;border-inline:1px solid var(--line)}
[class*="st-key-row_"] p{margin:0;font-size:.9rem;overflow-wrap:anywhere}
[class*="st-key-row_"] .mlabel{display:none}
.rowend{height:10px;border:1px solid var(--line);border-top:0;border-radius:0 0 12px 12px;background:#fff}
/* ---------------- inputs / buttons */
div.stButton>button,div[data-testid="stFormSubmitButton"]>button{width:100%;border-radius:12px;border:1px solid var(--navy);color:var(--navy);font-weight:600;min-height:2.6rem;background:#fff}
div.stButton>button:hover{border-color:var(--gold);color:var(--navy)}
div.stButton>button[kind="primary"],div[data-testid="stFormSubmitButton"]>button[kind="primary"],div[data-testid="stFormSubmitButton"]>button{background:linear-gradient(180deg,var(--gold2),var(--gold));border-color:var(--gold);color:#1c1400}
div.stButton>button[kind="secondary"]{background:#fff}
.st-key-cta_search button{background:#fff !important;border:1.5px solid var(--navy) !important;color:var(--navy) !important}
.st-key-ask_btn button,.st-key-search_btn button{background:var(--navy) !important;color:#fff !important;border-color:var(--navy) !important}
[data-baseweb="input"],[data-baseweb="select"]>div,[data-baseweb="textarea"]{border-radius:12px !important;background:#fff !important}
[data-testid="stForm"]{border:1px solid var(--line);border-radius:var(--r);background:#fff;padding:1rem 1.1rem}
[data-testid="stExpander"]{border-radius:12px;border-color:var(--line);background:#fff}
.kv{display:grid;grid-template-columns:170px 1fr;gap:.55rem 1rem;font-size:.95rem}
.kv .k{color:var(--muted);font-weight:600}
.kv div{overflow-wrap:anywhere}
.wrap-tbl{overflow-x:auto}
@media (max-width:1000px){
  .block-container{padding:4rem 1.1rem 2.5rem}
  .st-key-topbar{margin:0 0 .6rem}
  header[data-testid="stHeader"]{height:3.2rem}
  [data-testid="stSidebar"],[data-testid="stSidebarCollapsedControl"],[data-testid="stExpandSidebarButton"],[data-testid="stSidebarCollapseButton"]{display:none !important}
  .stats{grid-template-columns:repeat(2,1fr)}
  .hero{padding:1.6rem 1.3rem} .hero h1{font-size:1.55rem}
  .rowh{display:none}
}
@media (max-width:640px){
  .stats{gap:.6rem} .stat .n{font-size:1.45rem}
  .hero h1{font-size:1.3rem} .hero p{font-size:.94rem}
  .kv{grid-template-columns:1fr;gap:.1rem .5rem} .kv .k{margin-top:.5rem}
  [class*="st-key-row_"] .mlabel{display:inline;color:var(--muted);font-weight:600}
  [class*="st-key-row_"]{border:1px solid var(--line);border-radius:14px;margin:.5rem 0;padding:.7rem .9rem}
  .rowend{display:none}
  .st-key-topnav{display:block}
  div.stButton>button{width:100%;min-height:2.9rem}
  .page-title{font-size:1.35rem}
}
@media (max-width:1000px){ .st-key-topnav{display:block} }
.st-key-topnav [data-testid="stRadio"] div[role="radiogroup"]{flex-wrap:nowrap;overflow-x:auto;gap:.3rem;padding-bottom:.3rem}
.st-key-topnav [data-testid="stRadio"] label{background:#fff;border:1px solid var(--line);border-radius:999px;padding:.25rem .8rem;white-space:nowrap}
.st-key-topnav [data-testid="stRadio"] label > div:first-child{display:none}
.st-key-topnav [data-testid="stRadio"] label:has(input:checked){background:var(--navy);border-color:var(--navy)}
.st-key-topnav [data-testid="stRadio"] label:has(input:checked) p{color:#fff}
.st-key-topnav [data-testid="stRadio"] label p{font-size:.86rem;margin:0;font-weight:600}
.st-key-topnav [data-testid="stRadio"] > label{display:none}
"""

RTL = """
.stApp,.block-container,.card,.answer,.banner,.hero,.stat,[data-testid="stSidebarContent"],[data-testid="stForm"],.stMarkdown,label,.kv,.page-title,.page-sub,.note,.bubble-user,.rowh,[class*="st-key-row_"]
 {direction:rtl;text-align:right}
.stat{text-align:center}
.bubble-user{margin-inline-start:0;margin-inline-end:auto}
input,textarea{direction:rtl;text-align:right}
code,.ltr,.stSlider,[data-testid="stSlider"]{direction:ltr;text-align:left}
bdi{unicode-bidi:isolate}
[data-testid="stSidebarCollapseButton"],[data-testid="stExpandSidebarButton"]{transform:scaleX(-1)}
"""
LTR = """
.stApp,.block-container,.card,.answer,.banner,.hero,[data-testid="stForm"],.kv,.rowh,[class*="st-key-row_"]{direction:ltr;text-align:left}
.stat{text-align:center}
"""

EMBLEM_SVG = """<svg width="46" height="46" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<circle cx="32" cy="32" r="30" stroke="#C9A24B" stroke-width="2"/><path d="M14 40c6 8 18 12 18 12s12-4 18-12" stroke="#E3C57B" stroke-width="2.2" stroke-linecap="round"/>
<path d="M32 14l16 7v3H16v-3l16-7z" fill="#E3C57B"/><rect x="20" y="27" width="4" height="12" fill="#C9A24B"/><rect x="30" y="27" width="4" height="12" fill="#C9A24B"/><rect x="40" y="27" width="4" height="12" fill="#C9A24B"/>
<rect x="16" y="40" width="32" height="3" rx="1" fill="#E3C57B"/></svg>"""
