// PWB Unity Port — Render/DayNightTint.cs (U4)
// 全屏昼夜/季节染色 overlay(契约 §6):fx_dot 白点拉伸为全屏(fx_dot PPU=16 → 1/16 世界单位,
// localScale×16 折算),z=+50(相机前方),sortingOrder=+1000;每帧跟随相机中心与正交尺寸。
// 配色:夜(DayPhase>0.8||<0.2)蓝黑 alpha 峰 0.35 正弦;晨(0.2-0.3)昏(0.7-0.8)橙 0.12;
// 冬(season==3)+0.06 灰蓝;秋(==2)+0.04 橙。
using PWB.Core;
using UnityEngine;

namespace PWB.Render
{
    public sealed class DayNightTint : MonoBehaviour
    {
        public static DayNightTint Instance;

        private SpriteRenderer _sr;

        void Awake()
        {
            Instance = this;
            SpriteFactory.EnsureAll();
            var go = new GameObject("DayNightTint");
            _sr = (SpriteRenderer)go.AddComponent(typeof(SpriteRenderer));
            _sr.sprite = SpriteFactory.S["fx_dot"];
            _sr.sortingOrder = 1000;
            go.transform.position = new Vector3(128f, 80f, 50f);
        }

        void LateUpdate()
        {
            var rig = CameraRig.Instance;
            var cam = rig != null ? rig.Cam : Camera.main;
            if (cam == null) return;

            // 尺寸跟随相机(fx_dot 1px@PPU16 → 世界 1/16:×16 折算,留 4% 余量)
            float h = cam.orthographicSize * 2f * 1.04f;
            float w = h * (Screen.width / (float)Screen.height) * 1.04f;
            var t = _sr.transform;
            t.position = new Vector3(cam.transform.position.x, cam.transform.position.y, 50f);
            t.localScale = new Vector3(w * 16f, h * 16f, 1f);

            var ts = TimeSystem.Instance;
            if (ts == null) { _sr.enabled = false; return; }

            float p = ts.DayPhase;
            float nr = 0f, ng = 0f, nb = 0f, na = 0f;

            // 夜:蓝黑,峰 0.35 正弦渐变
            float nt = -1f;
            if (p >= 0.8f) nt = (p - 0.8f) / 0.2f;
            else if (p <= 0.2f) nt = 1f - p / 0.2f;
            if (nt > 0f)
            {
                float k = 0.35f * Mathf.Sin(nt * Mathf.PI * 0.5f);
                nr += 0.07f * k; ng += 0.10f * k; nb += 0.24f * k; na += k;
            }

            // 晨昏:橙 0.12
            float dt2 = -1f;
            if (p > 0.2f && p < 0.3f) dt2 = (p - 0.2f) / 0.1f;
            else if (p > 0.7f && p < 0.8f) dt2 = (p - 0.7f) / 0.1f;
            if (dt2 > 0f)
            {
                float k = 0.12f * Mathf.Sin(dt2 * Mathf.PI);
                nr += 1f * k; ng += 0.55f * k; nb += 0.25f * k; na += k;
            }

            // 季节:冬灰蓝 / 秋橙
            int season = ts.Season;
            if (season == 3) { nr += 0.55f * 0.06f; ng += 0.62f * 0.06f; nb += 0.75f * 0.06f; na += 0.06f; }
            else if (season == 2) { nr += 1f * 0.04f; ng += 0.6f * 0.04f; nb += 0.3f * 0.04f; na += 0.04f; }

            if (na < 0.01f) { _sr.enabled = false; return; }
            if (na > 0.55f) na = 0.55f;
            _sr.enabled = true;
            _sr.color = new Color(nr / na, ng / na, nb / na, na);
        }
    }
}
