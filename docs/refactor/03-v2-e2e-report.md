# v2 重构验证报告

## 自动化

```text
npm test                     179/179
Host unit                    36/36
Client unit                   9/9
Host smoke                   41 routes / 6 tools / 5 features / 17 Koishi plugins
Client smoke                 ok
architecture                 ok (103 source files, 177 imports)
offline:verify               ok (NapCat.Shell-4.18.42, 35,967,555 bytes)
template tests               56/56
package                      127 files / 47.5 MB
```

## 真实 DSH 实例（隔离 profile）

用 DSH CLI 创建独立 profile `qqbot-v2-test`（web 基础包），link 到
`/Users/crab/project/dsh-qqbot-v2`，端口 `65474`，与当前 DSH 进程隔离。

结果：

```text
/qqbot/status         200，clientTabs 7 个，hostPlugins 10 个
/qqbot/client/tabs    200，overview/ai/messages/access/plugins/features/logs
/qqbot/access         200
/qqbot/ai/status      200，deepseek-account/deepseek-flash
/qqbot/ai/chat        200，reply "v2 系统测试通过"
client bundle         200，225,806 bytes
```

首次加载时发现并修复了一个真实问题：

```text
index.js 的 async apply 把 applyHost() 的返回值返回给 Cordis
→ Cordis 将其视为 effect handle → Invalid effect
→ 改为 await applyHost(...) 后正常加载
```

测试实例已停止并删除临时 profile。当前 desktop profile 已指向 v2，
但正在运行的 DSH 进程仍持有旧模块，需要重启 DeepSeek Harness 才会加载 v2。

## 未覆盖

- 重启后 v2 + 扫码登录 + 实际 QQ 收发的端到端
- 当前运行中的 DSH 面板 UI（bundle 已确认可被 DSH 服务并注入 boot）

## 回滚

```bash
cp ~/.dsh/profiles/desktop/package.json.bak-v2-switch \
   ~/.dsh/profiles/desktop/package.json
cd ~/.dsh/profiles/desktop && pnpm install
```
