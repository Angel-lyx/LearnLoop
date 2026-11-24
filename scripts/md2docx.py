#!/usr/bin/env python
"""把 docs/product-design.md 转成排版好的 Word 文档。

用法：
    python scripts/md2docx.py docs/product-design.md "docs/LearnLoop-产品设计文档.docx"
"""
import re
import sys
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor

BODY_FONT = "微软雅黑"
MONO_FONT = "Consolas"
BODY_SIZE = Pt(10.5)


def set_east_asia(run_or_style, name):
    """同时设置拉丁与东亚字体，避免中文回退成宋体。"""
    el = run_or_style.element if hasattr(run_or_style, "element") else run_or_style._element
    rpr = el.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    rfonts.set(qn("w:eastAsia"), name)
    rfonts.set(qn("w:ascii"), name)
    rfonts.set(qn("w:hAnsi"), name)


def shade_paragraph(paragraph, fill="F5F5F5"):
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:fill"), fill)
    paragraph._p.get_or_add_pPr().append(shd)


INLINE_RE = re.compile(r"(\*\*.+?\*\*|`[^`]+`)")


def add_inline(paragraph, text):
    """解析 **粗体** 与 `行内代码`。"""
    for piece in INLINE_RE.split(text):
        if not piece:
            continue
        if piece.startswith("**") and piece.endswith("**") and len(piece) > 4:
            run = paragraph.add_run(piece[2:-2])
            run.bold = True
        elif piece.startswith("`") and piece.endswith("`") and len(piece) > 2:
            run = paragraph.add_run(piece[1:-1])
            run.font.name = MONO_FONT
            run.font.size = Pt(9.5)
        else:
            paragraph.add_run(piece)


def parse_table_block(lines):
    """把 | a | b | 形式的连续行拆成二维数组，跳过分隔行。"""
    rows = []
    for line in lines:
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
            continue
        rows.append(cells)
    return rows


def add_table(doc, rows):
    if not rows:
        return
    cols = max(len(r) for r in rows)
    table = doc.add_table(rows=0, cols=cols)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    for i, row in enumerate(rows):
        cells = table.add_row().cells
        for j in range(cols):
            text = row[j] if j < len(row) else ""
            para = cells[j].paragraphs[0]
            para.paragraph_format.space_after = Pt(2)
            add_inline(para, text)
            for run in para.runs:
                run.font.size = Pt(9.5)
                if i == 0:
                    run.bold = True
                    set_east_asia(run, BODY_FONT)
    # 表头加浅灰底
    for cell in table.rows[0].cells:
        tc_pr = cell._tc.get_or_add_tcPr()
        shd = OxmlElement("w:shd")
        shd.set(qn("w:val"), "clear")
        shd.set(qn("w:fill"), "EAEAEA")
        tc_pr.append(shd)
    doc.add_paragraph()


def convert(md_path: Path, out_path: Path):
    text = md_path.read_text(encoding="utf-8")
    lines = text.split("\n")

    doc = Document()

    normal = doc.styles["Normal"]
    normal.font.name = BODY_FONT
    normal.font.size = BODY_SIZE
    set_east_asia(normal, BODY_FONT)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.35

    for lvl in range(1, 5):
        st = doc.styles[f"Heading {lvl}"]
        st.font.name = BODY_FONT
        st.font.color.rgb = RGBColor(0x1A, 0x1A, 0x1A)
        set_east_asia(st, BODY_FONT)
        st.font.size = Pt({1: 18, 2: 14, 3: 12, 4: 11}[lvl])

    # 标题页
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run("LearnLoop")
    run.bold = True
    run.font.size = Pt(28)
    set_east_asia(run, BODY_FONT)

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = sub.add_run("学习管理与保研规划平台 · 产品设计文档")
    r.font.size = Pt(13)
    r.font.color.rgb = RGBColor(0x60, 0x60, 0x60)
    set_east_asia(r, BODY_FONT)
    doc.add_paragraph()

    # 页脚页码
    footer_p = doc.sections[0].footer.paragraphs[0]
    footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = "PAGE"
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    fld_run = footer_p.add_run()
    fld_run._r.append(fld_begin)
    fld_run._r.append(instr)
    fld_run._r.append(fld_end)
    fld_run.font.size = Pt(9)

    skipped_cover_title = False

    i = 0
    n = len(lines)
    while i < n:
        raw = lines[i]
        line = raw.rstrip()
        stripped = line.strip()

        # 代码块
        if stripped.startswith("```"):
            i += 1
            block = []
            while i < n and not lines[i].strip().startswith("```"):
                block.append(lines[i])
                i += 1
            i += 1
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(4)
            p.paragraph_format.space_after = Pt(8)
            p.paragraph_format.left_indent = Pt(6)
            shade_paragraph(p)
            for k, bl in enumerate(block):
                if k:
                    p.add_run().add_break()
                r = p.add_run(bl)
                r.font.name = MONO_FONT
                r.font.size = Pt(9)
            continue

        # 表格
        if stripped.startswith("|") and stripped.endswith("|"):
            block = []
            while i < n and lines[i].strip().startswith("|") and lines[i].strip().endswith("|"):
                block.append(lines[i])
                i += 1
            add_table(doc, parse_table_block(block))
            continue

        if not stripped:
            i += 1
            continue

        # 分隔线
        if re.fullmatch(r"-{3,}", stripped):
            i += 1
            continue

        # 标题
        m = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if m:
            level = len(m.group(1))
            heading_text = m.group(2)
            # 封面已经渲染了文档标题，正文里的第一个一级标题跳过
            if level == 1 and not skipped_cover_title:
                skipped_cover_title = True
                i += 1
                continue
            p = doc.add_heading(level=min(level, 4))
            add_inline(p, heading_text)
            for run in p.runs:
                run.font.name = BODY_FONT
                run.font.color.rgb = RGBColor(0x1A, 0x1A, 0x1A)
                set_east_asia(run, BODY_FONT)
            i += 1
            continue

        # 引用
        if stripped.startswith(">"):
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Pt(10)
            r = p.add_run(stripped.lstrip("> ").strip())
            r.italic = True
            r.font.color.rgb = RGBColor(0x66, 0x66, 0x66)
            r.font.size = Pt(10)
            set_east_asia(r, BODY_FONT)
            i += 1
            continue

        # 无序列表
        if re.match(r"^[-*]\s+", stripped):
            p = doc.add_paragraph(style="List Bullet")
            p.paragraph_format.space_after = Pt(2)
            add_inline(p, re.sub(r"^[-*]\s+", "", stripped))
            i += 1
            continue

        # 有序列表
        if re.match(r"^\d+\.\s+", stripped):
            p = doc.add_paragraph(style="List Number")
            p.paragraph_format.space_after = Pt(2)
            add_inline(p, re.sub(r"^\d+\.\s+", "", stripped))
            i += 1
            continue

        # 普通段落（合并连续行）
        p = doc.add_paragraph()
        add_inline(p, stripped)
        i += 1

    doc.save(out_path)
    return doc


if __name__ == "__main__":
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/product-design.md")
    dst = Path(sys.argv[2] if len(sys.argv) > 2 else "docs/LearnLoop-产品设计文档.docx")
    convert(src, dst)
    print(f"OK -> {dst}")
