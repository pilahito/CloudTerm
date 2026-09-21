#!/usr/bin/env python3
"""
Genera los bitmaps e iconos del instalador de CloudTerm.

NSIS exige BMP de 24 bits, sin canal alfa:
  - installer-sidebar.bmp  164 × 314  (bienvenida y final)
  - installer-header.bmp   150 × 57   (cabecera de las páginas interiores)

También produce:
  - icon-512.png           Linux / hicolor
  - icon.ico               Windows, 16…256 px
  - previsualizaciones PNG de los banners

Uso:
    python packaging/installer/generar_recursos.py
"""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# Paleta neon — la misma que docs/brand/generar_brand.py
BG = (7, 11, 17)
BG_DEEP = (5, 8, 13)
SURFACE = (13, 18, 27)
ELEVATED = (20, 27, 39)
BORDER = (31, 42, 57)
MUTED = (108, 124, 148)
TEXT = (226, 236, 248)
ACCENT = (34, 211, 238)
ACCENT_DIM = (14, 116, 144)
SUCCESS = (40, 200, 120)
WARNING = (250, 204, 21)
VIOLET = (192, 132, 252)
SKIN = (233, 185, 141)

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
BRAND = ROOT / "docs" / "brand"
ICONS = ROOT / "src-tauri" / "icons"

GITHUB_MARK = Path(__file__).resolve().parent / "github-mark.png"


def fonts_dir() -> Path:
    windir = os.environ.get("WINDIR", r"C:\Windows")
    return Path(windir) / "Fonts"


def load_font(names: list[str], size: int) -> ImageFont.ImageFont:
    roots = [
        fonts_dir(),
        Path("/usr/share/fonts/truetype/dejavu"),
        Path("/usr/share/fonts/TTF"),
        Path("/usr/share/fonts/truetype/liberation"),
    ]
    for root in roots:
        for name in names:
            path = root / name
            if path.is_file():
                return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def mono(size: int) -> ImageFont.ImageFont:
    return load_font(
        ["consola.ttf", "CascadiaMono.ttf", "cascadia.ttf", "DejaVuSansMono.ttf", "cour.ttf"],
        size,
    )


def sans(size: int) -> ImageFont.ImageFont:
    return load_font(
        ["segoeui.ttf", "SegoeUI.ttf", "calibri.ttf", "DejaVuSans.ttf", "LiberationSans-Regular.ttf"],
        size,
    )


def fill_bg(img: Image.Image) -> None:
    w, h = img.size
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(BG[0] * (1 - t) + BG_DEEP[0] * t)
        g = int(BG[1] * (1 - t) + BG_DEEP[1] * t)
        b = int(BG[2] * (1 - t) + BG_DEEP[2] * t)
        for x in range(w):
            px[x, y] = (r, g, b)


def iso_grid(draw: ImageDraw.ImageDraw, w: int, h: int, origin_y: int) -> None:
    color = (31, 42, 57)
    step = 18
    for i in range(-8, 24):
        x0 = i * step
        draw.line((x0, origin_y, x0 + h, origin_y + h), fill=color, width=1)
        draw.line((w - x0, origin_y, w - x0 - h, origin_y + h), fill=color, width=1)


def chevron(draw: ImageDraw.ImageDraw, x: int, y: int, size: int) -> None:
    s = size
    draw.line([(x, y), (x + s * 0.55, y + s * 0.5), (x, y + s)], fill=ACCENT, width=max(3, size // 8))
    bw, bh = max(4, size // 5), max(3, size // 10)
    draw.rounded_rectangle(
        [x + s * 0.62, y + s * 0.72, x + s * 0.62 + bw, y + s * 0.72 + bh],
        radius=bh // 2,
        fill=SUCCESS,
    )


def pixel_agent(draw: ImageDraw.ImageDraw, cx: int, cy: int, hair, shirt, scale: int = 2) -> None:
    s = scale

    def r(x, y, w, h, c):
        draw.rectangle([cx + x * s, cy + y * s, cx + (x + w) * s - 1, cy + (y + h) * s - 1], fill=c)

    r(-3, 2, 6, 2, (0, 0, 0))
    r(-2, -5, 1, 3, shirt)
    r(1, -5, 1, 3, shirt)
    r(-2, -6, 4, 5, shirt)
    r(-2, -9, 4, 4, SKIN)
    r(-2, -11, 4, 2, hair)
    r(-1, -8, 1, 1, (26, 34, 48))
    r(1, -8, 1, 1, (26, 34, 48))
    r(-3, -8, 1, 2, SUCCESS)
    r(2, -8, 1, 2, SUCCESS)
    r(-3, -1, 6, 3, ELEVATED)
    r(-2, -4, 4, 2, (7, 12, 19))


def paste_github(img: Image.Image, x: int, y: int, size: int = 22) -> int:
    """Pega la marca oficial de GitHub (Invertocat) en blanco sobre el fondo oscuro."""
    mark = Image.open(GITHUB_MARK).convert("RGBA")
    mark = mark.resize((size, size), Image.Resampling.LANCZOS)
    img.paste(mark, (x, y), mark)
    return size


def save_bmp(img: Image.Image, path: Path) -> None:
    img.convert("RGB").save(path, format="BMP")
    print(f"escrito {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


def save_png(img: Image.Image, path: Path) -> None:
    img.save(path, format="PNG")
    print(f"escrito {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


def sidebar() -> Image.Image:
    w, h = 164, 314
    img = Image.new("RGB", (w, h), BG)
    fill_bg(img)
    draw = ImageDraw.Draw(img)
    iso_grid(draw, w, h, 150)

    glow = Image.new("RGB", (w, h), BG)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-40, -30, 200, 160], fill=(10, 70, 90))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(24)), 0.35)
    draw = ImageDraw.Draw(img)

    chevron(draw, 14, 14, 26)
    draw.text((48, 22), "CloudTerm", font=mono(14), fill=TEXT)

    draw.text((14, 68), "SSH · SFTP", font=sans(11), fill=MUTED)
    draw.text((14, 84), "Pixel Agents", font=sans(11), fill=WARNING)

    pixel_agent(draw, 42, 150, (80, 160, 210), (40, 90, 140), 4)
    pixel_agent(draw, 88, 168, (210, 90, 140), (140, 50, 90), 4)
    pixel_agent(draw, 122, 150, (220, 180, 70), (90, 120, 50), 4)

    draw.rectangle([0, 248, w, h], fill=BG_DEEP)
    draw.line([(0, 248), (w, 248)], fill=BORDER)
    mark_w = paste_github(img, 12, 256, 22)
    draw = ImageDraw.Draw(img)
    draw.text((12 + mark_w + 6, 260), "GitHub", font=sans(11), fill=TEXT)
    draw.text((12, 288), "github.com/", font=mono(9), fill=MUTED)
    draw.text((12, 300), "pilahito/cloudterm", font=mono(9), fill=ACCENT)
    return img


def header() -> Image.Image:
    w, h = 150, 57
    img = Image.new("RGB", (w, h), BG)
    fill_bg(img)
    draw = ImageDraw.Draw(img)
    chevron(draw, 8, 12, 22)
    draw.text((40, 10), ">_ CloudTerm", font=mono(12), fill=TEXT)
    draw.text((40, 30), "SSH · SFTP · Agents", font=sans(9), fill=MUTED)
    return img


def icon_512() -> Image.Image:
    src = BRAND / "icon-1024.png"
    master = Image.open(src).convert("RGBA")
    return master.resize((512, 512), Image.Resampling.LANCZOS)


def icon_ico(src: Image.Image, dest: Path) -> None:
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    src.convert("RGBA").save(
        dest,
        format="ICO",
        sizes=sizes,
        append_images=[src.resize(s, Image.Resampling.LANCZOS) for s in sizes],
    )
    print(f"escrito {dest.relative_to(ROOT)} ({dest.stat().st_size} bytes)")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    side = sidebar()
    head = header()
    save_bmp(side, OUT / "installer-sidebar.bmp")
    save_bmp(head, OUT / "installer-header.bmp")
    save_png(side, OUT / "installer-sidebar.png")
    save_png(head, OUT / "installer-header.png")

    ico512 = icon_512()
    save_png(ico512, OUT / "icon-512.png")
    save_png(ico512, OUT / "icon.png")
    save_png(ico512, BRAND / "icon-512.png")
    save_png(ico512, ICONS / "512x512.png")
    icon_ico(Image.open(BRAND / "icon-1024.png"), OUT / "icon.ico")
    icon_ico(Image.open(BRAND / "icon-1024.png"), ICONS / "icon.ico")


if __name__ == "__main__":
    main()
