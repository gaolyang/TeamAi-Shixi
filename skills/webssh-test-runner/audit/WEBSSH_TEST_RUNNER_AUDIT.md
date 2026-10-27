# webssh-test-runner 全面技术审计报告

- 审计日期：2026-10-17
- 审计对象：`D:\AAAA\Shixi_Project\webssh-test-runner`
- 审计类型：静态代码审查 + 可执行验证（只读，未改动源码）
- 审计环境：Windows 10 Home (10.0.19045) / Node v22.23.2 / npm 10.9.8

---

## 1. 总体结论

### 结论：`READY_WITH_LIMITATIONS`（核心链路可用，但仍有限制）

| 问题 | 结论 |
|---|---|
| 是否满足最初需求？ | **基本满足**：WebSSH2 + Playwright + Agent Skill 的自动化执行与截图留痕链路已真实实现，不是纯文档。 |
| 能否直接交给 Agent 使用？ | **可以，但有前提**：拿到一台"已授权 + 凭据有效"的目标主机后才能真正跑完全部成功闭环。 |
| 能否完成一次真实自动化测试？ | **核心机制可，但完整闭环尚未在本机验证通过**（缺有效凭据，见 4.3）。 |
| 能否在后台执行？ | **可以**：headless Playwright + 复用后台 WebSSH2。 |
| 能否可靠生成截图与 JSON 证据？ | **可以**：已真实验证 PNG 与 evidence.json 生成（含失败路径）。 |
| 是否可以接入 Excel 测试用例？ | **尚未**：目前只有 JSON testcase 接口，Excel/CIDA 驱动未接入（第五优先级）。 |

> **一项关键矛盾请求注意**：代码框架（架构、门禁、白名单、唯一结束标记、截图、证据）设计正确、实现完整，且**除"真实凭据下的完整成功闭环"外的部分已在本机验证通过**。但"完整成功闭环"在本机**未完成端到端验收**——因为本机 `192.168.63.132:22` 端口可达、却未提供有效凭据。这是**环境/凭据阻塞**，不是代码缺陷，但按审计规则只能标记为 `BLOCKED`，不能视为已通过。

---

## 2. 项目结构审计

```
webssh-test-runner/
├── SKILL.md                  # Agent 技能说明（YAML frontmatter + 使用/安全/异常/输出规范）
├── README.md                 # 概览 + 安装 + 使用
├── ENVIRONMENT.md            # 依赖、选择器、配置、验证状态、已知限制
├── REPORT.md                 # 开发汇报 + 使用方法
├── package.json / .env.example / .gitignore
├── config/config.example.json
├── examples/TC_OS_001.json   # 测试用例示例（2步）
├── scripts/
│   ├── check-env.ps1         # 环境门禁（Node/npm/Playwright/WebSSH2）
│   ├── install-prerequisites.ps1
│   ├── start-webssh2.ps1     # 复用/拉起 WebSSH2
│   ├── stop-webssh2.ps1      # 只停自有进程
│   └── run-testcase.ps1      # 运行封装
├── src/                      # Node 源码（职责分离）
│   ├── index.mjs             # CLI 编排入口
│   ├── environment-check.mjs # 硬门禁
│   ├── config-loader.mjs     # .env/config 加载
│   ├── host-validator.mjs    # 目标主机白名单/格式校验
│   ├── webssh-controller.mjs # WebSSH2 服务生命周期
│   ├── playwright-runner.mjs # 浏览器启动 + 连接表单
│   ├── command-executor.mjs  # 真实终端命令执行 + Socket.IO 帧解码
│   ├── completion-detector.mjs # 唯一结束标记包装器
│   ├── screenshot-manager.mjs  # 真实截图
│   ├── evidence-writer.mjs   # evidence.json（脱敏）
│   ├── result-parser.mjs     # PASS/FAIL 判定
│   ├── error-handler.mjs     # 异常分类
│   ├── safe-text.mjs         # 凭据脱敏
│   └── status.mjs            # 环境状态常量
├── tests/                    # node --test 单元测试（3 个文件）
└── evidence/                 # 运行证据（当前仅 .gitkeep）
```

**技术栈**：Node.js ≥20（ESM）、Playwright 1.64 + Chromium/headless-shell、Socket.IO v4 帧解码、`node --test` 单元测试、PowerShell 封装脚本。

---

## 3. 需求符合性矩阵

### 需求 A：Skill 结构与 Agent 调用能力

| 子项 | 状态 | 代码位置 | 验证证据 |
|---|---|---|---|
| 完整 SKILL.md | **PASS** | `SKILL.md` | 已读取，含 frontmatter + 使用/安全/异常/输出规范 |
| 适用场景与条件 | **PASS** | `SKILL.md` L23-44 | 明确"何时用/何时不用/调用条件" |
| 输入参数定义 | **PASS** | `SKILL.md` L47-77 | 参数表 + testcase JSON 结构 |
| 执行结果与输出格式 | **PASS** | `SKILL.md` L181-200 | stdout 稳定 JSON |
| 执行前环境检查 | **PASS** | `SKILL.md` L83；`src/index.mjs` L146 | `--check-env` 实测 `ENVIRONMENT_OK` |
| 异常/安全限制 | **PASS** | `SKILL.md` L106-129 | 白名单/交互命令/脱敏/不伪报 |
| 可实际执行的调用命令 | **PASS** | `SKILL.md` L155-179 | node CLI + PowerShell 封装 |
| Agent 能发现加载 | **PASS**（假设） | 见注 1 | 独立目录 + 标准 frontmatter；未实际装入 Agent |
| Agent 能通过 Skill 调脚本 | **PASS**（设计） | `package.json` bin | 未做真实 Agent 调用实测 |
| 避免临时写 Playwright 脚本 | **PASS** | `src/playwright-runner.mjs` | 封装在模块内 |
| 独立项目目录运行 | **PASS** | — | 独立目录，可移植 |
| 如何安装到 Agent Skill 目录 | **PARTIAL** | `REPORT.md` L33 | 只给了软链说明，未自动安装 |

> 注 1：当前 Agent（本会话）通过**项目级可用**方式即可调用 `node src/index.mjs`，SKILL 不是纯提示词文档、有真实可执行代码（A 类需求核心达成）。

### 需求 B：WebSSH2 环境检查与后台运行

| 子项 | 状态 | 代码位置 | 验证证据 |
|---|---|---|---|
| 识别安装目录 | **PASS** | `environment-check.mjs` L99-112 | 实测找到 `D:\DSH对话\webssh2` |
| 检测服务运行 | **PASS** | `webssh-controller.mjs` L45-66 | 实测 HTTP 200 |
| 检测 `/ssh` 可访问 | **PASS** | `webssh-controller.mjs` L50 | 实测 HTTP 200 |
| 区分页面可达 vs SSH 会话建立 | **PASS** | `command-executor.mjs` L101-119 `probeConnected` | 用探测命令+唯一标记验证 live shell |
| 已运行则复用 | **PASS** | `index.mjs` L160-165 | 实测复用，不重启 |
| 未运行则按配置拉起 | **PASS**（设计） | `startWebSSH2` L80-115 | 未实际触发（服务已在跑） |
| 避免重复启动/端口冲突/误杀 | **PASS** | `webssh-controller` + `stop-webssh2.ps1` | ownedPids 机制 + ps1 校验 |
| Windows 运行 | **PASS** | 全项目 | 实测通过 |
| 后台常驻 | **PASS** | `spawn` detached + headless | — |
| 日志与故障处理 | **PARTIAL** | `webssh-controller.mjs` L93-95 | 有日志，但启动失败重试/清理有限 |
| 默认本机监听 | **PASS** | 默认 `127.0.0.1:2222` | — |
| 正确处理启动失败 | **PARTIAL** | `startWebSSH2` L109-114 | 20s 超时报错，但无回滚/清理 |

### 需求 C：Playwright 与 Chromium

| 子项 | 状态 | 代码位置 | 验证证据 |
|---|---|---|---|
| 正确安装使用 Playwright | **PASS** | `package.json` | 实测 import 正常 |
| 验证 Chromium 可启动 | **PASS** | `environment-check.mjs` L82-97 | 实测 executablePath 存在 |
| Headless 无头 | **PASS** | `playwright-runner.mjs` L30-36 | 默认 `headless:true` |
| 可选有头调试 | **PASS** | `--headful` L47 | — |
| 打开真实 WebSSH2 页面 | **PASS** | `playwright-runner.mjs` L49 | 实测 |
| 等待页面/终端加载 | **PASS** | L65-66 | `state:'attached'` |
| 定位当前版本元素 | **PASS** | `SELECTORS` L9-17 | 选择器来自真实 v5.4.2 DOM |
| 识别 SSH 连接成功状态 | **PARTIAL**（见注2） | `probeConnected` | 机制正确，但需真实凭据验证"成功"分支 |
| 浏览器中输入命令 | **PASS** | `command-executor.type` L122-128 | insertText+Enter |
| 等待终端输出 | **PASS** | 唯一结束标记轮询 L155-172 | 非固定 sleep |
| 生成真实 PNG | **PASS** | `screenshot-manager.mjs` | 实测生成 |
| 结束释放资源 | **PASS** | `playwright-runner.close` L69-74 | `finally` 内调用 |
| 超时/错误截图 | **PASS** | `index.mjs` error.png | 实测失败路径截图 |
| 无硬编码等待/脆弱选择器 | **PASS** | 全源码 | 无 `waitForTimeout`；选择器基于实测 DOM |

> 注 2：连接选择器、live-shell 判定机制均已实测，但"带正确密码的完整成功 SSH 会话"这一分支因缺凭据未闭环验证。

### 需求 D：真实 SSH 命令执行 ★（最重要）

| 子项 | 状态 | 代码位置 | 验证证据 |
|---|---|---|---|
| 命令经 WebSSH2 终端输入 | **PASS**（机制+实测） | `command-executor.mjs` | Socket.IO 帧读取实测 |
| 连接授权 Linux/FusionOS 机 | **BLOCKED** | `index.mjs` | `192.168.63.132:22` 可达但无凭据 |
| 执行 `echo WEBSSH_AUTOMATION_TEST` | **BLOCKED** | — | 需有效凭据 |
| 执行 `uname -a` | **BLOCKED** | — | 需有效凭据；单测覆盖包装器 |
| 获得远端真实输出 | **PASS**（机制） | `decodeFrame` + 结束标记 | 帧格式实测 `42["data",...]` |
| 识别命令完成 | **PASS** | `extractCompletion` 唯一标记 | 单测覆盖，非固定等待 |
| 取得可靠退出码 | **PASS**（设计） | `$?` 捕获进 END 标记 | 单测覆盖 |
| 区分"执行完成"与"断言通过" | **PASS** | `result-parser.mjs` / `index.mjs` L237 | exit0≠PASS，须匹配 expected |
| 处理超时 | **PASS** | L175-183 | Ctrl+C + TIMEOUT |
| 处理 SSH 断线 | **PARTIAL** | `_parseEvent` + classifyError | 有探测，断线恢复未实测 |
| 处理输出不完整 | **PARTIAL** | `OUTPUT_UNVERIFIED` 定义 | 有状态，无大量实测 |
| 处理长输出/滚动 | **PASS**（帧读取） | 帧解码不依赖渲染 | 解析不受视口裁剪影响 |
| 不把本地执行误当远端 | **PASS** | 全部经远端 shell | — |
| 无模拟/伪造输出 | **PASS** | — | 无 mock 冒充；凭据缺失时诚实 BLOCKED |
| 命令关联用例/步骤 ID | **PASS** | `index.mjs` writeStep | evidence 含 testcase/step |

**结束检测机制评估（关键）**：采用唯一 BEGIN/END token + base64 经远端 `sh` 执行 + `$?` 捕获真实退出码，**替代固定 sleep**，设计正确。标记由远端 shell 输出、与本次 token 关联、退出码在打印标记前保存（`$?`）。此机制满足审计要求，非固定 `waitForTimeout`。

### 需求 E：自动截图与证据留存

| 子项 | 状态 | 代码位置 | 验证证据 |
|---|---|---|---|
| 连接成功截图 | **PASS** | `index.mjs` L190 | `01_connected.png` |
| 命令执行后截图 | **PARTIAL**（见注3） | `index.mjs` L224-225 | 生成，但多步会被覆盖 |
| 失败/超时诊断截图 | **PASS** | `error.png` | 实测生成 |
| 截图来自真实页面 | **PASS** | `page.screenshot` | — |
| 含实际命令与输出 | **PASS** | 截 `.xterm` | 实测 |
| 每用例/批次独立目录 | **PASS** | `evidence/<case>/<runId>/` | 实测 |
| 稳定命名规则 | **PARTIAL** | `02_result.png` | 命名稳定但多步同名覆盖 |
| 避免覆盖同名截图 | **FAIL/设计缺陷** | `index.mjs` L224 | 多步 testcase 中每步都写同一 `02_result.png`，只保留最后一步 |
| 记录截图路径 | **PASS** | evidence.screenshots | — |
| JSON 关联截图 | **PARTIAL** | evidence-writer | 关联但覆盖问题导致不完整 |
| 截图写入失败处理 | **PASS** | `captureSafe` | 吞错不翻转结果 |
| 敏感信息不进截屏/日志 | **PARTIAL** | `safe-text.mjs` / 连接后清表单 | 输出有脱敏；但密码进表单字段时会短暂出现在页面截图？见 8-G |

### 需求 F：Evidence JSON 与结果判定

JSON 记录字段（审计确认均已实现）：`run_id`、`testcase_id`、`step_id`、target(host/port/username/os)、backend、command、start/end_time、duration_ms、exit_code、status、output、expected、assertion.actual/passed/rule、screenshots、errors。

| 子项 | 状态 | 代码位置 | 验证证据 |
|---|---|---|---|
| JSON 符合约定结构 | **PASS** | `evidence-writer.mjs` | 单测 + 早前失败路径实测 |
| 时间来自实际执行 | **PASS** | `startTime/endTime` | — |
| 退出码来自真实执行 | **PASS**（设计） | END 标记解析 | 单测覆盖 |
| 截图路径确实存在 | **PASS** | — | 返回路径 |
| 区分 PASS/FAIL/TIMEOUT/ERROR/N/A/SKIP | **PARTIAL** | `finalStatus` | 有定义，但 index 主流程未用 `finalStatus`；N/A/SKIP 未接入 |
| 区分执行状态与断言状态 | **PASS** | execution.status vs assertion.passed | — |
| 避免把所有成功命令标 PASS | **PARTIAL**（见注4） | `index.mjs` L237 / `result-parser` | exit0 在无 expected 时会被判 PASS |
| 结果不可验证时返回未知/异常 | **PASS** | `OUTPUT_UNVERIFIED`/`TIMEOUT`/`ERROR` | — |
| 敏感凭据写入 JSON | **PASS**（未写） | `redact` | 单测验证脱敏 |

> 注 4：当命令**没有 `expected` 断言**（如单命令模式、read 类 check）且退出码为非 0 时，`evaluateAssertion(null,…)` 返回 `passed:true`，`index.mjs` L237 把它判为 **PASS**。这与 SKILL/README 宣称的"不臆造 PASS/FAIL"矛盾——未提供断言时实际被标 PASS，而不是只记录状态。

### 需求 G：安全性

| 子项 | 状态 | 代码位置 | 验证证据 |
|---|---|---|---|
| 目标主机白名单 | **PASS**（存在） | `host-validator.mjs` | 实测拒绝非白名单 |
| 连接前强制校验 | **PASS** | `index.mjs` L152-157 | 实测 `SSH_TARGET_INVALID` 阻断 |
| 可绕过白名单 | **FAIL/风险** | `--allowed-hosts` CLI 覆盖 L51 | 调用方可临时覆盖白名单 |
| 密码写源码/Git | **PASS**（未写） | — | 从 env 读取 |
| `.env` 进 gitignore | **PASS** | `.gitignore` | 含 `.env`/`*.local` |
| 日志泄露密码 | **PASS**（脱敏） | `redact` | 单测 |
| 关闭主机身份校验 | **PASS**（未做） | — | 无 SkipHostKey 相关 |
| 危险命令风险控制 | **FAIL/未实现**（见注5） | 无实际 gate | `allowChange` 仅配置未使用 |
| 配置修改/重启授权要求 | **PARTIAL** | `websshAutoStart=false` | 默认安全，但回调路径无授权强制 |
| 配置修改备份/回滚 | **PASS**（未适用） | 不修改系统配置 | 审计期未触发 |
| 失败时不误报加固通过 | **PASS** | 诚实返回 | 实测失败路径 |
| 不合法主机阻止执行 | **PASS** | 实测 | 连接前阻断 |

> 注 5：SKILL/ENVIRONMENT 宣称"只读/危险命令安全策略已实现"，但代码中**只有 `isInteractive` 拦截**，没有任何危险命令风险分级 gate；`allowChange`/`ALLOW_CHANGE` 仅穿管未生效。这是"文档与实现不符"。

### 需求 H：异常处理与可维护性

| 异常场景 | 状态 | 处理 |
|---|---|---|
| WebSSH2 不可用 | **PASS** | `BLOCKED` |
| Playwright 未安装 | **PASS** | `BLOCKED` + 安装命令 |
| Chromium 不可用 | **PASS** | `CHROMIUM_UNAVAILABLE` + msedge 回退 |
| SSH 认证失败 | **PASS** | `BLOCKED/ERROR` + error.png + evidence（实测） |
| 页面元素定位失败 | **PARTIAL** | 抛错 → error.png |
| SSH 连接断开 | **PARTIAL** | `CONNECTION_LOST` 分类存在，运行中断线未实测 |
| 命令超时 | **PASS** | `TIMEOUT` + Ctrl+C |
| 结束标记缺失 | **PASS** | `TIMEOUT` |
| 输出无法验证 | **PARTIAL** | `OUTPUT_UNVERIFIED` 状态定义，主流程未完全走通 |
| 截图失败 | **PASS** | swallow，不翻转结果 |
| JSON 写入失败 | **PARTIAL** | 未单独处理（`writeFileSync` 同步抛） |
| 目标主机被拒 | **PASS** | 连接前 `BLOCKED`（实测） |
| 浏览器退出异常 | **PASS** | `finally` 释放 |
| 回滚失败 | N/A | 不做系统回滚 |

异常后：返回状态码、保存错误截图、释放资源、不把异常包装成 PASS——**基本满足**。

**可维护性**：模块职责分离清晰、无 TODO/FIXME、无 `console.error`/debugger、无 `waitForTimeout`。整体良好。

---

## 4. 实际验证结果

| # | 测试项 | 执行情况 | 实际结果 | 证据 | 结论 |
|---|---|---|---|---|---|
| 1 | 单元测试 | 已执行 | **20/20 通过** | 上方终端输出 | 实际通过 |
| 2 | 环境门禁 `--check-env` | 已执行 | **`ENVIRONMENT_OK`** | JSON | 实际通过 |
| 3 | WebSSH2 HTTP 访问 `/ssh` | 已执行 | **HTTP 200** | curl | 实际通过 |
| 4 | 目标主机可达性 | 已执行 | **`192.168.63.132:22` 端口开放** | /dev/tcp | 实际通过 |
| 5 | 白名单拒绝（连接前） | 已执行 | **`SSH_TARGET_INVALID` / BLOCKED** | JSON | 实际通过 |
| 6 | 真实 SSH 连接（有效凭据） | **BLOCKED** | 缺有效凭据 | — | 环境受限，未执行 |
| 7 | 简单命令执行（echo/uname） | **BLOCKED** | 需有效凭据 | — | 环境受限 |
| 8 | 命令失败处理 | **BLOCKED** | 需有效凭据 | — | 环境受限 |
| 9 | 超时处理 | **BLOCKED** | 需有效凭据闭环 | — | 环境受限 |
| 10 | Headless 截图（成功路径） | **BLOCKED** | 需有效凭据；失败路径已实测 | 早前 error.png | 部分 |
| 11 | 主机白名单（未授权地址） | 已执行 | **拒绝执行** | 实测 | 实际通过 |
| 12 | 证据完整性（成功路径） | **BLOCKED** | 无成功证据留存（evidence 仅 .gitkeep，早前失败证据已被清理） | — | 待补 |

> **诚实说明**：因本机未取得有效 SSH 凭据，测试 6–12 的成功分支**未执行**，标记为 `BLOCKED`，**未伪造任何结果**。早前另一会话在错误凭据下真实产出的 `error.png + evidence.json`（认证失败路径）证实了失败留痕能力，但该文件已被清理，当前 `evidence/` 下已无留存证据。

---

## 5. 问题清单

### P0（严重安全/危险操作）
- 无。审计未发现 P0 级缺陷。

### P1（核心链路不可用 / 错误证据）
- **P1-1｜完整成功闭环未端到端验证**：`BLOCKED`
  - 位置：贯穿 `index.mjs` / `command-executor.mjs`
  - 复现：需要一台已授权 + 有效凭据的主机执行 `echo WEBSSH_AUTOMATION_TEST` / `uname -a`，验证 PASS + 成功截图 + evidence。
  - 影响：目前不能宣称"能完成一次真实测试"。
  - 修复：提供有效凭据测试机后按 ENVIRONMENT.md 的"如何补做完整远端验收"执行。
  - 验证：期望 `ok:true`、步骤 `PASS`、生成 `01_connected.png`/`02_result.png`/`evidence.json` 且 exit_code 为真实值。

### P2（可靠性 / 异常 / 文档不一致）
- **P2-1｜无论成败主流程都 `process.exit(0)`**
  - 位置：`src/index.mjs:294`
  - 描述：执行完所有步骤后无条件 `exit(0)`，即使所有步骤 `FAIL`。与 README「成功退出 0、失败退出非 0（Agent 可依赖退出码）」**矛盾**。
  - 复现：对一个必然 FAIL 的用例跑完，观察退出码仍为 0。
  - 影响：依赖退出码的 Agent 会把失败运行误判为成功（虽然 stdout JSON 有 `ok:false`）。
  - 修复：按 summary.ok 返回 `process.exit(summary.ok ? 0 : 1)`。
  - 验证：FAIL 后退出码非 0。

- **P2-2｜多步 testcase 截图被同名覆盖**
  - 位置：`src/index.mjs:224`（所有步骤共用 `02_result.png`）
  - 描述：每个 step 都写同一 `02_result.png`，多步用例只保留最后一步截图，无法按步骤审计。
  - 修复：命名为 `STEP_<n>_result.png` 或 `02_<stepId>.png`。
  - 验证：两步用例应生成两张不同截图。

- **P2-3｜无断言 + 非零退出码被误判 PASS**
  - 位置：`src/result-parser.mjs:51-53` + `src/index.mjs:237`
  - 描述：未提供 `expected` 时 `evaluateAssertion` 返回 `passed:true`，非零退出码命令被标 PASS。与 SKILL「不臆造 PASS」矛盾。
  - 修复：无 `expected` 时若 `exit_code !== 0` 应判定为 FAIL 或输出 `COMPLETED`（而不映射到 PASS），或要求提供 `expected`。
  - 验证：`node … --command "false"`（无断言）不应 PASS。

- **P2-4｜白名单可被 `--allowed-hosts` 运行时覆盖**
  - 位置：`src/index.mjs:51`
  - 描述：任何调用者可用 CLI 覆盖白名单，绕过"硬门禁"；且默认 `allowedHosts: []` 时只做格式校验、不比较白名单。
  - 修复：区分"显式加固白名单"与"临时覆盖"；默认无白名单时禁止无人值守不可达目标，或在 SKILL 明确此为 advisory。
  - 影响：安全边界比文档弱。

- **P2-5｜`allowChange` / 危险命令风险控制未实现**
  - 位置：`src/config-loader.mjs:85`（仅配置），无实际 gate
  - 描述：SKILL/ENVIRONMENT 称"只读/危险命令安全策略已实现"，但代码中除 `isInteractive` 外无危险命令分级/授权 gate。
  - 修复：实现危险命令列表 + `allowChange` 门控，或弱化文档表述。

- **P2-6｜`--password` CLI 参数与"绝不进参数"矛盾**
  - 位置：`src/index.mjs:43,101`
  - 描述：代码支持 `--password`（会出现在进程 argv），虽文档称"密码绝不进参数"。
  - 修复：移除 `--password` 或标记为废弃并强制走 env。

- **P2-7｜`isInteractive` 误伤合法 SSH 检查命令**
  - 位置：`src/completion-detector.mjs:20`（`\bssh\s+`）
  - 描述：含「`ssh `」子串的只读命令（如 `grep -i ssh /etc/ssh/sshd_config`）会被误判为交互命令而 `BLOCKED`，而这恰是本工具要跑的加固检查。
  - 修复：改用命令首词匹配或更精确的交互判断。
  - 验证：对 `grep -i ssh /etc/ssh/sshd_config` 不应 BLOCKED。

### P3（文档 / 维护 / 非关键）
- **P3-1**：连接失败 evidence 中 `durationMs` 硬编码为 0（`index.mjs:200`）。
- **P3-2**：私钥登录明确不支持，遇到私钥主机会 `BLOCKED`（`playwright-runner.mjs:56-58`）——对仅私钥登录的主机不适用（文档已声明）。
- **P3-3**：`N/A`/`SKIP` 状态与 `finalStatus` 已定义但主流程未接入（`index.mjs` 未用 `finalStatus`）。
- **P3-4**：evidence 目录当前无成功路径留存证据（早前失败证据已被清理）；建议保留一次真实成功运行作为验收留痕。

---

## 6. 完成度评估

| 能力项 | 状态 | 依据 |
|---|---|---|
| Skill 与 Agent 集成 | **设计完成** | SKILL.md 完整 + 可执行 CLI；真实 Agent 加载未实测 |
| 环境检查 | **验证完成** | `ENVIRONMENT_OK` 实测 |
| WebSSH2 后台服务管理 | **验证完成（复用路径）** | HTTP 200 实测；自动拉起路径未实测 |
| Playwright 无头执行 | **验证完成** | 实测（页面/表单/终端/截图） |
| SSH 自动连接 | **部分验证** | 表单+live-shell 判定实测；带密码成功分支 BLOCKED |
| 真实命令执行 | **设计+机制验证** | 帧解码/包装器实测；完整成功命令 BLOCKED |
| 命令完成检测与退出码 | **验证完成（机制+单测）** | 唯一结束标记 + `$?` 单测覆盖 |
| 自动截图 | **验证完成（失败路径）** | error.png 实测生成 |
| Evidence JSON | **验证完成（结构+脱敏+失败路径）** | 单测 + 早前失败 evidence |
| 安全控制 | **部分** | 白名单实测有效；危险命令 gate / --allowed-hosts 覆盖有缺陷 |
| 异常处理 | **验证完成（大部分）** | 状态码/截图/释放/不伪报 |
| 测试用例扩展能力 | **基础完成** | JSON testcase + 多步；Excel/CIDA 未接入 |

**总体完成度（说明计算规则）**：按"代码实现完整性"约 **90%**；按"全部需在实机验证通过才算完成"则核心成功闭环尚未闭环（BLOCKED），故**"已验证的可交付度"约 75–80%**。未验证的完整成功闭环（真实凭据下 echo/uname→PASS→成功截图）单独列出，**不计入已完成**。

---

## 7. 整改路线图

| 优先级 | 任务 | 对应模块 | 验收标准 |
|---|---|---|---|
| 1 | 保证真实 SSH 命令执行正确可靠 | `command-executor/index` + 实机验收 | 用有效凭据跑通 echo/uname，退出码可靠 |
| 2 | 命令结束检测/退出码/PASS-FAIL 判定准确 | `index`/`result-parser` | 修复 P2-1、P2-3；FAIL/非零退出码正确反映 |
| 3 | 截图与 JSON 证据真实完整可追溯 | `index`/`screenshot-manager`/`evidence-writer` | 修复 P2-2 多步截图覆盖；证据含每步截图 |
| 4 | 环境检查、后台服务管理、异常恢复 | `webssh-controller`/`environment-check` | 自动拉起、断线恢复实测 |
| 5 | Skill 安装与 Agent 调用方式 | SKILL/doc | 装入 Agent 并真实调用一次 |
| 6 | Excel/CIDA 用例驱动、批量、Word 报告 | 新增 | 从 Excel 生成 testcase 并执行、汇总报告 |

---

## 8. 最终建议

1. **当前版本能否直接用于实机测试？** 机制可，但**仍缺一次真实凭据下的完整成功验收**；在拿到有效凭据前，建议不要宣称"已能完成真实测试"。
2. **阻塞点是什么？** 唯一硬阻塞：**缺少已授权 + 有效凭据的测试主机**（`192.168.63.132:22` 端口可达但无密码/密钥）。
3. **最少修复哪些才能形成可用 V1.0？**
   - P2-1（退出码）—— Agent 依赖错误。
   - P2-2（多步截图覆盖）—— 证据完整性。
   - P2-3（无断言非零退出码误 PASS）—— 正确性 + 与文档一致。
   - 然后补做一次真实成功端到端验收。
4. **哪些可推迟？** P2-5（危险命令 gate）、P2-7（isInteractive 误伤）、P3 各项、Excel/CIDA/Word（第六优先级）。
5. **应先批准哪些整改？** 建议先修 **P2-1、P2-2、P2-3**，再安排一台有效凭据主机做完整成功闭环验收。是否授权我按此整改？我会先只改这三处，跑回归，再请你核实。

---

*审计为只读验证，未修改任何源码、配置或系统状态。*
