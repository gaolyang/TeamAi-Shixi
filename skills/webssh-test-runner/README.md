# webssh-test-runner

通过 **WebSSH2 浏览器 SSH 终端 + Headless Playwright** 自动执行 Linux / FusionOS 测试命令的 Skill。核心链路：

```
用户/飞书/命令行 → AI Agent → webssh-test-runner
   → 环境门禁 → 白名单 → 复用后台 WebSSH2
   → Headless Chromium → 打开 /ssh → 自动填写连接表单
   → 真实 xterm.js 终端 → SSH → Linux/FusionOS
   → 输入包装器命令(唯一结束标记) → 读取真实输出/退出码
   → 真实截图 → evidence.json → 返回 Agent
```

**关键承诺**：只通过真实 WebSSH2 终端执行，不伪造输出、不用 Paramiko 冒充、不臆造 PASS。

## 安装

需要 Node.js ≥ 20。

```powershell
cd D:\AAAA\Shixi_Project\webssh-test-runner
npm install
npx playwright install chromium
# 复制 .env.example -> .env（如需持久配置）
```

## 环境门禁

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-env.ps1
# 或
node src/index.mjs --check-env
```

只有 `ENVIRONMENT_OK` 才进入执行。状态还包括 `ENVIRONMENT_MISSING`、`WEBSSH2_UNAVAILABLE`、`PLAYWRIGHT_UNAVAILABLE`、`CHROMIUM_UNAVAILABLE`、`SSH_TARGET_INVALID`。

## 使用

```powershell
# 测试用例文件
node src/index.mjs --testcase examples/TC_OS_001.json

# 单命令模式
node src/index.mjs --id TC_OS_001 --command "ss -lntup" --host H --username root

# 调试（显示浏览器）
node src/index.mjs --id TC --command "uname -a" --host H --username root --headful
```

密码用环境变量（绝不进参数/文件/日志）：

```powershell
$env:TEST_TARGET_PASSWORD = "运行时密码"
node src/index.mjs --testcase examples/TC_OS_001.json
Remove-Item Env:TEST_TARGET_PASSWORD
```

PowerShell 封装：`.\scripts\run-testcase.ps1 -Testcase .\examples\TC_OS_001.json`

## 输出

```
evidence/<testcase_id>/<runId>/
  01_connected.png      # 连接成功终端
  02_result.png         # 每条命令执行结果
  error.png             # 异常/超时诊断
  evidence.json         # 结构化证据（脱敏）
```

## WebSSH2 服务

- 已在运行 → **直接复用**，不重启、不 kill、不占第二个端口。
- 未运行 → 只有当 `WEBSSH2_AUTO_START=true` 才由本技能拉起；拉起后记录 pid，停止时只停自己启动的进程。
- 本机安装目录已从 `C:\webssh` 和 `D:\DSH对话\webssh2` 自动探测。

## 测试

```powershell
npm test
# 或
node --test "tests/*.test.mjs"
```

单元测试（白名单、命令包装器、结束标记、Socket.IO 帧解码、evidence 脱敏、结果判定）不需要真实主机。

## 结构

```
src/
  index.mjs               CLI 编排入口
  environment-check.mjs   环境门禁（硬门禁）
  config-loader.mjs       .env/config 加载
  host-validator.mjs      目标主机白名单
  webssh-controller.mjs   WebSSH2 服务生命周期
  playwright-runner.mjs   浏览器启动 + 连接表单
  command-executor.mjs    真实终端命令执行 + socket 解码
  completion-detector.mjs 唯一结束标记包装器
  screenshot-manager.mjs  真实截图
  evidence-writer.mjs     evidence.json
  result-parser.mjs       PASS/FAIL 判定
  error-handler.mjs       异常分类
  safe-text.mjs           凭据脱敏
scripts/                  PowerShell 脚本
tests/                    node --test 单元测试
examples/                 测试用例示例
```

## 已验证 vs 尚未完整验证

见 [ENVIRONMENT.md](ENVIRONMENT.md) 的「验证状态」一节。核心架构（连接、终端、socket 解码、命令包装、截图、evidence）已在本机真实验证；**远端完整成功闭环**需要在获得一台已授权、凭据有效的主机后执行验收用例，或当时主机的密码另行提供。
