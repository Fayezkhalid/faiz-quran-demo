#!/usr/bin/env python3
"""Builds a private, ready-to-use copy of the S192 coverage app with data embedded.

Usage: make_private_build.py ROSTER.xls MANPOWER.xlsx OUT.html [STORE]
The output contains employee names and phone numbers: never commit or publish it.
"""
import sys, re, json, time
from html.parser import HTMLParser
import openpyxl

roster_path, man_path, out_path = sys.argv[1:4]
store = sys.argv[4] if len(sys.argv) > 4 else "S192"

def group_of(pos, dept):
    p = (pos or "").upper()
    if p == "CASHIER": return "cashier"
    if p.startswith("CUSTOMER SERVICE"): return "cs"
    if "PRODUCE" in p or re.search(r"_PROD$", dept or "", re.I): return "produce"
    return "other"

rows, st = [], {"cur": None, "cell": None}
class P(HTMLParser):
    def handle_starttag(s, t, a):
        if t == "tr": st["cur"] = []
        if t in ("td", "th"): st["cell"] = ""
    def handle_endtag(s, t):
        if t in ("td", "th") and st["cur"] is not None and st["cell"] is not None:
            st["cur"].append(re.sub(r"[\s\xa0]+", " ", st["cell"]).strip()); st["cell"] = None
        if t == "tr" and st["cur"] is not None: rows.append(st["cur"]); st["cur"] = None
    def handle_data(s, d):
        if st["cell"] is not None: st["cell"] += d
P().feed(open(roster_path, "rb").read().decode("cp1256", errors="replace"))
hdr = next(r for r in rows if len(r) >= 4 and r[0].lower() == "employee code" and re.search(r"\d+/\d+/\d{4}", r[2]))
dates = []
for h in hdr[2:]:
    d, m, y = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", h).groups()
    dates.append(f"{y}-{int(m):02d}-{int(d):02d}")
ros = {r[0]: {"name": r[1], "shifts": r[2:]} for r in rows if len(r) == len(hdr) and r[0].isdigit()}

wb = openpyxl.load_workbook(man_path, read_only=True, data_only=True)
ws = wb[next(n for n in wb.sheetnames if "employees" in n.lower())]
it = ws.iter_rows(values_only=True)
H = None
for r in it:
    if any(str(c).strip().lower() == "nationality" for c in r if c): H = [str(c or "").strip().lower() for c in r]; break
ix = {k: H.index(v) for k, v in dict(id="employee", nat="nationality", name="employee name", mob="mobile", cc="cost center", pos="position", store="store").items()}
staff, known = {}, []
for r in it:
    if str(r[ix["store"]]).strip() == store: known.append(re.sub(r"\D", "", str(r[ix["id"]])))
    if str(r[ix["store"]]).strip() != store or "saudi" not in str(r[ix["nat"]]).lower(): continue
    pos = str(r[ix["pos"]] or "").strip()
    if pos.upper() == "STORE MANAGER": continue
    i = re.sub(r"\D", "", str(r[ix["id"]]))
    staff[i] = dict(id=i, name=re.sub(r"\s+", " ", str(r[ix["name"]])).strip(), pos=pos, dept=str(r[ix["cc"]] or ""),
                    phone=re.sub(r"\D", "", str(r[ix["mob"]] or "")), grp=group_of(pos, r[ix["cc"]]))

seed = {"stamp": str(int(time.time())), "staff": staff, "known": known, "roster": {"dates": dates, "rows": ros}}
src = open(__file__.replace("tools/make_private_build.py", "index.html"), encoding="utf-8").read()
src = src.replace('<script id="seed" type="application/json">null</script>',
                  '<script id="seed" type="application/json">' + json.dumps(seed, ensure_ascii=False).replace("</", "<\\/") + "</script>")
open(out_path, "w", encoding="utf-8").write(src)
print(f"{len(staff)} Saudi staff, {len(ros)} roster rows, {dates[0]}..{dates[-1]} -> {out_path}")
