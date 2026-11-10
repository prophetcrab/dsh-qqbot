# Bot Workspace Runtime 设计方案

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-11-10 |
| 状态 | 设计草案（未实现，先定边界再开发） |
| 基线 | `dshbot-mac` / `fabb235` |
| 关联 | group-loop、prompt assembly、ADR-0011、DSH host services |
| 结论 | 推荐做独立的 Workspace Task Runtime，不把 workspace 能力塞进普通群聊 compose |

---

## 1. 背景

当前 QQ bot 的群聊链路是：

```text
QQ 群消息
  → Koishi group-listener
  → DSH /qqbot/group/analyze
  → DSH /qqbot/group/compose
  → DSH /qqbot/group/state-update
  → Koishi 发送回复
```

它解决的是“看群聊、决定说不说、怎么说”，本身没有文件系统、命令执行或 DSH 工具调用能力。

我们的 ReAct 和自建工具栈已经移除，当前 compose 是单次 LLM 调用。  
下一步希望机器人拥有自己的 workspace，并在 workspace 里调用 DSH 的能力完成实际任务。

这里的核心问题不是“怎么再写一套工具”，而是：

- 任务在哪里执行；
- 执行时能访问什么；
- QQ 群消息如何安全地触发；
- 长任务如何回传；
- 如何审计、取消、回滚。

---

## 2. 目标与非目标

### 2.1 目标

1. 给 bot 一个独立、可持久化的工作目录（Workspace）。
2. 支持通过明确命令触发任务，而不是所有群聊消息都能触发。
3. 在 Workspace 内完成文件读写、搜索、git diff 等基础工作。
4. 通过 Capability Adapter 调用 DSH 暴露的安全能力。
5. 每次任务有 Run 记录、工具调用记录、耗时、token 用量和审计日志。
6. 能取消任务、限制资源、失败可读。
7. 在 DSH 面板里查看 Workspace 文件、Run、审批和策略。

### 2.2 非目标

MVP 阶段明确不做：

- 不把 Workspace 能力接进普通 `compose`；
- 不允许任意群成员直接执行 shell；
- 不允许访问 Workspace 之外的宿主目录；
- 不开放 `qqbot_control` / `qqbot_configure` 等控制面工具；
- 不把 Workspace 当作真正的 OS 沙箱；
- 不允许任务自己修改权限策略或审批规则；
- 不做无人值守的长期后台自治任务。

---

## 3. 结论摘要

建议采用：

```text
普通聊天：analyze / compose（保持现状，快速回复）
工作任务：/work → 独立 Workspace Task Runtime
```

Workspace Runtime 的边界：

```text
QQ / Koishi
  → /qqbot/workspace/task
    → WorkspaceAgent
      ├─ Workspace 文件系统（受路径约束）
      ├─ DSH Tools Bridge（按白名单）
      ├─ DSH llm / agentDefaultModel
      ├─ Policy / Approval
      └─ Run Store / Audit
```

关键原则：

1. **硬边界优先**：先定义“永远不允许”的硬拦截层，再讨论策略和审批。
2. **审批不是兜底**：审批只能放行硬边界内允许的操作，不能把禁止项变成允许项。
3. **默认拒绝**：工具、路径、命令都先拒绝，再按策略放行。
4. **显式触发**：只有 `/work`（或后续确认的触发方式）进入任务运行时。
5. **文件硬隔离、进程默认禁用**：文件层可以做到代码级路径硬拦截；进程层在获得 OS 级沙箱前必须硬禁用。
6. **先文件、后工具、再 shell**：不要第一步就开放命令执行。
7. **长任务异步化**：Koishi 请求有超时限制，Workspace 任务不应强依赖单次 HTTP 同步返回。

---

## 4. 当前链路与边界

### 4.1 保持不变

```text
群消息 → analyze → compose → state-update
```

- 继续使用 DSH `llm` 与 `agentDefaultModel`；
- 继续使用 persona v2（`[NAME LOAD]` / `[SETTING LOAD]`）；
- 继续使用 prompt 配置，不在普通聊天中加入工具循环。

### 4.2 新增独立链路

```text
/work 任务消息
  → Workspace Task API
  → WorkspaceAgent
  → 结果摘要 / 文件 / diff 回到群或面板
```

两条链路共享：

- DSH LLM；
- persona；
- token 统计基础设施；
- 面板与本地 HTTP guard。

但不能共享“群聊一收到消息就自动执行”的语义。

---

## 5. 目标架构

```text
┌─────────────────────────────────────────────────────────┐
│ DSH Host                                                 │
│                                                         │
│  group-loop（现有）          workspace（新增）            │
│  ├─ analyze/compose          ├─ WorkspaceService         │
│  ├─ persona/prompt           ├─ WorkspaceAgent           │
│  └─ state-update             ├─ ToolsBridge              │
│                              ├─ Policy/Approval          │
│                              └─ RunStore/Audit           │
│                                                         │
│  DSH services: llm, agentDefaultModel, tools,            │
│                attachments, systemPrompt                 │
└───────────────────────┬─────────────────────────────────┘
                        │
                 workspace filesystem
                 ~/project/qq-bot/workspace
```

### 5.1 组件职责

| 组件 | 职责 |
| --- | --- |
| WorkspaceService | 根目录、路径安全、文件 CRUD、搜索、git diff |
| WorkspaceAgent | 一次任务的目标拆解、LLM 调用、步骤执行、结果汇总 |
| ToolsBridge | 枚举/执行 DSH 工具，做白名单和参数检查 |
| Policy | 决定用户/群/工具/操作能否执行 |
| Approval | 敏感操作挂起、确认、拒绝、过期 |
| RunStore | Run 状态、步骤、产物、用量 |
| Audit | 追加式审计日志，记录谁在什么上下文做了什么 |
| Workspace API | 给 Koishi / 面板调用的 HTTP 接口 |
| Workspace Panel | 文件、Run、审批、策略、日志 UI |

### 5.2 硬拦截边界（Hard Boundary）

“硬拦截”指：由代码或操作系统直接拒绝，发生在 Policy、审批和模型判断之前；  
配置、模型、群指令、管理员审批都不能覆盖。

建议把权限分成两层执行：

```text
① Hard Boundary   永远不能发生的事（代码/OS 拒绝）
② Policy/Approval 在允许集合内，决定哪些需要审批
```

#### 硬拦截清单

| 操作 | 硬拦截策略 | 审批能否放行 |
| --- | --- | --- |
| 访问 Workspace 外路径 | 拒绝 | ❌ |
| `..` 越界、绝对路径 | 拒绝 | ❌ |
| 符号链接逃逸 | 拒绝 | ❌ |
| 访问设备、FIFO、socket 等特殊文件 | 拒绝 | ❌ |
| `qqbot_control` / `qqbot_configure` | 拒绝 | ❌ |
| DSH 配置/模型配置/密钥目录 | 拒绝 | ❌ |
| 未知工具 / 未登记工具 | 拒绝 | ❌ |
| 修改 Policy / Approval / Audit | 拒绝 | ❌ |
| 任务批准自己的审批 | 拒绝 | ❌ |
| 伪造 groupId / userId | 拒绝 | ❌ |
| 超过资源硬上限 | 终止任务 | ❌ |
| shell / 包安装 | MVP 硬禁用 | ❌（Phase 4 才可能开启） |

#### 5.2.1 文件系统硬隔离

所有文件操作必须经过唯一的 `WorkspaceFs` 门面，禁止业务代码直接调用 `node:fs`：

```text
WorkspaceFs
├─ resolve(path)     # 拒绝绝对路径、..、NUL
├─ realpath(path)    # 解析后仍必须在 root 内
├─ rejectSymlink()   # 拒绝符号链接；或使用 O_NOFOLLOW
├─ open/read/write/list/move/delete
└─ quota()           # 文件数、总大小、单文件大小
```

硬性要求：

- 路径 resolve 后必须以 workspace realpath 为前缀；
- 目标本身和父目录逐级检查符号链接；
- 只允许普通文件和目录；
- 不允许通过 `rename`、`copy`、`open` 绕过检查；
- Windows 版还要处理盘符、UNC、大小写、ADS 等边界（后续平台分支验证）。

代码级检查只能降低风险，不能完全消除 TOCTOU。  
如果要求“绝对不可越界”，最终仍需要 OS 级文件沙箱或容器；但**所有代码路径统一门面 + 拒绝符号链接 + realpath 校验**应是 Phase 1 的硬要求。

#### 5.2.2 进程硬隔离

MVP：

```text
shell / child_process / exec / spawn = 硬禁用
```

不是“配置里默认关闭”，而是：

- 不允许导入 `node:child_process`（架构测试拦截）；
- 不存在可被模型调用的执行工具；
- 即使 Policy 被误改，也没有执行入口。

Phase 4 若开放 shell，必须满足：

- 有 OS 级沙箱（`sandbox-exec` / 容器 / 独立用户）；
- 无沙箱时启动直接失败，不允许 fallback 到裸 `spawn`；
- cwd 固定在 workspace；
- 环境变量白名单；
- 固定超时、输出上限、进程组终止。

只设置 `cwd` 不是硬隔离。

#### 5.2.3 工具硬白名单

ToolsBridge 采用“先编译白名单，再执行”：

```text
allowed = new Set([...])       # 代码内固定，不从 QQ 读取
if (!allowed.has(name)) deny
if (denied.has(name)) deny
```

- 未知工具一律拒绝；
- DSH 控制面工具进入不可覆盖的 denylist；
- 群指令/模型输出不能修改 allowed/denied；
- 工具 schema 在注册时校验，运行时再次检查参数。

#### 5.2.4 状态硬隔离

以下路径对 Agent 只读或完全不可见：

```text
data/config/workspace.json
data/state/workspace/approvals/
data/state/workspace/audit.jsonl
```

- Run 只能追加自己的运行记录；
- 不能删除、改写审计；
- 不能修改 Policy；
- 不能写 Approval 结果；
- 管理员只能通过面板路由修改 Policy，不能通过 QQ 任务修改。

#### 5.2.5 触发硬门禁

任务入口先做身份硬校验，再做 Policy：

```text
1. 是否本地 HTTP 请求（面板/Koishi）
2. 是否已登记群/用户
3. 是否管理员或显式允许
4. 是否超过并发限制
```

身份不明确时 fail closed，不进入 WorkspaceAgent。

#### 5.2.6 资源硬上限

资源上限由 Runtime 强制执行，不是提示词里的“请不要”：

- 超时直接 abort；
- 步骤/工具调用超限直接终止；
- 输出/文件超限直接拒绝；
- 进程超时杀进程组；
- 配额满时拒绝新写入。

#### 5.2.7 审批与硬拦截的关系

```text
硬拦截拒绝 → 任何审批都无效
Policy 允许但敏感 → 审批可以决定是否执行
Policy 禁止 → 不能通过审批放行
```

审批解决“是否现在做”，不解决“是否允许做”。  
控制面工具、Workspace 外路径、Policy 修改属于后者，永远不可审批。

---

## 6. Workspace 设计

### 6.1 位置

```text
~/project/qq-bot/workspace/
```

不放在源码仓库内，避免误提交和误删除。

### 6.2 目录结构

```text
workspace/
├── README.md                 # 给 bot 和用户看的目录说明
├── shared/                   # 所有群可读的公共资料
├── groups/
│   └── <sanitized-group-id>/
│       ├── notes/
│       ├── projects/
│       └── scratch/
├── .bot/
│   ├── runs/                 # Run 记录
│   ├── approvals/            # 待审批操作
│   ├── audit.jsonl           # 追加式审计
│   └── config.json           # 权限/资源策略
└── .git/                     # 推荐初始化
```

### 6.3 多群隔离

推荐：

- `shared/`：公共只读或受限写入；
- `groups/<id>/`：群私有工作区；
- `scratch/`：临时文件，按 Run 清理；
- 群 ID 必须 hash/白名单过滤，不能直接拼路径。

不建议所有群共用一个可写目录。群 ID 不可信，直接拼接会产生路径注入和跨群覆盖风险。

### 6.4 Git

建议 Workspace 初始化 Git 仓库：

- 每次 Run 前记录 HEAD；
- 任务结束后生成 diff；
- 文件修改可通过 git 回滚；
- 面板展示变更文件；
- `.bot/` 加入 `.gitignore`。

Git 不替代权限控制，但能显著降低“改坏了无法回滚”的成本。

---

## 7. 能力模型

“调用 DSH 的所有能力”不能等同于“把 DSH 所有工具无条件给 QQ 群”。  
建议先定义**能力目录（Capability Catalog）**，再决定暴露方式。

### 7.1 能力分层

#### 安全层（默认开放，MVP）

```text
list_dir
read_file
write_file
append_file
create_dir
move_file
delete_file（限 workspace）
search_files
git status / diff / log
```

#### 受控层（策略或审批）

```text
shell / bash
包安装
批量删除
访问 workspace 外部路径
下载大文件
长期进程
```

#### 禁止层

```text
qqbot_control
qqbot_configure
DSH 自身配置/模型配置
宿主用户目录、密钥、token、cookie
任意宿主进程控制
```

### 7.2 DSH Tools Bridge

当前 Host 只把工具注册给 DSH agent；QQ bot 侧没有现成的工具枚举/执行入口。  
因此需要先做 Phase 0 探测：

1. DSH 的 `tools` 服务是否提供 `list/describe/execute`；
2. `llm.stream` 是否支持原生 `tools` 参数；
3. DSH 内置工具、插件工具、MCP 工具是否都能被同一接口枚举；
4. 工具的返回值、错误、超时和权限语义。

Bridge 接口建议：

```text
ToolsBridge
├─ list()                    # 返回允许暴露的工具目录
├─ schema(name)              # 参数 schema
├─ execute(name, args)       # 执行
└─ policy(name)              # safe / sensitive / forbidden
```

如果 DSH 支持原生 tool calling，优先使用原生协议；  
不要再写一套自由格式的 ReAct 文本解析器。之前自定义 ReAct 已经移除，不应以同样方式回归。

### 7.3 能力暴露矩阵

| 能力 | 来源 | MVP | 后续 |
| --- | --- | --- | --- |
| Workspace 文件操作 | 自建 | ✅ | — |
| git diff / 回滚 | 自建 | ✅ | — |
| web_search / web_fetch | DSH tools | 待探测 | ✅ |
| image_generate | DSH tools | 待探测 | ✅ |
| MCP 资源/工具 | DSH tools | 待探测 | 按白名单 |
| qqbot_status / qqbot_logs | DSH tools | 可考虑只读 | ✅ 只读 |
| qqbot_control / qqbot_configure | DSH tools | ❌ | ❌ |
| shell / 包管理 | 自建或 DSH | ❌ | 审批后 |
| DSH 子 agent / workflow | 待探测 | ❌ | 单独评估 |

---

## 8. Workspace Agent 执行模型

### 8.1 Run 状态机

```text
queued
  → running
  → waiting_approval
  → running
  → succeeded | failed | cancelled | timed_out
```

同一 Workspace 建议**串行执行**，避免两个任务同时改同一文件。

### 8.2 一次 Run 的执行流程

```text
1. 接收任务 + 身份 + 群/私聊上下文
2. Policy 检查（用户、群、能力、路径）
3. 记录 workspace HEAD / 创建 run 目录
4. LLM 规划 + 工具调用循环
5. 每个工具调用前检查 policy
6. 敏感操作创建 approval 并挂起
7. 执行、记录 observation、更新 run
8. 生成结果摘要 + diff + artifacts
9. 回到群/面板，保留 run 记录
```

### 8.3 资源限制

建议默认值（可配置）：

| 项 | 默认 |
| --- | --- |
| 单 Run 时长 | 90 秒（MVP 同步上限） |
| 最大步骤 | 12 |
| 最大工具调用 | 20 |
| 单次工具超时 | 15 秒 |
| 单次输出 | 32 KB |
| 单次写入 | 2 MB |
| Workspace 配额 | 500 MB |
| 并发 Run | 1 / workspace |

超过限制必须中止并返回明确原因，不能无限循环。

### 8.4 Run 数据模型

```json
{
  "id": "run_...",
  "groupId": "123456",
  "userId": "20000",
  "task": "整理这个月的笔记并生成摘要",
  "workspace": "groups/123456",
  "status": "succeeded",
  "createdAt": "2026-11-10T...",
  "startedAt": "2026-11-10T...",
  "finishedAt": "2026-11-10T...",
  "steps": [
    { "tool": "list_dir", "args": { "path": "notes" }, "ok": true, "ms": 12 }
  ],
  "changedFiles": ["notes/summary.md"],
  "artifacts": ["notes/summary.md"],
  "usage": { "input": 1234, "output": 456, "total": 1690 },
  "error": null
}
```

### 8.5 任务结果回群

长任务不能依赖 Koishi 单次请求一直阻塞。建议：

- MVP：任务限制在 90 秒内，同步返回摘要；
- 后续：异步 Run + Koishi 轮询/回调，完成后主动发回群；
- 群消息只发摘要、变更文件、失败原因，不刷完整工具日志；
- 完整日志留在面板和 Run 记录里。

---

## 9. 安全模型

安全模型分两层：

```text
① 硬拦截：永远不允许的操作（见 §5.2）
② 软策略 + 审批：在允许集合内决定是否执行
```

Workspace 不是完整的 OS 安全边界。文件层通过统一门面做到代码级硬拦截；  
只要存在 shell，就必须承认它接近宿主权限，因此 MVP 硬禁用进程执行。

### 9.1 威胁

| 威胁 | 例子 |
| --- | --- |
| Prompt injection | 群友让 bot 读取密钥、删除文件 |
| 路径穿越 | `../../.ssh/id_rsa` |
| 符号链接逃逸 | workspace 内链接指向宿主目录 |
| 命令注入 | 拼接 shell 参数执行任意命令 |
| 资源耗尽 | 无限循环、巨大文件、长进程 |
| 跨群读取 | A 群任务读 B 群私有目录 |
| 权限提升 | 任务修改 policy/approval |
| 数据外泄 | 把 workspace 内容发到外部 |

### 9.2 控制

执行顺序固定为：

```text
Hard Boundary → Policy → Approval → Execute → Audit
```

1. **路径约束**
   - 所有路径先 resolve，再 realpath；
   - 必须位于 workspace 根目录内；
   - 拒绝符号链接逃逸；
   - 拒绝绝对路径和 `..` 越界。

2. **命令约束**
   - MVP 不开放 shell；
   - 后续使用 `spawn`，cwd 固定 workspace；
   - 环境变量白名单，不继承宿主 secrets；
   - 禁止交互式命令、长期进程、后台守护；
   - 破坏性命令必须审批。

3. **权限约束**
   - Policy 默认拒绝；
   - 任务不能修改 Policy；
   - DSH 控制面工具永久禁止；
   - 跨群路径默认禁止。

4. **资源约束**
   - 超时、步骤数、工具调用数、输出大小、workspace 配额。

5. **审计**
   - 每次工具调用写 audit；
   - 记录 group/user/run/tool/args 摘要/结果摘要；
   - 敏感值脱敏；
   - Run 记录不可由模型修改。

6. **审批**
   - 敏感操作生成 approval；
   - approval 有过期时间；
   - 只能由管理员在面板或私聊确认；
   - 模型不能批准自己的请求。

### 9.3 关于“真沙箱”

如果要开放 shell，macOS 上至少需要：

- `sandbox-exec` 配置，或
- 独立用户/容器/虚拟机，或
- 只允许固定的、无参数化的命令模板。

只设置 `cwd=workspace` 不构成沙箱。  
在未完成 OS 级隔离前，shell 只能作为管理员显式开启的实验能力。

---

## 10. 触发与交互

### 10.1 命令

```text
/work <task>          创建任务
/work status          查看当前任务
/work cancel          取消当前任务
/work files           查看最近产物
/work diff            查看本次变更
/work approve <id>    批准敏感操作（管理员）
/work deny <id>       拒绝敏感操作（管理员）
```

### 10.2 权限矩阵

| 场景 | 默认 |
| --- | --- |
| 私聊管理员 | 可建任务 |
| 白名单群管理员 | 可建任务 |
| 白名单群普通成员 | 默认不可建任务 |
| 非白名单群 | 不可建任务 |
| 普通聊天 | 永不触发 Workspace |
| 读 workspace | 允许 |
| 写 workspace | 允许，路径受限 |
| shell | 默认关闭 |
| 控制面工具 | 禁止 |

具体触发方式需要在开发前确认（见 §16）。

---

## 11. HTTP API 草案

统一使用本地 HTTP guard；请求带 `apiVersion: 1`。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/qqbot/workspace/task` | 创建 Run |
| GET | `/qqbot/workspace/runs` | Run 列表 |
| GET | `/qqbot/workspace/runs/:id` | Run 详情 |
| POST | `/qqbot/workspace/runs/:id/cancel` | 取消 Run |
| GET | `/qqbot/workspace/files` | 文件树 |
| GET | `/qqbot/workspace/file` | 文件内容 |
| GET | `/qqbot/workspace/diff` | 最近 diff |
| GET | `/qqbot/workspace/approvals` | 待审批列表 |
| POST | `/qqbot/workspace/approvals/:id` | 批准/拒绝 |
| GET | `/qqbot/workspace/policy` | 读取策略 |
| POST | `/qqbot/workspace/policy` | 更新策略（仅面板管理员） |

创建任务请求示例：

```json
{
  "apiVersion": 1,
  "groupId": "123456",
  "userId": "20000",
  "task": "整理 notes/ 下这个月的记录，生成 summary.md"
}
```

返回：

```json
{
  "ok": true,
  "data": {
    "runId": "run_...",
    "status": "queued"
  }
}
```

---

## 12. 面板设计

新增 `Workspace` tab：

```text
Workspace
├─ 文件树 / 文件预览 / 下载
├─ 当前 Run 状态机
├─ 历史 Run 列表
├─ 每步工具调用与耗时
├─ 待审批操作
├─ 策略编辑
├─ audit 查询
└─ workspace 大小 / git 状态
```

交互原则：

- 文件预览只读直到显式编辑；
- 删除、shell、策略修改都要确认；
- Run 日志默认折叠，失败时展开；
- 长内容在面板查看，不塞进 QQ 消息。

---

## 13. 数据与配置路径

```text
<projectDir>/workspace/                     # 可写工作区
<projectDir>/data/config/workspace.json     # 权限与资源策略
<projectDir>/data/state/workspace/runs/     # Run 记录
<projectDir>/data/state/workspace/audit.jsonl
<projectDir>/data/state/workspace/approvals/
```

Workspace 本体不在 `data/` 下，避免备份/清理脚本误删；`data/state/workspace` 只放运行元数据。

---

## 14. 分阶段计划

### Phase 0：能力探测与决策

产出：

- DSH `tools` 服务 API 探测结果；
- DSH `llm.stream` 是否支持原生 tools；
- 工具风险清单；
- 本设计文档补充“确认项”。

退出条件：

- 明确 ToolsBridge 可行性；
- 明确 MVP 是否只做文件工具。

### Phase 1：Workspace 文件层

产出：

- workspace 初始化；
- 路径安全（resolve/realpath/符号链接）；
- 文件读写/列表/搜索；
- git init、status、diff；
- 面板文件浏览。

验收：

- 无法通过路径穿越访问 workspace 外文件；
- 文件操作有大小/数量限制；
- 错误可读。

### Phase 2：Task Runner MVP

产出：

- Run 数据模型；
- `/work` 命令；
- 单次任务 LLM 执行；
- 步骤/时长/工具预算；
- 结果摘要回群；
- Run 面板。

验收：

- 私聊管理员可完成“读取 notes 并生成 summary.md”；
- 超时/失败/取消有明确状态；
- 不阻塞普通群聊。

### Phase 3：DSH Tools Bridge

产出：

- 工具枚举与 schema；
- 安全工具接入（web_search / web_fetch 等）；
- 工具调用审计；
- 禁止层过滤。

验收：

- 控制面工具无法从群聊调用；
- 工具失败不会把原始堆栈发群；
- 工具调用可追踪。

### Phase 4：Shell 与审批

前置：

- 确认 OS 级隔离方案，或明确只允许管理员手动开启。

产出：

- spawn 执行器；
- 环境变量白名单；
- 审批流；
- 资源限制；
- 回滚。

验收：

- 未审批的敏感命令不能执行；
- 超时进程被终止；
- 审计可还原操作。

### Phase 5：面板完善与运营

产出：

- Workspace tab 完整化；
- 策略编辑；
- audit 检索；
- token 统计接入；
- 多群隔离验收。

---

## 15. MVP 验收标准

MVP 建议只做 Phase 1 + Phase 2：

```text
[ ] /work 仅管理员/私聊可用
[ ] workspace 文件读、写、列表、搜索
[ ] 路径逃逸测试全部拒绝：`..`、绝对路径、符号链接、前缀伪装
[ ] 直接 `node:fs` / `node:child_process` 导入被架构测试拦截
[ ] 未知工具 / 控制面工具硬拒绝
[ ] 伪造/越权修改 Policy、Approval、Audit 硬拒绝
[ ] 单 Run 最长 90s、最多 12 步
[ ] 一次任务能生成一个文件并回群摘要
[ ] Run 记录可在面板查看
[ ] 失败/超时/取消状态正确
[ ] 不影响普通 analyze/compose 延迟
[ ] 单元测试 + route smoke + client smoke 全绿
```

---

## 16. 未决问题

开发前需要确认：

### 16.1 触发方式

- A. 仅管理员 `/work`（推荐先做）
- B. 白名单群所有成员可用 `/work`
- C. 自然语言也能触发

### 16.2 Shell

- A. MVP 不做（推荐）
- B. Phase 4 做，默认关闭 + 审批
- C. 默认开放（不建议）

### 16.3 Workspace 共享范围

- A. 所有群一个 workspace（简单，隔离差）
- B. 每群一个子目录（推荐）
- C. shared 只读 + 群私有可写（长期推荐）

### 16.4 “所有 DSH 能力”的边界

- 是否允许 `qqbot_status` / `qqbot_logs` 只读工具？
- 是否允许 image_generate？
- 是否允许 MCP 工具？
- 是否允许子 agent/workflow？
- 控制面工具是否永久禁止？

推荐：

```text
只读 QQ 状态/日志：允许
image_generate：允许但记录用量
MCP：按工具白名单
子 agent/workflow：暂不开放
qqbot_control/configure：禁止
```

---

## 17. 示例任务流

```text
用户（私聊管理员）：
/work 把 notes/ 下这个月的记录整理成 summary.md

Bot：
收到，开始执行 run_xxx。

WorkspaceAgent：
1. list_dir notes
2. read_file 若干记录
3. LLM 汇总
4. write_file notes/summary.md
5. git diff
6. 生成摘要

Bot 回群/私聊：
完成。新增 notes/summary.md，共整理 6 条记录。
```

如果任务需要 shell：

```text
WorkspaceAgent：
需要执行 shell 命令：npm test
→ 创建 approval
→ 管理员确认
→ 执行
→ 记录结果
```

---

## 18. 设计边界总结

一句话：

> Workspace 是 bot 的“受控工作目录 + 任务运行时”，不是“把宿主权限直接交给 QQ 群”。

先建立硬拦截层，再做文件层和任务记录，然后逐步接 DSH tools；shell 和“全部能力”必须最后做，并且必须叠加 OS 级隔离、审批和审计。
