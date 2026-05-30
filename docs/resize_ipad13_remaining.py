#!/usr/bin/env python3
"""
Resize the remaining 3 iPad 13" source images (sleep, medications, nutrition)
to all 4 Apple-required dimensions.
"""

from PIL import Image
import os

BASE = "/home/ubuntu/VitalSync-App/docs"
OUT  = os.path.join(BASE, "ipad_4k_13inch_ALL4")
os.makedirs(OUT, exist_ok=True)

SOURCES = [
    "ipad_4k_05_sleep",
    "ipad_4k_06_medications",
    "ipad_4k_07_nutrition",
]

SIZES = [
    (2064, 2752, "portrait_2064x2752"),
    (2048, 2732, "portrait_2048x2732"),
    (2752, 2064, "landscape_2752x2064"),
    (2732, 2048, "landscape_2732x2048"),
]

for name in SOURCES:
    src_path = os.path.join(BASE, f"{name}.png")
    img = Image.open(src_path).convert("RGB")
    print(f"Source: {name}  ({img.width}x{img.height})")

    for (w, h, label) in SIZES:
        resized = img.resize((w, h), Image.LANCZOS)
        out_name = f"vitalsync_{name}_{label}.png"
        out_path = os.path.join(OUT, out_name)
        resized.save(out_path, "PNG", optimize=True)
        v = Image.open(out_path)
        assert v.width == w and v.height == h
        print(f"  ok {out_name}  ({v.width}x{v.height})")

print("Done.")
