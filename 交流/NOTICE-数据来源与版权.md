# 数据来源

区块布局、编号、名称和模式池提取自本地 lgtbot 项目的 `games/long_night/map.h`。

上游源代码版权标识：Copyright (c) 2018-present, JiaQi Yu <github.com/tiedanGH>。上游说明其源码采用 LGPLv2，仓库附带 GNU Lesser General Public License 2.1 文本；随本工具保留该文本为 `LICENSE.lgtbot`。

提取脚本 `scripts/extract_blocks.py` 保留区块数据来源和 SHA256，可从更新后的上游重新生成 `blocks.js`。辅助界面和推理实现与游戏程序独立运行。

墙边贴图直接复制自 lgtbot 的 `games/long_night/resource/classic/walls/`，保存在 `assets/lgtbot/classic/walls/`。普通墙、空边、树篱、关闭门及开启门分别对应 `wall`、`empty`、`hedge`、`door`、`dooropen`，横纵贴图保持上游原样。

金币与按钮贴图直接复制自同一经典主题的 `coin.png` 和 `button.png`，保存在 `assets/lgtbot/classic/`，保持原图及整格居中缩放方式。
