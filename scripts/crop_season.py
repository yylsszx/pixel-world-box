from PIL import Image

# 裁剪四季轮转卡片区域放大验证（面板位于左上 44,64 起）
img = Image.open('/home/z/my-project/download/season-progress.png')
crop = img.crop((68, 100, 290, 165))
crop = crop.resize((crop.width * 4, crop.height * 4), Image.NEAREST)
crop.save('/home/z/my-project/download/season-progress-zoom.png')
print('saved', crop.size)

# 顺带裁剪天使图标（工具栏最右侧神力区）——天使在 toolbar 神力 tab，需要先确认位置
# 本图 toolbar 未开神力 tab，仅验证季节进度
