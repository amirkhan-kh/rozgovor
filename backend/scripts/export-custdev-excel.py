#!/usr/bin/env python3
"""
Custdev intervyular natijalarini Excel'ga eksport qiladi.

Format:
  Sheet "Sotib olganlar" — original Excel strukturasi:
    - Ustun A: savollar (+ section header'lar: Presale/Sale/After sales)
    - Ustun B: Xulosa (bo'sh)
    - Ustun C+: har bir intervyu uchun javoblar (header — Mijoz ismi)

  Sheet "Transkriptsiya" — diarization bilan har intervyu transkripti:
    - Ustun A: Mijoz ismi
    - Ustun B: Audio fayl
    - Ustun C: Transkript
"""
import os
import re
import psycopg2
import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

DB_URL = os.environ.get("DATABASE_URL", "postgresql://salesai:salesai123@localhost:5432/salesai")
CUSTDEV_ID = "cmob21cto0001l1c5rqbqd9ub"
OUT_PATH = "/home/grafeas/WORK/Agents/SalesAi | Bitrix | Prosales/Enter shifo CustDev - Tahlil.xlsx"

# Excel original strukturasi: savol / section header tartibi
# None → bo'sh section divider
STRUCTURE = [
    ("header", "Mijozdan ma'lumot"),
    ("q", "Mijoz ismi?", "cmob21cto0002l1c56nr9n67b"),
    ("q", "Raqami", "cmob21cto0003l1c5z4keot08"),
    ("q", "Yoshi", "cmob21cto0004l1c5opzb6la8"),
    ("q", "Jinsi", "cmob21cto0005l1c5eaws2tr8"),
    ("q", "Qanday faoliyat bilan shug'ullanasiz?", "cmob21cto0006l1c5mcrxa8dk"),
    ("section", "Presale bo'limi"),
    ("q", "Siz bizning klinikamiz haqida qayerdan ma'lumot oldingiz?", "cmob21cto0007l1c5vvgdw3h0"),
    ("q", "Nimaga aynan bizning klinikamizni tanladingiz?", "cmob21cto0008l1c5587xg0ne"),
    ("q", "Qanday muammo bilan bizga murojaat qilgandingiz?", "cmob21cto0009l1c5ggsx6tmu"),
    ("q", "Doktorlarimiz konsultatsiyalaridan qay darajada mamnunsiz?", "cmob21cto000al1c51p3khpr6"),
    ("q", "Registraturadagi qizlarning xizmat darajasini baholay olasizmi? 1-10 (tezlik va muomala)", "cmob21cto000bl1c5k34f0i12"),
    ("section", "Sale"),
    ("q", "Doktor konsultatsiyasiga kirish jarayoni qay darajada sizga qulay bo'ldi?", "cmob21cto000cl1c5xdy57s51"),
    ("q", "Muolaja jarayonida sizni nimalar ikkilantirdi: narxi, diagnoz aniqligi, davolash?", "cmob21cto000dl1c5wpm037aw"),
    ("q", "Bizdan boshqa yana boshqa shifoxonalarda davolanganmisiz?", "cmob21cto000el1c52ieq91j3"),
    ("q", "Bizning shifoxonamizni ulardan ajratib turadigan farqlar nimadi?", "cmob21cto000fl1c5zs29xgjg"),
    ("section", "After sales"),
    ("q", "Ogohlantirilmagan qo'shimcha jarayonlar bo'lmadimi? (narx, analiz, protsedura)", "cmob21cto000gl1c5m7es59hq"),
    ("q", "Shu muammoyingizga qay darajada qoniqarli yechim oldingiz? 1-10", "cmob21cto000hl1c5qj316473"),
    ("q", "Xizmatimiz narxiga mosmi — qimmat emasmi, narxiga arziydimi?", "cmob21cto000il1c59mzhrtu1"),
    ("q", "Shifoxonamizda nimani yana yaxshilashimizni taklif qilgan bo'lardingiz?", "cmob21cto000jl1c5cd6sqc4l"),
    ("q", "Klinikamiz qulayligini baholang: tozalik, interyer", "cmob21cto000kl1c538gwgmnj"),
    ("q", "Xizmatimizni yana biror tanishingizga tavsiya qilgan bo'larmidingiz?", "cmob21cto000ll1c5w74dc2dk"),
    ("q", "Kinezolog muolajasini oldingizmi? Foyda foizi?", "cmob21cto000ml1c5uw1i2d6u"),
    ("q", "Umumiy xizmatimizni 1-10 gacha baholang", "cmob21cto000nl1c5now9fpyp"),
    ("q", "Bizning klinikaga kelishdagi kutuvingiz qanday edi va qanchalik yechim topdingiz?", "cmob21cto000ol1c5w3lzd7rc"),
]


def fetch_interviews():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT i.id, i."audioKey", i.transcription, i."aiSummary", i.status
        FROM "CustdevInterview" i
        WHERE i."custdevId"=%s
        ORDER BY i."createdAt" ASC
        """,
        (CUSTDEV_ID,),
    )
    rows = cur.fetchall()
    ivs = []
    for iid, akey, tran, sumry, st in rows:
        cur.execute(
            'SELECT "questionId", answer FROM "CustdevAnswer" WHERE "interviewId"=%s',
            (iid,),
        )
        answers = {qid: ans for qid, ans in cur.fetchall()}
        ivs.append(
            {
                "id": iid,
                "audioKey": akey or "",
                "transcription": tran or "",
                "aiSummary": sumry or "",
                "status": st,
                "answers": answers,
            }
        )
    cur.close()
    conn.close()
    return ivs


def clean_name(raw: str) -> str:
    """Q1 javobidan ismni tozalaydi"""
    if not raw or raw.strip().lower().startswith("(javob"):
        return "?"
    s = raw.strip()
    # Qo'shimcha izohlarni olib tashlash
    s = re.sub(r"\s*\(.*?\)\s*", " ", s).strip()
    s = re.sub(r"\s*—.*$", "", s).strip()
    s = re.sub(r"[.!?]+$", "", s).strip()
    # "Mijozga intervyu davomida X opa deb murojaat qilingan." → X opa
    m = re.search(r"(?:Mijoz(?:ga|ning)?\s+(?:ismi|bu))?\s*[—:]?\s*([A-ZA-ZА-ЯЁа-яё'`’ʻ]+(?:\s+[A-ZA-ZА-ЯЁа-яё'`’ʻ]+){0,2})", s)
    if m:
        name = m.group(1).strip()
        if len(name) >= 3:
            return name[:40]
    return s[:40]


def main():
    ivs = fetch_interviews()
    print(f"Topildi: {len(ivs)} intervyu")

    wb = openpyxl.Workbook()

    # ─── Sheet 1: Sotib olganlar ───
    ws = wb.active
    ws.title = "Sotib olganlar"

    # Column headers: A=Savol, B=Xulosa, C+ = interview columns
    ws.cell(row=1, column=1, value="Savol").font = Font(bold=True, size=11)
    ws.cell(row=1, column=2, value="Xulosa").font = Font(bold=True, size=11)
    for idx, iv in enumerate(ivs):
        # Customer name from Q1
        q1 = iv["answers"].get("cmob21cto0002l1c56nr9n67b", "")
        name = clean_name(q1)
        ws.cell(row=1, column=3 + idx, value=f"{idx + 1}. {name}").font = Font(bold=True, size=10)

    # Header color
    header_fill = PatternFill("solid", fgColor="1F4E78")
    for col in range(1, 3 + len(ivs)):
        c = ws.cell(row=1, column=col)
        c.fill = header_fill
        c.font = Font(bold=True, color="FFFFFF", size=10)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    # Body: structure
    r = 2
    section_fill = PatternFill("solid", fgColor="FEF3C7")
    wrap_align = Alignment(wrap_text=True, vertical="top")
    for item in STRUCTURE:
        if item[0] == "header":
            _, title = item
            ws.cell(row=r, column=1, value=title).font = Font(bold=True, color="FFFFFF")
            ws.cell(row=r, column=1).fill = PatternFill("solid", fgColor="0F172A")
            for col in range(2, 3 + len(ivs)):
                ws.cell(row=r, column=col).fill = PatternFill("solid", fgColor="0F172A")
            r += 1
        elif item[0] == "section":
            _, title = item
            c = ws.cell(row=r, column=1, value=title)
            c.font = Font(bold=True, italic=True)
            c.fill = section_fill
            for col in range(2, 3 + len(ivs)):
                ws.cell(row=r, column=col).fill = section_fill
            r += 1
        elif item[0] == "q":
            _, qtext, qid = item
            ws.cell(row=r, column=1, value=qtext).alignment = wrap_align
            ws.cell(row=r, column=1).font = Font(bold=True)
            for idx, iv in enumerate(ivs):
                ans = iv["answers"].get(qid, "")
                ws.cell(row=r, column=3 + idx, value=ans).alignment = wrap_align
            r += 1

    # aiSummary row
    r += 1
    c = ws.cell(row=r, column=1, value="AI qisqa xulosa")
    c.font = Font(bold=True, color="7C3AED")
    for idx, iv in enumerate(ivs):
        ws.cell(row=r, column=3 + idx, value=iv["aiSummary"]).alignment = wrap_align
    r += 1

    # Column widths
    ws.column_dimensions["A"].width = 48
    ws.column_dimensions["B"].width = 22
    for idx in range(len(ivs)):
        ws.column_dimensions[get_column_letter(3 + idx)].width = 36

    ws.freeze_panes = "C2"

    # ─── Har bir intervyu uchun alohida transcript sheet ───
    # Format: [MM:SS] Menejer: ...  /  [MM:SS] Mijoz: ...
    line_re = re.compile(
        r"(\[\d{1,2}:\d{2}\])?\s*(Menejer|Mijoz)\s*[:：]\s*(.*)",
        re.IGNORECASE,
    )
    used_titles = set()

    for idx, iv in enumerate(ivs):
        q1 = iv["answers"].get("cmob21cto0002l1c56nr9n67b", "")
        name = clean_name(q1)
        # Sheet nomi Excelda max 31 belgi, noyob bo'lishi kerak
        base = f"{idx + 1}. {name}"[:28]
        base = re.sub(r"[\\/:*?\"<>|\[\]]", "", base).strip() or f"{idx + 1}"
        title = base
        i = 2
        while title in used_titles:
            title = f"{base}_{i}"[:31]
            i += 1
        used_titles.add(title)

        ws2 = wb.create_sheet(title)

        # Headers
        ws2.cell(row=1, column=1, value="Mijoz").font = Font(bold=True, color="FFFFFF", size=11)
        ws2.cell(row=1, column=2, value="Menejer").font = Font(bold=True, color="FFFFFF", size=11)
        ws2.cell(row=1, column=1).fill = PatternFill("solid", fgColor="059669")
        ws2.cell(row=1, column=2).fill = PatternFill("solid", fgColor="2563EB")
        ws2.cell(row=1, column=1).alignment = Alignment(horizontal="center", vertical="center")
        ws2.cell(row=1, column=2).alignment = Alignment(horizontal="center", vertical="center")

        r = 2
        transcript = iv["transcription"] or ""

        # Parse lines: har qatorni rol bo'yicha ajratamiz
        # Yangi rol qatori boshlanganida — yangi row
        current_role = None
        current_text: list[str] = []
        current_ts = ""

        def flush():
            nonlocal r, current_role, current_text, current_ts
            if not current_text:
                return
            text = " ".join(current_text).strip()
            if current_ts:
                text = f"{current_ts} {text}"
            if not text:
                current_text = []
                current_role = None
                current_ts = ""
                return
            col = 1 if current_role == "mijoz" else 2
            cell = ws2.cell(row=r, column=col, value=text)
            cell.alignment = Alignment(wrap_text=True, vertical="top")
            # Boshqa ustunni bo'sh qoldiramiz, lekin row height uchun
            r += 1
            current_text = []
            current_role = None
            current_ts = ""

        # Transkript satrlari
        for raw_line in transcript.split("\n"):
            line = raw_line.strip()
            if not line:
                continue
            m = line_re.match(line)
            if m:
                # Yangi rol qatori
                flush()
                ts = m.group(1) or ""
                role_raw = m.group(2).lower()
                text = m.group(3).strip()
                current_role = "mijoz" if role_raw.startswith("mij") else "menejer"
                current_ts = ts
                if text:
                    current_text.append(text)
            else:
                # Davomi — oxirgi rol matniga qo'shamiz
                if current_role:
                    current_text.append(line)
                else:
                    # Rol yorliqsiz matn — "Mijoz" ustuniga qo'yamiz (fallback)
                    current_role = "mijoz"
                    current_ts = ""
                    current_text.append(line)
        flush()

        if r == 2:
            # Hech nima yozilmagan — xom matnni ko'rsatamiz
            ws2.cell(row=2, column=1, value=transcript).alignment = Alignment(
                wrap_text=True, vertical="top"
            )

        ws2.column_dimensions["A"].width = 70
        ws2.column_dimensions["B"].width = 70
        ws2.freeze_panes = "A2"

    wb.save(OUT_PATH)
    print(f"✓ Saqlandi: {OUT_PATH}")
    print(f"  Intervyular: {len(ivs)}")
    print(
        f"  Completed: {sum(1 for iv in ivs if iv['status'] == 'completed')}, "
        f"processing: {sum(1 for iv in ivs if iv['status'] == 'processing')}"
    )


if __name__ == "__main__":
    main()
