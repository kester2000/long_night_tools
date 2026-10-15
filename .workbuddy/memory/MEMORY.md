# 长夜工具项目记忆

## 项目结构

- 纯静态 Web 应用（无构建、无依赖），`server.cjs` 仅本地静态服务。
- 核心：messages.js（解析+多视角重建）、engine.js（约束推理/整图验证）、
  local.js（单/双/三区块枚举）、team.js（跨玩家平移对齐）、hypotheses.js
  （传送门假设）、advice.js、timeline.js（按钮门时序）、blocks.js（71 区块数据，
  由 scripts/extract_blocks.py 从 lgtbot 源码提取）。
- UI 数据在 localStorage `long-night-message-notebook-v2`；测试 208 项
  `node --test tests/*.test.cjs`；浏览器测试 tests/browser.cjs 需 Playwright。

## 关键约束与坑

- messages.js 的 parse LRU 缓存：命中必须深拷贝 trajectory tokens
  （buildOne 原地写 token.noSubspace，共享会跨 rebuild 泄漏状态）。
- Edge leveldb：有效 localStorage 最新值在 .log 尾部（UTF-16LE JSON），
  .ldb 大块为 snappy 压缩不可直读。
- matchBlocks 域推导是纯函数且按观测 AND 分解——pair 阶段可用
  domain_A ∩ shift(domain_B) 先筛 ID 再联合核对事件变体与门时序（已实施）。
- index.html 与 chat.html 完全相同（历史遗留双入口）。

## 性能基线（2026-10-11，真实 4 人局）

- T.solve ≈3.0s：pair 55% / preserveTriples 21% / 初始 solveMap+certify 13%。
- 基准脚本 artifacts/bench-*.cjs；样本 tests/fixtures/edge-twist-4p-escape.json。
- 优化计划与细节见仓库根 OPTIMIZATION.md。

## Git 仓库（2026-10-14 已建立并推送）

- 远程 origin：git@github.com:kester2000/long_night_tools.git（SSH，2026-10-14 由 HTTPS 切换）。
- HTTPS 推送在本环境会挂死：credential.helper=helper-selector 非交互环境需认证时挂起，
  Windows 凭据管理器无 GitHub 凭据；SSH 密钥已绑定 kester2000，推送走 SSH。
- 提交惯例：英文 commit message，简要描述变更内容。

## 2026-10-15 更新

- 对审查报告的最新答复已追加至 workbuddy.md 第十节，明确实现范围与规则前提修正。
- 五窗口、合并组地图、候选缩略图主图预览、玩家分回合路径和撞墙标记已实现；挪图已移除。
- 完整地图检查区块唯一、逃生舱数量和联合出生条件，真实四人存档仍为 16 张候选。
- 当前主界面回归以 combined-birth / merged-layouts / workspace / wall-rendering 四个 browser.cjs 专项为准；旧 browser.cjs 包含历史界面断言，不作为新版完整发布检查。
