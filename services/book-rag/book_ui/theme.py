"""Page look around the book: library background, navy/gold sidebar, cream "pen" question line.

Only CSS on Streamlit's own elements (no change to how widgets work).
"""
import html

import streamlit as st

_SPINES = ("repeating-linear-gradient(90deg,#5B2A22 0 22px,#120c08 22px 24px,#2E3F5C 24px 50px,#120c08 50px 52px,"
           "#6B5636 52px 70px,#120c08 70px 72px,#3E5A4C 72px 100px,#120c08 100px 102px,#7A3B2E 102px 120px,"
           "#120c08 120px 122px,#4A3A5C 122px 150px,#120c08 150px 152px,#8C6D33 152px 168px,#120c08 168px 170px,"
           "#2B2B3A 170px 196px,#120c08 196px 198px,#1E3A6E 198px 220px,#120c08 220px 222px)")

CSS = """
:root{--sams-serif:'Amiri','Noto Naskh Arabic','Traditional Arabic','Geeza Pro',serif;--sams-ruqaa:'Aref Ruqaa','Amiri','Noto Naskh Arabic','Geeza Pro',serif;--sams-sans:'IBM Plex Sans Arabic','Noto Sans Arabic','Segoe UI','Geeza Pro',Tahoma,sans-serif;--sams-navy:#0E2547;--sams-gold:#C9A24A;--sams-gold2:#E8C977;--sams-paper:#F2EADB}
.stApp{background:#140E09}
.stApp::before{content:"";position:fixed;inset:-30px;z-index:0;pointer-events:none;
  background:repeating-linear-gradient(180deg,rgba(18,12,8,.95) 0 26px,rgba(0,0,0,0) 26px 216px,#3A2414 216px 230px),SPINES;
  filter:blur(2px) brightness(.55) saturate(.7)}
.stApp::after{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;
  background:radial-gradient(ellipse 45% 55% at 45% 25%,rgba(255,205,130,.30),rgba(255,190,110,.08) 45%,rgba(0,0,0,0) 70%),
             radial-gradient(ellipse at 45% 50%,rgba(0,0,0,0) 35%,rgba(0,0,0,.55) 100%)}
[data-testid="stAppViewContainer"],[data-testid="stMain"],[data-testid="stHeader"],[data-testid="stBottom"],
[data-testid="stBottom"] > div,[data-testid="stBottomBlockContainer"]{background:transparent !important}
[data-testid="stAppViewContainer"]{position:relative;z-index:1}
[data-testid="stMainBlockContainer"],.block-container{padding-top:4.2rem !important;padding-bottom:1rem !important;max-width:1240px}
[data-testid="stIFrame"],iframe{border:0;background:transparent}
.stApp,[data-testid="stSidebar"],.stMarkdown,label{direction:rtl;text-align:right}

/* sidebar */
[data-testid="stSidebar"]{overflow-x:hidden}
[data-testid="stSidebar"][aria-expanded="false"],[data-testid="stSidebar"][data-collapsed="true"]{visibility:hidden}
[data-testid="stSidebar"][aria-expanded="false"] > div,[data-testid="stSidebar"][data-collapsed="true"] > div{display:none !important}
[data-testid="stSidebar"]{background:linear-gradient(180deg,#172A4B 0%,#0E1B33 100%) !important;border-left:1px solid #2A3E62}
[data-testid="stSidebar"] p,[data-testid="stSidebar"] label,[data-testid="stSidebar"] input,[data-testid="stSidebar"] .stCaption{font-family:var(--sams-sans)}
[data-testid="stSidebar"] label,[data-testid="stSidebar"] p,[data-testid="stSidebar"] .stCaption{color:#B9C4D6 !important}
[data-testid="stSidebar"] h3{font-family:var(--sams-ruqaa) !important;color:#E8C977 !important;font-size:21px !important;margin:6px 0 0 !important;padding:0 !important}
[data-testid="stSidebar"] [data-testid="stTextInput"] input{background:transparent !important;color:#FBF6EA !important;border:0 !important;border-bottom:1px solid #5C7096 !important;border-radius:0 !important;font-family:var(--sams-serif) !important;font-size:17px}
[data-testid="stSidebar"] [data-testid="stTextInput"] div[data-baseweb="input"],
[data-testid="stSidebar"] [data-testid="stTextInput"] div[data-baseweb="base-input"]{background:transparent !important;border:0 !important}
[data-testid="stSidebar"] [data-testid="stTextInput"] input::placeholder{color:#7F91B0 !important}
[data-testid="stSidebar"] [data-testid="stTextInput"] div:has(> input),[data-testid="stSidebar"] [data-testid="stTextInput"] div:has(> div > input){background:transparent !important;border-color:transparent !important}
[data-testid="stSidebar"] .stButton button{width:100%;justify-content:flex-start;text-align:right;background:transparent;color:#D8DEE9;border:0;border-radius:6px;
  font-family:var(--sams-serif) !important;font-size:16px;padding:6px 10px;border-right:6px solid var(--rib,#B8923C)}
[data-testid="stSidebar"] .stButton button p{font-family:var(--sams-serif) !important;color:#D8DEE9 !important;font-size:16px}
[data-testid="stSidebar"] .stButton button:hover{background:rgba(201,162,74,.14);color:#F5E6C4}
[data-testid="stSidebar"] .stButton button[kind="primary"]{justify-content:center;border:1px solid var(--sams-gold);border-right:1px solid var(--sams-gold)}
[data-testid="stSidebar"] .stButton button[kind="primary"] p{font-family:var(--sams-ruqaa) !important;color:#E8C977 !important;font-size:18px}
[data-testid="stSidebar"] [role="radiogroup"]{background:#0B1529;border-radius:8px;padding:3px;gap:3px !important;flex-wrap:nowrap}
[data-testid="stSidebar"] [role="radiogroup"] label{flex:1;justify-content:center;margin:0 !important;padding:5px 6px;border-radius:6px;cursor:pointer}
[data-testid="stSidebar"] [role="radiogroup"] label > div:first-child,
[data-testid="stSidebar"] [role="radiogroup"] label > *:not(:has(p)):not(p){display:none !important}
[data-testid="stSidebar"] [role="radiogroup"] label > div > div:not(:has(p)){display:none !important}
[data-testid="stSidebar"] [role="radiogroup"] label p{color:#D8DEE9 !important;font-size:12px;white-space:nowrap}
[data-testid="stSidebar"] [role="radiogroup"] label:has(input:checked){background:var(--sams-gold)}
[data-testid="stSidebar"] [role="radiogroup"] label:has(input:checked) p{color:#2A2116 !important;font-weight:600}
.sams-brand{text-align:center;padding:4px 0 12px;margin-bottom:6px;border-bottom:1px solid #2A3E62}
.sams-brand .n{font-family:var(--sams-ruqaa);font-size:27px;color:#E8C977;line-height:1.3;white-space:nowrap}
.sams-brand .s{font-size:11px;color:#9FB0C9}
.sams-status{font-size:11px;color:#9FB0C9;display:flex;align-items:center;gap:6px}
.sams-status i{width:7px;height:7px;border-radius:50%;display:inline-block}

/* question line (chat input) */
[data-testid="stChatInput"] > div,[data-testid="stChatInput"] > div:focus-within{border-color:transparent !important;background:transparent !important}
[data-testid="stChatInput"]:focus-within{box-shadow:0 0 0 2px #C9A24A,0 10px 30px rgba(0,0,0,.35) !important}
[data-testid="stChatInput"]{background:var(--sams-paper) !important;border:0 !important;border-radius:10px !important;box-shadow:0 10px 30px rgba(0,0,0,.35)}
[data-testid="stChatInput"] textarea{font-family:var(--sams-serif) !important;font-size:19px !important;color:#2A2116 !important;direction:rtl;text-align:right}
[data-testid="stChatInput"] textarea::placeholder{color:#9A8A6A !important}
[data-testid="stChatInput"] button{background:var(--sams-navy) !important;color:#E8C977 !important;border-radius:6px !important}
[data-testid="stChatInput"] button svg{fill:#E8C977 !important;color:#E8C977 !important}
""".replace("SPINES", _SPINES)

RIBBONS = ["#3E6B5C", "#0E2547", "#B8923C", "#8E1F2B", "#5B4A7A", "#6B5636"]


def inject_theme():
    st.markdown(f"<style>{CSS}</style>", unsafe_allow_html=True)


def sidebar_brand(name, sub):
    st.markdown(f'<div class="sams-brand"><div class="n">{html.escape(name)}</div><div class="s">{html.escape(sub)}</div></div>',
                unsafe_allow_html=True)


def ribbon_css(keys):
    """Colored bookmark on each example button (buttons are matched by their Streamlit key)."""
    rules = [f'.st-key-{k} button{{--rib:{RIBBONS[i % len(RIBBONS)]}}}' for i, k in enumerate(keys)]
    st.markdown(f"<style>{''.join(rules)}</style>", unsafe_allow_html=True)


def status_line(books, connected):
    color = "#5FBF8A" if connected else "#C9A24A"
    txt = f"{books:,} كتاب في الفهرس · Gemini: {'متصل' if connected else 'غير متصل (رد احتياطي فقط)'}"
    st.markdown(f'<div class="sams-status"><i style="background:{color}"></i>{html.escape(txt)}</div>', unsafe_allow_html=True)
