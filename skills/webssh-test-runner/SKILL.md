---
name: webssh-test-runner
version: 1.0.0
description: "通过 WebSSH2 浏览器 SSH 终端 + Headless Playwright 自动执行 Linux/FusionOS 测试任务：检查环境、复用后台 WebSSH2、连接授权目标主机、向真实终端输入命令、等待命令完成（唯一结束标记）、保存真实截图并生成结构化 evidence.json。当用户要求对 Linux/FusionOS 主机执行测试命令、安全加固检查、端口/服务/配置检查并保留截图与执行证据时使用。禁止将此技能用于白名单之外的任意主机，也不得伪造 PASS。"
metadata:
  requires:
    bins: ["node"]
  runtime:
    node: ">=20"
    deps: ["playwright"]
  outputs:
    - evidence.json
    - PNG screenshots
---

# webssh-test-runner

**通过真实 WebSSH2 终端 + Headless Playwright 执行 Linux / FusionOS 测试命令，并保存可追溯的截图与结构化证据。**

本 SKILL 不是 Web 管理平台，而是一个供 Agent 自动调用的执行引擎。最终用户只需下达测试任务，不用打开浏览器、填写表单或手动输入命令。

## 何时使用

当用户需要：
- 对一台已授权的 Linux / FusionOS 测试机执行一条或多个 Shell 命令；
- 执行安全加固/配置检查（`sshd -T`、`ss -lntup`、`systemctl status sshd` 等）；
- 保留命令执行前后的真实终端截图；
- 生成结构化的 evidence.json 供后续分析或 Word 报告。

## 何时不要使用

- 目标主机不在 `ALLOWED_HOSTS` 白名单内（必须先拒绝）。
- 命令需要交互式输入（`su`、`passwd`、`ssh`、交互 `sudo` 等）——本技能不支持，直接拒绝。
- 用户只想要「生成一份测试计划」而不实际执行。
- 需要修改系统配置但未获得授权 / 无回滚方案（`CHANGE` 级命令）。
- 目标主机不可达或 WebSSH2 / Playwright / Chromium 不可用。

## 调用条件（调用前必须检查）

1. WebSSH2 已在本地运行（默认 `http://127.0.0.1:2222/ssh`），或 `WEBSSH2_AUTO_START=true` 且已授权由本技能拉起。
2. 项目依赖已安装（`npm install` + `npx playwright install chromium`）。
3. 目标主机在 `ALLOWED_HOSTS` 白名单内，且提供 `host/port/username`。
4. 证书（密码）通过环境变量 `TEST_TARGET_PASSWORD` 提供，**绝不**放入命令行参数/JSON/代码/日志。

## 输入参数

| 参数 | 说明 |
|---|---|
| `--testcase <file.json>` | 结构化测试用例（见下） |
| `--id TC_xxx` / `--command "..."` | 单命令模式 |
| `--host` / `--port` / `--username` | 目标主机（单命令/覆盖） |
| `--allowed-hosts <csv>` | 覆盖白名单（临时） |
| `--timeout <ms>` | 单命令超时 |
| `--output <dir>` | evidence 根目录（默认 `evidence`） |
| `--headful` | 调试：显示浏览器窗口（默认 headless） |
| `--check-env` | 仅做环境门禁检查 |

测试用例 JSON 结构：

```json
{
  "testcase_id": "TC_OS_001",
  "title": "检查远端基本信息",
  "target": { "host": "192.168.63.132", "port": 22, "username": "root" },
  "steps": [
    {
      "step_id": "STEP_001",
      "command": "uname -a",
      "timeout_ms": 30000,
      "screenshot": true,
      "expected": { "contains": "Linux" }
    }
  ]
}
```

一个步骤支持：`step_id`、`title`、`action`、`command`、`timeout_ms`、`expected`（判定规则）、`screenshot`。

判定规则键：`contains`、`not_contains`、`regex`、`equals`、`exit_code`、`not_exit_code`、`any`、`all`。未提供 `expected` 时只记录命令状态，**不**臆造 PASS/FAIL。

## 执行步骤

1. **环境门禁**：`checkEnvironment()` 校验 Node、npm、Playwright、Chromium、WebSSH2 安装与服务可达、目标主机白名单。任一必要项失败 → `BLOCKED`，返回诊断，不进入执行。
2. **目标主机白名单**：连接前先校验 `host` 格式与白名单。
3. **WebSSH2 服务**：检测 `http://127.0.0.1:2222/ssh`；若在运行直接复用，不重启、不 kill。
4. **启动 headless Chromium**（`PLAYWRIGHT_HEADLESS=true` 默认）。
5. **连接真实终端**：打开 `/ssh`，用已验证选择器（`#hostInput`/`#portInput`/`#usernameInput`/`#passwordInput` + Connect 按钮）自动填写并连接；等到 xterm 终端挂载。
6. **验证真实 live shell**：通过 Socket.IO `data` 帧读取终端输出，运行快速探测命令并等待唯一结束标记，确认 shell 真正交互（避免把「未认证的空终端」误判为已连接）。
7. **执行每一条命令**：
   - 生成唯一 token，构造包装器（命令 base64 后 `| base64 -d | sh`，`printf` 唯一 BEGIN/END 标记，`__wst_rc=$?` 捕获真实退出码）；
   - 把包装器输入终端（`insertText` + Enter）；
   - **等待唯一 END 标记**出现（不是固定 sleep 几秒）；
   - 从终端缓冲区解析 stdout 与真实 `exit_code`。
8. **结果判定**：用 `expected` 规则对**真实输出**判定 PASS/FAIL。退出码 0 ≠ PASS；必须匹配预期输出。
9. **截图**：连接成功 `01_connected.png`，命令结果 `02_result.png`（截取 `.xterm` 真实终端）；失败/超时保存 `error.png`。
10. **写 evidence**：`evidence/<testcase_id>/<runId>/evidence.json` + PNG + execution 元数据。
11. 输出稳定 JSON 汇总。

## 唯一结束标记（替代固定等待）

每条命令都带唯一 token 的 BEGIN/END 标记。命令结束 = 在终端缓冲区中检测到 `__WST_END_<token>:<exit_code>`。它保证：
- 不会把历史输出或业务文本误判为完成；
- 结束标记唯一，避免跨命令串扰；
- 退出码是真实远端退出码。

## 安全限制（必须遵守）

- **白名单硬门禁**：目标主机必须在 `ALLOWED_HOSTS`，否则连接前拒绝（不发送任何命令）。
- **交互命令拒绝**：需要提示符输入的命令（`su`/`passwd`/`ssh`/`scp`/`expect` 等）直接 `BLOCKED`，不无限等待。
- **凭据保护**：密码只从 `TEST_TARGET_PASSWORD` 环境变量读取；不写源码、不写 Git、不写 evidence JSON、不打印日志、不进 URL、截图前清空登录表单。所有写入 evidence 的输出经 `redact()` 脱敏。
- **不改 WebSSH2**：WebSSH2 已在运行时直接复用；`WEBSSH2_AUTO_START` 默认为 `false`。本技能只会停止它自己记录的进程。
- **不伪造 PASS/FAIL**：命令执行没有真实可靠输出时，返回 `OUTPUT_UNVERIFIED` / `TIMEOUT` / `ERROR`，绝不臆造结果。

## 异常处理规则

返回稳定 outcome：`OK` / `BLOCKED` / `TIMEOUT` / `CONNECTION_LOST` / `OUTPUT_UNVERIFIED` / `ERROR`。

| 场景 | 处理 |
|---|---|
| WebSSH2 未安装/未启动/不可达 | `BLOCKED`，给诊断 |
| Playwright / Chromium 未安装 | `BLOCKED`，给安装命令 |
| SSH 认证失败 / 连接失败 | `BLOCKED` / `ERROR`，截图 `error.png` + evidence |
| 命令执行超时 | `TIMEOUT`，发 Ctrl+C 中断，截 `error.png` |
| 结束标记缺失 / 连接断开 | `CONNECTION_LOST` / `OUTPUT_UNVERIFIED` |
| 输出无法可靠读取 | `OUTPUT_UNVERIFIED`（不伪造） |
| 目标主机非白名单 | `BLOCKED`，安全拒绝 |
| 命令被策略拒绝（交互/危险） | `BLOCKED` |

异常后尽可能保存诊断截图与日志，但**绝不**在异常后伪造 PASS，也不把未执行的命令记为已执行。

## 证据保存规则

每次运行在 `evidence/<testcase_id>/<runId>/` 下创建独立目录（不覆盖历史）：

```
evidence/
  TC_OS_001/
    20261017122000-a1b2c3/
      01_connected.png
      02_result.png
      evidence.json
```

`evidence.json` 含 `schema_version`、`run_id`、`testcase_id`、`step_id`、`target`、`execution`（命令/起止时间/耗时/退出码/status/输出）、`assertion`、`screenshots`、`errors`。其中输出已脱敏。

## 状态定义

- `COMPLETED`：命令已执行完。
- `PASS`：断言通过。
- `FAIL`：断言失败。
- `TIMEOUT`：命令超时。
- `ERROR` / `BLOCKED`：工具或执行过程错误/被拒绝。
- `N/A` / `SKIP`：按规则跳过。

## 调用命令

```bash
# 环境检查
node src/index.mjs --check-env

# 测试用例文件
node src/index.mjs --testcase examples/TC_OS_001.json

# 单命令模式
node src/index.mjs --id TC_OS_001 --command "uname -a" --host 192.168.63.132 --username root
```

PowerShell 封装：
```powershell
.\scripts\run-testcase.ps1 -Testcase .\examples\TC_OS_001.json
.\scripts\run-testcase.ps1 -Id TC_OS_001 -Command "uname -a" -Host 192.168.63.132 -Username root
```

密码：
```powershell
$env:TEST_TARGET_PASSWORD = "运行时密码"
node src/index.mjs --id TC_X --command "uname -a" --host H --username U
Remove-Item Env:TEST_TARGET_PASSWORD
```

## 读取返回结果

程序最终在 stdout 输出稳定 JSON：

```json
{
  "ok": true,
  "outcome": "PASS",
  "testcase_id": "TC_OS_001",
  "run_id": "20261017122000-a1b2c3",
  "steps": [ { "step_id": "STEP_001", "status": "PASS", "exit_code": 0 } ],
  "evidence": "D:\\...\\evidence\\TC_OS_001\\20261017122000-a1b2c3\\evidence.json"
}
```

Agent 使用逻辑：
- `ok === true` 且每步 `PASS` → 任务通过。
- 任一步 `FAIL` / `TIMEOUT` / `ERROR` → 读取该步 `evidence.json` 的 `assertion.actual` 和 `errors` 说明失败原因。
- `outcome === BLOCKED` → 报告被安全策略/环境门禁阻止，附原因，**不**尝试绕过。
- 向用户汇报时，必须引用真实 `evidence.json` 路径与截图路径，说明是否真实执行。

## 示例任务

用户：「执行 TC_SSH_001，并保存测试截图。」

Agent 应：
1. 确认/构造 testcase（CFG `target` + 步骤命令 + `expected`）。
2. 校验目标主机白名单 + 授权。
3. 调 `node src/index.mjs --testcase .../TC_SSH_001.json`。
4. 读取 stdout JSON：若 `ok`，向用户汇报 PASS 与 `evidence.json` 路径、截图路径；否则汇报失败原因与诊断截图，绝不伪报成功。

## 安装与依赖

```powershell
cd D:\AAAA\Shixi_Project\webssh-test-runner
npm install
npx playwright install chromium
# 复制 .env.example 为 .env 并按需填写
powershell -ExecutionPolicy Bypass -File scripts/check-env.ps1   # 门禁
```

详见 [README.md](README.md) 与 [ENVIRONMENT.md](ENVIRONMENT.md)。
