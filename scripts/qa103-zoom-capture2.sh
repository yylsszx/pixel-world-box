#!/bin/bash
# #103 QA-2：LOD 切换点全分辨率取证（无缩放导出，320x180 中心裁剪）
S=task-103
mkdir -p /tmp/qa103
cd /home/z/my-project/pixel-world-box
ab() { agent-browser --session $S "$@"; }

CX=129; CY=57 # 场景中心（上轮 setup x0=113+16, y0=51+6）

export_view() { # $1=名字 $2=zoom $3=cw $4=ch
  RES=$(ab eval "
new Promise((resolve) => {
  const E = window.__wbEngine;
  E.zoomAnim = null;
  E.cam.zoom = $2;
  let n = 0;
  const step = () => {
    if (++n < 20) { requestAnimationFrame(step); return; }
    E.cam.x = $CX; E.cam.y = $CY;
    E.frameCount = 480;
    const step2 = () => {
      if (++n < 26) { requestAnimationFrame(step2); return; }
      const cv = document.querySelector('main canvas');
      const t = document.createElement('canvas');
      t.width = $3; t.height = $4;
      const g = t.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(cv, (cv.width - $3) / 2, (cv.height - $4) / 2, $3, $4, 0, 0, $3, $4);
      resolve(t.toDataURL('image/png'));
    };
    requestAnimationFrame(step2);
  };
  requestAnimationFrame(step);
})" 2>/dev/null | tr -d '"\n')
  B64="${RES#data:image/png;base64,}"
  echo "$B64" | base64 -d > "/tmp/qa103/$1.png" 2>/dev/null
  echo "exported $1 (z$2, $(stat -c%s /tmp/qa103/$1.png 2>/dev/null) bytes)"
}

export_view full-z1.2 1.2 640 360
export_view full-z2.4 2.4 640 360
export_view full-z2.6 2.6 640 360
export_view full-z3.5 3.5 640 360
export_view full-z4.5 4.5 640 360
export_view full-z9.5 9.5 640 360
