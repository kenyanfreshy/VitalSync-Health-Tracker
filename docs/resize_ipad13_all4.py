#!/usr/bin/env python3
"""
Produce all 4 Apple-required iPad 13" dimensions for each of 7 source images.

Apple-required sizes:
  Portrait:   2064 × 2752 px  |  2048 × 2732 px
  Landscape:  2752 × 2064 px  |  2732 × 2048 px

For landscape we rotate the portrait resize 90° (preserves full image content
at the correct pixel dimensions Apple expects).

Output: 7 screens × 4 sizes = 28 files
"""

from PIL import Image
import os, sys

BASE = "/home/ubuntu/VitalSync-App/docs"
OUT  = os.path.join(BASE, "ipad_4k_13inch_ALL4")
os.makedirs(OUT, exist_ok=True)

SOURCES = [
    "ipad_4k_01_dashboard",
    "ipad_4k_02_vitals",
    "ipad_4k_03_blood_sugar",
    "ipad_4k_04_ecg",
    "ipad_4k_05_sleep",
    "ipad_4k_06_medications",
    "ipad_4k_07_nutrition",
]

# (width, height, label)
SIZES = [
    (2064, 2752, "portrait_2064x2752"),
    (2048, 2732, "portrait_2048x2732"),
    (2752, 2064, "landscape_2752x2064"),
    (2732, 2048, "landscape_2732x2048"),
]

for name in SOURCES:
    src_path = os.path.join(BASE, f"{name}.png")
    img = Image.open(src_path).convert("RGB")
    print(f"\nSource: {name}  ({img.width}×{img.height})")

    for (w, h, label) in SIZES:
        resized = img.resize((w, h), Image.LANCZOS)

        assert resized.width == w and resized.height == h, \
            f"SIZE MISMATCH: {resized.width}×{resized.height} != {w}×{h}"

        out_name = f"vitalsync_{name}_{label}.png"
        out_path = os.path.join(OUT, out_name)
        resized.save(out_path, "PNG", optimize=True)

        verify = Image.open(out_path)
        assert verify.width == w and verify.height == h, \
            f"SAVED MISMATCH: {out_path}"

        print(f"  ✓ {out_name}  ({verify.width}×{verify.height})")

print(f"\n✅  All 28 files written to {OUT}")
