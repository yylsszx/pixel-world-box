// UnityEngine API 桩(仅用于离线 dotnet 编译验证;Unity 内构建时本文件被 csproj 条件排除)。
// 覆盖契约 §2 白名单。签名与 Unity 6 对齐(足够编译期类型检查)。
using System;
using System.Collections.Generic;

#pragma warning disable 0169, 0649, 0219, 0414

namespace UnityEngine
{
    // ---------- 基础数学 ----------
    public struct Vector2
    {
        public float x, y;
        public Vector2(float x, float y) { this.x = x; this.y = y; }
        public static Vector2 zero { get { return new Vector2(0, 0); } }
        public static Vector2 one { get { return new Vector2(1, 1); } }
        public static Vector2 operator +(Vector2 a, Vector2 b) { return new Vector2(a.x + b.x, a.y + b.y); }
        public static Vector2 operator -(Vector2 a, Vector2 b) { return new Vector2(a.x - b.x, a.y - b.y); }
        public static Vector2 operator *(Vector2 a, float d) { return new Vector2(a.x * d, a.y * d); }
        public static Vector2 operator *(float d, Vector2 a) { return new Vector2(a.x * d, a.y * d); }
    }
    public struct Vector3
    {
        public float x, y, z;
        public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
        public static Vector3 zero { get { return new Vector3(0, 0, 0); } }
        public static Vector3 one { get { return new Vector3(1, 1, 1); } }
        public static Vector3 back { get { return new Vector3(0, 0, -1); } }
        public static Vector3 operator +(Vector3 a, Vector3 b) { return new Vector3(a.x + b.x, a.y + b.y, a.z + b.z); }
        public static Vector3 operator -(Vector3 a, Vector3 b) { return new Vector3(a.x - b.x, a.y - b.y, a.z - b.z); }
        public static Vector3 operator *(Vector3 a, float d) { return new Vector3(a.x * d, a.y * d, a.z * d); }
        public static implicit operator Vector2(Vector3 v) { return new Vector2(v.x, v.y); }
    }
    public struct Vector4 { public float x, y, z, w; public Vector4(float x, float y, float z, float w) { this.x = x; this.y = y; this.z = z; this.w = w; } }

    public struct Color
    {
        public float r, g, b, a;
        public Color(float r, float g, float b, float a = 1f) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public static Color white { get { return new Color(1, 1, 1, 1); } }
        public static Color black { get { return new Color(0, 0, 0, 1); } }
        public static Color gray { get { return new Color(0.5f, 0.5f, 0.5f, 1); } }
        public static Color clear { get { return new Color(0, 0, 0, 0); } }
    }
    public struct Color32
    {
        public byte r, g, b, a;
        public Color32(byte r, byte g, byte b, byte a) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public static Color32 white { get { return new Color32(255, 255, 255, 255); } }
        public static implicit operator Color32(Color c) { return new Color32((byte)(c.r * 255), (byte)(c.g * 255), (byte)(c.b * 255), (byte)(c.a * 255)); }
        public static implicit operator Color(Color32 c) { return new Color(c.r / 255f, c.g / 255f, c.b / 255f, c.a / 255f); }
        public static Color32 Lerp(Color32 a, Color32 b, float t)
        {
            return new Color32((byte)(a.r + (b.r - a.r) * t), (byte)(a.g + (b.g - a.g) * t), (byte)(a.b + (b.b - a.b) * t), (byte)(a.a + (b.a - a.a) * t));
        }
    }

    public static class Mathf
    {
        public const float PI = 3.14159274f;
        public static float Sin(float f) { return (float)Math.Sin(f); }
        public static float Cos(float f) { return (float)Math.Cos(f); }
        public static float Atan2(float y, float x) { return (float)Math.Atan2(y, x); }
        public static float Sqrt(float f) { return (float)Math.Sqrt(f); }
        public static float Abs(float f) { return Math.Abs(f); }
        public static int Abs(int f) { return Math.Abs(f); }
        public static float Min(float a, float b) { return a < b ? a : b; }
        public static float Max(float a, float b) { return a > b ? a : b; }
        public static int Min(int a, int b) { return a < b ? a : b; }
        public static int Max(int a, int b) { return a > b ? a : b; }
        public static float Clamp(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
        public static float Clamp01(float v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
        public static int Clamp(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }
        public static int Round(float f) { return (int)Math.Round(f); }
        public static int Floor(float f) { return (int)Math.Floor(f); }
        public static int CeilToInt(float f) { return (int)Math.Ceiling(f); }
        public static int FloorToInt(float f) { return (int)Math.Floor(f); }
        public static float Pow(float f, float p) { return (float)Math.Pow(f, p); }
        public static float Lerp(float a, float b, float t) { return a + (b - a) * t; }
        public static float Exp(float f) { return (float)Math.Exp(f); }
    }

    // ---------- 时间/输入 ----------
    public static class Time
    {
        public static float deltaTime = 0.016f;
        public static float time;
        public static int frameCount;
        public static float fixedDeltaTime = 0.02f;
    }
    public static class Screen
    {
        public static int width = 1280;
        public static int height = 720;
    }
    public struct KeyCodeValues { }
    public enum KeyCode { Mouse0, Mouse1, Mouse2, W, A, S, D, UpArrow, DownArrow, LeftArrow, RightArrow, Space, Escape, X, Alpha1, Alpha2, Alpha3 }
    public static class Input
    {
        public static Vector3 mousePosition = new Vector3(640, 360, 0);
        public static bool GetMouseButtonDown(int b) { return false; }
        public static bool GetMouseButton(int b) { return false; }
        public static bool GetMouseButtonUp(int b) { return false; }
        public static bool GetKey(KeyCode k) { return false; }
        public static bool GetKeyDown(KeyCode k) { return false; }
        public static bool GetKeyUp(KeyCode k) { return false; }
        public static float GetAxis(string axis) { return 0f; }
    }

    // ---------- 引擎对象 ----------
    public class Object { public string name; public static void Destroy(Object o) { } }
    public class GameObject : Object
    {
        public Transform transform = new Transform();
        public GameObject() { }
        public GameObject(string name) { this.name = name; }
        public T AddComponent<T>() where T : Component, new() { var c = new T(); c.gameObject = this; return c; }
        public Component AddComponent(Type t) { return null; }
        public T GetComponent<T>() where T : class { return null; }
        public void SetActive(bool v) { }
        public static GameObject Find(string n) { return null; }
    }
    public class Component : Object { public GameObject gameObject; public Transform transform; }
    public class Transform : Component
    {
        public Vector3 position = new Vector3(0, 0, 0);
        public Vector3 localPosition = new Vector3(0, 0, 0);
        public Vector3 localScale = new Vector3(1, 1, 1);
        public void SetParent(Transform p) { }
        public void SetParent(Transform p, bool worldPositionStays) { }
    }
    public class MonoBehaviour : Component
    {
        public bool enabled = true;
        public GameObject gameObject2 { get { return gameObject; } }
        public void StartCoroutine(System.Collections.IEnumerator e) { }
        public void StopAllCoroutines() { }
    }
    public class WaitForSeconds { public WaitForSeconds(float s) { } }
    public class YieldInstruction { }

    public class Shader { public static Shader Find(string name) { return new Shader(); } }
    public class Material : Object { public Material(Shader s) { } }
    public enum FilterMode { Point = 0, Bilinear = 1 }
    public enum TextureWrapMode { Clamp = 0, Repeat = 1 }
    public enum TextureFormat { RGBA32 = 3 }

    public class Texture2D : Texture
    {
        public int width, height;
        public FilterMode filterMode;
        public TextureWrapMode wrapMode;
        public Texture2D(int w, int h, TextureFormat f, bool mip) { width = w; height = h; }
        public void SetPixel(int x, int y, Color c) { }
        public void SetPixels32(Color32[] px) { }
        public Color32[] GetPixels32() { return null; }
        public void Apply() { }
        public void Apply(bool updateMipmaps) { }
        public void Apply(bool updateMipmaps, bool makeNoLongerReadable) { }
    }

    public class Sprite : Object
    {
        public Rect rect;
        public static Sprite Create(Rect r, Vector2 pivot, float ppu) { return new Sprite(); }
        public static Sprite Create(Rect r, Vector2 pivot, Vector4 border, float ppu) { return new Sprite(); }
        public static Sprite Create(Texture2D tex, Rect r, Vector2 pivot, float ppu) { return new Sprite(); }
        public static Sprite Create(Texture2D tex, Rect r, Vector2 pivot, float ppu, uint extrude, TextureWrapMode wrap, Vector4 border, float ppu2) { return new Sprite(); }
    }
    public class SpriteRenderer : Component
    {
        public Sprite sprite;
        public int sortingOrder;
        public Color color = new Color(1, 1, 1, 1);
        public bool flipX;
        public bool enabled = true;
        public Material material;
    }
    public class Camera : Component
    {
        public static Camera main = new Camera();
        public bool orthographic = true;
        public float orthographicSize = 48f;
        public Color backgroundColor;
        public static Vector3 ScreenToWorldPoint(Vector3 p) { return p; }
        public void Render() { }
    }
    public class AudioListener : Component { }

    public static class Debug
    {
        public static void Log(object o) { }
        public static void LogWarning(object o) { }
        public static void LogError(object o) { }
    }
    public static class Application
    {
        public static bool isMobilePlatform = false;
        public static int targetFrameRate = -1;
        public static bool isPlaying;
    }
    public class JsonUtility { public static string ToJson(object o) { return ""; } public static T FromJson<T>(string s) { return default(T); } }

    public enum RuntimeInitializeLoadType { AfterSceneLoad = 1 }
    public class RuntimeInitializeOnLoadMethodAttribute : Attribute
    {
        public RuntimeInitializeLoadType loadType;
        public RuntimeInitializeOnLoadMethodAttribute() { }
        public RuntimeInitializeOnLoadMethodAttribute(RuntimeInitializeLoadType t) { loadType = t; }
    }

    // ---------- IMGUI ----------
    public struct Rect
    {
        public float x, y, width, height;
        public Rect(float x, float y, float w, float h) { this.x = x; this.y = y; width = w; height = h; }
        public float xMax { get { return x + width; } }
        public float yMax { get { return y + height; } }
        public bool Contains(Vector2 p) { return p.x >= x && p.x < x + width && p.y >= y && p.y < y + height; }
    }
    public class GUIStyle { public int fontSize = 13; public UnityEngine.Color normalColorRef; public TextAlign alignment; }
    public enum TextAlign { Left, Center, Right }
    public class Event { public static Event current = new Event(); public EventType type; public Vector2 mousePosition; public void Use() { } }
    public enum EventType { MouseDown, MouseUp, MouseDrag, Repaint, Layout, Used }
    public static class GUI
    {
        public static Color color = new Color(1, 1, 1, 1);
        public static void Box(Rect r, string text) { }
        public static void Box(Rect r, string text, GUIStyle s) { }
        public static void Label(Rect r, string text) { }
        public static void Label(Rect r, string text, GUIStyle s) { }
        public static bool Button(Rect r, string text) { return false; }
        public static bool Button(Rect r, string text, GUIStyle s) { return false; }
        public static string TextField(Rect r, string text) { return text; }
        public static void BeginArea(Rect r) { }
        public static void EndArea() { }
        public static void DrawTexture(Rect r, Texture tex) { }
        public static Vector2 BeginScrollView(Rect r, Vector2 pos) { return pos; }
        public static void EndScrollView() { }
        public static float HorizontalSlider(Rect r, float v, float lo, float hi) { return v; }
    }
    public static class GUILayout
    {
        public static void Label(string t) { }
        public static void Label(string t, GUIStyle s) { }
        public static void Label(string t, params GUILayoutOption[] opt) { }
        public static bool Button(string t) { return false; }
        public static bool Button(string t, GUIStyle s) { return false; }
        public static bool Button(string t, params GUILayoutOption[] opt) { return false; }
        public static void Box(string t) { }
        public static void Box(string t, params GUILayoutOption[] opt) { }
        public static void BeginHorizontal() { }
        public static void EndHorizontal() { }
        public static void BeginVertical() { }
        public static void EndVertical() { }
        public static void BeginArea(Rect r) { }
        public static void EndArea() { }
        public static void FlexibleSpace() { }
        public static int SelectionGrid(int sel, string[] labels, int cols) { return sel; }
        public static int Toolbar(int sel, string[] labels) { return sel; }
        public static float HorizontalSlider(float v, float lo, float hi) { return v; }
        public static float HorizontalSlider(float v, float lo, float hi, params GUILayoutOption[] opt) { return v; }
        public static GUILayoutOption Width(float w) { return new GUILayoutOption(); }
        public static GUILayoutOption Height(float h) { return new GUILayoutOption(); }
        public static GUILayoutOption MinWidth(float w) { return new GUILayoutOption(); }
        public static GUILayoutOption ExpandWidth(bool e) { return new GUILayoutOption(); }
    }
    public class GUILayoutOption { }
    public static class GUILayoutUtility { }
    public class Texture : Object { }
    public class GUIStyleState { }
}
