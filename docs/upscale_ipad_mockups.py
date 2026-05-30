"""
Upscale VitalSync iPad marketing mockups to Apple App Store 13" Display dimensions.
Target: 2048 × 2732 px (iPad Pro 12.9" / 13" portrait)
Method: Lanczos high-quality resampling, maintaining aspect ratio with padding if needed.
"""

from PIL import Image
import os

TARGET_W = 2048
TARGET_H = 2732

IMAGES = [
    ("ipad_mockup_1_dashboard.png",  "ipad_mockup_1_dashboard_4k.png"),
    ("ipad_mockup_2_blood_sugar.png","ipad_mockup_2_blood_sugar_4k.png"),
    ("ipad_mockup_3_records.png",    "ipad_mockup_3_records_4k.png"),
]

BASE = "/home/ubuntu/VitalSync-App/docs"

for src_name, dst_name in IMAGES:
    src_path = os.path.join(BASE, src_name)
    dst_path = os.path.join(BASE, dst_name)

    img = Image.open(src_path).convert("RGB")
    orig_w, orig_h = img.size
    print(f"{src_name}: {orig_w}×{orig_h} → ", end="")

    # Scale to fit target dimensions, preserving aspect ratio
    scale = min(TARGET_W / orig_w, TARGET_H / orig_h)
    new_w = round(orig_w * scale)
    new_h = round(orig_h * scale)

    resized = img.resize((new_w, new_h), Image.LANCZOS)

    # Pad with black if needed to reach exact target size
    if new_w != TARGET_W or new_h != TARGET_H:
        canvas = Image.new("RGB", (TARGET_W, TARGET_H), (0, 0, 0))
        offset_x = (TARGET_W - new_w) // 2
        offset_y = (TARGET_H - new_h) // 2
        canvas.paste(resized, (offset_x, offset_y))
        final = canvas
    else:
        final = resized

    final.save(dst_path, "PNG", optimize=False, compress_level=1)
    print(f"{TARGET_W}×{TARGET_H} → saved to {dst_name}")

print("Done.")
