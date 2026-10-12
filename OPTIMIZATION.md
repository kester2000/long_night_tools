# 优化分析与实施记录（2026-10-11，基于真实对局存档基准）

## 基准数据来源

从 Edge `localStorage`（leveldb `010930.log`）提取的真实 4 人幻变局存档：
14 条消息、9×9、0号/1号 最终逃生。基准脚本 `artifacts/bench-real-archive.cjs`、
`artifacts/bench-stages.cjs`、`artifacts/bench-pairs.cjs`、`artifacts/bench-fused.cjs` 可重复运行。
存档样本已存为 `artifacts/edge-archive-latest.json`（可直接作为 tests/fixtures 用例）。

## 端到端耗时画像（Node 22，本机）

| 阶段 | 耗时 | 占比 | 说明 |
|---|---|---|---|
| 解析 + M.build（4 视角） | 7 ms | — | 已很快 |
| ① solveMap + refine + certify（每视角） | 405 ms | 13% | 4 视角 × 完整域传播 |
| ② local.analyze（单/双/三区块枚举） | 80 ms | 3% | 预算内完成 |
| ③ pair 对齐（6 对 × 81 平移） | **1770 ms** | **55%** | 301 次从头 solveMap + 284 次整图验证（预算 1000） |
| ④ preserveTriples（历史三区块验证） | 674 ms | 21% | 2号 899 组 / 3号 472 组逐组验证 |
| 合计（T.solve） | ~3.0–3.2 s | 100% | 全部在 Worker 后台，不阻塞输入 |

热点结论：**推理时间几乎全部花在「重复推导区块域」上**——同一个视角的观测
在不同平移假设下被一遍遍重新 matchBlocks。

## 已实施 ✅

### 1. `messages.js` parse 结果 LRU 缓存（本次提交）

- `prepare()` 改用 `parseCached()`：以消息文本为 key 的 512 项 LRU。
- 浏览器 UI 中 `settings()` / `checkInput()` / `renderBoard()` / 每-
  视角 `M.build`（N 人局 = N 次全量解析）在每次输入后都重复解析全部消息，
  8 人局长局下每次输入触发数千次重复正则扫描；缓存后全部 O(1) 命中。
- **修复过程中发现的隐患**：缓存命中返回的对象必须深拷贝 trajectory 的
  `tokens`（`buildOne` 前瞻逻辑会原地写 `token.noSubspace`，浅拷贝会跨
  rebuild 泄漏状态——已由 tests/hypotheses 用例回归覆盖）。
- 验证：96/96 测试通过；Node 基准数值不变（该收益在 UI 重复解析路径）。

## 建议清单（按性价比排序）

### P0 — pair 阶段域分解复用（预计 ③ 1770ms → ~400ms）

`team.js` L34-39 对每个候选平移把 A.obs + shift(B.obs) 从头喂给
`solveMap`。而 matchBlocks 对同一 block+origin 的判定是各观测的**逻辑与**，
因此：

```
domain(合并后 slot p) = domain_A(p) ∩ shift(domain_B(q))
```

- `domain_A`：A 视角 9 个 slot 域，每对 (A,B) 只算一次（甚至全 pair 循环共享）。
- `domain_B`：B 坐标系 9 个 slot 域算一次，按平移量索引后取交集。
- 交集非空的 block 再跑 `Timeline.check` 联合门时序验证（含门 block 才需要）。
- 之后照常走现有 edges/requirements 传播 + `verifyCompleteLayout`。
- 语义完全等价（AND 分解），301 次全量 solveMap 降为 18 次域计算 + 集合交。

### P1 — preserveTriples 增量验证（④ 674ms → ~200ms）

2号视角 899 组历史三区块全部逐组 `verifyCompleteLayout(预算80)`。三区块
中若两块相同而仅第三块不同，前两块固定的传播结果可复用；也可把
`verifyStarted` 500ms 窗口内才真验证的策略改为「按组数抽样 + 全量后台」。

### P2 — 仓库卫生

- `index.html` 与 `chat.html` 内容完全相同（cmp 一致）：删一份，另一份留
  或用构建脚本同步，避免双入口漂移。
- `artifacts/` 已 76 MB（bench、截图、engine-before-optimization 快照）：
  已在 .gitignore，但建议归档到外部目录或清理一次性诊断脚本。
- 无 git 仓库：`git init` + 初始提交，保护这次优化和后续回滚能力。
- `tests/fixtures/` 补充 `edge-archive-latest.json` 作为真实局回归用例。

### P3 — 更远期

- **候选平移按证据预排序**：relation 约束多的方向先验证，尽早收缩 offsets。
- **hypotheses.js crossFits 的 81 平移 × solveMap** 与 pair 阶段同构，P0
  的域分解可直接复用。
- **Worker 分片**：视角数 ≥ 4 时按视角拆 postMessage 并行（当前单 worker）。
- **增量 rebuild**：输入新消息时只重算受影响视角与 pair（当前全量重算，
  配合 P0 后收益变小，优先级低）。
