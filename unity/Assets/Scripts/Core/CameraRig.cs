// PWB Unity Port — Core/CameraRig.cs (U1)
// 正交相机操纵:初始化(背景 #0d1b2e,正交尺寸=纵向可见 96 tiles,位置 (128,80,-10));
// 右键/中键拖拽 + WASD/方向键平移(速度 = 可见 tiles/秒 × 0.8);滚轮缩放 32~256 tiles 连续指数插值;
// ClampCam 边界 ±10;Shake(float) 屏幕震动(强度每帧 ×0.9,LateUpdate 随机偏移);
// JumpTo(x,y) 小地图跳转。屏→世界换算用正交手动投影(仅 Screen.width/height + orthographicSize,白名单安全)。
using UnityEngine;

namespace PWB.Core
{
    public sealed class CameraRig : MonoBehaviour
    {
        public static CameraRig Instance;

        public const float MinTiles = 32f, MaxTiles = 256f;  // 缩放范围(可见 tiles)
        public const float InitTiles = 96f;                  // 初始可见 96 tiles
        public const float PanSpeedMul = 0.8f;               // 平移速度 = 可见 tiles/秒 × 0.8
        public const float BorderPad = 10f;                  // ClampCam 边界余量

        public Camera Cam { get; private set; }

        private Vector3 _pos;                 // 权威相机中心(shake 只在 LateUpdate 叠加,不污染)
        private float _tiles = InitTiles;     // 当前可见 tiles(平滑值)
        private float _targetTiles = InitTiles;
        private float _shake;
        private readonly Rng _rng = new Rng(0xC0FFEEu); // 震动随机(禁 UnityEngine.Random)
        private bool _dragging;
        private Vector2 _lastMouse;

        void Awake()
        {
            Instance = this;
            Cam = Camera.main;
            if (Cam == null) Cam = (Camera)new GameObject("PWB Camera").AddComponent(typeof(Camera));
            Cam.orthographic = true;
            Cam.backgroundColor = new Color32(0x0d, 0x1b, 0x2e, 255); // #0d1b2e
            _pos = new Vector3(128f, 80f, -10f);
            Apply();
        }

        private void Apply()
        {
            Cam.orthographicSize = _tiles * 0.5f; // orthographicSize = 半高
        }

        /// <summary>每屏幕像素对应的世界单位数(正交,纵横同密度)。</summary>
        public float WorldPerPixel { get { return _tiles / Screen.height; } }

        void Update()
        {
            float dt = Time.deltaTime;
            if (dt > 0.1f) dt = 0.1f; // 后台归来防跳变

            // —— 滚轮缩放:目标值指数步进 + 连续指数插值逼近 ——
            float sw = Input.GetAxis("Mouse ScrollWheel");
            if (Mathf.Abs(sw) > 0.0001f) Zoom(sw);
            if (_tiles != _targetTiles)
            {
                _tiles = Mathf.Lerp(_tiles, _targetTiles, 1f - Mathf.Exp(-14f * dt));
                if (Mathf.Abs(_tiles - _targetTiles) < 0.02f) _tiles = _targetTiles;
                Apply();
            }

            // —— 平移:右键/中键拖拽 ——
            bool drag = Input.GetMouseButton(1) || Input.GetMouseButton(2);
            Vector2 m = Input.mousePosition;
            if (drag)
            {
                if (_dragging)
                {
                    float wpp = WorldPerPixel;
                    _pos.x -= (m.x - _lastMouse.x) * wpp;
                    _pos.y -= (m.y - _lastMouse.y) * wpp;
                }
                _dragging = true;
            }
            else _dragging = false;
            _lastMouse = m;

            // —— 平移:WASD/方向键(速度=可见 tiles/秒 × 0.8)——
            float spd = _tiles * PanSpeedMul * dt;
            if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow)) _pos.y += spd;
            if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow)) _pos.y -= spd;
            if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow)) _pos.x -= spd;
            if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow)) _pos.x += spd;

            ClampCam();
        }

        /// <summary>相机中心限制在世界边界 ±10 内。</summary>
        public void ClampCam()
        {
            _pos.x = Mathf.Clamp(_pos.x, -BorderPad, World.W + BorderPad);
            _pos.y = Mathf.Clamp(_pos.y, -BorderPad, World.H + BorderPad);
        }

        /// <summary>滚轮缩放(连续指数):delta 为滚轮增量,目标 32~256 tiles。</summary>
        public void Zoom(float delta)
        {
            _targetTiles = Mathf.Clamp(_targetTiles * Mathf.Pow(2f, -delta * 2.5f), MinTiles, MaxTiles);
        }

        /// <summary>屏幕震动(强度累加,每帧 ×0.9 衰减,LateUpdate 随机偏移)。</summary>
        public void Shake(float strength)
        {
            _shake += strength;
            if (_shake > 2f) _shake = 2f;
        }

        /// <summary>小地图/事件跳转:相机中心移到 (x,y)。</summary>
        public void JumpTo(float x, float y)
        {
            _pos.x = x;
            _pos.y = y;
            ClampCam();
        }

        public Vector2 Center { get { return new Vector2(_pos.x, _pos.y); } }
        public float VisibleTiles { get { return _tiles; } }

        void LateUpdate()
        {
            if (_shake > 0f)
            {
                _shake *= 0.9f;
                if (_shake < 0.002f) _shake = 0f;
            }
            float ox = 0f, oy = 0f;
            if (_shake > 0f)
            {
                ox = (_rng.Value() * 2f - 1f) * _shake;
                oy = (_rng.Value() * 2f - 1f) * _shake;
            }
            Cam.transform.position = new Vector3(_pos.x + ox, _pos.y + oy, _pos.z);
        }
    }
}
