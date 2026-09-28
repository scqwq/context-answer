# ContextLens - Smart AI Side Panel Chrome Extension

ContextLens is a Chrome extension that lets you highlight text on any webpage and instantly interact with AI models in a side panel. It automatically captures deep DOM context around your selection (full code blocks, tables, surrounding paragraphs), with optional full-page article content, so the model can respond with accurate, context-rich answers.

It also supports **local CLI coding agents** (Claude Code, Codex CLI, Antigravity CLI, Copilot CLI). Through the Bridge Server, selected UI text can be sent directly to your local agent, enabling a seamless workflow from "select text -> locate code -> apply changes".

本项目基于ContextLens修改,原项目 https://github.com/cola-sk/context-lens
---

## Core Features

- **Instant highlight trigger**: Select text on a webpage and a Lens button appears right next to the cursor.
- **Persistent side panel**: Built on Chrome Side Panel API, so conversation context is kept across tab switching.
- **Smart DOM context extraction**: Automatically detects code blocks (with language hint), tables (formatted as Markdown), heading hierarchy, context windows, semantic path, and image metadata.
- **Full-page context merge**: Optionally append the full article body (semantic extraction, cleanup, Markdown conversion) for complete background.
- **Long full-page extraction (50,000 chars)**: Increased the body extraction limit from `6,000` to `50,000`, making long docs and large source files fully usable for translation and summarization.
- **Right-click model routing (up to 5 pinned models)**: Pin frequently used models in settings, then launch "New Chat" with a specific model directly from right-click submenu.
- **Instant tooltip for pinned models**: Pure CSS tooltip with scale-pop animation and safe positioning to avoid clipping; pin icons smoothly transition to filled state.
- **Precise right-click image filtering**: Image parsing now runs only when right-clicking actual image elements (`<img>`, `<picture>`, `<figure>`), avoiding noisy false-positive image capture on normal text/container clicks.
- **Multi-provider API support**: Connect to Google Gemini, OpenAI, Anthropic Claude, and any OpenAI-compatible custom/local endpoints (Ollama, LM Studio, vLLM, etc.).
- **Local coding agents**: Via Bridge Server, connect Claude Code, Codex CLI, Antigravity CLI, and Copilot CLI to locate and modify source code from selected UI text.
- **URL auto-switch rules**: Glob-style domain rule engine for automatic model and working-directory switching by site.
- **Rule modal editor**: Create and edit URL auto-switch rules in modal forms for cleaner interaction.
- **Tab-level isolation**: Each tab keeps its own chat history, selection context, and model state.
- **Real-time streaming output**: All models support SSE streaming; local agents additionally show logs, reasoning, and tool calls.
- **Interrupt while running**: Send button switches to a red stop button during request execution; click to cancel immediately (before first token or during streaming).
- **Learning answer history**: The in-page learning panel keeps the latest completed answers after it is closed; use **Home** to return from logs and **View history** to reopen a previous answer.
- **LLM timing timeline**: Every API/Agent call records its own `t=0`, dispatch, HTTP response, first stream data, first displayable output, end state, and aggregate timing metrics for performance tuning.
- **Fast Jev context gate**: Optional TypeSafe Jev decision route checks whether the selected context is sufficient before the generative model runs; the existing LLM JSON check remains a fallback.
- **Model config modal improvements**: Switching provider automatically resets irrelevant fields; model sync success messages auto-dismiss.
- **Bilingual UI**: One-click `Chinese / English` switching in the side panel, including static and major dynamic messages.
- **Glassmorphism UI**: Frosted style with polished transitions, code highlighting, and breathing status indicators.

---

## Installation

### 1. Install the Chrome extension

This project uses Chrome Manifest V3 and is loaded as an unpacked extension:

1. Clone or download this repository.
2. Open `chrome://extensions/` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select the project root (the folder containing `manifest.json`).
4. Pin ContextLens in the Chrome toolbar for the best experience.

### 2. Start Bridge Server (optional, required for local agents)

If you want to use Claude Code / Codex CLI / Antigravity CLI / Copilot CLI local agents:

```bash
cd bridge
npm install
node server.js
```

Bridge Server runs at `http://localhost:3100` by default. The extension will auto-detect local agent availability.

---

## AI Configuration

1. Click the **Settings (gear)** button at the top of the side panel.
2. In **Basic Config**, manage models:
   - **Local agents**: Auto-detect installed CLI agents (Claude Code, Codex, Antigravity, Copilot), including availability and version. Click **Refresh Agents** to re-scan.
   - **API models**: Click **+ Add API Model** in model cards, choose provider (Gemini / OpenAI / Claude / Custom), and enter API key + model name. Custom API supports one-click model list sync.
   - **Form behavior**: When switching providers in the modal, non-applicable fields are automatically cleared/reset. Sync success message auto-hides after a short delay.
3. In **Auto-Switch Rules**, configure URL rules:
   - Create/edit rules with **Add Rule** or **Edit** on a rule card.
   - Fill name, URL pattern (`*` wildcard supported), target model, and CWD (for local agents).
   - Rules support priority sorting and enable/disable toggles.
4. Click **Save Configuration**. A green status indicator at the bottom means configuration is successful.

---

## Usage

![ContextLens Main UI](referrence/main_en.png)

### Method 1: Floating Lens button (recommended)

1. Highlight text on any webpage.
2. Click the floating `Lens` button near the selection to open side panel with extracted DOM context.
3. Optionally enable full-page context.
4. Enter your request and press Enter to send.

![ContextLens Highlight Interaction](referrence/case1_en.png)

### Method 2: Right-click context menu

1. Select text on webpage (or right-click an element, including images and buttons).
2. Choose **Ask ContextLens** from context menu.
3. **Direct model routing from right-click menu**: If models are pinned in settings, right-click menu exposes a submenu for direct model selection, and starts a new chat with that temporary model.

![ContextLens Right-click Routing](referrence/case2_en.png)

### Local Agent mode

1. Ensure Bridge Server is running and at least one CLI agent is installed.
2. Select a local agent model in settings, or switch via URL rules.
3. Select UI text on webpage; ContextLens builds a code-location prompt template automatically.
4. Side panel renders agent output in three cards: **Input Context** -> **Execution Logs** (reasoning + tool calls) -> **Execution Result**.

![ContextLens Local Agent Workflow](referrence/case3_en.png)

#### Typical workflow: Apply web article ideas to local project

When reading a technical article, you can directly apply a code idea or fix into your local repository with ContextLens:

1. **Select web content**: Highlight relevant code or explanation in the article and click the floating `Lens` button.
2. **Attach full-article background (optional)**: Enable full-page context in side panel for richer background.
3. **Send a concrete coding instruction**: Example: "Refactor a method in `utils.js` in my local project based on this web logic."
4. **Auto-locate and patch code**: Local agent combines selection content, full-page content, and local workspace context to locate and update source files.

![Web Context + Local Project Integration](referrence/case4_en.png)

### Quick model switching

Click the status indicator at the bottom of side panel to open quick model panel:

- **Temporary Switch**: Temporary model switch for current tab only.
- **Create Domain Rule**: Quickly create auto-switch rule based on current page URL.

### UI language switching

Click the language button at the top-right corner of side panel to switch between `Chinese / English`. The preference is persisted and auto-restored.

---

## Project Structure

```text
ContextLens/
  manifest.json            # Chrome extension config (MV3)
  background.js            # Service Worker: side panel lifecycle, context menu, session routing
  content.js               # Content script: text selection, DOM extraction, floating button
  content.css              # Floating button styles
  sidepanel/
    sidepanel.html         # Side panel layout
    sidepanel.css          # Glassmorphism style system
    sidepanel.js           # Core logic: streaming interactions, rule engine, state persistence
  bridge/
    package.json           # Bridge Server config
    server.js              # Node bridge: agent detection, CLI dispatch, SSE forwarding
  shared/
    llm-timeline.js        # Privacy-safe per-call LLM timing timeline
  icons/                   # Extension icon set
  referrence/              # Product screenshots
```

---

## Technical Details

### DOM context extraction

`content.js` extracts the following structured context around selected content:

| Context Type | Extraction Logic |
|---|---|
| Code Block | Walk up to `<pre>/<code>`, capture full content, detect language from `language-*` class |
| Table | Find parent `<table>` and convert to Markdown table |
| Heading | Scan previous `h1-h6` to determine section title |
| Text Window | Sliding window of 800 chars before and after selection |
| Images | Up to 5 images in selection (alt, dimensions, src) |
| Semantic Path | CSS breadcrumb like `main > article > section#content > p` |
| Full-page Body | Semantic main-content extraction (<= 50000 chars), cleanup + Markdown conversion |
| Meta | `<meta description>` and `og:description` |

### Bridge Server agent orchestration

| Agent | CLI Command | Output Format |
|---|---|---|
| Claude Code | `claude -p <prompt> --output-format=stream-json` | Stream JSON (`assistant` / `tool_use` / `result`) |
| Codex CLI | `codex exec --json -C <dir> <prompt>` | JSON (`agent_message` / `function_call` / `function_result`) |
| Antigravity CLI | `agy --output-format=stream-json -p <prompt>` | Stream JSON (`content` / `reasoning` / `tool_call`) |
| Copilot CLI | `copilot --output-format json --stream on -p <prompt>` | JSON stream (`assistant.message_*` / `tool.execution_start` / `tool.execution_complete`) |

### URL rule engine

Rule matching uses glob patterns, with specificity scoring and manual ordering:

1. **Temporary switch** (highest priority) - current tab only.
2. **URL rules** - matched in order, with more specific patterns preferred.
3. **Default model** - fallback when no rule matches.

### Streaming output parsing

All API endpoints use SSE streaming. Local agents also parse these event types:

- `assistant / agent_message / content` -> rendered as text
- `thinking / reasoning` -> rendered as collapsible reasoning blocks
- `tool_use / tool_call / function_call / tool.execution_start` -> rendered as system logs (with params)
- `tool_result / function_result / command_execution / tool.execution_complete` -> rendered as system logs (with output)
- `error` -> rendered as error alerts

### LLM 调用时间线与性能排查

为便于优化自动上下文评估和流式回答的耗时，扩展会将每一次实际模型调用作为一条独立时间线保存，并以一次用户提问为“请求链”归组。自动上下文的 Jev 判断、LLM 回退判断和最终回答会显示在同一个请求链边界内，而不是混在相邻问题之间。

- 网页内学习面板：点击右上角“日志”，查看最近 15 条请求链。
- 原生侧边栏：点击顶部波形图标，查看最近 15 条请求链。
- 每条记录包含绝对开始时间 `startedAt` 与相对时间 `t+…ms`：请求创建、发出 HTTP 请求、收到 HTTP 响应、收到首个流式数据、解析到首段输出、完成/取消/超时/失败。
- `firstResponseMs` 用于判断 HTTP 开始响应的速度，`firstStreamDataMs` 表示首个流数据，`firstOutputMs` 表示何时真的能向用户显示内容；总耗时、流数据块数和字节数可用于比较模型、网络或提示词策略。

日志保存在扩展的 `chrome.storage.local` 键 `contextLensLlmTimelines`，最多保留最近 60 次调用，并不写入项目目录或本机文本文件。这种方式适合 Manifest V3 的 Service Worker 生命周期，也不会要求扩展获得本机文件写入权限。

出于隐私考虑，时间线不会记录 API Key、请求 URL、请求头、选区、提示词、模型回答正文或思维链。“响应内容”仅以安全的事件类型和大小指标表示，例如 `HTTP 200`、`assessment-response`、`first-output`、输出字符数。

### 学习回答历史与主页

学习模式的最终回答默认使用 SSE 流式显示；自动上下文的充分性判断是非流式短请求，因此不需要新增 `.env` 流式开关。原生侧边栏沿用既有的会话历史；网页内学习面板新增右上角 **查看历史** 和 **主页**：前者读取已完成回答，后者从“日志”或历史详情返回当前回答。

网页内历史保存于独立的 `chrome.storage.local` 键 `contextLensLearningAnswerHistory`，最多 30 条。为控制本地容量，单条问题最多保存 1,200 个字符、回答最多保存 16,000 个字符；不保存选区、页面 URL、API Key、请求头，也不会把回答写进性能日志。这里使用浏览器扩展自带存储，而不是 SQLite：无需本机数据库、原生消息服务或后端进程，且能在关闭面板后继续保留数据。

### 学习模式的手动上下文

在“手动选择”模式下，可选上下各 `0 / 5 / 10 / 20` 行。`0 行（仅选区）` 不会发起上下文充分性评估，不调用 Jev 或 LLM 判断，也不会额外向网页读取前后内容；只把最小选区交给最终回答模型，适合已经完整的单行代码、短定义或希望控制发送内容的场景。

### Jev 优先的自动上下文判断

自动模式支持两条可独立开关的判断路线：Jev 是主路线，既有生成式 LLM JSON 判断是回退路线。Jev 使用 TypeSafe 的 System One API，发送 `state` 与两道 `choice` 问题：当前内容是否足够回答、若不足应优先读取前文/后文/两侧。只有 `sufficient` 或 `insufficient` 的置信度达到阈值时才会生效；低置信度、网络异常或未完成配置时会回退到 LLM。

```env
CONTEXTLENS_JEV_ENABLED=true
CONTEXTLENS_JEV_API_KEY=请填入你的 TypeSafe Key
CONTEXTLENS_JEV_API_URL=https://api.typesafe.ai/v1/systemone
CONTEXTLENS_JEV_MODEL=jev-latest
CONTEXTLENS_JEV_CONFIDENCE_THRESHOLD=0.75
CONTEXTLENS_LLM_ASSESSMENT_ENABLED=true
```

Jev 不是 OpenAI 兼容聊天接口，不能配置到 `CONTEXTLENS_API_URL` 中；它的完整协议由 `background/jev-assessment.js` 独立处理。将两条开关同时设为 `false` 后，自动模式会明确提示“仅使用当前选区”，并跳过上下文判断和扩展，最终解释仍由你配置的正常 API 模型完成。

---

## Security and Privacy

- API keys are stored in `chrome.storage.local` only.
- Bridge Server runs locally at `localhost:3100` and is not exposed publicly.
- API requests are sent directly to model endpoints; ContextLens does not proxy your data through intermediate servers.

---

## License

MIT
