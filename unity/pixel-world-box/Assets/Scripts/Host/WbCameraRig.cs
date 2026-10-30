// WbCameraRig.cs — M-U7 整合 b：相机/输入薄壳（宿主域，Unity only）
// ============================================================
// 蓝本锚（engine.ts 宿主侧输入协议——数值语义逐条机械对齐）：
//   - cam 初值 {x: W/2, y: H/2, zoom: 4.5}（engine.ts L681/L932）
//   - screenToWorld: wx = (px - cw/2)/zoom + cam.x（engine.ts L13455-13458）
//   - zoomAt: target = max(0.6, min(24, base*factor))（engine.ts L13472）；|factor-1|<0.0006 忽略（L13465）
//   - clampCam: cam.x ∈ [-10, W+10]、cam.y ∈ [-10, H+10]（engine.ts L13504-13508）
//   - pan: cam.x += dx/zoom（engine.ts L13492-13493——dx 正 = 镜头右移、内容反向）
// Unity 换算协议（本壳定义，宿主域）：1 tile = 1 世界单位；cam.zoom = 屏幕像素/用户空间像素
//   （用户空间 4px/tile，WbRender.W2 注释同源）→ 正交半高（tile）= Screen.height/(8*zoom)；
//   相机 transform.position = (cam.x, cam.y)（cam.y = 视口中心 tile 坐标，screenToWorld 中心行同构）。
// WbWorld 坐标系：tile (0,0) 左上 → Unity 世界 (0,159)（Y 翻转在呈现侧统一处理）。
// ============================================================
using UnityEngine;

namespace PixelWorldBox.Host
{
    public class WbCameraRig : MonoBehaviour
    {
        public double camX = 128, camY = 80, zoom = 4.5;   // engine.ts L681 初值
        public const double ZoomMin = 0.6, ZoomMax = 24;   // engine.ts L13472 钳制
        public const double DragThresh = 0.0006;           // engine.ts L13465 zoomAt 忽略阈

        Camera _cam;
        bool _dragging;
        Vector3 _lastMouse;

        void Awake()
        {
            _cam = Camera.main;
            if (_cam == null) _cam = gameObject.AddComponent<Camera>();
            _cam.transform.position = new Vector3((float)camX, (float)camY, -10f);
            _cam.orthographic = true;
            _cam.backgroundColor = new Color32(13, 27, 46, 255);   // DEEP_BG '#0d1b2e'（render.ts L10）
            _cam.clearFlags = CameraClearFlags.SolidColor;
        }

        void Update()
        {
            // 滚轮缩放（zoomAt 语义：锚点世界坐标钉在光标位——经典地图推拉）
            var wheel = Input.mouseScrollDelta.y;
            if (Mathf.Abs(wheel) > 0.001f)
            {
                float factor = Mathf.Pow(1.15f, wheel);
                var mp = Input.mousePosition;
                ZoomAt(new Vector2(mp.x, mp.y), factor);   // Vector3→Vector2 无隐式转换（真 Unity API 语义）
            }

            // 右键/中键拖拽平移（pan 语义：dx/zoom；镜头反向于内容）
            if (Input.GetMouseButtonDown(1) || Input.GetMouseButtonDown(2))
            {
                _dragging = true;
                _lastMouse = Input.mousePosition;
            }
            if (Input.GetMouseButtonUp(1) || Input.GetMouseButtonUp(2)) _dragging = false;
            if (_dragging)
            {
                var m = Input.mousePosition;
                // 屏幕向右拖 → dx 负 → 镜头左移 → 内容跟手（L13488-13491 统一修复语义）
                Pan(_lastMouse.x - m.x, m.y - _lastMouse.y);
                _lastMouse = m;
            }

            ApplyCamera();
        }

        /// <summary>engine.ts zoomAt（L13463-13477 宿主域简化版：无缓动动画，直接落位——
        /// 缓动为纯手感域，位精确对账面不涉及；锚点回写 = before 世界点钉回光标屏位）</summary>
        public void ZoomAt(Vector2 screenPx, float factor)
        {
            if (System.Math.Abs(factor - 1.0) < DragThresh) return;
            var before = ScreenToWorld(screenPx.x, screenPx.y);
            zoom = System.Math.Max(ZoomMin, System.Math.Min(ZoomMax, zoom * factor));
            var after = ScreenToWorld(screenPx.x, screenPx.y);
            camX += before.wx - after.wx;
            camY += before.wy - after.wy;
            ClampCam();
        }

        /// <summary>engine.ts pan（L13491-13493）</summary>
        public void Pan(float dxPx, float dyPx)
        {
            camX += dxPx / zoom;
            camY += dyPx / zoom;
            ClampCam();
        }

        /// <summary>engine.ts screenToWorld（L13455-13458 机械对齐；cw/ch = Screen 尺寸）</summary>
        public (double wx, double wy) ScreenToWorld(float px, float py)
        {
            return ((px - Screen.width / 2f) / zoom + camX,
                    (py - Screen.height / 2f) / zoom + camY);
        }

        /// <summary>engine.ts clampCam（L13504-13508 机械对齐）</summary>
        public void ClampCam()
        {
            camX = System.Math.Max(-10.0, System.Math.Min(PixelWorldBox.Wb.WbWorld.W + 10.0, camX));
            camY = System.Math.Max(-10.0, System.Math.Min(PixelWorldBox.Wb.WbWorld.H + 10.0, camY));
        }

        void ApplyCamera()
        {
            _cam.transform.position = new Vector3((float)camX, (float)camY, -10f);
            // orthoSize（半高 tile 数）= 屏高像素 / 2 / 4px用户空间 × 8px设备每tile = Screen.height/(8*zoom)
            _cam.orthographicSize = Screen.height / (8f * (float)zoom);
        }
    }
}
