#!/usr/bin/env python3
"""
Resize 5 VitalSync watch marketing images to Apple Watch Ultra 3 dimensions:
  - 422 × 514 px  (Ultra 3 primary)
  - 410 × 502 px  (Ultra 3 secondary)
"""

from PIL import Image
import os

BASE = "/home/ubuntu/VitalSync-App/docs"
OUT  = os.path.join(BASE, "watch_ultra3_v3_final")
os.makedirs(OUT, exist_ok=True)

SCREENS = [
    "watch_v3_blood_sugar",
    "watch_v3_vitals",
    "watch_v3_medications",
    "watch_v3_ecg",
    "watch_v3_sleep",
]

SIZES = {
    "422x514": (422, 514),
    "410x502": (410, 502),
}

for screen in SCREENS:
    src = os.path.join(BASE, f"{screen}.png")
    img = Image.open(src)
    for label, (w, h) in SIZES.items():
        resized = img.resize((w, h), Image.LANCZOS)
        out_path = os.path.join(OUT, f"vitalsync_{screen}_{label}.png")
        resized.save(out_path, "PNG", optimize=True)
        print(f"Saved {out_path}  ({w}×{h})")

print("\nAll done.")
