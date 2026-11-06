# 架构决策目录

状态说明：

- **Current**：当前有效，代码/发布应按此执行；
- **Historical**：历史设计或早期方案，仅作背景参考，不代表当前实现；
- **Superseded**：已被后续 ADR 取代；
- **Proposed**：规划中，尚未实现。

| ADR | 主题 | 状态 | 备注 |
|---|---|---|---|
| [0001](0001-event-runtime-plan.md) | 事件驱动的多群机器人运行时 | Historical | 早期事件运行时方案；当前实现以 kernel/group-loop/services 为准 |
| [0002](0002-runtime-v1-detailed-design.md) | 运行时内核 v1 详细设计 | Historical | 早期设计参考，当前 kernel 已按 v2 架构重写 |
| [0003](0003-character-memory-design.md) | 小核心人格 + 记忆 + 情绪 | Current | 已落地并演进到 persona/profiles/group-loop |
| [0004](0004-group-listener-loop-design.md) | 群消息监听与反馈闭环 | Current | 已落地并演进到 group-listener/group-loop |
| [0005](0005-game-core.md) | 确定性游戏核心 | Current | 游戏命令和状态在 Host 服务处理 |
| [0006](0006-game-plugin-architecture.md) | 每游戏插件架构 | Current | DSH + Koishi 插件成对 |
| [0007](0007-multiplatform-branch-strategy.md) | 多平台分支策略 | Superseded | 被 0008/0009 取代；保留历史 |
| [0008](0008-main-guidance-only.md) | main 只做导向管理 | Current | 已完成迁移 |
| [0009](0009-feature-flow-and-release-convention.md) | 功能流与独立发布 | Current | mac 上游，win 同步/适配 |
| [0010](0010-server-editions.md) | 服务器版本 A/B2 | Proposed | 服务器版规划，尚未实现 |
| [0011](0011-prompt-assembly.md) | 提示词装配架构 | Current | 通用引擎 + 群聊 section/stage 计划；golden 测试锁定输出 |

新增决策使用 `NNNN-<title>.md`，并在本表登记。
