# 进度快照（2026-11-02 · HEAD faf4f45 · 分支 cline/dchkq83m）

> 本文件是一次「看进度」的实测对账记录：数字均由本沙箱当场跑命令取得，不引用 worklog 自述。
> 复现命令见文末。

## 1. 结论

- 主线（Unity 迁移 + 网页版基线不动）当前停在 **M-U27「天使光环域」收官**，提交 `faf4f45`，
  工作树干净、与 `origin/main` 同步，无在制品。
- M-U27 四链（黄金 / 镜像 / verify / NUnit）中，**前三链本轮当场复跑全绿**；
  NUnit 因本沙箱无 `dotnet`（每轮沙箱回收后需重装）未复跑，沿用 M-U27 提交时记录 **316 全绿**。
- 引擎级通道共 **61 槽**，宿主已装配 **34 槽（55.7%）**，未装配 27 槽；其中 `rebuildBuckets`、
  `unitsTick` 两槽 **C# 侧已译但宿主未接线**（实为 36 个域已译）。

## 2. 本轮实测证据

| 检查项 | 命令 | 结果 |
| --- | --- | --- |
| 镜像链逐位对账 | `node scripts/unity-migration/tool3-transcript.mjs` | `48/48 场景逐位 ALL PASS` |
| 独立验证器（段 39） | `node scripts/unity-migration/verify-tool3-only.mjs` | `VERIFY-TOOL3: ALL PASS`（台账完备 + **红证 13/13** 旋钮全红） |
| 黄金双写一致性 | `md5sum scripts/unity-migration/golden/tool3.json unity/pixel-world-box/Assets/StreamingAssets/WbGolden/tool3.json` | 两侧同为 `88cfa846bd77466bb207fb3fcfe619e5` |
| 槽位表完整性 | `grep -c 'public const int' .../WbTickOrch.cs` | 61 个槽常量 + 61 个 `SlotNames` 名 |
| 宿主装配度 | `grep -c 'Orch.D\[PixelWorldBox.Wb.WbTickOrch\.' .../WbGameHost.cs` | 34 / 61 |
| C# 内核体量 | `wc -l`（`Assets/Scripts` 递归） | **27,394 行**（WbBail 7,545 / WbCivSim 4,137 / WbUnits 3,510 / WbSprites 2,551） |
| C# 测试件量体 | `wc -l`（`Assets/Tests` 递归） | **13,636 行**（WbGoldenTests 5,219 / WbTool3Tests 1,093） |
| 用例规模 | `[Test]` 170 个 + `[TestCase` 146 条 | NUnit 口径 316 用例（worklog 记录值吻合） |
| 黄金切片数量 | `ls scripts/unity-migration/golden/*.json \| wc -l` | 38 个切片黄金文件 |
| 提交节奏 | `git log --oneline \| wc -l`；首提交 2026-10-25 | 8 天 **188 提交** |

> 注：worklog 记「C# 27,406 行」，本轮实测 27,394 行（差 12 行，属统计口径差异，不影响结论）。

## 3. 未装配的 27 个槽（剩余工作面）

已译未接线（优先补装，成本最低）：
`1 rebuildBuckets`（`WbWorld.RebuildBuckets` L869）、`2 unitsTick`（`WbBail.UnitsTick` L1314）。

未译域（按 worklog 待办优先级）：
`3 panicTick`、`7 radTick`、`8 frontTick`、`10 tradeTick`、`11 defenseTick`、`12 templeTick`、
`13 barracksTick`、`14 banditRaidTick`、`15 dragonSpawnTick`、`17 statsTick`、`18 checkTriggers`、
`19 decalsTick`、`20 fpTick`、`22 snowmanTick`、`23 historyTick`、`24 victoryTick`、`25 warTick`、
`26 worldWarTick`、`28 warInfoTick`、`33 armoryTick`、`35 evolutionTick`、`36 sampleHistory`、
`37 achievementsTick`、`59 WBB.touchMeta`、`60 agentLaws.tick`。

下一里程碑建议（与 M-U27 风险建议一致）：
1. `agentLaws.tick`（槽 60，61 槽中最后一个具名灰盒域）；
2. 武器铸造域 `engine.ts L8723+`（emergentWeapons / doctrineOf / WC_PAYLOAD…，涌现层重件）；
3. `toolsTick` 剩余神力 case（`plagueArea` / `healArea` / `killArea` 孤译待点亮）；
4. Unity Test Runner 用户侧首跑（C# 侧 316 全绿背书，StreamingAssets 四 JSON 在册）。

## 4. 纪律面状态

- **网页版基线零触碰**：`git status` 干净，本快照未改 `src/`、未改引擎；「网页版唯一回归基准」成立。
- **黄金体量红线（R3）**：`golden/tool3.json` 实测 790,444 字节（≈772KB）< 1MB。
- **红证纪律**：13 个 `TOOL3_RED` 旋钮逐个验证「禁写面 → 对应场景 FAIL → 还原复绿」。

## 5. 复现脚本

```bash
cd /workspace/scripts/unity-migration
node tool3-transcript.mjs            # 镜像 48/48
node verify-tool3-only.mjs           # 段 39：台账 + 13 红证
md5sum golden/tool3.json ../../unity/pixel-world-box/Assets/StreamingAssets/WbGolden/tool3.json
cd /workspace
grep -c 'Orch.D\[PixelWorldBox.Wb.WbTickOrch\.' unity/pixel-world-box/Assets/Scripts/Host/WbGameHost.cs
find unity/pixel-world-box/Assets/Scripts -name '*.cs' | xargs wc -l | tail -1
```

未跑项（需先恢复工具链）：`dotnet test unity/pixel-world-box/Wb.Tests.csproj`（沙箱无 dotnet，需按
`scripts/dotnet-install.sh` 重装后再跑 316 用例）。
