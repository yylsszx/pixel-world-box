from PIL import Image

img = Image.open('/home/z/my-project/download/angel-toolbar.png')
w, h = img.size
# 工具栏在底部（约 y 555-615），裁全宽找天使
crop = img.crop((0, h - 75, w, h))
crop = crop.resize((crop.width * 2, crop.height * 2), Image.NEAREST)
crop.save('/home/z/my-project/download/angel-toolbar-zoom.png')
print('saved', crop.size)
