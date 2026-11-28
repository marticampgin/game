"""Animate the painted fire above each bowl in the Shattered Ring backdrop."""
from math import cos, pi, sin
from pathlib import Path

from PIL import Image
from art_output import publish

ASSETS = Path(__file__).resolve().parents[1] / 'public' / 'assets'
CELL = (48, 60)
FRAMES = 12
# Native crop and root of the fire, in the same order as battle.css.
BRAZIERS = [((605, 190), (24, 53)), ((1431, 226), (24, 54))]


def clamp(value):
    return max(0, min(1, value))


def flame_frame(painting, base, frame, east):
    result = Image.new('RGBA', CELL)
    source = painting.load()
    pixels = result.load()
    angle = 2 * pi * frame / FRAMES
    for y in range(CELL[1]):
        height = (base[1] - y) / (44 if east else 34)
        if not 0 < height < 1:
            continue
        # The coal bed stays planted. The upper tongues travel farthest.
        lean = (3.8 * sin(angle) + 1.3 * sin(2 * angle) * cos(height * 6)) * height
        lift = (3.0 * sin(angle) - 2.1 * sin(2 * angle)) * height
        for x in range(CELL[0]):
            distance = abs(x - base[0]) / (15 - height * 4)
            edge = clamp((1 - distance) * 4) * clamp((1 - height) * 7) * clamp(height * 16)
            if not edge:
                continue
            dx = round(lean * edge)
            dy = round(lift * edge)
            color = source[x - dx, y - dy]
            # Modulate amber pixels in the coals without lighting the masonry.
            heat = clamp((color[0] - color[2] - 52) / 104)
            flicker = edge * heat * (sin(angle) * cos(height * 4) + .42 * sin(2 * angle))
            rgb = tuple(max(0, min(255, c + round(flicker * gain))) for c, gain in zip(color, (8, 21, 12)))
            pixels[x, y] = (*rgb, round(255 * edge))
    return result


if __name__ == '__main__':
    arena = Image.open(ASSETS / 'ring-wide.webp').convert('RGB')
    if arena.size != (1881, 836):
        raise ValueError('Register the brazier crops against the new arena dimensions.')
    strip = Image.new('RGBA', (CELL[0] * FRAMES, CELL[1] * len(BRAZIERS)))
    for row, ((left, top), base) in enumerate(BRAZIERS):
        painting = arena.crop((left, top, left + CELL[0], top + CELL[1]))
        for frame in range(FRAMES):
            strip.paste(flame_frame(painting, base, frame, row == 1), (frame * CELL[0], row * CELL[1]))
    publish(strip, ASSETS / 'arena-braziers.webp')
