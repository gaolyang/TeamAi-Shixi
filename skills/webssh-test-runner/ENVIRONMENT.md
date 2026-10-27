# ENVIRONMENT — 依赖、安装位置与验证状态

本文件记录本 Skill 在实机上的真实环境状态与验证情况。

## 运行时

| 项 | 值 | 说明 |
|---|---|---|
| 操作系统 | Windows 10 Home (10.0.19045) | 优先适配 Windows |
| Node.js | v22.23.2 | 满足 WebSSH2 Node≥22 |
| npm | 10.9.8 | — |
| Node 测试 | node --test（内建） | 无需额外框架 |

## WebSSH2

| 项 | 值 |
|---|---|
| 安装目录（自动探测） | `D:\DSH对话\webssh2`（非默认 `C:\webssh\webssh2`） |
| 版本 | 5.4.2 (2026-07-30) |
| 服务地址 | `http://127.0.0.1:2222/ssh` |
| 状态 | 运行中（HTTP 200） |
| 客户端 | SolidJS + xterm.js 5.5 + Socket.IO 4 |

**已验证的连接表单选择器**（v5.4.2，直接来自真实页面 DOM）：
- 主机输入 `#hostInput`（name=host）
- 端口输入 `#portInput`（name=port）
- 用户名 `#usernameInput`（name=username）
- 密码 `#passwordInput`（type=password）
- Connect 按钮 `role=button[name="Connect"]`
- 终端 `.xterm`、输入 textarea `.xterm-helper-textarea`

注意：`.xterm` 在点击 Connect 后即挂载（即使 SSH 认证失败），**不能**作为已连接的充分条件；本技能用「Socket.IO 探测命令 + 唯一结束标记」验证 live shell。

## Playwright / Chromium

| 项 | 值 |
|---|---|
| Playwright | 本项目 `node_modules` 内安装（1.64.x） |
| Chromium | `C:\Users\12296\AppData\Local\ms-playwright\chromium-1248\...\chrome.exe`（已下载） |
| headless shell | `chromium_headless_shell-1248`（已下载，默认 headless 模式使用） |
| 无头模式 | 默认 `PLAYWRIGHT_HEADLESS=true` |

安装命令：`npm install` + `npx playwright install chromium`。

## 配置项（.env）

复制 `.env.example` 为 `.env`。敏感项（`SSH_PASSWORD`）优先用环境变量 `TEST_TARGET_PASSWORD` 注入，`.env` 仅建议放非敏感项。

| 变量 | 默认 | 说明 |
|---|---|---|
| `WEBSSH2_URL` | `http://127.0.0.1:2222/ssh` | WebSSH2 服务 |
| `WEBSSH2_HOME` | 自动探测 | WebSSH2 安装目录 |
| `WEBSSH2_AUTO_START` | `false` | 未运行时是否由本技能拉起 |
| `PLAYWRIGHT_HEADLESS` | `true` | 无头运行 |
| `BROWSER_WIDTH` / `BROWSER_HEIGHT` | 1440 / 1000 | 视口 |
| `SSH_HOST` / `SSH_PORT` / `SSH_USER` | — | 目标（可被任务覆盖） |
| `ALLOWED_HOSTS` | 空 | 白名单（逗号分隔） |
| `COMMAND_TIMEOUT_MS` | 30000 | 单命令超时 |
| `PAGE_TIMEOUT_MS` | 20000 | 页面/连接超时 |
| `EVIDENCE_DIR` | `evidence` | 证据根目录 |

## 验证状态（截至 2026-10-17 实机）

| 项目 | 状态 | 说明 |
|---|---|---|
| 环境门禁（Node/npm/Playwright/Chromium/WebSSH2/白名单） | ✅ 已通过 | `node src/index.mjs --check-env` → `ENVIRONMENT_OK`；`scripts/check-env.ps1` 通过 |
| 单元测试 | ✅ 20/20 通过 | 白名单、命令包装、结束标记、Socket.IO 帧解码、evidence 脱敏、判定 |
| WebSSH2 页面/表单/终端挂载 | ✅ 已验证 | 真实页面 DOM；选择器来自实机检查 |
| 自动填写连接表单 + 点 Connect | ✅ 已验证 | 触发真实认证流程 |
| Socket.IO `data` 帧实时读取 | ✅ 已验证（帧格式） | 真实帧形如 `42["data","..."]`，解码器按该格式实现并通过测试 |
| 命令输入真实终端 | ✅ 已验证 | `insertText` + Enter 送入 xterm |
| Chromium 真实截图 | ✅ 已验证 | `01_connected.png`/`error.png` 真实生成 |
| evidence.json 生成 | ✅ 已验证 | 含 run_id/execution/assertion/脱敏输出 |
| 只读/危险命令安全策略 + 交互命令拒绝 | ✅ 已实现+测试 | — |
| **远端完整成功执行闭环**（可访问主机 + 有效凭据） | ⚠️ **待提供环境验证** | 本机 `192.168.63.132:22` 可达，但未获得有效凭据，未伪造成功 |

### 如何补做完整远端验收

在获得一台已授权、凭据有效的目标机后：

```powershell
$env:TEST_TARGET_PASSWORD = "<有效密码>"
node src/index.mjs --testcase examples/TC_OS_001.json --allowed-hosts "<目标IP>"
Remove-Item Env:TEST_TARGET_PASSWORD
```

预期：`ok:true`、步骤 `PASS`、生成 `01_connected.png`、`02_result.png`、`evidence.json`，其中 `execution.exit_code` 为真实值。

## 已知限制

- **私钥认证**：当前走 WebSSH2 表单密码登录；浏览器端的私钥输入（`#privateKeyText` / Add SSH Key）headless 不可靠，暂不实现，遇到私钥会明确拒绝。
- **交互式命令**（`su`/`passwd`/`ssh`/交互 `sudo` 等）明确不支持，返回 `BLOCKED`。
- **多行/复杂脚本**：命令先 base64 编码再经 `sh` 执行，可容纳管道、引号、多参数；不支持需要交互的多行脚本。
- 若 WebSSH2 部署在远端机器上，凭据与页面均需远端可达，目前面向本机 WebSSH2。
