// PWB Unity Port — Core/PwbInput.cs (U1)
// 指针路由:每帧 mousePosition → 世界 tile 坐标(正交手动投影,复用 CameraRig 相机);
// 左键 Down/按住(节流 3 tick)/Up 转发 Powers.ToolSystem.Instance.OnPointer*(tx,ty,button);
// 观察模式下点击转发 UI.InspectorUI.Instance.TryPick(tx,ty)。
// ObserveMode 开关由 U3 ToolSystem 在工具切换时同步(默认 true:开局即观察)。
using UnityEngine;

namespace PWB.Core
{
    public sealed class PwbInput : MonoBehaviour
    {
        public static PwbInput Instance;

        /// <summary>当前是否处于「观察」工具(U3 切工具时写 false;观察时点击走 Inspector 拾取)。</summary>
        public static bool ObserveMode = true;

        private Camera _cam;
        private bool _down;
        private int _lastMoveTick = int.MinValue;

        void Awake() { Instance = this; }

        void Update()
        {
            if (_cam == null)
            {
                if (CameraRig.Instance != null) _cam = CameraRig.Instance.Cam;
                else _cam = Camera.main;
                if (_cam == null) return;
            }

            Vector2 wp = ScreenToWorld(Input.mousePosition);
            int tx = (int)Mathf.Floor(wp.x);
            int ty = (int)Mathf.Floor(wp.y);

            if (Input.GetMouseButtonDown(0))
            {
                var tools = Powers.ToolSystem.Instance;
                if (tools != null) tools.OnPointerDown(tx, ty, 0); // 观察工具侧为空实现(契约 §3)
                if (ObserveMode)
                {
                    var ui = UI.InspectorUI.Instance;
                    if (ui != null) ui.TryPick(tx, ty);
                }
                _down = true;
                _lastMoveTick = CurrentTick();
            }

            if (_down && Input.GetMouseButton(0))
            {
                int t = CurrentTick();
                if (t - _lastMoveTick >= 3) // 节流:每 3 tick 最多一次 OnPointerMove
                {
                    _lastMoveTick = t;
                    var tools = Powers.ToolSystem.Instance;
                    if (tools != null) tools.OnPointerMove(tx, ty, 0);
                }
            }

            if (Input.GetMouseButtonUp(0))
            {
                _down = false;
                var tools = Powers.ToolSystem.Instance;
                if (tools != null) tools.OnPointerUp(tx, ty, 0);
            }
        }

        private static int CurrentTick()
        {
            var ts = TimeSystem.Instance;
            return ts != null ? ts.Tick : 0;
        }

        /// <summary>屏幕坐标 → 世界坐标(正交相机手动投影:中心偏移 × 每像素世界数)。</summary>
        private Vector2 ScreenToWorld(Vector2 m)
        {
            float wpp = (_cam.orthographicSize * 2f) / Screen.height;
            return new Vector2(
                _cam.transform.position.x + (m.x - Screen.width * 0.5f) * wpp,
                _cam.transform.position.y + (m.y - Screen.height * 0.5f) * wpp);
        }

        /// <summary>当前悬停 tile(供 UI/工具提示)。</summary>
        public static Vector2 HoverWorld
        {
            get
            {
                Camera c = CameraRig.Instance != null ? CameraRig.Instance.Cam : Camera.main;
                if (c == null) return Vector2.zero;
                float wpp = (c.orthographicSize * 2f) / Screen.height;
                Vector2 m = Input.mousePosition;
                return new Vector2(
                    c.transform.position.x + (m.x - Screen.width * 0.5f) * wpp,
                    c.transform.position.y + (m.y - Screen.height * 0.5f) * wpp);
            }
        }
    }
}
