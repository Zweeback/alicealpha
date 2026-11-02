"""Kontaktbogen: python3 mh/hair_sheet.py PREFIX shot1,shot2,... OUT.png  (2x2 bzw. Reihe, je 500px)"""
import sys
from PIL import Image
pre, shots, out = sys.argv[1], sys.argv[2].split(','), sys.argv[3]
ims = [Image.open(f'{pre}_{s}.png').convert('RGB') for s in shots]
ims = [im.crop((150, 50, 850, 850)) if im.size == (1000, 1000) else im for im in ims]
ims = [im.resize((560, int(560 * im.size[1] / im.size[0]))) for im in ims]
cols = 2 if len(ims) == 4 else len(ims); rows = (len(ims) + cols - 1) // cols
h = max(i.size[1] for i in ims)
sheet = Image.new('RGB', (560 * cols, h * rows))
for k, im in enumerate(ims): sheet.paste(im, ((k % cols) * 560, (k // cols) * h))
sheet.save(out)
