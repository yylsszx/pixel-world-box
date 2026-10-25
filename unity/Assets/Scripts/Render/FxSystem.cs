// PWB Unity Port — Render/FxSystem.cs (U4)
// 自研粒子池(契约 §6,不用 ParticleSystem):300 个 SpriteRenderer 预建隐藏,环形游标复用;
// Spawn(kind,x,y,scale):spark/blood/smoke/explosion/lightning/ring/heal/curse 八种;
// Update 推进(位置/缩放插值/颜色插值含 alpha 衰减);explosion/lightning 附带 CameraRig.Shake。
// 随机源用 PWB.Core.Rng(0xFACADE)——契约禁 UnityEngine.Random。
using PWB.Core;
using UnityEngine;

namespace PWB.Render
{
    public sealed class FxSystem : MonoBehaviour, ISystem
    {
        public static FxSystem Instance;

        private const int Pool = 300;

        private struct Par
        {
            public bool On;
            public byte Sid;                        // 0 dot / 1 ring / 2 bolt / 3 cross
            public Vector2 Pos, Vel;
            public float Life, LifeMax, S0, S1, Grav;
            public Color32 C0, C1;
        }

        private readonly Par[] _p = new Par[Pool];
        private readonly SpriteRenderer[] _sr = new SpriteRenderer[Pool];
        private readonly Sprite[] _sprites = new Sprite[4];
        private int _cursor;
        private readonly Rng _rng = new Rng(0xFACADEu);

        void Awake()
        {
            Instance = this;
            SpriteFactory.EnsureAll();
            _sprites[0] = SpriteFactory.S["fx_dot"];
            _sprites[1] = SpriteFactory.S["fx_ring"];
            _sprites[2] = SpriteFactory.S["fx_bolt"];
            _sprites[3] = SpriteFactory.S["fx_cross"];
        }

        void Start()
        {
            var root = new GameObject("Fx");
            for (int i = 0; i < Pool; i++)
            {
                var go = new GameObject("p");
                go.transform.SetParent(root.transform, false);
                var sr = (SpriteRenderer)go.AddComponent(typeof(SpriteRenderer));
                sr.sortingOrder = 300;              // 单位(40-202)之上、昼夜 tint(1000)之下
                sr.enabled = false;
                _sr[i] = sr;
            }
        }

        /// <summary>ISystem 占位(粒子由 Update 驱动)。</summary>
        public void Tick(World w) { }

        // ================= 生成接口(DisasterSystem/CombatSystem/ToolSystem 调用) =================

        public void Spawn(string kind, float x, float y, float scale)
        {
            if (scale <= 0f) scale = 1f;
            switch (kind)
            {
                case "spark":
                    {
                        int n = Mathf.Clamp(Mathf.CeilToInt(6f * scale), 1, 24);
                        for (int i = 0; i < n; i++)
                        {
                            float ang = _rng.Value() * 6.2831853f;
                            float spd = (1.4f + _rng.Value() * 2.2f) * Mathf.Max(0.7f, scale);
                            Emit(0, x, y, Mathf.Cos(ang) * spd, Mathf.Sin(ang) * spd * 0.8f + 1.2f,
                                0.35f + _rng.Value() * 0.3f, 2.2f + _rng.Value() * 2f, 0.4f, -5.5f,
                                new Color32(255, 180, 80, 255), new Color32(255, 240, 210, 160));
                        }
                        break;
                    }
                case "blood":
                    {
                        int n = 8;
                        for (int i = 0; i < n; i++)
                        {
                            float ang = _rng.Value() * 6.2831853f;
                            float spd = (0.8f + _rng.Value() * 2.4f) * Mathf.Max(0.7f, scale);
                            Emit(0, x, y, Mathf.Cos(ang) * spd, Mathf.Sin(ang) * spd + 0.8f,
                                0.28f + _rng.Value() * 0.25f, 2.4f + _rng.Value() * 1.6f, 0.5f, -7f,
                                new Color32(200, 30, 25, 255), new Color32(110, 12, 10, 140));
                        }
                        break;
                    }
                case "smoke":
                    {
                        for (int i = 0; i < 5; i++)
                        {
                            Emit(0, x + (_rng.Value() - 0.5f) * 0.8f, y + (_rng.Value() - 0.5f) * 0.5f,
                                (_rng.Value() - 0.5f) * 0.6f, 0.7f + _rng.Value() * 0.8f,
                                0.8f + _rng.Value() * 0.5f, 5f + _rng.Value() * 3f, 12f + _rng.Value() * 5f, 0.25f,
                                new Color32(125, 125, 130, 150), new Color32(85, 85, 92, 70));
                        }
                        break;
                    }
                case "explosion":
                    {
                        Emit(0, x, y, 0f, 0f, 0.22f, 14f * scale, 26f * scale, 0f,
                            new Color32(255, 245, 205, 255), new Color32(255, 150, 60, 200));      // 闪光
                        Emit(1, x, y, 0f, 0f, 0.5f, 0.7f * scale, 3.2f * scale, 0f,
                            new Color32(255, 215, 140, 230), new Color32(255, 120, 50, 110));     // 冲击环
                        for (int i = 0; i < 16; i++)
                        {
                            float ang = _rng.Value() * 6.2831853f;
                            float spd = (2.5f + _rng.Value() * 4f) * scale;
                            Emit(0, x, y, Mathf.Cos(ang) * spd, Mathf.Sin(ang) * spd * 0.9f + 1f,
                                0.35f + _rng.Value() * 0.35f, 2.5f + _rng.Value() * 2.5f, 0.4f, -5.5f,
                                new Color32(255, 190, 90, 255), new Color32(255, 240, 200, 140));
                        }
                        var rig = CameraRig.Instance;
                        if (rig != null) rig.Shake(0.25f + 0.3f * scale);
                        break;
                    }
                case "lightning":
                    {
                        Emit(2, x, y, 0f, 0f, 0.15f, 2.4f, 2.7f, 0f,
                            new Color32(235, 245, 255, 255), new Color32(170, 200, 255, 170));
                        Emit(2, x + 0.5f, y, 0f, 0f, 0.22f, 1.7f, 2f, 0f,
                            new Color32(210, 230, 255, 120), new Color32(150, 180, 255, 60));
                        var rig = CameraRig.Instance;
                        if (rig != null) rig.Shake(0.12f);
                        break;
                    }
                case "ring":
                    {
                        Emit(1, x, y, 0f, 0f, 0.5f, 0.6f * scale, 2.6f * scale, 0f,
                            new Color32(255, 255, 255, 220), new Color32(200, 220, 255, 90));
                        break;
                    }
                case "heal":
                    {
                        for (int i = 0; i < 3; i++)
                        {
                            Emit(3, x + (_rng.Value() - 0.5f) * 1.4f, y + _rng.Value() * 0.8f,
                                0f, 0.7f + _rng.Value() * 0.5f,
                                0.55f + _rng.Value() * 0.3f, 2f + _rng.Value(), 3.2f, 0f,
                                new Color32(140, 255, 170, 235), new Color32(90, 220, 130, 110));
                        }
                        break;
                    }
                case "curse":
                    {
                        for (int i = 0; i < 5; i++)
                        {
                            Emit(0, x + (_rng.Value() - 0.5f) * 1.6f, y + 0.6f + _rng.Value() * 1.2f,
                                (_rng.Value() - 0.5f) * 0.4f, -1.4f - _rng.Value() * 0.8f,
                                0.5f + _rng.Value() * 0.35f, 2.2f, 1.2f, -1f,
                                new Color32(185, 90, 235, 230), new Color32(110, 40, 160, 110));
                        }
                        break;
                    }
            }
        }

        private void Emit(int sid, float x, float y, float vx, float vy,
            float life, float s0, float s1, float grav, Color32 c0, Color32 c1)
        {
            int i = _cursor;
            _cursor = (_cursor + 1) % Pool;
            _p[i].On = true;
            _p[i].Sid = (byte)sid;
            _p[i].Pos = new Vector2(x, y);
            _p[i].Vel = new Vector2(vx, vy);
            _p[i].Life = life;
            _p[i].LifeMax = life;
            _p[i].S0 = s0;
            _p[i].S1 = s1;
            _p[i].Grav = grav;
            _p[i].C0 = c0;
            _p[i].C1 = c1;
            _sr[i].sprite = _sprites[sid];
            _sr[i].enabled = true;
        }

        void Update()
        {
            float dt = Time.deltaTime;
            if (dt > 0.1f) dt = 0.1f;
            for (int i = 0; i < Pool; i++)
            {
                if (!_p[i].On) continue;
                float life = _p[i].Life - dt;
                if (life <= 0f)
                {
                    _p[i].On = false;
                    _sr[i].enabled = false;
                    continue;
                }
                _p[i].Life = life;
                Vector2 pos = _p[i].Pos;
                Vector2 vel = _p[i].Vel;
                pos.x += vel.x * dt;
                pos.y += vel.y * dt;
                vel.y += _p[i].Grav * dt;
                _p[i].Pos = pos;
                _p[i].Vel = vel;

                float t = 1f - life / _p[i].LifeMax;
                float s = _p[i].S0 + (_p[i].S1 - _p[i].S0) * t;
                var tr = _sr[i].transform;
                tr.position = new Vector3(pos.x, pos.y, 0f);
                tr.localScale = new Vector3(s, s, 1f);
                _sr[i].color = Color32.Lerp(_p[i].C0, _p[i].C1, t);
            }
        }
    }
}
