# Bot Workspace Runtime 设计方案

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-11-16 |
| 状态 | 设计稿（未实现） |
| 基线 | `dshbot-mac` / `bf9b046` |
| 结论 | 独立 Workspace Task Runtime，不并入普通群聊 compose |

---

## 1. 目标与边界

### 目标

- 给 bot 一个独立工作目录和任务运行时。
- 支持 `/work` 任务：文件操作、搜索、git diff、按策略调用 DSH 能力。
- 每次任务有 Run 记录、预算、审计、审批和取消。
- 面板可查看文件、Run、工具策略和审计。

### 非目标

- 不让普通群消息自动获得 Workspace 权限。
- MVP 不开放 shell、包安装和 DSH 控制面工具。
- 不把 Workspace 当作真正的 OS 沙箱。
- 不允许任务修改策略、审批或审计。
- 不做无人值守的长期自治任务。

---

## 2. 总体架构

```text
普通群聊：群消息 → analyze → compose → state-update（保持不变）

工作任务：
QQ / Koishi
  → POST /qqbot/workspace/task
    → WorkspaceAgent
      ├─ WorkspaceFs
      ├─ DSH Tools Bridge
      ├─ DSH llm / agentDefaultModel
      ├─ Policy / Approval
      └─ RunStore / Audit
```

原则：

1. 普通聊天和任务执行分离。
2. 默认拒绝，显式触发。
3. 硬边界优先于策略和审批。
4. 先文件、后 DSH 工具、最后 shell。
5. 长任务异步化，避免依赖 Koishi 单次请求。

---

## 3. Workspace

路径：

```text
~/project/qq-bot/workspace/
```

结构：

```text
workspace/
├── shared/                 # 公共资料
├── groups/<group-id>/      # 群私有目录
│   ├── notes/
│   ├── projects/
│   └── scratch/
├── .bot/
│   ├── runs/
│   ├── approvals/
│   ├── audit.jsonl
│   └── config.json
└── .git/
```

- 群 ID 必须 hash/白名单处理，不能直接拼路径。
- 推荐初始化 git：每次 Run 记录 HEAD，结束后生成 diff，可回滚。
- 运行元数据放 `data/state/workspace/`，Workspace 本体不放 `data/`。

---

## 4. 硬拦截（Hard Boundary）

硬拦截由代码或 OS 直接拒绝，发生顺序在 Policy、审批和模型判断之前。  
配置、模型、群指令、管理员审批都不能覆盖。

| 操作 | 硬拦截 |
| --- | --- |
| Workspace 外路径 | 拒绝 |
| `..`、绝对路径、前缀伪装 | 拒绝 |
| 符号链接逃逸 | 拒绝 |
| 设备/FIFO/socket 等特殊文件 | 拒绝 |
| `qqbot_control` / `qqbot_configure` | 永久禁止 |
| DSH 配置、密钥、宿主目录 | 永久禁止 |
| 未知工具/未登记工具 | 拒绝 |
| 修改 Policy / Approval / Audit | 拒绝 |
| 任务批准自己的审批 | 拒绝 |
| 伪造 groupId / userId | 拒绝 |
| 超过资源硬上限 | 终止 |
| shell / 包安装 | MVP 禁止 |

### 4.1 文件系统

所有文件操作必须经过唯一的 `WorkspaceFs`：

```text
resolve → realpath → root 前缀检查 → 符号链接拒绝 → 普通文件/目录
```

- 业务代码禁止直接 import `node:fs`，由架构测试拦截；
- 拒绝 `..`、绝对路径、NUL、特殊文件；
- 写入有单文件、单次、总量配额；
- 代码级 jail 不能完全消除 TOCTOU，最终仍需 OS 级隔离可选加固。

### 4.2 进程

MVP：

```text
node:child_process / exec / spawn = 硬禁用
```

- 架构测试禁止 import；
- 不存在 shell 工具入口；
- Policy 误改也无法执行。

Phase 4 若开放 shell，必须有 OS 级沙箱（sandbox-exec / 容器 / 独立用户）；  
没有沙箱时启动失败，不允许 fallback 到裸 `spawn`。`cwd` 不是沙箱。

### 4.3 工具与状态

- 工具使用编译期白名单，未知工具拒绝；
- 控制面工具进入永久 denylist；
- Policy、Approval、Audit 对 Agent 只读或不可见；
- 管理员只能通过面板修改策略，不能从 QQ 任务修改。

### 4.4 触发与资源

- 任务入口先校验本地 HTTP、群、用户身份；
- 身份不明确 fail closed；
- 超时、步骤、token、工具调用、输出、配额全部由 Runtime 强制。

---

## 5. 工具策略

工具决策：

```text
allow       默认放行
approval    需要审批
deny        拒绝
```

其中 hard deny 不可覆盖。

### 5.1 路线 A：默认配置（自动）

每个工具声明固定元数据，Policy Compiler 生成默认策略：

```json
{
  "id": "delete_file",
  "risk": "destructive",
  "sideEffects": true,
  "defaultDecision": "approval"
}
```

| 工具 | 默认 |
| --- | --- |
| 读取/列表/搜索/git status/diff/log | allow |
| Workspace 内写文件/建目录/移动 | allow |
| 删除/覆盖已有文件 | approval |
| web_search / web_fetch | allow（有配额） |
| image_generate | allow（记录用量） |
| qqbot_status / qqbot_logs | allow（只读） |
| shell / 包安装 | MVP deny |
| qqbot_control / qqbot_configure | hard deny |
| 目录外未知工具 | hard deny |
| 目录内新增、未分类工具 | approval |

自动生成时机：首次启动、工具目录变化、面板点击「重新生成默认策略」。

### 5.2 路线 B：手动修改

管理员可在面板逐个工具修改：

```text
allow ↔ approval ↔ deny
```

- hard deny 锁定，不能改；
- 手动 deny 可以更严格；
- 手动 allow 不能绕过 hard deny；
- 修改记录操作者、时间、旧值、新值；
- 改成 allow 后旧审批失效；
- 改成 approval 后下一次调用进入审批。

### 5.3 生效顺序

```text
hard deny
  → 手动 override
  → 自动默认
  → 未知工具 deny
```

配置：

```json
{
  "version": 1,
  "mode": "auto",
  "defaultsVersion": 1,
  "overrides": {
    "delete_file": "approval",
    "shell": "deny"
  }
}
```

- `auto`：自动默认 + override；
- `manual`：手动为主，未配置工具按 approval；
- 工具目录变化保留 override，新工具标记待复核，移除工具保留记录但不执行。

---

## 6. 任务运行时

### 6.1 Run 状态

```text
queued → running → waiting_approval → running
       → succeeded | failed | cancelled | timed_out | budget_exceeded | stalled
```

### 6.2 预算

| 项 | 默认 |
| --- | --- |
| 单 Run 执行时长 | 90 秒（审批等待不计入） |
| 最大步骤 | 12 |
| 最大 LLM 调用 | 12 |
| 最大 token | 64k / Run |
| 连续无进展 | 3 步 |
| 最大工具调用 | 20 |
| 单次工具超时 | 15 秒 |
| 单次输出 | 32 KB |
| 单次写入 | 2 MB |
| Workspace 配额 | 500 MB |
| 并发 Run | 1 / workspace |

记账规则：

- 调用前预留，调用后按实际结算；
- token usage 缺失时估算并标记 `estimated`；
- 被拒绝的工具调用也计数；
- 预算只能由 Runtime 增加，模型/工具/Policy 不能重置；
- 重试计入 LLM/token 预算。

终止：

| 原因 | 状态 |
| --- | --- |
| wall time | `timed_out` |
| 步骤/token/工具超限 | `budget_exceeded` |
| 连续无进展 | `stalled` |
| 用户取消 | `cancelled` |
| 审批超时 | `approval_expired` |
| 高风险注入 | `injection_suspected` |

终止时 abort LLM、终止工具、停止接受新调用、保留 partial artifacts，回群只发简短原因。

### 6.3 Run 记录

```json
{
  "id": "run_...",
  "groupId": "123456",
  "userId": "20000",
  "task": "整理 notes 并生成 summary.md",
  "status": "succeeded",
  "steps": [{ "tool": "list_dir", "args": { "path": "notes" }, "ok": true, "ms": 12 }],
  "changedFiles": ["notes/summary.md"],
  "artifacts": ["notes/summary.md"],
  "usage": { "input": 1234, "output": 456, "total": 1690 },
  "error": null
}
```

### 6.4 结果回群

- MVP：90 秒内同步返回摘要；
- 后续：异步 Run + 轮询/回调；
- 群里只发摘要、变更文件、失败原因；
- 完整日志留在面板和 Run 记录。

---

## 7. 防注入

不可信输入包括：群消息、文件名、文件内容、网页、搜索结果、图片/OCR、记忆、画像、工具返回。

### 7.1 信任边界

| 可信 | 不可信 |
| --- | --- |
| system prompt / task 对象 | 群消息、昵称、引用 |
| Policy / Approval / Audit | 文件、网页、搜索结果 |
| Runtime 校验结果 | 工具返回、MCP、图片描述 |
|  | 记忆、画像、历史摘要 |

规则：

- 不可信内容不能成为 system/developer 指令；
- 不能修改 Policy、预算、工具白名单或审批；
- 不能改变当前 Run 的目标；
- 目标只能来自创建 Run 的显式请求。

### 7.2 控制

1. **上下文隔离**：独立 untrusted 段，标签包裹，转义结束标签和伪 system 标记。
2. **特权分离**：模型只提议；Runtime 执行 hard boundary → policy → approval。
3. **结果清洗**：截断、去控制字符、转义边界，不自动打开 URL，不把 observation 里的 `tool_call` 当工具调用。
4. **审批防绕过**：审批绑定 `runId + tool + args hash + policyVersion`；参数变化失效；模型不能自批。
5. **外泄防护**：环境变量白名单；token/cookie/私钥脱敏；默认只回摘要。
6. **检测**：可疑模式标记、写审计、必要时终止；检测不是安全边界。

### 7.3 安全不变量

```text
I1  不可信内容不能成为 system/developer 指令
I2  不可信内容不能修改 Policy / budget / allowlist
I3  每个工具调用必须经过 hard boundary + policy
I4  每个文件路径必须经过 WorkspaceFs canonical 检查
I5  审批绑定 run + tool + args hash + policyVersion
I6  预算不能被模型、工具、Policy 重置
I7  Audit 只能追加
I8  上下文不出现 workspace 外敏感文件内容
I9  模型输出不能直接成为下一次 system prompt
I10 observation 不能伪造工具调用
```

没有绝对防注入。真正的保证是硬边界、特权分离、不可信隔离和预算。

---

## 8. 触发、API、面板

### 命令

```text
/work <task>
/work status
/work cancel
/work files
/work diff
/work approve <id>
/work deny <id>
```

默认仅私聊管理员或白名单群管理员可创建任务；普通群聊永不触发 Workspace。

### API

```text
POST /qqbot/workspace/task
GET  /qqbot/workspace/runs
GET  /qqbot/workspace/runs/:id
POST /qqbot/workspace/runs/:id/cancel
GET  /qqbot/workspace/policy
POST /qqbot/workspace/policy
GET  /qqbot/workspace/approvals
POST /qqbot/workspace/approvals/:id
```

### 面板

```text
Workspace tab
├─ 文件树 / 预览
├─ 当前 Run / 历史 Runs
├─ 工具策略（默认 / override / 生效）
├─ 待审批
├─ audit
└─ workspace 大小 / git 状态
```

---

## 9. 分阶段

| 阶段 | 内容 | 退出条件 |
| --- | --- | --- |
| Phase 0 | 探测 DSH tools API、原生 tool calling、工具风险 | 明确 Bridge 可行性 |
| Phase 1 | WorkspaceFs、路径硬拦截、git、文件工具、策略模型 | 路径逃逸测试全过 |
| Phase 2 | Run 模型、`/work`、单任务执行、预算、结果回群 | 能生成文件并回摘要 |
| Phase 3 | DSH Tools Bridge、自动默认 + 手动策略、审计 | 安全工具可调用，控制面工具拒绝 |
| Phase 4 | shell + 审批 + OS 隔离 | 未审批命令不能执行 |
| Phase 5 | 面板完整化、策略编辑、audit 查询 | 运营可用 |

MVP 只做 Phase 1 + Phase 2。

---

## 10. MVP 验收

```text
[ ] /work 仅管理员/私聊可用
[ ] Workspace 文件读、写、列表、搜索
[ ] `..`、绝对路径、符号链接、前缀伪装全部拒绝
[ ] 直接 import node:fs / node:child_process 被架构测试拦截
[ ] 未知工具 / 控制面工具硬拒绝
[ ] 自动默认策略生成 allow / approval 基线
[ ] 手动 override 生效，hard deny 不可覆盖
[ ] 策略修改有审计，旧审批随策略变化失效
[ ] 伪造/越权修改 Policy、Approval、Audit 硬拒绝
[ ] 单 Run 90s、12 步、12 次 LLM 调用、64k token
[ ] 预算账本、终止状态、重试记账正确
[ ] 群消息/文件/网页/工具结果按 untrusted 处理
[ ] 注入内容不能改 Policy、预算、工具白名单或审批
[ ] 安全不变量 I1–I10 有对应测试
[ ] 不影响普通 analyze/compose 延迟
[ ] 单元测试 + route smoke + client smoke 全绿
```

---

## 11. 待确认

1. **触发**：仅管理员 `/work`（推荐）/ 白名单群 / 自然语言。
2. **Shell**：MVP 不做（推荐）/ Phase 4 审批后 / 默认开放。
3. **隔离**：所有群共享 / 每群子目录（推荐）/ shared 只读 + 群私有可写。
4. **DSH 能力边界**：
   - 只读 `qqbot_status` / `qqbot_logs`：建议允许；
   - `image_generate`：建议允许并按量配额；
   - MCP：按工具白名单；
   - 子 agent / workflow：暂不开放；
   - `qqbot_control` / `qqbot_configure`：永久禁止。
