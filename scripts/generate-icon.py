#!/usr/bin/env python3
"""Generate Grove app icon - a minimal tree/grove symbol on a dark rounded-rect background."""

from PIL import Image, ImageDraw
import math
import os

SIZE = 1024
PAD = 120  # padding inside the rounded rect
CORNER = 220  # corner radius

# Colors (Catppuccin Mocha inspired)
BG = (30, 30, 46)          # #1e1e2e - dark background
GREEN1 = (166, 227, 161)   # #a6e3a1 - green (main tree)
GREEN2 = (148, 226, 213)   # #94e2d5 - teal (left tree)
GREEN3 = (137, 180, 250)   # #89b4fa - blue (right tree)
TRUNK = (186, 194, 222)    # #bac2de - subtext/trunk color


def rounded_rect(draw, xy, radius, fill):
    """Draw a rounded rectangle."""
    x0, y0, x1, y1 = xy
    r = radius
    # Main body
    draw.rectangle([x0 + r, y0, x1 - r, y1], fill=fill)
    draw.rectangle([x0, y0 + r, x1, y1 - r], fill=fill)
    # Corners
    draw.pieslice([x0, y0, x0 + 2*r, y0 + 2*r], 180, 270, fill=fill)
    draw.pieslice([x1 - 2*r, y0, x1, y0 + 2*r], 270, 360, fill=fill)
    draw.pieslice([x0, y1 - 2*r, x0 + 2*r, y1], 90, 180, fill=fill)
    draw.pieslice([x1 - 2*r, y1 - 2*r, x1, y1], 0, 90, fill=fill)


def draw_tree(draw, cx, cy, canopy_r, trunk_w, trunk_h, color, trunk_color):
    """Draw a simple stylized tree (circle canopy + rectangle trunk)."""
    # Trunk
    tx = cx - trunk_w // 2
    ty = cy + canopy_r * 0.3
    draw.rounded_rectangle(
        [tx, ty, tx + trunk_w, ty + trunk_h],
        radius=trunk_w // 4,
        fill=trunk_color
    )
    # Canopy (circle)
    draw.ellipse(
        [cx - canopy_r, cy - canopy_r, cx + canopy_r, cy + canopy_r],
        fill=color
    )


def main():
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background rounded rect
    rounded_rect(draw, (0, 0, SIZE, SIZE), CORNER, BG)

    center_x = SIZE // 2
    base_y = SIZE * 0.62  # vertical center for trees

    # Three trees forming a grove
    # Center tree (biggest, green)
    draw_tree(draw, center_x, base_y - 60, 155, 40, 180, GREEN1, TRUNK)

    # Left tree (medium, teal)
    draw_tree(draw, center_x - 195, base_y + 30, 115, 32, 140, GREEN2, TRUNK)

    # Right tree (medium, blue)
    draw_tree(draw, center_x + 195, base_y + 30, 115, 32, 140, GREEN3, TRUNK)

    # Terminal cursor prompt at bottom center  >_
    prompt_y = SIZE * 0.82
    prompt_x = center_x - 60
    bar_w = 8
    bar_h = 50
    # > character (two lines forming an arrow)
    arrow_pts = [
        (prompt_x, prompt_y),
        (prompt_x + 30, prompt_y + bar_h // 2),
        (prompt_x, prompt_y + bar_h),
    ]
    draw.line(arrow_pts, fill=GREEN1, width=10, joint='curve')
    # _ underscore cursor
    cursor_x = prompt_x + 50
    cursor_y = prompt_y + bar_h - 4
    draw.rounded_rectangle(
        [cursor_x, cursor_y, cursor_x + 40, cursor_y + 8],
        radius=3,
        fill=GREEN1
    )

    # Save
    out_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(out_dir)
    build_dir = os.path.join(project_dir, 'build')
    os.makedirs(build_dir, exist_ok=True)

    icon_path = os.path.join(build_dir, 'icon.png')
    img.save(icon_path, 'PNG')
    print(f'Saved: {icon_path}')

    # Also save 512x512 version
    img_512 = img.resize((512, 512), Image.LANCZOS)
    img_512.save(os.path.join(build_dir, 'icon-512.png'), 'PNG')

    # Save 256x256 for Windows .ico
    img_256 = img.resize((256, 256), Image.LANCZOS)
    img_256.save(os.path.join(build_dir, 'icon-256.png'), 'PNG')

    print('Done! Icons saved to build/')


if __name__ == '__main__':
    main()
