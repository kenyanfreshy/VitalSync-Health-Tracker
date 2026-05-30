"""
Resize VitalSync Apple Watch marketing screenshots to all 5 Apple Watch model dimensions.
Uses Lanczos resampling. Crops to exact aspect ratio first, then scales to target size.
"""

from PIL import Image
import os

BASE = "/home/ubuntu/VitalSync-App/docs"

# Apple Watch model target dimensions (W × H)
MODELS = {
    "ultra3_422x514":   (422, 514),
    "ultra3_410x502":   (410, 502),
    "series11_416x496": (416, 496),
    "series9_396x484":  (396, 484),
    "series6_368x448":  (368, 448),
    "series3_312x390":  (312, 390),
}

SCREENS = [
    "watch_1_dashboard",
    "watch_2_blood_sugar",
    "watch_3_vitals",
]

def crop_to_ratio(img, target_w, target_h):
    """Center-crop image to match target aspect ratio before resizing."""
    src_w, src_h = img.size
    target_ratio = target_w / target_h
    src_ratio = src_w / src_h

    if src_ratio > target_ratio:
        # Source is wider — crop sides
        new_w = int(src_h * target_ratio)
        offset = (src_w - new_w) // 2
        img = img.crop((offset, 0, offset + new_w, src_h))
    elif src_ratio < target_ratio:
        # Source is taller — crop top/bottom
        new_h = int(src_w / target_ratio)
        offset = (src_h - new_h) // 2
        img = img.crop((0, offset, src_w, offset + new_h))

    return img

os.makedirs(os.path.join(BASE, "watch_screenshots"), exist_ok=True)

for screen in SCREENS:
    src_path = os.path.join(BASE, f"{screen}.png")
    img = Image.open(src_path).convert("RGB")
    print(f"\nProcessing {screen}.png ({img.size[0]}×{img.size[1]}):")

    for model_name, (tw, th) in MODELS.items():
        cropped = crop_to_ratio(img, tw, th)
        resized = cropped.resize((tw, th), Image.LANCZOS)
        out_name = f"{screen}_{model_name}.png"
        out_path = os.path.join(BASE, "watch_screenshots", out_name)
        resized.save(out_path, "PNG", optimize=False, compress_level=1)
        print(f"  → {out_name}: {tw}×{th}")

print("\nAll done.")
