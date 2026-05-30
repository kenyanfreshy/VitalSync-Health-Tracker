#!/usr/bin/env python3
"""
Resize 3 new iPad 13" marketing images to both Apple portrait dimensions:
  2064 × 2752 px
  2048 × 2732 px
"""
from PIL import Image
import os

BASE = "/home/ubuntu/VitalSync-App/docs"
OUT  = os.path.join(BASE, "ipad_new3_portrait")
os.makedirs(OUT, exist_ok=True)

SOURCES = [
    "ipad_4k_08_record",
    "ipad_4k_09_settings_diet",
    "ipad_4k_10_privacy",
]

SIZES = [
    (2064, 2752, "portrait_2064x2752"),
    (2048, 2732, "portrait_2048x2732"),
]

for name in SOURCES:
    src = os.path.join(BASE, f"{name}.png")
    img = Image.open(src).convert("RGB")
    print(f"Source: {name}  ({img.width}x{img.height})")
    for (w, h, label) in SIZES:
        out_name = f"vitalsync_{name}_{label}.png"
        out_path = os.path.join(OUT, out_name)
        resized = img.resize((w, h), Image.LANCZOS)
        resized.save(out_path, "PNG", optimize=True)
        v = Image.open(out_path)
        assert v.width == w and v.height == h, f"MISMATCH {out_path}"
        print(f"  ok {out_name}  ({v.width}x{v.height})")

print("Done.")
