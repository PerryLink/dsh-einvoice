#!/usr/bin/env python3
"""Generate the dsh-einvoice README visuals (docs/assets/).

This repository is a local, file-level Chinese e-invoice (OFD / XML) pipeline:
two input channels (OFD container / standalone XML) -> invoice_ingest (realpath
allowlist, size gate, SHA-256, original kept 0600, byte-idempotent) ->
invoice_parse (ofd-zip-xml@1: eight fields, integer cents, field evidence,
unknown fields) -> two rails (R0 read-only: query / dedup / check / tax id and
code checks; R1 local write: review queue / receipt / red-link / archive /
restore) -> one local store (fin_invoice + originals / archives / restore).

Outputs (idempotent overwrite):
  dsh-einvoice-hero-zh-light.webp   1440x576 banner, Chinese
  dsh-einvoice-hero-zh-dark.webp
  dsh-einvoice-hero-en-light.webp   1440x576 banner, English
  dsh-einvoice-hero-en-dark.webp
  dsh-einvoice-flow-v5-light.svg    1100x660 structure diagram (dual-channel
  dsh-einvoice-flow-v5-dark.svg     confluence into one normalize core, then an
                                    R0 read rail / R1 write rail split)

Every label is taken from the code or the READMEs (tool names are the stable
API surface). No invented features: OCR, tax-bureau verification and PDF input
are deliberately absent.

Run:  python scripts/gen-readme-assets.py
"""

from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets")

# Rendered at 2x and downsampled: crisp rounded corners and soft shadows.
SS = 2
HERO_W, HERO_H = 1440, 576
FLOW_W, FLOW_H = 1100, 660

# --- fonts: Microsoft YaHei (CJK + Latin) and Consolas (machine tokens) ------
FONT_PATHS = {
    "sans": [
        r"C:\Windows\Fonts\msyh.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/System/Library/Fonts/PingFang.ttc",
    ],
    "sans-bold": [
        r"C:\Windows\Fonts\msyhbd.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    ],
    "mono": [
        r"C:\Windows\Fonts\consola.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    ],
    "mono-bold": [
        r"C:\Windows\Fonts\consolab.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    ],
}
FONTS: dict[str, str] = {}
for _name, _paths in FONT_PATHS.items():
    FONTS[_name] = next((p for p in _paths if os.path.exists(p)), "")
    if not FONTS[_name]:
        sys.exit(
            "FATAL: no usable font for %s (probed %s). Refusing to render "
            "Chinese as tofu boxes." % (_name, ", ".join(_paths))
        )

_FONT_CACHE: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def fnt(kind: str, size: float, scale: int = 1) -> ImageFont.FreeTypeFont:
    key = (kind, max(1, int(round(size * scale))))
    if key not in _FONT_CACHE:
        _FONT_CACHE[key] = ImageFont.truetype(FONTS[kind], key[1])
    return _FONT_CACHE[key]


_MEASURE = ImageDraw.Draw(Image.new("RGB", (8, 8)))


def tw(text: str, kind: str, size: float) -> float:
    """Text width in 1x layout pixels."""
    return _MEASURE.textlength(text, font=fnt(kind, size))


# --- palette ---------------------------------------------------------------
PAL = {
    "light": dict(
        bg1="#f9f6fd",
        bg2="#e4eaf8",
        panel="#ffffff",
        panel_border="#e3ddf0",
        card="#f8f5fe",
        card_border="#e8e1f6",
        row="#f4f0fc",
        text="#171820",
        sub="#535a6d",
        muted="#8a8fa2",
        accent="#4B67B4",
        accent_soft="#ece7f9",
        ok="#177a55",
        ok_soft="#e4f4ec",
        bad="#b0332b",
        bad_soft="#fbeae8",
        dot="#cdc5e4",
        shadow=(38, 30, 78, 44),
        glow="#8f7bd6",
        glow_alpha=17,
    ),
    "dark": dict(
        bg1="#131a2a",
        bg2="#0c1016",
        panel="#161e2f",
        panel_border="#2a3450",
        card="#1a2234",
        card_border="#2b3653",
        row="#1c2539",
        text="#eef1fb",
        sub="#a7b1c9",
        muted="#7a849d",
        accent="#8496f5",
        accent_soft="#232c49",
        ok="#63d29a",
        ok_soft="#0f2c25",
        bad="#ff9a94",
        bad_soft="#2a1a1d",
        dot="#39415c",
        shadow=(0, 0, 0, 96),
        glow="#4B67B4",
        glow_alpha=30,
    ),
}
SANS_FAMILY = "'Microsoft YaHei', 'Segoe UI', system-ui, sans-serif"
MONO_FAMILY = "Consolas, 'Courier New', monospace"


# --- Pillow helpers --------------------------------------------------------
class Art:
    def __init__(self, img: Image.Image):
        self.img = img
        self.d = ImageDraw.Draw(img)

    def rect(self, box, radius, fill=None, outline=None, width=1.4):
        self.d.rounded_rectangle(
            [v * SS for v in box],
            radius=radius * SS,
            fill=fill,
            outline=outline,
            width=max(1, int(round(width * SS))),
        )

    def text(self, xy, s, kind, size, fill, anchor="ls", bold=False):
        self.d.text(
            (xy[0] * SS, xy[1] * SS),
            s,
            font=fnt(kind, size, SS),
            fill=fill,
            anchor=anchor,
        )

    def line(self, p1, p2, fill, width=1.2):
        self.d.line([p1[0] * SS, p1[1] * SS, p2[0] * SS, p2[1] * SS], fill=fill,
                    width=max(1, int(round(width * SS))))

    def dashed(self, x1, y1, x2, y2, fill, width=1.2, dash=6, gap=5):
        length = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
        if length <= 0:
            return
        ux, uy = (x2 - x1) / length, (y2 - y1) / length
        pos = 0.0
        while pos < length:
            end = min(pos + dash, length)
            self.line((x1 + ux * pos, y1 + uy * pos),
                      (x1 + ux * end, y1 + uy * end), fill, width)
            pos = end + gap

    def circle(self, center, r, fill=None, outline=None, width=1.4):
        self.d.ellipse(
            [(center[0] - r) * SS, (center[1] - r) * SS,
             (center[0] + r) * SS, (center[1] + r) * SS],
            fill=fill,
            outline=outline,
            width=max(1, int(round(width * SS))),
        )


def hx(color: str, alpha: int = 255):
    value = color.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)


def shadow(img, box, radius, blur=15, dy=9, color=(38, 30, 78, 44)):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = [v * SS for v in box]
    d.rounded_rectangle(
        (x0, y0 + dy * SS, x1, y1 + dy * SS), radius=radius * SS, fill=color
    )
    layer = layer.filter(ImageFilter.GaussianBlur(blur * SS * 0.7))
    img.alpha_composite(layer)


def glow(img, center, radius, color, alpha):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy, r = center[0] * SS, center[1] * SS, radius * SS
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=hx(color, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(r * 0.55))
    img.alpha_composite(layer)


def gradient(size, c1, c2):
    w, h = size
    vertical = Image.linear_gradient("L").resize((w, h))
    horizontal = Image.linear_gradient("L").rotate(90, expand=True).resize((w, h))
    mask = Image.blend(vertical, horizontal, 0.42)
    return Image.composite(Image.new("RGB", (w, h), c2),
                           Image.new("RGB", (w, h), c1), mask)


def dot_field(img, color, alpha, step=26, radius=1.3):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for y in range(step // 2, img.size[1], step * SS):
        for x in range(step // 2, img.size[0], step * SS):
            r = radius * SS
            d.ellipse((x - r, y - r, x + r, y + r), fill=hx(color, alpha))
    img.alpha_composite(layer)


def fit_size(lines, kind, bold, maxw, start, floor, step=1):
    size = start
    while size >= floor:
        if all(tw(line, kind if not bold else kind + "-bold", size) <= maxw
               for line in lines):
            return size
        size -= step
    raise SystemExit("FATAL: cannot fit text: %r" % (lines,))


def require(cond, message):
    if not cond:
        raise SystemExit("FATAL: layout check failed: " + message)


# --- hero copy (values come from samples/quickstart/expected/result.json) ---
HERO = {
    "zh": dict(
        kicker="DeepSeek Harness · 电子发票插件",
        title="dsh-einvoice",
        lines=["一张本地 OFD / XML → 八字段台账",
               "查重、回执、红蓝勾稽、归档校验都在本机"],
        sub="整数分勾稽 · 同字节幂等 · 票号主体唯一 · 不联网",
        meta="R0 只读 / R1 本地写 · ofd-zip-xml@1 · v0.3.0",
        foot="社区插件 · 与 DeepSeek 无关 · 仅公开 / 合成数据验证",
        file="invoice-a-copy.ofd",
        file_sub="1 270 B · 数电票 OFD · 合成样例",
        hash="sha256 37a6229c656de49b…4e3dbd77f9e0",
        parser="ofd-zip-xml@1",
        unknown="unknown_fields 0",
        labels=["发票号", "开票日期", "购买方", "销售方", "金额 / 税额", "价税合计"],
        fields=["25512345000000000091", "2026-08-01",
                "示例买方（合成）有限公司", "示例卖方（合成）有限公司",
                "1000.00 / 60.00", "1060.00 CNY"],
        kinds=["mono", "mono", "sans", "sans", "mono", "mono"],
        cents="106000 分",
        evidence="field_evidence · Tags/CustomTag.xml:InvoiceNo → #1",
        extra="confidence 1 · warnings 0",
    ),
    "en": dict(
        kicker="DeepSeek Harness · e-invoice plugin",
        title="dsh-einvoice",
        lines=["One local invoice → eight fields",
               "Search, dedupe, archive — all local"],
        sub="integer cents · byte-idempotent · offline",
        meta="R0 read / R1 local write · ofd-zip-xml@1 · v0.3.0",
        foot="Community plugin · not affiliated with DeepSeek",
        file="invoice-a-copy.ofd",
        file_sub="1 270 B · digital OFD · synthetic",
        hash="sha256 37a6229c656de49b…4e3dbd77f9e0",
        parser="ofd-zip-xml@1",
        unknown="unknown_fields 0",
        labels=["Invoice no", "Issue date", "Buyer", "Seller",
                "Amount / tax", "Total"],
        fields=["25512345000000000091", "2026-08-01",
                "Demo buyer (synthetic)", "Demo seller (synthetic)",
                "1000.00 / 60.00", "1060.00 CNY"],
        kinds=["mono", "mono", "sans", "sans", "mono", "mono"],
        cents="106000 cents",
        evidence="field_evidence · Tags/CustomTag.xml:InvoiceNo → #1",
        extra="confidence 1 · warnings 0",
    ),
}


def chip(art, x, y, text, fg, bg, border=None, size=13.5, mono=True, height=24,
         padx=10):
    kind = "mono" if mono else "sans"
    w = tw(text, kind, size) + padx * 2
    art.rect((x, y, x + w, y + height), height / 2, fill=bg, outline=border,
             width=1.2)
    art.text((x + padx, y + height / 2), text, kind, size, fg, anchor="lm")
    return w


def draw_hero(lang: str, skin: str) -> Image.Image:
    P = PAL[skin]
    T = HERO[lang]
    size = (HERO_W * SS, HERO_H * SS)
    img = gradient(size, P["bg1"], P["bg2"]).convert("RGBA")
    dot_field(img, P["dot"], 26 if skin == "light" else 34)
    glow(img, (150, 120), 340, P["glow"], P["glow_alpha"])
    glow(img, (1210, 470), 300, P["glow"], P["glow_alpha"])
    art = Art(img)

    # ---------------- left column: kicker / title / values / meta ----------
    x0 = 66
    kicker_size = 18
    kw = tw(T["kicker"], "sans", kicker_size) + 40
    art.rect((x0, 52, x0 + kw, 92), 20, fill=P["accent_soft"],
             outline=P["accent"] + "55", width=1.2)
    art.text((x0 + 20, 79), T["kicker"], "sans", kicker_size, P["accent"])

    title_size = 96
    title_w = tw(T["title"], "sans-bold", title_size)
    require(x0 + title_w <= 720, "hero title wider than left column")
    art.text((x0, 224), T["title"], "sans-bold", title_size, P["text"])

    vmax = 650
    value_size = fit_size(T["lines"], "sans", True, vmax, 34, 27)
    for index, line in enumerate(T["lines"]):
        art.text((x0, 306 + index * 46), line, "sans-bold", value_size,
                 P["text"])

    sub_size = 26
    require(tw(T["sub"], "sans", sub_size) <= vmax, "hero subline too wide")
    art.text((x0, 404), T["sub"], "sans", sub_size, P["sub"])

    meta_size = 21
    require(tw(T["meta"], "sans", meta_size) <= vmax, "hero meta too wide")
    art.text((x0, 448), T["meta"], "sans", meta_size, P["muted"])

    art.line((x0, 480), (x0 + 236, 480), P["panel_border"], 1.4)
    foot_size = 20
    require(tw(T["foot"], "sans", foot_size) <= vmax, "hero footer too wide")
    art.text((x0, 514), T["foot"], "sans", foot_size, P["muted"])

    # ---------------- right visual: the ingest -> parse -> record rail -----
    rail_x = 812
    panels = {"a": (846, 52, 528, 112),
              "b": (846, 182, 528, 238),
              "c": (846, 436, 528, 110)}
    art.dashed(rail_x, 60, rail_x, 534, P["panel_border"], 1.4, 5, 6)
    for i, cy in enumerate((108, 301, 491)):
        art.circle((rail_x, cy), 13, fill=P["accent"], outline=P["panel"],
                   width=2)
        art.text((rail_x, cy + 2), str(i + 1), "mono-bold", 14, "#ffffff",
                 anchor="mm")

    def panel(key):
        x, y, w, h = panels[key]
        shadow(img, (x, y, x + w, y + h), 20, 15, 9, P["shadow"])
        art.rect((x, y, x + w, y + h), 20, fill=P["panel"],
                 outline=P["panel_border"], width=1.3)
        return x, y, w, h

    px, py, pw, ph = panel("a")
    art.rect((px + 22, py + 22, px + 66, py + 66), 12, fill=P["accent_soft"],
             outline=P["accent"] + "55", width=1.2)
    art.text((px + 44, py + 46), "OFD", "mono-bold", 11, P["accent"],
             anchor="mm")
    art.text((px + 80, py + 48), T["file"], "mono-bold", 21, P["text"])
    art.text((px + 80, py + 73), T["file_sub"], "sans", 15, P["sub"])
    art.text((px + 22, py + 99), T["hash"], "mono", 14.5, P["muted"])
    require(tw(T["hash"], "mono", 14.5) <= pw - 44, "hero hash too wide")

    px, py, pw, ph = panel("b")
    cw = chip(art, px + 22, py + 15, "parsed", P["ok"], P["ok_soft"],
              P["ok"] + "44", 13.5, True, 26)
    art.text((px + 34 + cw, py + 33), T["parser"], "mono", 15, P["sub"])
    art.text((px + pw - 22, py + 33), T["unknown"], "mono", 14, P["muted"],
             anchor="rs")
    art.line((px + 22, py + 50), (px + pw - 22, py + 50), P["panel_border"], 1.2)

    label_x = px + 22
    value_x = px + 124
    vfont = 19
    for index in range(6):
        cy = py + 78 + index * 29
        art.text((label_x, cy), T["labels"][index], "sans", 14, P["muted"])
        kind = T["kinds"][index]
        value = T["fields"][index]
        require(tw(value, kind, vfont) <= px + pw - 30 - value_x,
                "hero field value too wide: " + value)
        art.text((value_x, cy), value, kind, vfont, P["text"])
        if index == 5:
            vw = tw(value, "mono", vfont)
            cw2 = tw(T["cents"], "sans", 13) + 16
            require(value_x + vw + 10 + cw2 <= px + pw - 22,
                    "hero cents chip overflows")
            art.rect((value_x + vw + 10, cy - 20,
                      value_x + vw + 10 + cw2, cy + 4),
                     12, fill=P["accent_soft"])
            art.text((value_x + vw + 10 + cw2 / 2, cy - 8), T["cents"], "sans",
                     13, P["accent"], anchor="mm")
    art.line((px + 22, py + 176), (px + pw - 22, py + 176),
             P["panel_border"], 1.2)

    px, py, pw, ph = panel("c")
    lc = 13.5
    lx = px + 22
    ly = py + 14
    for index, name in enumerate(("received", "parsed", "verified")):
        active = name == "parsed"
        w = chip(art, lx, ly, name,
                 P["text"] if active else P["muted"],
                 P["accent_soft"] if active else None,
                 P["accent"] if active else P["panel_border"],
                 lc, True, 26)
        lx += w
        if index < 2:
            art.text((lx + 9, ly + 18), "→", "mono", 13, P["muted"])
            lx += 24
    art.text((lx + 5, ly + 18), "/", "mono", 13, P["muted"])
    chip(art, lx + 15, ly, "quarantined", P["bad"], None,
         P["bad"] + "66", lc, True, 26)

    art.text((px + 22, py + 68), T["evidence"], "mono", 14, P["sub"])
    require(tw(T["evidence"], "mono", 14) <= pw - 44, "hero evidence too wide")
    art.text((px + 22, py + 90), T["extra"], "mono", 13.5, P["muted"])

    return img.convert("RGB")


# --- flow SVG: 1100x660, dual-channel confluence + two rails ----------------
SVG_TEXT = {
    "title": "dsh-einvoice",
    "subtitle": "本地 OFD/XML → 八字段归一 → R0 只读 / R1 本地写 · 原件不改",
    "pill": "ofd-zip-xml@1 · v0.3.0 · 不联网",
    "left_head": "输入 · 双通道",
    "left_note": "本地文件",
    "a_label": "A · OFD 容器",
    "a_note": "PK / ZIP",
    "a_rows": [
        ("OFD.xml", "必需", "mono", 0),
        ("Attachs/original_invoice.xml", "旧版", "mono", 0),
        ("Tags/CustomTag.xml", "数电", "mono", 0),
        ("Pages/*/Content.xml", "文本表", "mono", 0),
        ("ObjectRef → TextObject", "", "mono", 18),
        ("解压 ≤1000 / 100 MB", "有界", "sans", 0),
        ("XML 实体禁用", "防膨胀", "sans", 0),
    ],
    "b_label": "B · 独立 XML",
    "b_note": "无容器",
    "b_rows": [
        ("<Invoice> / <eInvoice>", "根", "mono"),
        ("UTF-8 · ≤ 50 MB", "直读", "mono"),
        ("与 OFD 共用归一化", "同核", "sans"),
    ],
    "c_label": "边界 · 只读输入",
    "c_rows": [
        ("越界 / 符号链接 / 空文件", "拒收", "sans"),
        ("> 50 MB → 拒收", "", "sans"),
    ],
    "merge_a": "OFD",
    "merge_b": "XML",
    "ingest_head": "invoice_ingest",
    "ingest_tag": "R1",
    "ingest_rows": [
        "realpath · 输入根白名单",
        "SHA-256 · originals/ 0600",
        "同字节幂等 · doc_id ULID",
    ],
    "parse_head": "invoice_parse",
    "parse_tag": "R0",
    "parse_rows": [
        "ofd-zip-xml@1 · 八字段",
        "金额 → 整数分（BigInt）",
        "日期 → YYYY-MM-DD",
    ],
    "equation": "价税合计 = 金额 + 税额",
    "guard": "不相等即失败 · 不静默猜值",
    "out1": "输出 · 八字段 + 明细行",
    "out2": "+ field_evidence + unknown_fields",
    "r0_head": "R0 · 只读轨",
    "r1_head": "R1 · 本地写轨",
    "ns": "invoice_*",
    "r0_rows": [
        ("query", "主体 / 期间 / 生命周期"),
        ("dedup", "票号 / 税号+日期+总额"),
        ("check", "清单 / 成员哈希"),
        ("tax_id_check", "GB 32100-2015"),
        ("code_check", "EN 16931"),
    ],
    "r1_rows": [
        ("review_queue", "待复核 · 实体不符"),
        ("record_receipt", "pass→verified"),
        ("redlink", "红 → 蓝 · 差额"),
        ("archive", "manifest + ZIP"),
        ("restore", "仅 signable"),
    ],
    "foot1": "$DSH_HOME/storages/dsh-einvoice",
    "foot2": "fin_invoice KV · originals 0600 · archives · restore",
    "states": ["received", "parsed", "verified", "quarantined"],
    "alt": (
        "dsh-einvoice 结构：两条输入通道（OFD 容器：OFD.xml、旧版 "
        "Attachs/original_invoice.xml、数电 Tags/CustomTag.xml 的 ObjectRef → "
        "Pages/*/Content.xml 文本；以及独立 XML）汇入 invoice_ingest（realpath "
        "白名单、大小闸门、SHA-256、原件 0600、同字节幂等），再由 "
        "invoice_parse（ofd-zip-xml@1）归一为八字段、明细行、字段证据与未知字段；"
        "之后分两轨：R0 只读轨 query / dedup / check / tax_id_check / "
        "code_check，R1 本地写轨 review_queue / record_receipt / redlink / "
        "archive / restore。生命周期 received → parsed，回执后 verified 或 "
        "quarantined；数据落在 fin_invoice 与 storages/dsh-einvoice，不联网。"
    ),
}


def esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class Svg:
    def __init__(self, palette):
        self.P = palette
        self.parts: list[str] = []
        self.problems: list[str] = []

    def add(self, raw: str):
        self.parts.append(raw)

    def width(self, text, kind, size):
        return tw(text, "mono" if kind == "mono" else "sans", size)

    def text(self, x, y, text, size, fill, kind="sans", anchor="start",
             weight="400", limit=None, label=""):
        w = self.width(text, kind, size)
        if limit is not None:
            end = x + w if anchor == "start" else x
            if anchor == "start" and end > limit + 0.6:
                self.problems.append(
                    "%s: %r ends %.1f > %.1f" % (label, text, end, limit))
        family = MONO_FAMILY if kind == "mono" else SANS_FAMILY
        self.add(
            '<text x="%.1f" y="%.1f" fill="%s" font-family="%s" '
            'font-size="%.2f" font-weight="%s" text-anchor="%s">%s</text>'
            % (x, y, fill, family, size, weight,
               {"start": "start", "end": "end", "middle": "middle"}[anchor],
               esc(text))
        )

    def svg(self):
        return "\n".join(self.parts) + "\n"


def flow_svg(skin: str) -> str:
    P = PAL[skin]
    T = SVG_TEXT
    s = Svg(P)
    text_color = P["text"]
    sub = P["sub"]
    muted = P["muted"]
    accent = P["accent"]
    border = P["panel_border"]
    card = P["panel"]
    row_bg = P["row"]

    def card_rect(x, y, w, h, radius=18, fill=None, stroke=None, width=1.4):
        return (
            '<g filter="url(#soft)"><rect x="%.1f" y="%.1f" width="%.1f" '
            'height="%.1f" rx="%d" fill="%s" stroke="%s" stroke-width="%.1f" />'
            "</g>" % (x, y, w, h, radius, fill or card, stroke or border, width)
        )

    s.add(
        '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" '
        'viewBox="0 0 %d %d" role="img" aria-label="%s">'
        % (FLOW_W, FLOW_H, FLOW_W, FLOW_H, esc(T["alt"]))
    )
    s.add("<title>%s</title>" % esc(
        "dsh-einvoice: dual-channel confluence, one normalize core, "
        "R0 read rail / R1 write rail"))
    s.add(
        "<defs>"
        '<linearGradient id="bg" x1="0" y1="0" x2="0.38" y2="1">'
        '<stop offset="0" stop-color="%s"/>'
        '<stop offset="1" stop-color="%s"/>'
        "</linearGradient>"
        '<filter id="soft" x="-30%%" y="-30%%" width="160%%" height="180%%">'
        '<feDropShadow dx="0" dy="7" stdDeviation="10" '
        'flood-color="#1b1735" flood-opacity="0.10"/>'
        "</filter>"
        '<pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">'
        '<circle cx="1.3" cy="1.3" r="1.3" fill="%s"/>'
        "</pattern>"
        '<marker id="arrow" viewBox="0 0 10 10" refX="8.4" refY="5" '
        'markerWidth="6.4" markerHeight="6.4" orient="auto-start-reverse">'
        '<path d="M0 1.6 L9 5 L0 8.4 z" fill="%s"/>'
        "</marker>"
        "</defs>" % (P["bg1"], P["bg2"], P["dot"], accent)
    )
    s.add('<rect width="%d" height="%d" fill="url(#bg)"/>'
          % (FLOW_W, FLOW_H))
    s.add('<rect width="%d" height="%d" fill="url(#dots)" opacity="0.42"/>'
          % (FLOW_W, FLOW_H))

    # header
    s.text(40, 58, T["title"], 30, text_color, "sans", weight="700",
           limit=700, label="flow title")
    s.text(40, 84, T["subtitle"], 15, sub, "sans", limit=760,
           label="flow subtitle")
    s.add('<rect x="790" y="36" width="270" height="34" rx="17" fill="%s"/>'
          % P["accent_soft"])
    s.text(925, 58, T["pill"], 14, accent, "mono", anchor="middle",
           label="flow pill")
    s.add('<line x1="40" y1="96" x2="1060" y2="96" stroke="%s" '
          'stroke-width="1.2"/>' % border)

    # ---- left: input panel with two channels + boundary
    s.add(card_rect(40, 104, 324, 464, 20))
    s.text(60, 132, T["left_head"], 16.5, text_color, "sans", weight="700",
           limit=340, label="left head")
    s.text(344, 132, T["left_note"], 13.75, muted, "sans", anchor="end",
           label="left note")
    s.add('<line x1="60" y1="146" x2="344" y2="146" stroke="%s" '
          'stroke-width="1.1"/>' % border)

    s.text(60, 172, T["a_label"], 15, accent, "sans", weight="700",
           limit=340, label="a label")
    s.text(344, 172, T["a_note"], 13.75, muted, "mono", anchor="end",
           label="a note")
    y = 196
    for title, note, kind, indent in T["a_rows"]:
        note_w = s.width(note, "sans", 13.75) if note else 0
        if indent:
            s.add('<path d="M66 %.1f V%.1f H76" fill="none" stroke="%s" '
                  'stroke-width="1.2"/>' % (y - 18, y - 4, P["dot"]))
        s.text(60 + indent, y, title, 13.75, text_color, kind,
               limit=344 - note_w - 12, label="a row")
        if note:
            s.text(344, y, note, 13.75, sub, "sans", anchor="end",
                   label="a note row")
        y += 26
    s.add('<line x1="60" y1="366" x2="344" y2="366" stroke="%s" '
          'stroke-width="1.1"/>' % border)

    s.text(60, 390, T["b_label"], 15, accent, "sans", weight="700",
           limit=340, label="b label")
    s.text(344, 390, T["b_note"], 13.75, muted, "sans", anchor="end",
           label="b note")
    y = 414
    for title, note, kind in T["b_rows"]:
        note_w = s.width(note, "sans", 13.75) if note else 0
        s.text(60, y, title, 13.75, text_color, kind,
               limit=344 - note_w - 12, label="b row")
        if note:
            s.text(344, y, note, 13.75, sub, "sans", anchor="end",
                   label="b note row")
        y += 26
    s.add('<line x1="60" y1="480" x2="344" y2="480" stroke="%s" '
          'stroke-width="1.1"/>' % border)

    s.text(60, 504, T["c_label"], 15, sub, "sans", weight="700", limit=340,
           label="c label")
    y = 528
    for title, note, kind in T["c_rows"]:
        note_w = s.width(note, "sans", 13.75) if note else 0
        s.text(60, y, title, 13.75, text_color, kind,
               limit=344 - note_w - 12, label="c row")
        if note:
            s.text(344, y, note, 13.75, sub, "sans", anchor="end",
                   label="c note row")
        y += 24

    # ---- merge arrows into ingest
    s.text(368, 244, T["merge_a"], 13.75, muted, "mono", label="merge a")
    s.text(368, 406, T["merge_b"], 13.75, muted, "mono", label="merge b")
    s.add('<path d="M364 256 C382 256 386 272 396 272" fill="none" '
          'stroke="%s" stroke-width="1.8" marker-end="url(#arrow)"/>' % accent)
    s.add('<path d="M364 423 C382 423 388 312 396 312" fill="none" '
          'stroke="%s" stroke-width="1.8" marker-end="url(#arrow)"/>' % accent)

    # ---- ingest card
    s.add(card_rect(400, 200, 320, 124))
    s.add('<circle cx="410" cy="222" r="9" fill="%s"/>' % accent)
    s.text(410, 226, "1", 11, "#ffffff", "mono", anchor="middle",
           weight="700", label="ingest num")
    s.text(426, 228, T["ingest_head"], 16.5, text_color, "mono", weight="700",
           limit=696, label="ingest head")
    s.text(700, 228, T["ingest_tag"], 13.75, accent, "mono", anchor="end",
           label="ingest tag")
    s.add('<line x1="420" y1="240" x2="700" y2="240" stroke="%s" '
          'stroke-width="1.1"/>' % border)
    y = 266
    for line in T["ingest_rows"]:
        s.text(420, y, line, 13.75, sub, "sans", limit=696,
               label="ingest row")
        y += 24

    # ingest -> parse
    s.add('<line x1="560" y1="324" x2="560" y2="334" stroke="%s" '
          'stroke-width="1.8" marker-end="url(#arrow)"/>' % accent)

    # ---- parse card
    s.add(card_rect(400, 340, 320, 248))
    s.add('<circle cx="410" cy="362" r="9" fill="%s"/>' % accent)
    s.text(410, 366, "2", 11, "#ffffff", "mono", anchor="middle",
           weight="700", label="parse num")
    s.text(426, 368, T["parse_head"], 16.5, text_color, "mono", weight="700",
           limit=696, label="parse head")
    s.text(700, 368, T["parse_tag"], 13.75, accent, "mono", anchor="end",
           label="parse tag")
    s.add('<line x1="420" y1="380" x2="700" y2="380" stroke="%s" '
          'stroke-width="1.1"/>' % border)
    y = 406
    for line in T["parse_rows"]:
        s.text(420, y, line, 13.75, sub, "sans", limit=696,
               label="parse row")
        y += 26
    s.add('<rect x="420" y="470" width="280" height="30" rx="10" fill="%s"/>'
          % row_bg)
    s.text(560, 490, T["equation"], 14, text_color, "sans", anchor="middle",
           weight="700", label="equation")
    s.text(420, 518, T["guard"], 13.75, P["bad"], "sans", limit=696,
           label="guard")
    s.add('<line x1="420" y1="530" x2="700" y2="530" stroke="%s" '
          'stroke-width="1.1"/>' % border)
    s.text(420, 552, T["out1"], 13.75, text_color, "sans", limit=696,
           label="out1")
    s.text(420, 574, T["out2"], 13.75, sub, "mono", limit=696,
           label="out2")

    # ---- split bus: one core, two rails
    s.add('<path d="M720 464 H734 V221 H740" fill="none" stroke="%s" '
          'stroke-width="1.8"/>' % accent)
    s.add('<path d="M734 464 V470 H740" fill="none" stroke="%s" '
          'stroke-width="1.8"/>' % accent)
    s.add('<path d="M740 216.6 L748 221 L740 225.4 z" fill="%s"/>' % accent)
    s.add('<path d="M740 465.6 L748 470 L740 474.4 z" fill="%s"/>' % accent)

    # ---- R0 read rail
    s.add(card_rect(750, 104, 310, 234))
    s.text(770, 132, T["r0_head"], 16.5, text_color, "sans", weight="700",
           limit=1000, label="r0 head")
    s.text(1040, 132, T["ns"], 13.75, muted, "mono", anchor="end",
           label="r0 ns")
    s.add('<line x1="770" y1="146" x2="1040" y2="146" stroke="%s" '
          'stroke-width="1.1"/>' % border)
    y = 156
    for title, note in T["r0_rows"]:
        note_w = s.width(note, "sans", 14)
        s.add('<rect x="764" y="%d" width="280" height="30" rx="10" '
              'fill="%s"/>' % (y, row_bg))
        s.text(784, y + 20, title, 16.5, text_color, "mono",
               limit=1028 - note_w - 12, label="r0 title")
        s.text(1028, y + 20, note, 14, sub, "sans", anchor="end",
               label="r0 note")
        y += 36

    # ---- R1 write rail
    s.add(card_rect(750, 352, 310, 236))
    s.text(770, 380, T["r1_head"], 16.5, text_color, "sans", weight="700",
           limit=1000, label="r1 head")
    s.text(1040, 380, T["ns"], 13.75, muted, "mono", anchor="end",
           label="r1 ns")
    s.add('<line x1="770" y1="394" x2="1040" y2="394" stroke="%s" '
          'stroke-width="1.1"/>' % border)
    y = 404
    for title, note in T["r1_rows"]:
        note_w = s.width(note, "sans", 14)
        s.add('<rect x="764" y="%d" width="280" height="30" rx="10" '
              'fill="%s"/>' % (y, row_bg))
        s.text(784, y + 20, title, 16.5, text_color, "mono",
               limit=1028 - note_w - 12, label="r1 title")
        s.text(1028, y + 20, note, 14, sub, "sans", anchor="end",
               label="r1 note")
        y += 36

    # ---- footer: local store + lifecycle tape
    s.add(card_rect(40, 600, 1020, 48, 14))
    s.text(60, 621, T["foot1"], 13.75, text_color, "mono", limit=660,
           label="foot1")
    s.text(60, 641, T["foot2"], 13.75, sub, "mono", limit=660,
           label="foot2")

    states = T["states"]
    widths = [s.width(name, "mono", 13.75) + 20 for name in states]
    total = sum(widths) + 2 * 22 + 10 + 18
    lx = 1040 - total
    for index, name in enumerate(states):
        w = widths[index]
        active = name == "parsed"
        fill = P["accent_soft"] if active else "none"
        stroke = accent if active else border
        color = accent if active else muted
        s.add('<rect x="%.1f" y="612" width="%.1f" height="24" rx="12" '
              'fill="%s" stroke="%s" stroke-width="1.1"/>'
              % (lx, w, fill, stroke))
        s.text(lx + w / 2, 628, name, 13.75, color, "mono", anchor="middle",
               label="state")
        lx += w
        if index < 2:
            s.text(lx + 9, 628, "→", 13, muted, "mono", label="state arrow")
            lx += 22
        elif index == 2:
            s.text(lx + 5, 628, "/", 13, muted, "mono", label="state slash")
            lx += 14

    s.add("</svg>")
    if s.problems:
        raise SystemExit("FATAL: SVG layout problems:\n  "
                         + "\n  ".join(s.problems))
    return s.svg()


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    written = []
    for lang in ("zh", "en"):
        for skin in ("light", "dark"):
            image = draw_hero(lang, skin)
            image = image.resize((HERO_W, HERO_H), Image.LANCZOS)
            path = os.path.join(OUT, "dsh-einvoice-hero-%s-%s.webp"
                                % (lang, skin))
            image.save(path, "WEBP", quality=90, method=6)
            written.append((os.path.basename(path), os.path.getsize(path)))
    for skin in ("light", "dark"):
        path = os.path.join(OUT, "dsh-einvoice-flow-v5-%s.svg" % skin)
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(flow_svg(skin))
        written.append((os.path.basename(path), os.path.getsize(path)))
    for name, size in written:
        print("wrote %-42s %7d bytes" % (name, size))


if __name__ == "__main__":
    main()
