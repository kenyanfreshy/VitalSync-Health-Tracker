#!/usr/bin/env python3
"""
Resize 7 premium 4K VitalSync iPad 13" marketing images to BOTH
Apple-required dimensions:
  - 2064 × 2752 px  (iPad Pro 13" M4 primary)
  - 2048 × 2732 px  (iPad Pro 13" legacy / iPad Air 13")

Uses LANCZOS for maximum sharpness. Verifies every output pixel dimension.
"""

from PIL import Image
import os, sys

BASE = "/home/ubuntu/VitalSync-App/docs"
OUT  = os.path.join(BASE, "ipad_4k_13inch_FINAL")
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

SIZES = [
    (2064, 2752),   # iPad Pro 13" M4
    (2048, 2732),   # iPad Pro 13" / iPad Air 13"
]

for name in SOURCES:
    src_path = os.path.join(BASE, f"{name}.png")
    img = Image.open(src_path).convert("RGB")
    print(f"\nSource: {name}  ({img.width}×{img.height})")

    for (w, h) in SIZES:
        resized = img.resize((w, h), Image.LANCZOS)

        # Pixel-exact assertion
        assert resized.width == w and resized.height == h, \
            f"SIZE MISMATCH: got {resized.width}×{resized.height}, expected {w}×{h}"

        label = f"{w}x{h}"
        out_name = f"vitalsync_{name}_{label}.png"
        out_path = os.path.join(OUT, out_name)
        resized.save(out_path, "PNG", optimize=True)

        # Re-open and verify saved file
        verify = Image.open(out_path)
        assert verify.width == w and verify.height == h, \
            f"SAVED FILE SIZE MISMATCH: {out_path}"

        print(f"  ✓ {out_name}  ({verify.width}×{verify.height})")

print(f"\n✅  All 14 files written to {OUT}")
