"""Render PNG icons (same design as public/icons/icon.svg). Usage: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw

def render(size, out):
    S = 4096  # supersample
    k = S / 512
    im = Image.new("RGB", (S, S), "#2f7d5b")
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([116*k, 116*k, 396*k, 396*k], radius=64*k, outline="white", width=int(28*k))
    pts = [(190*k, 262*k), (237*k, 309*k), (329*k, 207*k)]
    w = int(32*k)
    d.line(pts, fill="white", width=w, joint="curve")
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x-w/2, y-w/2, x+w/2, y+w/2], fill="white")
    im.resize((size, size), Image.LANCZOS).save(out)

for size, name in ((192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")):
    render(size, f"public/icons/{name}")
