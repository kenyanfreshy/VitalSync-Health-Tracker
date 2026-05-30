#!/usr/bin/env python3
"""
Resize 5 premium 4K VitalSync Apple Watch Ultra 3 marketing images
to exactly 410 × 502 px (Apple Watch Ultra 3 secondary dimension).
Uses high-quality LANCZOS downsampling.
"""

from PIL import Image
import os

BASE = "/home/ubuntu/VitalSync-App/docs"
OUT  = os.path.join(BASE, "watch_4k_ultra3_410x502")
os.makedirs(OUT, exist_ok=True)

W, H = 410, 502

SCREENS = {
    "watch_4k_01_readiness":  "vitalsync_watch_4k_01_readiness_410x502.png",
    "watch_4k_02_blood_sugar":"vitalsync_watch_4k_02_blood_sugar_410x502.png",
    "watch_4k_03_ecg":        "vitalsync_watch_4k_03_ecg_410x502.png",
    "watch_4k_04_vitals":     "vitalsync_watch_4k_04_vitals_410x502.png",
    "watch_4k_05_sleep":      "vitalsync_watch_4k_05_sleep_410x502.png",
}

for src_name, dst_name in SCREENS.items():
    src = os.path.join(BASE, f"{src_name}.png")
    img = Image.open(src)
    print(f"  Source: {img.size}  →  {W}×{H}  ({src_name})")
    resized = img.resize((W, H), Image.LANCZOS)
    out_path = os.path.join(OUT, dst_name)
    resized.save(out_path, "PNG", optimize=True)
    print(f"  Saved : {out_path}")

print("\nAll 5 images resized to 410×502 px.")
