# ContextLens / ContextAnswer 浏览器学习助手

[English README](README.md)

ContextLens 是一个 Chromium Manifest V3 浏览器扩展。阅读网页代码或技术文档时，用户可通过划词后的 Lens 图标或右键菜单打开统一的 **ContextAnswer** 面板，获得翻译、含义、作用、结构与上下文相关的解释，也可以进行普通对话。

默认界面是网页内 Shadow DOM 面板，不依赖 `chrome.sidePanel`，因此可在大多数允许扩展内容脚本的 Chromium 浏览器中使用，例如 Chrome、Edge、联想浏览器等。旧原生侧边栏仍作为兼容宿主保留。

## 主要功能

- 自动采集选区、完整代码块、表格、标题层级、相邻内容、页面元信息和右键元素上下文。
- 统一 ContextAnswer 面板支持拖动、流式回答、停止请求、主页、历史、日志、设置和中英切换。
- 提供“学习模式”和“普通聊天”。学习模式支持语言提示、自动选择、手动选择和自行添加上下文。
- 自动上下文优先使用 TypeSafe Jev 判断，低置信度或不可用时回退 LLM JSON 判断；仅按 `0 → 5 → 10 → 20` 行逐步扩展。
- 网页内面板和原生侧边栏的“设置”都可以直接开关自动上下文评估、Jev 判断、LLM 兜底判断；浏览器本地设置优先于 `.env`，不需要为了切换开关重新构建配置。
- 设置页可添加、修改、删除并选择多个 Gemini、OpenAI、Claude、自定义兼容 API 和本地 CLI Agent 模型。
- `.env` 可配置默认模型，并可提前预置最多 5 个额外模型。
- 学习模式按“页面来源 + 语言 + 规范化选区”保存最多 20 轮记忆；下一轮注入摘要和最近 4 轮，旧记录摘要在回答后异步生成。
- 记录按一次用户请求归组的 LLM 时间线；不会在日志中保存 Key、URL、提示词、选区或回答正文。

## 环境要求

- Chromium 浏览器：Chrome、Edge、联想浏览器或其他支持加载未打包扩展的 Chromium 浏览器。
- Node.js 18+ 与 `pnpm`（或兼容包管理器），用于生成扩展本地运行时配置。
- 一个远程 API Key 与模型地址，或本地兼容模型服务。
- 可选本地 Agent：安装 Claude Code、Codex CLI、Antigravity CLI、Copilot CLI 之一，并可启动 Node Bridge。

## 快速开始

1. 安装依赖：

   ```powershell
   pnpm install
   ```

2. 将 `.env.example` 复制为 `.env`，至少填写一个默认模型。例如 OpenAI 兼容接口：

   ```env
   CONTEXTLENS_PANEL_MODE=in-page
   CONTEXTLENS_API_PROVIDER=custom
   CONTEXTLENS_API_KEY=你的密钥
   CONTEXTLENS_API_URL=https://provider.example/v1
   CONTEXTLENS_MODEL=你的模型名
   ```

3. 生成浏览器扩展可读取的本地配置：

   ```powershell
   pnpm run build:env
   ```

4. 打开浏览器扩展管理页面，启用“开发者模式”，点击“加载已解压的扩展程序”，选择本项目根目录。

5. 在网页划词，点击 Lens 悬浮图标，打开 ContextAnswer。修改脚本、`manifest.json` 或 `.env` 后，重新执行需要的构建命令并在扩展管理页点击“重新加载”。

## 使用 ContextAnswer

默认 `in-page` 策略会打开一个可拖动面板。标题栏包含主页、历史、日志、设置、中英切换和关闭按钮。

- **学习模式**：选择源码语言和上下文策略，点击“一键学习解释”或输入具体问题。
- **普通聊天**：无需先选区；当前打开的面板保留最近 20 轮对话。
- **自动选择**：Jev 优先、LLM 回退；不足时逐步读取上下各 5、10、20 行。超过 20 行仍不足时会要求粘贴缺失定义或调用处。
- **手动选择**：选择 `0 / 5 / 10 / 20` 行。`0` 行只发送选区，不会调用 Jev 或 LLM 的充分性判断。
- **自行添加**：粘贴远处的结构体、接口定义、调用方或文档段落；它会作为明确标记的补充资料发送。
- **中英切换**：点击标题栏的 `中文 / EN`。该设置与原生侧边栏共用 `uiLanguage` 偏好；它翻译 ContextAnswer 的界面控件，模型回答的语言仍由学习配置单独控制。
- **判断开关**：设置中的“自动上下文评估”控制是否进入充分性判断；“Jev 判断”控制 Jev 主路线；“LLM 兜底判断”只控制 Jev 不可用或请求失败时的 LLM JSON 回退。三个开关关闭时，仍会正常请求最终解释模型，但只使用当前选区。

## 模型管理

主页只负责切换当前模型，绝不展示 Key、URL 或模型编辑字段。所有敏感连接参数和模型列表都在 **设置** 页面内。

- 在设置页填写供应商、显示名称、模型名以及必要的 Key/URL 后点击“添加模型”。
- 已保存模型可修改、删除，添加后会出现在主页下拉菜单中。
- `.env` 模型会作为只读预置项显示，可直接选择；如需网页内修改，可点击“复制编辑”创建浏览器本地副本。
- 主页选择“环境默认模型（.env）”会清除网页端的当前模型选择，恢复 `.env` 默认模型。

### 默认模型 `.env` 配置

| 变量 | 作用 |
| --- | --- |
| `CONTEXTLENS_API_PROVIDER` | `gemini`、`openai`、`claude` 或 `custom` |
| `CONTEXTLENS_API_KEY` | 默认远程模型 API Key |
| `CONTEXTLENS_API_URL` | 自定义/OpenAI 兼容接口基地址；未填完整端点时自动补 `/chat/completions` |
| `CONTEXTLENS_API_ENDPOINT` | 可选完整端点，填写后原样请求 |
| `CONTEXTLENS_MODEL` | 默认模型标识 |
| `CONTEXTLENS_PANEL_MODE` | `in-page`（默认）、`auto` 或 `native` |

### 额外预置模型

除默认模型外，可通过编号 `1` 到 `5` 预置额外模型。扩展加载时它们会进入主页下拉菜单和设置页模型列表：

```env
# provider 可选：gemini | openai | claude | custom | claude-agent | codex-agent | antigravity-agent | copilot-agent
CONTEXTLENS_EXTRA_MODEL_1_NAME=DeepSeek Flash
CONTEXTLENS_EXTRA_MODEL_1_PROVIDER=custom
CONTEXTLENS_EXTRA_MODEL_1_API_KEY=你的密钥
CONTEXTLENS_EXTRA_MODEL_1_API_URL=https://provider.example/v1
CONTEXTLENS_EXTRA_MODEL_1_API_ENDPOINT=
CONTEXTLENS_EXTRA_MODEL_1_MODEL=deepseek-flash
CONTEXTLENS_EXTRA_MODEL_1_BRIDGE_URL=
CONTEXTLENS_EXTRA_MODEL_1_COMMAND_PATH=
```

复制这一组并将编号替换为 `2`、`3`、`4`、`5` 即可。空白或不完整配置会被忽略。修改 `.env` 后必须执行 `pnpm run build:env`，再重新加载扩展。预置项不会复制到浏览器本地模型存储。

### 学习模式和充分性判断配置

| 变量 | 作用 |
| --- | --- |
| `CONTEXTLENS_LEARNING_RESPONSE_LANGUAGE` | 默认回答语言，如 `zh-CN` |
| `CONTEXTLENS_LEARNING_TRANSLATION_ENABLED` | 是否在需要时生成翻译 |
| `CONTEXTLENS_LEARNING_CONTEXT_MODE` | 默认 `auto`、`manual` 或 `custom` |
| `CONTEXTLENS_LEARNING_MANUAL_LINES` | 手动模式可用 `0`、`5`、`10`、`20` |
| `CONTEXTLENS_LEARNING_CONTEXT_ASSESSMENT_ENABLED` | 是否允许自动上下文充分性判断 |
| `CONTEXTLENS_JEV_ENABLED` | 是否开启 Jev 主判断路线；可在设置中覆盖 |
| `CONTEXTLENS_LLM_ASSESSMENT_ENABLED` | 是否开启 LLM JSON 回退判断；可在设置中覆盖 |
| `CONTEXTLENS_LEARNING_REQUEST_TIMEOUT_MS` | 学习任务总超时，默认 `90000` 毫秒 |
| `CONTEXTLENS_LEARNING_ASSESSMENT_TIMEOUT_MS` | 每次判断超时，默认 `15000` 毫秒 |

Jev 和 LLM 判断均关闭时，自动模式会明确提示只使用当前选区，不自动扩展上下文，但最终解释模型仍正常调用。

上述三个开关也可以直接在 ContextAnswer 的“设置”中修改。设置保存到浏览器本地，立即影响后续请求；Jev 的 API Key、URL、Model 仍需通过 `.env` 提供。删除本地偏好后会恢复 `.env` 默认值。

### 本地 API 与本地 Agent

设置 `CONTEXTLENS_USE_LOCAL_MODEL=true` 后，扩展使用 `CONTEXTLENS_LOCAL_API_*`，可连接 Ollama、LM Studio、vLLM 等兼容服务。

本地 CLI Agent 是另一条路径：设置 `CONTEXTLENS_USE_LOCAL_AGENT=true`、`CONTEXTLENS_LOCAL_AGENT_PROVIDER` 后，在项目根目录启动 Bridge：

```powershell
pnpm run bridge
```

`CONTEXTLENS_BRIDGE_URL` 默认是 `http://localhost:3100`。它仅供 `*-agent` 本地 Agent 使用；Gemini、OpenAI、Claude 和自定义兼容 API 均不使用它。若本地 API 和本地 Agent 同时开启，Agent 优先。本地 Agent 会跳过短上下文判断，避免额外启动 CLI。

## 保留能力与项目架构

项目保留原 ContextLens 的右键入口、代码/表格/标题提取、原生侧边栏会话、URL 模型规则、可选全文参考和本地 Agent Bridge 等能力。

```text
用户划词 / 右键
  -> content.js 提取 contextData
  -> background/panel-capabilities.js 选择网页内或原生宿主
  -> fallback/in-page-panel.js 默认展示 ContextAnswer
  -> background/fallback-chat.js 编排判断并流式请求模型
  -> shared/learning-memory.js 在回答结束后记录学习记忆
```

| 路径 | 职责 |
| --- | --- |
| `content.js` | 划词、右键元素、DOM 与上下文窗口提取 |
| `background.js` | 浏览器消息与面板生命周期路由 |
| `background/fallback-chat.js` | 网页内 API/Agent 流式请求、取消、判断和记忆摘要 |
| `fallback/` | Shadow DOM ContextAnswer UI、安全渲染、拖动和中英切换 |
| `shared/` | 提示词、选项、模型、偏好、历史、记忆、诊断和时间线 |
| `sidepanel/` | 既有原生侧边栏与生成后的本地配置 |
| `bridge/` | 可选 Node 本地 Agent Bridge |

## 隐私与诊断

- `.env` 与生成的 `sidepanel/config.local.js` 已被 Git 忽略，绝不能提交真实 Key。
- 网页设置中新增的模型保存于 `chrome.storage.local`，其中可能包含 Key，不应随意导出。
- LLM 时间线与诊断不会保存 Key、URL、请求头、提示词、选区、回答正文或思维链。
- 用户可见的回答历史与学习记忆会在独立存储键中限量保存回答正文，绝不混入性能日志。
- 浏览器内置页、扩展商店、企业策略限制页或无法注入内容脚本的页面不能显示网页内面板。

## 开发检查

```powershell
pnpm run check
pnpm run build:env
```

后续维护请优先阅读 `AGENTS.md`，其中记录了模块职责、存储边界、配置参数与安全约束。

## 来源与许可

本项目基于 [cola-sk/context-lens](https://github.com/cola-sk/context-lens) 修改。许可证：MIT。
