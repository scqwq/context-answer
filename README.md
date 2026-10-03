# ContextLens / ContextAnswer

[中文说明](README_ZH.md)

ContextLens 是一个 Chromium Manifest V3 扩展：在网页上划词或右键选择内容后，默认打开可拖动的 **ContextAnswer** 网页内面板，提供学习解释、普通聊天和上下文补充。原生侧边栏仍可作为兼容宿主使用。

## 功能概览

- 学习模式与普通聊天；支持流式输出、停止、按同一选区分组的学习历史和中英文界面。
- 自动上下文在 `0 → 5 → 10` 行判断，不足时扩展至最大 20 行后直接回答；Jev 高置信度判断充分后也会直接回答，Jev 不可用或异常时才由 LLM JSON 判断兜底。
- 支持 Gemini、OpenAI、Claude、兼容 OpenAI 的接口、本地 API，以及可选的本地 CLI Agent Bridge。
- 日志按请求链归组，显示每次 Jev 请求的时间、上下文窗口和请求体字符数；日志可导出为脱敏 `.txt`。

## 快速开始

1. 安装依赖：

   ```powershell
   pnpm install
   ```

2. 将 `.env.example` 复制为 `.env`，至少配置默认模型的 Provider、Key、URL 和 Model。

3. 生成运行时配置：

   ```powershell
   pnpm run build:env
   ```

4. 在 Chromium 扩展管理页启用开发者模式，选择“加载已解压的扩展程序”，并选择本仓库根目录。

修改 `.env` 后需要重新执行构建；修改扩展脚本、清单或配置后需要重新加载扩展。

## `.env` 配置模块

`.env` 不会被浏览器直接读取；构建命令会生成被 Git 忽略的 `sidepanel/config.local.js`。不要提交 `.env`、生成配置或任何 Key。

| 模块 | 何时需要配置 | 重要变量 |
| --- | --- | --- |
| 默认远程模型 | 必需，除非使用本地模型或 Agent | `CONTEXTLENS_API_PROVIDER`、`API_KEY`、`API_URL` / `API_ENDPOINT`、`MODEL` |
| Jev 上下文判断 | 希望自动判断选区是否足够时 | `CONTEXTLENS_JEV_ENABLED`、`JEV_API_KEY`、`JEV_API_URL`、`JEV_MODEL` |
| 面板与学习默认值 | 调整界面与回答习惯时 | `PANEL_MODE`、`LEARNING_RESPONSE_LANGUAGE`、`LEARNING_CONTEXT_MODE` |
| 额外预置模型 | 希望主页可切换多个只读模型时 | `CONTEXTLENS_EXTRA_MODEL_1_*` 至 `_5_*` |
| 本地 API | 使用 Ollama、LM Studio、vLLM 等时 | `USE_LOCAL_MODEL`、`LOCAL_API_URL`、`LOCAL_MODEL` |
| 本地 Agent Bridge | 使用 Claude/Codex 等本机 CLI 时 | `USE_LOCAL_AGENT`、`LOCAL_AGENT_PROVIDER`、`BRIDGE_URL` |

变量均以 `CONTEXTLENS_` 为完整前缀；上表为便于阅读省略此前缀的部分名称。

## 使用方式

- **学习模式**：选择语言和上下文策略后，点击“解释选区”或提问。
- **普通聊天**：不需要选区，面板保留最近 20 轮会话。
- **自动上下文**：最多扩展到上下各 20 行；到达该上限后直接生成回答，不再多发一次充分性判断请求。若某一层 Jev/上下文判断超时，则保留当前已读取的 0、5、10 或 20 行上下文，直接交给最终回答模型。
- **判断设置**：在网页内面板或原生侧边栏的“设置”中可直接开关自动上下文评估、Jev 判断和 LLM 兜底判断，并调整每次 Jev/上下文判断的超时时间，不必修改 `.env`；设置会覆盖 `.env` 默认值，并立即作用于后续请求。
- **手动上下文**：可选上下各 `0 / 5 / 10 / 20` 行；`0` 只发送选区，不发起充分性判断。
- **补充资料**：将远处定义、调用方或文档段落粘贴到补充框，只发送用户主动添加的内容。

## 日志与隐私

日志和性能时间线存放在扩展的 `chrome.storage.local`，不写入项目文件。日志页显示最近 15 条请求链；“导出”可保存全部已保留的脱敏日志为 `.txt`。

时间线和导出内容不会保存 API Key、完整 URL、请求头、提示词、选区、模型回答或推理内容。学习回答历史与学习记忆是独立、用户可见的功能数据，不会进入日志导出。

## 开发

```powershell
pnpm run check
pnpm run build:env
pnpm run bridge  # 仅本地 Agent 模式需要
```

主要目录：`content.js` 采集选区与上下文，`background/` 负责消息与模型请求，`fallback/` 是默认网页内面板，`shared/` 放提示词、状态、日志等共享逻辑，`sidepanel/` 保留原生侧边栏兼容实现。所有运行时模型提示词统一在 `shared/prompt-templates.js`，每段模板都有原调用位置与功能注释。

详细的模块契约、存储边界和维护规范请阅读 [AGENTS.md](AGENTS.md)。

## 配置细则

### 默认远程模型

```env
CONTEXTLENS_PANEL_MODE=in-page
CONTEXTLENS_API_PROVIDER=custom
CONTEXTLENS_API_KEY=your-key
CONTEXTLENS_API_URL=https://provider.example/v1
CONTEXTLENS_API_ENDPOINT=
CONTEXTLENS_MODEL=your-model
```

- `CONTEXTLENS_API_PROVIDER`：`gemini`、`openai`、`claude` 或 `custom`。
- `CONTEXTLENS_API_ENDPOINT`：可选完整地址；填写后不会拼接 `/chat/completions`。
- `CONTEXTLENS_PANEL_MODE`：`in-page`（默认）、`auto` 或 `native`。

### Jev 与 LLM 判断兜底

```env
CONTEXTLENS_JEV_ENABLED=true
CONTEXTLENS_JEV_API_KEY=your-jev-key
CONTEXTLENS_JEV_API_URL=https://api.typesafe.ai/v1/systemone
CONTEXTLENS_JEV_MODEL=jev-latest
CONTEXTLENS_JEV_CONFIDENCE_THRESHOLD=0.75
CONTEXTLENS_LLM_ASSESSMENT_ENABLED=true
```

Jev 低置信度会按信息不足扩展并重试，不会立即调用 LLM。`CONTEXTLENS_LLM_ASSESSMENT_ENABLED` 只控制 Jev 未配置或请求异常时的 LLM 兜底。两者均关闭时，自动模式直接用当前选区回答。

也可以在 ContextAnswer 的“设置”中直接切换“自动上下文评估”“Jev 判断”和“LLM 兜底判断”，并设置每次判断的超时时间。这些设置保存在浏览器本地并覆盖 `.env` 默认值；Jev 的 API Key、URL 和 Model 仍需要先通过 `.env` 配置。关闭判断开关只会跳过充分性判断，不会关闭最终回答模型。网页内面板使用低对比度深色渐变背景，界面字体优先使用 MiSans / HarmonyOS Sans SC，未安装时回退到 Microsoft YaHei UI。

### 学习默认值

| 变量 | 可选值 / 默认含义 |
| --- | --- |
| `CONTEXTLENS_LEARNING_RESPONSE_LANGUAGE` | 如 `zh-CN` |
| `CONTEXTLENS_LEARNING_TRANSLATION_ENABLED` | `true` / `false` |
| `CONTEXTLENS_LEARNING_CONTEXT_MODE` | `auto`、`manual`、`custom` |
| `CONTEXTLENS_LEARNING_MANUAL_LINES` | `0`、`5`、`10`、`20` |
| `CONTEXTLENS_LEARNING_CONTEXT_ASSESSMENT_ENABLED` | `true` / `false` |
| `CONTEXTLENS_LEARNING_REQUEST_TIMEOUT_MS` | 总工作流超时，默认 `90000` |
| `CONTEXTLENS_LEARNING_ASSESSMENT_TIMEOUT_MS` | 单次判断超时默认值，默认 `15000`；超时后使用当前上下文继续回答 |
| `CONTEXTLENS_LEARNING_RESPONSE_DETAIL` | `compact` 或 `normal` |
| `CONTEXTLENS_LEARNING_OUTPUT_STYLE` | `focus` 或 `standard` |
| `CONTEXTLENS_LEARNING_CODE_EXAMPLES` | `never`、`on-demand`、`always` |

### 额外模型、本地 API 与 Agent

额外预置模型最多五组：`CONTEXTLENS_EXTRA_MODEL_1_*` 至 `_5_*`。每组可配置 `NAME`、`PROVIDER`、`API_KEY`、`API_URL`、`API_ENDPOINT`、`MODEL`，不完整的组会被忽略。

本地 API 使用：

```env
CONTEXTLENS_USE_LOCAL_MODEL=true
CONTEXTLENS_LOCAL_API_URL=http://localhost:11434/v1
CONTEXTLENS_LOCAL_MODEL=qwen2.5-coder:7b
```

本地 CLI Agent 使用：

```env
CONTEXTLENS_USE_LOCAL_AGENT=true
CONTEXTLENS_LOCAL_AGENT_PROVIDER=codex-agent
CONTEXTLENS_BRIDGE_URL=http://localhost:3100
```

Agent Provider 可选 `claude-agent`、`codex-agent`、`antigravity-agent` 或 `copilot-agent`。启用 Agent 后运行 `pnpm run bridge`；若本地 API 与 Agent 同时开启，Agent 优先。

## Origin and license

Based on [cola-sk/context-lens](https://github.com/cola-sk/context-lens). License: MIT.
