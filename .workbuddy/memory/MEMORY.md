# 长夜工具项目记忆

## 项目结构

- 纯静态 Web 应用（无构建、无依赖），`server.cjs` 仅本地静态服务。
- 核心：messages.js（解析+多视角重建）、engine.js（约束推理/整图验证）、
  local.js（单/双/三区块枚举）、team.js（跨玩家平移对齐）、hypotheses.js
  （传送门假设）、advice.js、timeline.js（按钮门时序）、blocks.js（71 区块数据，
  由 scripts/extract_blocks.py 从 lgtbot 源码提取）。
- UI 数据在 localStorage `long-night-message-notebook-v2`；测试 96 项
  `node --test tests/*.test.cjs`；浏览器测试 tests/browser.cjs 需 Playwright。

## 关键约束与坑

- messages.js 的 parse LRU 缓存：命中必须深拷贝 trajectory tokens
  （buildOne 原地写 token.noSubspace，共享会跨 rebuild 泄漏状态）。
- Edge leveldb：有效 localStorage 最新值在 .log 尾部（UTF-16LE JSON），
  .ldb 大块为 snappy 压缩不可直读。
- matchBlocks 域推导是纯函数且按观测 AND 分解——pair 阶段可用
  domain_A ∩ shift(domain_B) 替代全量 solveMap（P0 优化，未实施）。
- index.html 与 chat.html 完全相同（历史遗留双入口）。

## 性能基线（2026-10-11，真实 4 人局）

- T.solve ≈3.0s：pair 55% / preserveTriples 21% / 初始 solveMap+certify 13%。
- 基准脚本 artifacts/bench-*.cjs；样本 tests/fixtures/edge-twist-4p-escape.json。
- 优化计划与细节见仓库根 OPTIMIZATION.md。

## 无 git 仓库（截至 2026-10-11）

建议尽快 `git init` 建立基线提交。
