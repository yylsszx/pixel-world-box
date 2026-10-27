from PIL import Image, ImageDraw

# 与 constants.ts PIX 色板一致
PIX = {
    '.': None,
    'k': '#14100c', 'K': '#3a342c',
    'w': '#f2ead8', 'f': '#f7f9fb',
    'c': '#d9a066', 'C': '#b57742',
    'g': '#4f9e3a', 'G': '#2c5e24',
    'n': '#c98d5a', 'N': '#6e4a2b',
    'r': '#cf3f2e', 'R': '#8c2317',
    'o': '#ff9b2d', 'O': '#c96a15',
    'y': '#ffd93d', 'Y': '#c9a02a',
    'b': '#4d9fd6', 'B': '#2b6fae',
    'm': '#8d8d8d', 'M': '#575757',
    's': '#e3cf96', 'S': '#c4ad74',
}

ANGEL_V4 = ['f......f', 'ff.yy.ff', 'ffwccwff', '.fwwwwf.', '..wwwwy.', '..wyywy.', '..w..w..', '..y..y..']
ANGEL_V5 = ['f......f', 'ff.yy.ff', 'ffyccyff', '.fwwwwf.', '..wwwwy.', '..wyywy.', '..w..w..', '..y..y..']

def render(rows, path, scale=28):
    img = Image.new('RGB', (8 * scale, 8 * scale), '#101014')
    d = ImageDraw.Draw(img)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            col = PIX.get(ch)
            if col:
                d.rectangle([x * scale, y * scale, (x + 1) * scale - 1, (y + 1) * scale - 1], fill=col)
    img.save(path)
    print('saved', path)

render(ANGEL_V4, '/home/z/my-project/download/angel-v4.png')
render(ANGEL_V5, '/home/z/my-project/download/angel-v5.png')

# 并排对比图
a = Image.open('/home/z/my-project/download/angel-v4.png')
b = Image.open('/home/z/my-project/download/angel-v5.png')
combo = Image.new('RGB', (a.width + b.width + 40, a.height), '#101014')
combo.paste(a, (0, 0))
combo.paste(b, (a.width + 40, 0))
combo.save('/home/z/my-project/download/angel-v4-v5-compare.png')
print('compare saved')
