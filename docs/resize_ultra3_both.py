#!/usr/bin/env python3
"""
Resize 5 premium 4K VitalSync Apple Watch Ultra 3 marketing images to
BOTH Apple-required dimensions:
  - 422 × 514 px  (Ultra 3 primary)
  - 410 × 502 px  (Ultra 3 secondary)

Uses LANCZOS for maximum sharpness. Verifies every output pixel dimension.
"""

from PIL import Image
import os, sys

BASE = "/home/ubuntu/VitalSync-App/docs"
OUT  = os.path.join(BASE, "watch_4k_ultra3_FINAL")
os.makedirs(OUT, exist_ok=True)

SOURCES = [
    "watch_4k_01_readiness",
    "watch_4k_02_blood_sugar",
    "watch_4k_03_ecg",
    "watch_4k_04_vitals",
    "watch_4k_05_sleep",
]

SIZES = [
    (422, 514),
    (410, 502),
]

errors = []

for name in SOURCES:
    src_path = os.path.join(BASE, f"{name}.png")
    img = Image.open(src_path).convert("RGB")
    print(f"\nSource: {name}  ({img.width}×{img.height})")

    for (w, h) in SIZES:
        resized = img.resize((w, h), Image.LANCZOS)

        # Pixel-exact verification
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

if errors:
    print("\nERRORS:", errors)
    sys.exit(1)
else:
    print(f"\n✅  All 10 files written to {OUT}")
