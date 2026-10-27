# webssh-test-runner — 开发汇报与使用文档

> 面向 Agent 与命令行的 Linux / FusionOS 无人值守测试 Skill。
> 通过**真实 WebSSH2 终端 + Headless Playwright** 自动执行测试命令，保存真实截图与结构化证据。

---

## 第 1 部分 · 开发汇报

### 1. 环境检查结果

| 项 | 结果 |
|---|---|
| 操作系统 | Windows 10 Home (10.0.19045)，优先适配 Windows |
| Node.js | v22.23.2 ✅（满足 WebSSH2 Node≥22） |
| npm | 10.9.8 ✅ |
| Playwright | 本项目 `node_modules` 内安装（1.64.x）✅ |
| Chromium / headless-shell | 已下载至 `C:\Users\12296\AppData\Local\ms-playwright` ✅ |
| WebSSH2 版本 | **5.4.2**（SolidJS 客户端 + xterm.js 5.5 + Socket.IO 4） |
| WebSSH2 安装目录 | `D:\DSH对话\webssh2`（**自动探测**，非默认 `C:\webssh\webssh2`） |
| WebSSH2 服务状态 | **运行中**，`http://127.0.0.1:2222/ssh` → HTTP 200 ✅ |
| 目标主机可达性 | `192.168.63.132:22` 端口开放 ✅（凭据未提供，见「验证状态」） |

**连接表单选择器（直接来自真实页面 DOM，非猜测）**：
`#hostInput` / `#portInput` / `#usernameInput` / `#passwordInput` + Connect 按钮 + `.xterm` / `.xterm-helper-textarea`。

> 重要发现：`.xterm` 在点击 Connect 后即挂载（即使 SSH 认证失败），**不能**作为已连接依据。
> 本 Skill 用「Socket.IO 探测命令 + 唯一结束标记」验证 live shell，避免把空终端误判为已连接。

### 2. Skill 实际安装路径

- **项目目录**：`D:\AAAA\Shixi_Project\webssh-test-runner`（独立、可移植）
- **Agent 接入**：若需全局接入，将本项目软链到 Agent 全局目录（如 `C:\Users\12296\.claude\skills\webssh-test-runner`，与现有 lark-* skill 做法一致），或将 `SKILL.md` 目录作为项目级 `.claude/skills/` 入口。

### 3. 项目目录结构

```
webssh-test-runner/
├── SKILL.md                  # Agent 可读取/执行的技能说明（YAML frontmatter）
├── README.md                 # 概览与安装
├── ENVIRONMENT.md            # 依赖、安装位置、验证状态
├── REPORT.md                 # 本文件（汇报 + 使用方法）
├── package.json / .env.example / .gitignore
├── config/config.example.json
├── examples/TC_OS_001.json   # 测试用例示例
├── scripts/                  # PowerShell 脚本
│   ├── check-env.ps1         # 环境门禁
│   ├── install-prerequisites.ps1
│   ├── start-webssh2.ps1     # 复用/拉起 WebSSH2
│   ├── stop-webssh2.ps1      # 只停自有进程
│   └── run-testcase.ps1      # 运行封装
├── src/                      # Node 源码（职责分离）
│   ├── index.mjs             # CLI 编排入口
│   ├── environment-check.mjs # 硬门禁
│   ├── config-loader.mjs     # .env/config 加载
│   ├── host-validator.mjs    # 目标主机白名单
│   ├── webssh-controller.mjs # WebSSH2 服务生命周期
│   ├── playwright-runner.mjs # 浏览器启动 + 连接表单
│   ├── command-executor.mjs  # 真实终端命令执行 + socket 解码
│   ├── completion-detector.mjs # 唯一结束标记包装器
│   ├── screenshot-manager.mjs # 真实截图
│   ├── evidence-writer.mjs   # evidence.json
│   ├── result-parser.mjs     # PASS/FAIL 判定
│   ├── error-handler.mjs     # 异常分类
│   └── safe-text.mjs         # 凭据脱敏
├── tests/                    # node --test 单元测试
└── evidence/                 # 运行证据（.gitkeep）
```

### 4. WebSSH2 与 Playwright 集成方式

```
用户/飞书/命令行 → AI Agent → webssh-test-runner
   → 环境门禁 → 白名单 → 复用后台 WebSSH2
   → Headless Chromium → 打开 /ssh → 自动填写连接表单
   → 真实 xterm.js 终端 → SSH → Linux/FusionOS
   → 输入包装器命令（唯一 BEGIN/END 标记）
   → 读取真实输出/退出码 → 真实截图 → evidence.json → 返回 Agent
```

### 5. 已实现功能

- **硬门禁**：Node/npm/Playwright/Chromium/WebSSH2/白名单全部检查后才执行；区分 `ENVIRONMENT_OK` / `ENVIRONMENT_MISSING` / `WEBSSH2_UNAVAILABLE` / `PLAYWRIGHT_UNAVAILABLE` / `CHROMIUM_UNAVAILABLE` / `SSH_TARGET_INVALID`。
- **目标主机白名单**：连接前拒绝非白名单主机，不发送任何命令。
- **WebSSH2 生命周期**：运行中直接复用；未运行且 `WEBSSH2_AUTO_START=true` 才由本技能拉起；只停止自己记录并启动的进程。
- **唯一结束标记**（替代固定 sleep）：命令 base64 后经 `sh` 执行，打印唯一 `__WST_END_<token>:<exit_code>`，检测到才认为完成；退出码为真实远端退出码。
- **真实截图**：`01_connected.png`、`02_result.png`（截取 `.xterm`）、异常 `error.png`。
- **结构化证据**：`evidence/<case>/<runId>/evidence.json` + PNG，输出经脱敏。
- **诚实判定**：退出码 0 ≠ PASS，必须匹配 `expected` 规则；无法可靠读取输出时返回 `OUTPUT_UNVERIFIED`，不伪造。
- **凭据保护**：密码只从 `TEST_TARGET_PASSWORD` / `SSH_PASSWORD` 环境变量读取，不写源码/Git/JSON/日志/URL；登录后清空表单密码字段。
- **错误分类**：`BLOCKED` / `TIMEOUT` / `CONNECTION_LOST` / `OUTPUT_UNVERIFIED` / `ERROR`。
- **安全策略**：交互命令（`su`/`passwd`/`ssh`/`scp`/`expect` 等）明确拒绝并返回 `BLOCKED`。

### 6. 实际运行过的测试

| 测试 | 结果 |
|---|---|
| 单元测试（20 项：白名单、包装器、结束标记、Socket.IO 帧解码、脱敏、判定） | ✅ 20/20 通过 |
| 环境门禁 `--check-env` | ✅ `ENVIRONMENT_OK` |
| `scripts/check-env.ps1` | ✅ 门禁通过 |
| WebSSH2 页面 / 表单 / 终端挂载 | ✅ 真实验证 |
| 自动填表 + Connect（触发真实认证流程） | ✅ 真实验证 |
| Socket.IO `data` 帧格式 `42["data",...]` | ✅ 实测+单测覆盖 |
| 命令输入真实终端 | ✅ 真实验证 |
| Chromium 真实截图（PNG） | ✅ 真实验证 |
| evidence.json 生成（含脱敏） | ✅ 真实验证 |
| 白名单拒绝（连接前） | ✅ 真实验证 |
| 错误凭据 → 诚实 `ERROR` + error.png + evidence.json | ✅ 真实验证 |
| **远端完整成功执行闭环**（有效凭据主机） | ⚠️ 待提供环境（见下） |

### 7. 截图与证据文件真实路径（示例）

```
D:\AAAA\Shixi_Project\webssh-test-runner\evidence\TC_E2E\20261017123322-093a0a\
    error.png      （认证失败诊断截图，真实生成）
    evidence.json  （结构化证据：schema_version/run_id/execution/assertion/errors）
```

> 说明：以上是一次**错误凭据**下的真实运行产物，用于验证"失败也留证据、绝不伪报"。成功的证据将在提供有效凭据主机后生成到 `evidence/<case>/<runId>/`。

### 8. 如何启动和调用（详见第 2 部分）

```bash
node src/index.mjs --check-env
node src/index.mjs --testcase examples/TC_OS_001.json
node src/index.mjs --id TC_OS_001 --command "uname -a" --host H --username U
```

### 9. 当前限制

- **私钥认证未实现**：headless 下的 `#privateKeyText` / Add SSH Key 不可靠，遇到私钥会明确拒绝，建议先用密码登录或选用旧版 Basic Auth 通道。
- **交互式命令不支持**（`su`/`passwd`/`ssh`/交互 `sudo` 等），返回 `BLOCKED`，不无限等待。
- **需本机 WebSSH2**：当前面向 `127.0.0.1:2222`；若 WebSSH2 在远端机器，凭据与页面需远端可达。
- **远端完整成功闭环未在本机完成**：`192.168.63.132:22` 可达但未获有效凭据；未伪造成功。

### 10. 下一步建议

1. 提供一台**已授权、凭据有效**的测试机（如 Kali/FusionOS），补做端到端验收：`--check-env` → 连接 → `uname -a` → PASS → 截图 + evidence JSON。
2. 把现有 Python runner（`remote-test-runner`）的 Excel 解析 / CIDA / 飞书任务入口接入本 Skill 的统一 testcase JSON 结构，实现"Excel → 本 Skill 执行"。
3. 需要时补充 Word 报告生成（读取 evidence JSON 汇总）。

---

## 第 2 部分 · 使用方法

### A. 首次安装与依赖

需要 Node.js ≥ 20。

```powershell
cd D:\AAAA\Shixi_Project\webssh-test-runner
npm install
npx playwright install chromium        # 下载 Chromium 浏览器
```

可选：`powershell -ExecutionPolicy Bypass -File scripts/install-prerequisites.ps1`（自动装依赖+浏览器）。

### B. 配置（.env）

```powershell
Copy-Item .env.example .env            # 按需编辑（不提交 .env）
```

关键配置项见 [ENVIRONMENT.md](ENVIRONMENT.md)；密码用环境变量注入，不写 .env。

### C. 环境门禁

```powershell
# 方式 1：Node CLI
node src/index.mjs --check-env

# 方式 2：PowerShell 脚本
powershell -ExecutionPolicy Bypass -File scripts/check-env.ps1
```

只有 `ENVIRONMENT_OK` 才能进入执行。

### D. 准备密码

```powershell
$env:TEST_TARGET_PASSWORD = "运行时密码"
# ... 执行命令 ...
Remove-Item Env:TEST_TARGET_PASSWORD       # 执行完清除
```

> 密码绝不放入命令行参数、JSON、代码或日志。

### E. 提交测试任务

**方式 1：测试用例文件**
```powershell
node src/index.mjs --testcase examples/TC_OS_001.json
```
用例结构（`examples/TC_OS_001.json`）：
```json
{
  "testcase_id": "TC_OS_001",
  "title": "检查远端基本信息",
  "target": { "host": "192.168.63.132", "port": 22, "username": "root" },
  "steps": [
    { "step_id": "STEP_001", "command": "uname -a", "timeout_ms": 30000,
      "expected": { "contains": "Linux" }, "screenshot": true }
  ]
}
```

**方式 2：单命令模式**
```powershell
node src/index.mjs --id TC_OS_001 --command "ss -lntup" --host 192.168.63.132 --username root
```

**方式 3：PowerShell 封装**
```powershell
.\scripts\run-testcase.ps1 -Testcase .\examples\TC_OS_001.json
.\scripts\run-testcase.ps1 -Id TC_OS_001 -Command "ss -lntup" -HostName 192.168.63.132 -Username root
```

**方式 4：调试（显示浏览器）**
```powershell
node src/index.mjs --id TC --command "uname -a" --host H --username root --headful
```

### F. 常用参数

| 参数 | 说明 |
|---|---|
| `--testcase <file>` | 测试用例 JSON |
| `--id <id>` / `--command "<cmd>"` | 单命令模式 |
| `--host` / `--port` / `--username` | 目标主机 |
| `--allowed-hosts <csv>` | 临时覆盖白名单 |
| `--timeout <ms>` | 单命令超时（默认 30000） |
| `--output <dir>` | 证据根目录（默认 `evidence`） |
| `--headful` | 显示浏览器窗口（调试） |
| `--check-env` | 仅环境门禁 |

### G. 预期输出的判定

通过环境变量/CLI 传入 `SSH_HOST` 等时，`expected` 支持规则：
`contains`、`not_contains`、`regex`、`equals`、`exit_code`、`not_exit_code`、`any`、`all`。
未提供 `expected` 时只记录命令状态，**不**臆造 PASS/FAIL。

### H. 读取返回结果（Agent 用）

程序 stdout 输出稳定 JSON：
```json
{
  "ok": true,
  "outcome": "PASS",
  "testcase_id": "TC_OS_001",
  "run_id": "20261017xxxxxx-abc123",
  "steps": [ { "step_id": "STEP_001", "status": "PASS", "exit_code": 0 } ],
  "evidence": "D:\\...\\evidence\\TC_OS_001\\<runId>\\evidence.json"
}
```

- `ok:true` 且每步 `PASS` → 通过。
- 任一步 `FAIL`/`TIMEOUT`/`ERROR` → 读该步 `evidence.json` 的 `assertion.actual` 与 `errors` 说明原因。
- `outcome:BLOCKED` → 被安全策略/门禁阻止，报告原因，不绕过。
- 向用户汇报时必须引用真实 `evidence.json` 与截图路径，说明是否真实执行。

### I. 运行单元测试

```powershell
npm test
# 或
node --test "tests/*.test.mjs"
```

直接运行 `node` 时，成功退出 0、失败退出非 0（Agent 可依赖退出码 + stdout JSON）。

### J. WebSSH2 服务操作（可选）

```powershell
# 查看/复用（已在运行则直接复用，不重启）
powershell -ExecutionPolicy Bypass -File scripts/start-webssh2.ps1

# 只停由本 Skill 启动的进程（不会停用户进程）
powershell -ExecutionPolicy Bypass -File scripts/stop-webssh2.ps1 -Pid 1234
```

默认 `WEBSSH2_AUTO_START=false`：未运行时不自动拉起。若希望自动拉起，在 `.env` 设 `WEBSSH2_AUTO_START=true` 并提供 `WEBSSH2_HOME`。
