// PWB Unity Port — Render/MapRenderer.cs (U4)
// 地图直绘(契约 §6,不用 Tilemap):单张 256×160 RGBA32 Texture2D,逐 tile 调 Map.TileDefs.TileColor;
// SetTileDirty(x,y) 增量脏格(当帧改 _pix,每帧最多一次 SetPixels32+Apply 整体上传);
// 水/岩浆动画:每 8 帧(Time.frameCount)全图轻扫重算动画格(等价于水体行带包围盒,且自动覆盖地形变迁);
// 火焰染色(fire>0 橙红闪烁);owner 领土染色(30 帧差分扫描,国界加浓)。
// 展示:GameObject+SpriteRenderer(PPU=1 → 恰好 256×160 世界单位),position(128,80,0),sortingOrder=-10。
// 另含建筑层(池化 SpriteRenderer,30 帧差分扫描 w.building;owner=-1 的残垣画焦暗色)。
using System.Collections.Generic;
using PWB.Civ;
using PWB.Core;
using PWB.Map;
using UnityEngine;

namespace PWB.Render
{
    public sealed class MapRenderer : MonoBehaviour
    {
        public static MapRenderer Instance;

        private Texture2D _tex;
        private readonly Color32[] _pix = new Color32[World.Size];
        private readonly short[] _paintedOwner = new short[World.Size];
        private bool _dirty;
        private int _frame = -1;
        private int _lastOwnerScan = -1000;
        private int _lastBuildScan = -1015;

        private readonly Dictionary<int, Color32> _kcolors = new Dictionary<int, Color32>(24);
        private SpriteRenderer _mapSr;

        // —— 建筑层 ——
        private Transform _buildRoot;
        private readonly Dictionary<int, SpriteRenderer> _bmap = new Dictionary<int, SpriteRenderer>(256);
        private readonly Dictionary<int, int> _bkind = new Dictionary<int, int>(256);
        private readonly List<SpriteRenderer> _bfree = new List<SpriteRenderer>(64);
        private readonly List<int> _bgc = new List<int>(64);
        private Sprite[] _bspr;

        void Awake()
        {
            Instance = this;
            SpriteFactory.EnsureAll();
            _tex = new Texture2D(World.W, World.H, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Point,
                wrapMode = TextureWrapMode.Clamp,
            };
            for (int i = 0; i < World.Size; i++) _paintedOwner[i] = -1;
            _bspr = new Sprite[9];
            _bspr[(int)BuildingKind.House] = SpriteFactory.S["b_house"];
            _bspr[(int)BuildingKind.Capital] = SpriteFactory.S["b_capital"];
            _bspr[(int)BuildingKind.Farm] = SpriteFactory.S["b_farm"];
            _bspr[(int)BuildingKind.Barracks] = SpriteFactory.S["b_barracks"];
            _bspr[(int)BuildingKind.Temple] = SpriteFactory.S["b_temple"];
            _bspr[(int)BuildingKind.Wall] = SpriteFactory.S["b_wall"];
            _bspr[(int)BuildingKind.Market] = SpriteFactory.S["b_market"];
            _bspr[(int)BuildingKind.Port] = SpriteFactory.S["b_port"];
        }

        void Start()
        {
            // 展示 quad:PPU=1 → 256×160 世界单位(1 tile = 1 unit)
            var go = new GameObject("MapQuad");
            _mapSr = (SpriteRenderer)go.AddComponent(typeof(SpriteRenderer));
            _mapSr.sprite = Sprite.Create(_tex, new Rect(0f, 0f, World.W, World.H), new Vector2(0.5f, 0.5f), 1f);
            go.transform.position = new Vector3(World.W * 0.5f, World.H * 0.5f, 0f);
            _mapSr.sortingOrder = -10;

            _buildRoot = new GameObject("Buildings").transform;

            RepaintAll();
        }

        /// <summary>全图重绘(Start 与 TopBarUI「新世界」调用)。</summary>
        public void RepaintAll()
        {
            var w = World.Instance;
            if (w == null) return;
            for (int i = 0; i < World.Size; i++)
            {
                _pix[i] = ComputeTile(w, i, _frame < 0 ? 0 : _frame);
                _paintedOwner[i] = w.owner[i];
            }
            _dirty = true;
        }

        /// <summary>脏格(TerrainSystem/FireSystem/ToolSystem 笔刷调用):立即重算并入本帧上传批。</summary>
        public void SetTileDirty(int x, int y)
        {
            var w = World.Instance;
            if (w == null || !w.InBounds(x, y)) return;
            int i = w.Idx(x, y);
            _pix[i] = ComputeTile(w, i, _frame < 0 ? 0 : _frame);
            _dirty = true;
        }

        void Update()
        {
            var w = World.Instance;
            if (w == null) return;
            int fc = Time.frameCount;
            int frame = (fc >> 3) & 3;               // 4 帧水动画,每 8 渲染帧推进
            if (frame != _frame)
            {
                _frame = frame;
                AnimatePass(w, frame);
            }
            if (fc - _lastOwnerScan >= 30) { _lastOwnerScan = fc; OwnerScan(w, frame); }
            if (fc - _lastBuildScan >= 30) { _lastBuildScan = fc; BuildingScan(w); }
            if (_dirty)
            {
                _tex.SetPixels32(_pix);
                _tex.Apply(false);
                _dirty = false;
            }
        }

        /// <summary>水/岩浆/火 动画格重算(全图轻扫;只重算水/岩浆/着火格,与已绘色比对后按需上传)。</summary>
        private void AnimatePass(World w, int frame)
        {
            byte water = (byte)Terrain.Water, lava = (byte)Terrain.Lava;
            var terrain = w.terrain;
            var fire = w.fire;
            for (int i = 0; i < World.Size; i++)
            {
                byte t = terrain[i];
                if (t != water && t != lava && fire[i] == 0) continue;
                Color32 c = ComputeTile(w, i, frame);
                if (c.r != _pix[i].r || c.g != _pix[i].g || c.b != _pix[i].b)
                {
                    _pix[i] = c;
                    _dirty = true;
                }
            }
        }

        /// <summary>归属差分扫描:owner 变化格(及其 4 邻,供国界加浓)重染。</summary>
        private void OwnerScan(World w, int frame)
        {
            var owner = w.owner;
            bool any = false;
            for (int i = 0; i < World.Size; i++)
            {
                short o = owner[i];
                if (o == _paintedOwner[i]) continue;
                _paintedOwner[i] = o;
                _pix[i] = ComputeTile(w, i, frame);
                any = true;
                int x = i % World.W, y = i / World.W;
                if (x > 0) { int j = i - 1; _pix[j] = ComputeTile(w, j, frame); }
                if (x < World.W - 1) { int j = i + 1; _pix[j] = ComputeTile(w, j, frame); }
                if (y > 0) { int j = i - World.W; _pix[j] = ComputeTile(w, j, frame); }
                if (y < World.H - 1) { int j = i + World.W; _pix[j] = ComputeTile(w, j, frame); }
            }
            if (any) _dirty = true;
        }

        /// <summary>tile 合成色 = TileColor 基色 + 王国领染色(国界加浓)+ 火焰橙红。</summary>
        private Color32 ComputeTile(World w, int i, int frame)
        {
            int x = i % World.W, y = i / World.W;
            Color32 c = TileDefs.TileColor((Terrain)w.terrain[i], w, x, y, frame);
            short o = w.owner[i];
            if (o >= 0)
            {
                bool border = (x > 0 && w.owner[i - 1] != o)
                    || (x < World.W - 1 && w.owner[i + 1] != o)
                    || (y > 0 && w.owner[i - World.W] != o)
                    || (y < World.H - 1 && w.owner[i + World.W] != o);
                c = Color32.Lerp(c, KingdomColor(o), border ? 0.55f : 0.26f);
            }
            if (w.fire[i] > 0)
            {
                float f = 0.55f + 0.15f * ((frame + i) & 1);
                c = Color32.Lerp(c, new Color32(255, 150, 40, 255), f);
            }
            return c;
        }

        private Color32 KingdomColor(int id)
        {
            Color32 c;
            if (_kcolors.TryGetValue(id, out c)) return c;
            var ks = KingdomSystem.Instance;
            var k = ks != null ? ks.Get(id) : null;
            c = k != null ? HexToColor(k.ColorHex) : new Color32(200, 200, 200, 255);
            _kcolors[id] = c;
            return c;
        }

        private static Color32 HexToColor(string hex)
        {
            if (hex == null || hex.Length < 7 || hex[0] != '#') return new Color32(200, 200, 200, 255);
            try
            {
                byte r = System.Convert.ToByte(hex.Substring(1, 2), 16);
                byte g = System.Convert.ToByte(hex.Substring(3, 2), 16);
                byte b = System.Convert.ToByte(hex.Substring(5, 2), 16);
                return new Color32(r, g, b, 255);
            }
            catch { return new Color32(200, 200, 200, 255); }
        }

        // ================= 建筑层(池化 SpriteRenderer) =================

        private void BuildingScan(World w)
        {
            var building = w.building;
            var owner = w.owner;

            // 消失/换型 → 回收;残垣(owner=-1)焦暗色
            _bgc.Clear();
            foreach (var kv in _bmap)
            {
                int i = kv.Key;
                int b = building[i];
                int painted;
                _bkind.TryGetValue(i, out painted);
                if (b == 0 || b != painted) { _bgc.Add(i); continue; }
                kv.Value.color = owner[i] >= 0 ? Color32.white : new Color32(158, 148, 138, 255);
            }
            for (int n = 0; n < _bgc.Count; n++)
            {
                int i = _bgc[n];
                var sr = _bmap[i];
                sr.enabled = false;
                _bfree.Add(sr);
                _bmap.Remove(i);
                _bkind.Remove(i);
            }

            // 新增
            for (int i = 0; i < World.Size; i++)
            {
                byte b = building[i];
                if (b == 0 || _bmap.ContainsKey(i)) continue;
                if (b >= _bspr.Length || _bspr[b] == null) continue;
                if (_bfree.Count == 0 && _bmap.Count >= 4096) break; // 池上限(全图 tile 数)
                SpriteRenderer sr;
                if (_bfree.Count > 0)
                {
                    sr = _bfree[_bfree.Count - 1];
                    _bfree.RemoveAt(_bfree.Count - 1);
                }
                else
                {
                    var go = new GameObject("b");
                    go.transform.SetParent(_buildRoot, false);
                    sr = (SpriteRenderer)go.AddComponent(typeof(SpriteRenderer));
                    sr.sortingOrder = -5;
                }
                sr.sprite = _bspr[b];
                sr.color = owner[i] >= 0 ? Color32.white : new Color32(158, 148, 138, 255);
                int x = i % World.W, y = i / World.W;
                sr.transform.position = new Vector3(x + 0.5f, y + 0.5f, 0f);
                sr.enabled = true;
                _bmap[i] = sr;
                _bkind[i] = b;
            }
        }
    }
}
