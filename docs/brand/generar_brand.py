#!/usr/bin/env python3
"""
Genera los recursos de marca de CloudTerm en SVG.

Se escribe como script (y no a mano) porque las escenas isométricas se calculan:
así el banner y la escena de la aplicación comparten la misma geometría, y los
recursos se regeneran cambiando solo la paleta o el texto.

Uso:
    python3 docs/brand/generar_brand.py
    rsvg-convert -w 1500 -h 1000 -o banner.png banner-buymeacoffee.svg
"""

from __future__ import annotations

import colorsys
import os

# --------------------------------------------------------------------------
# Paleta — copiada de src/styles/themes.css (tema «neon»)
# --------------------------------------------------------------------------

BG = "#070b11"
BG_DEEP = "#05080d"
SURFACE = "#0d121b"
ELEVATED = "#141b27"
BORDER = "#1f2a39"
MUTED = "#6c7c94"
TEXT = "#e2ecf8"
ACCENT = "#22d3ee"
ACCENT_DIM = "#0e7490"
SUCCESS = "#28c878"
WARNING = "#facc15"
VIOLET = "#c084fc"

MONO = "Fira Code"
SANS = "Rubik"

# --------------------------------------------------------------------------
# Geometría isométrica — idéntica a src/components/PixelAgents/PixelAgents.tsx
# --------------------------------------------------------------------------

HW = 30  # media anchura de baldosa
HH = 15  # media altura
STEP = 3.0  # separación entre puestos, en unidades de rejilla


def iso(gx: float, gy: float, gz: float = 0) -> tuple[float, float]:
    return ((gx - gy) * HW, (gx + gy) * HH - gz)


def face(points: list[tuple[float, float, float]]) -> str:
    return " ".join(f"{iso(x, y, z)[0]:.1f},{iso(x, y, z)[1]:.1f}" for x, y, z in points)


def hsl_hex(hue: float, sat: float, light: float) -> str:
    """HSL a hex: librsvg acepta hsl(), pero el hex es más predecible."""
    r, g, b = colorsys.hls_to_rgb((hue % 360) / 360, light / 100, sat / 100)
    return f"#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}"


# --------------------------------------------------------------------------
# Piezas
# --------------------------------------------------------------------------


def slab(w: float, d: float, h: float, top: str, side: str) -> str:
    """Losa isométrica centrada en el origen LOCAL del grupo que la contiene."""
    x0, x1 = -w / 2, w / 2
    y0, y1 = -d / 2, d / 2
    return (
        f'<polygon points="{face([(x0, y1, h), (x1, y1, h), (x1, y1, 0), (x0, y1, 0)])}" fill="{side}"/>'
        f'<polygon points="{face([(x1, y0, h), (x1, y1, h), (x1, y1, 0), (x1, y0, 0)])}" fill="{side}" opacity="0.78"/>'
        f'<polygon points="{face([(x0, y0, h), (x1, y0, h), (x1, y1, h), (x0, y1, h)])}" fill="{top}"/>'
    )


def agent(gx: float, gy: float, hue: float, online: bool = True,
          label: str = "", latency: str = "") -> str:
    """
    Un puesto de trabajo: sombra, silla, escritorio, monitor, personaje y chip.

    Todo se dibuja en coordenadas LOCALES dentro del grupo, que ya está
    trasladado al punto base. Usar aquí `gx`/`gy` desplazaría dos veces y el
    escritorio acabaría lejos de su personaje.
    """
    bx, by = iso(gx, gy)
    hair = hsl_hex(hue, 62, 52)
    shirt = hsl_hex(hue + 45, 48, 42)
    skin = "#e9b98d"
    status = SUCCESS if online else MUTED

    parts = [f'<g transform="translate({bx:.1f} {by:.1f})">']
    parts.append('<ellipse cx="0" cy="4" rx="30" ry="12" fill="#000000" opacity="0.45"/>')
    parts.append('<rect x="-12" y="-58" width="24" height="30" rx="4" fill="#1a2533"/>')
    parts.append('<rect x="-12" y="-58" width="24" height="4" fill="#243347"/>')

    parts.append(slab(1.5, 0.9, 14, "#233246", "#161f2b"))

    # monitor
    parts.append(
        f'<polygon points="{face([(-0.6, -0.34, 16), (0.6, -0.34, 16), (0.6, -0.34, 36), (-0.6, -0.34, 36)])}" '
        f'fill="#070c13" stroke="{status}" stroke-opacity="0.55" stroke-width="0.9"/>'
    )
    for z, colour, width in ((31.5, ACCENT, 0.68), (27.0, SUCCESS, 0.68), (22.5, "#f472b6", 0.48)):
        pts = face([
            (-0.46, -0.34, z),
            (-0.46 + width, -0.34, z),
            (-0.46 + width, -0.34, z + 1.9),
            (-0.46, -0.34, z + 1.9),
        ])
        parts.append(f'<polygon points="{pts}" fill="{colour}" opacity="0.9"/>')

    # personaje
    parts.append(
        f'<g transform="translate(0 -14)" shape-rendering="crispEdges">'
        f'<rect x="-14" y="-20" width="5" height="15" fill="{shirt}"/>'
        f'<rect x="9" y="-20" width="5" height="15" fill="{shirt}"/>'
        f'<rect x="-15" y="-8" width="6" height="6" fill="{skin}"/>'
        f'<rect x="9" y="-8" width="6" height="6" fill="{skin}"/>'
        f'<rect x="-9" y="-22" width="18" height="22" fill="{shirt}"/>'
        f'<rect x="-9" y="-22" width="18" height="4" fill="#ffffff" opacity="0.13"/>'
        f'<rect x="-7" y="-36" width="14" height="16" fill="{skin}"/>'
        f'<rect x="-9" y="-42" width="18" height="8" fill="{hair}"/>'
        f'<rect x="-10" y="-36" width="3" height="8" fill="{hair}"/>'
        f'<rect x="7" y="-36" width="3" height="8" fill="{hair}"/>'
        f'<rect x="-4" y="-30" width="3" height="3" fill="#1a2230"/>'
        f'<rect x="1" y="-30" width="3" height="3" fill="#1a2230"/>'
        f'<rect x="-10" y="-33" width="3" height="9" fill="{status}" opacity="0.9"/>'
        f'<rect x="7" y="-33" width="3" height="9" fill="{status}" opacity="0.9"/>'
        "</g>"
    )

    if label:
        text = f"{label} · {latency}" if latency else label
        w = max(80, len(text) * 5.5 + 30)
        parts.append(
            f'<g transform="translate({-w / 2:.1f} -106)">'
            f'<rect width="{w:.0f}" height="20" rx="10" fill="{SURFACE}" stroke="{status}" stroke-opacity="0.5"/>'
            f'<circle cx="11.5" cy="10" r="3.5" fill="{status}"/>'
            f'<text x="21" y="14.2" font-family="{MONO}" font-size="10" fill="{TEXT}">{text}</text>'
            "</g>"
        )

    parts.append("</g>")
    return "".join(parts)


def grid(span: int = 18) -> str:
    lines = []
    for i in range(-span, span + 1):
        a, b = iso(i, -span), iso(i, span)
        c, d = iso(-span, i), iso(span, i)
        lines.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}"/>')
        lines.append(f'<line x1="{c[0]:.1f}" y1="{c[1]:.1f}" x2="{d[0]:.1f}" y2="{d[1]:.1f}"/>')
    return f'<g stroke="{ACCENT}" stroke-opacity="0.10" stroke-width="1">{"".join(lines)}</g>'


def cloud(cx: float, cy: float, scale: float, opacity: float) -> str:
    blocks = [
        (2, 0), (3, 0), (4, 0),
        (1, 1), (2, 1), (3, 1), (4, 1), (5, 1), (6, 1),
        (0, 2), (1, 2), (2, 2), (3, 2), (4, 2), (5, 2), (6, 2), (7, 2),
        (1, 3), (2, 3), (3, 3), (4, 3), (5, 3), (6, 3),
    ]
    rects = "".join(f'<rect x="{bx * 10}" y="{by * 10}" width="10" height="10"/>' for bx, by in blocks)
    return (
        f'<g transform="translate({cx} {cy}) scale({scale})" fill="{ACCENT}" opacity="{opacity}">'
        f"{rects}</g>"
    )


def scene(seats: list[dict], cx: float, cy: float, scale: float) -> str:
    """Centra la escena (rejilla + agentes) en (cx, cy) y la escala."""
    xs, ys = [], []
    for seat in seats:
        x, y = iso(seat["gx"], seat["gy"])
        xs.append(x)
        ys.append(y)

    # Márgenes: el chip sobresale por arriba y el escritorio por los lados.
    min_x, max_x = min(xs) - 115, max(xs) + 115
    min_y, max_y = min(ys) - 132, max(ys) + 66
    bcx, bcy = (min_x + max_x) / 2, (min_y + max_y) / 2

    tx = cx - bcx * scale
    ty = cy - bcy * scale
    inner = grid() + "".join(
        agent(s["gx"], s["gy"], s["hue"], s.get("online", True),
              s.get("label", ""), s.get("latency", ""))
        for s in seats
    )
    return f'<g transform="translate({tx:.1f} {ty:.1f}) scale({scale})">{inner}</g>'


def pills(items: list[tuple[str, str]], cx: float, y: float, size: int = 21) -> str:
    """Fila de etiquetas centrada horizontalmente en `cx`."""
    widths = [len(text) * size * 0.60 + 46 for text, _ in items]
    total = sum(widths) + 14 * (len(items) - 1)
    x = cx - total / 2
    out = []
    for (text, colour), w in zip(items, widths):
        out.append(
            f'<rect x="{x:.0f}" y="{y}" width="{w:.0f}" height="{size * 2.15:.0f}" rx="{size * 1.07:.0f}" '
            f'fill="{colour}" fill-opacity="0.12" stroke="{colour}" stroke-opacity="0.45"/>'
            f'<text x="{x + w / 2:.0f}" y="{y + size * 1.45:.0f}" text-anchor="middle" '
            f'font-family="{SANS}" font-size="{size}" fill="{colour}">{text}</text>'
        )
        x += w + 14
    return "".join(out)


def mark(x: float, y: float, size: float) -> str:
    s = size / 100
    return (
        f'<g transform="translate({x} {y}) scale({s})">'
        f'<rect width="100" height="100" rx="24" fill="url(#markFill)" stroke="{ACCENT}" stroke-opacity="0.35"/>'
        f'<polyline points="30,30 54,50 30,70" fill="none" stroke="{ACCENT}" stroke-width="9" '
        f'stroke-linecap="round" stroke-linejoin="round"/>'
        f'<rect x="60" y="61" width="20" height="9" rx="4.5" fill="{SUCCESS}"/>'
        "</g>"
    )


DEFS = f"""
<defs>
  <linearGradient id="bgFill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{BG}"/>
    <stop offset="1" stop-color="{BG_DEEP}"/>
  </linearGradient>
  <linearGradient id="markFill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{ELEVATED}"/>
    <stop offset="1" stop-color="{BG_DEEP}"/>
  </linearGradient>
  <linearGradient id="wordFill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="0.55" stop-color="{ACCENT}"/>
    <stop offset="1" stop-color="{ACCENT_DIM}"/>
  </linearGradient>
  <radialGradient id="glow">
    <stop offset="0" stop-color="{ACCENT}" stop-opacity="0.20"/>
    <stop offset="1" stop-color="{ACCENT}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="glowViolet">
    <stop offset="0" stop-color="#8b5cf6" stop-opacity="0.20"/>
    <stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/>
  </radialGradient>
</defs>
"""


# --------------------------------------------------------------------------
# 1. Portada para Buy Me a Coffee — 1500 × 1000
# --------------------------------------------------------------------------


def banner_coffee() -> str:
    W, H = 1500, 1000
    cx = W / 2

    seats = [
        {"gx": 0.0, "gy": 0.0, "hue": 200, "label": "prod-web-01", "latency": "18 ms"},
        {"gx": STEP, "gy": 0.0, "hue": 330, "label": "db-master", "latency": "24 ms"},
        {"gx": 0.0, "gy": STEP, "hue": 45, "label": "cache-01", "latency": "9 ms"},
        {"gx": STEP, "gy": STEP, "hue": 145, "label": "staging", "latency": "31 ms"},
    ]

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
{DEFS}
<rect width="{W}" height="{H}" fill="url(#bgFill)"/>
<ellipse cx="{cx}" cy="300" rx="780" ry="420" fill="url(#glow)"/>
<ellipse cx="1210" cy="820" rx="520" ry="360" fill="url(#glowViolet)"/>
<g opacity="0.6">{cloud(140, 190, 1.1, 0.07)}{cloud(1310, 140, 1.4, 0.06)}{cloud(80, 600, 0.8, 0.04)}</g>

{mark(cx - 42, 74, 84)}

<text x="{cx}" y="268" text-anchor="middle" font-family="{MONO}" font-size="116"
      font-weight="700" fill="url(#wordFill)" letter-spacing="-4">CloudTerm</text>

<text x="{cx}" y="330" text-anchor="middle" font-family="{SANS}" font-size="33" fill="{TEXT}">
  Tu equipo de terminales, en un solo sitio
</text>

<text x="{cx}" y="376" text-anchor="middle" font-family="{SANS}" font-size="24" fill="{MUTED}">
  Cliente SSH y SFTP de escritorio · gratis para uso personal
</text>

{pills([("Terminal SSH", ACCENT), ("SFTP con drag &amp; drop", SUCCESS),
        ("Pixel Agents", WARNING), ("6 temas", VIOLET)], cx, 414, 20)}

{scene(seats, cx, 690, 1.62)}

<rect x="0" y="{H - 74}" width="{W}" height="74" fill="{BG_DEEP}" opacity="0.92"/>
<line x1="0" y1="{H - 74}" x2="{W}" y2="{H - 74}" stroke="{BORDER}"/>
<text x="70" y="{H - 30}" font-family="{SANS}" font-size="22" fill="{MUTED}">
  Código abierto · GNU AGPL-3.0 · hecho con Rust y Tauri
</text>
<text x="{W - 70}" y="{H - 30}" text-anchor="end" font-family="{MONO}" font-size="23" fill="{ACCENT}">
  buymeacoffee.com/pilahito
</text>
</svg>
"""


# --------------------------------------------------------------------------
# 2. Cabecera para el README — 1280 × 400
# --------------------------------------------------------------------------


def banner_readme() -> str:
    W, H = 1280, 400

    seats = [
        {"gx": 0.0, "gy": 0.0, "hue": 200},
        {"gx": STEP, "gy": 0.0, "hue": 330},
        {"gx": 0.0, "gy": STEP, "hue": 45},
    ]

    chips = [("Terminal SSH", ACCENT), ("SFTP", SUCCESS), ("Pixel Agents", WARNING)]
    chip_size = 18
    chip_width = sum(len(t) * chip_size * 0.60 + 46 for t, _ in chips) + 14 * (len(chips) - 1)

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
{DEFS}
<rect width="{W}" height="{H}" fill="url(#bgFill)"/>
<ellipse cx="380" cy="170" rx="640" ry="340" fill="url(#glow)"/>
<ellipse cx="1140" cy="330" rx="380" ry="260" fill="url(#glowViolet)"/>
{cloud(1060, 70, 0.9, 0.07)}

{mark(80, 62, 72)}

<text x="172" y="122" font-family="{MONO}" font-size="64" font-weight="700"
      fill="url(#wordFill)" letter-spacing="-2.5">CloudTerm</text>

<text x="82" y="190" font-family="{SANS}" font-size="25" fill="{TEXT}">
  Cliente SSH y SFTP de escritorio
</text>
<text x="82" y="222" font-family="{SANS}" font-size="20" fill="{MUTED}">
  Terminal, transferencias y Pixel Agents. Gratis para uso personal.
</text>

{pills(chips, 82 + chip_width / 2, 258, chip_size)}

<text x="82" y="366" font-family="{MONO}" font-size="19" fill="{ACCENT}">
  github.com/pilahito/cloudterm
</text>

{scene(seats, 1000, 250, 1.05)}
</svg>
"""


# --------------------------------------------------------------------------
# 3. Icono de la aplicación — 1024 × 1024
# --------------------------------------------------------------------------


def icon() -> str:
    verticals = "".join(
        f'<line x1="{150 + i * 96}" y1="690" x2="{150 + i * 96 + 340}" y2="1000"/>' for i in range(8)
    )
    horizontals = "".join(
        f'<line x1="{874 - i * 96}" y1="690" x2="{874 - i * 96 - 340}" y2="1000"/>' for i in range(8)
    )

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#121a28"/>
    <stop offset="1" stop-color="{BG_DEEP}"/>
  </linearGradient>
  <linearGradient id="chev" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#67e8f9"/>
    <stop offset="1" stop-color="{ACCENT}"/>
  </linearGradient>
  <radialGradient id="halo">
    <stop offset="0" stop-color="{ACCENT}" stop-opacity="0.32"/>
    <stop offset="1" stop-color="{ACCENT}" stop-opacity="0"/>
  </radialGradient>
</defs>

<rect width="1024" height="1024" rx="228" fill="url(#bg)"/>
<rect x="7" y="7" width="1010" height="1010" rx="222" fill="none"
      stroke="{ACCENT}" stroke-opacity="0.30" stroke-width="14"/>
<ellipse cx="512" cy="450" rx="430" ry="370" fill="url(#halo)"/>

<g stroke="{BORDER}" stroke-width="3.5" opacity="0.6">{verticals}{horizontals}</g>

<polyline points="272,296 512,512 272,728" fill="none" stroke="url(#chev)" stroke-width="92"
          stroke-linecap="round" stroke-linejoin="round"/>
<rect x="596" y="636" width="180" height="92" rx="46" fill="{SUCCESS}"/>
</svg>
"""


# --------------------------------------------------------------------------


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    outputs = {
        "banner-buymeacoffee.svg": banner_coffee(),
        "banner-readme.svg": banner_readme(),
        "icon.svg": icon(),
    }
    for name, svg in outputs.items():
        path = os.path.join(here, name)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(svg)
        print(f"escrito {name} ({len(svg)} bytes)")


if __name__ == "__main__":
    main()
