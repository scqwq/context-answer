# ContextLens 项目协作说明

## 项目目标

这是一个 Chromium Manifest V3 浏览器扩展。用户左键划词或右键点击网页内容后，扩展采集 DOM 上下文，并在侧边栏把内容交给大模型分析。新增的“学习解释”模式面向代码和技术文档，固定输出翻译、含义、作用、结构与不确定点。

## 技术栈

| 层级 | 技术 | 作用 |
| --- | --- | --- |
| 浏览器扩展 | Manifest V3、Chrome Extension API | 权限、内容脚本、右键菜单、存储、侧边栏 |
| 网页采集 | 原生 DOM、`Selection`、`Range` | 获取选区、代码块、表格、章节、前后文和正文 |
| 侧边栏 | HTML、CSS、原生 JavaScript | 模型设置、会话、流式回答、学习模式选择 |
| 模型通信 | `fetch`、SSE | 调用 Gemini、OpenAI、Claude 或兼容 OpenAI 的端点 |
| 本地 Agent（可选） | Node.js、`@sking7/agent-cli-unified` | 在 `localhost:3100` 调度本机 CLI Agent |

## 目录与职责

| 路径 | 职责 | 修改注意事项 |
| --- | --- | --- |
| `manifest.json` | 扩展权限、内容脚本、Service Worker 入口 | 增加权限前评估最小权限原则 |
| `content.js` | 网页选区、右键元素与 DOM 上下文提取 | 不在此处写模型请求或侧边栏 UI |
| `background.js` | 右键菜单、侧边栏开启、标签页消息中转 | 不直接读取网页 DOM |
| `sidepanel/sidepanel.html` | 侧边栏结构与脚本加载顺序 | 新控件放在对应功能模块附近 |
| `sidepanel/sidepanel.js` | 既有会话、模型请求、状态恢复主入口 | 新功能尽量只增加调用点，业务逻辑放独立目录 |
| `sidepanel/learning/` | 学习模式的状态、UI、提示词和样式 | 新学习能力按职责拆文件，避免回填主文件 |
| `shared/learning-prompt.js` | 侧边栏与网页内面板共用的学习提示词契约 | 不依赖 DOM 或单个浏览器 API |
| `shared/learning-options.js` | 学习请求的语言、上下文和回答风格选项 | 面板设置优先，翻译等策略由 `.env` 提供默认值 |
| `shared/context-assessment.js` | LLM 上下文充分性评估提示词与 JSON 解析 | 只允许输出评估 JSON，解析失败时禁止无限重试 |
| `shared/context-orchestrator.js` | 自动上下文状态机 | 自动模式按 0、5、10、20 行评估；20 行仍不足时要求用户补充 |
| `shared/request-diagnostics.js` | LLM 调用的脱敏诊断记录 | 仅保存阶段、供应商、传输方式、HTTP 状态和错误摘要，严禁记录密钥、URL、选区或回答 |
| `background/panel-capabilities.js` | 原生侧栏与网页内面板的能力路由 | 以策略对象统一 `open()`，禁止业务层直接调用 `chrome.sidePanel` |
| `background/fallback-chat.js` | 网页内面板的模型流式请求与转发 | 请求在 Service Worker 中执行，支持 Gemini、Claude、OpenAI 兼容接口 |
| `fallback/` | 无原生侧栏时的 Shadow DOM 右侧学习面板 | 不读取网页样式；只通过消息与后台通信 |
| `diagnostics/` | 不含敏感信息的故障分析记录 | 记录现象、复现条件、排查顺序与已实施修复 |
| `sidepanel/config.js` | 读取生成后的本地运行时默认配置 | 不写真实密钥 |
| `scripts/build-env.js` | `.env` 转 `sidepanel/config.local.js` | 远程/本地模型由显式开关选择，只允许白名单参数进入扩展 |
| `bridge/server.js` | 可选本地 CLI Agent Bridge | 修改前评估 CORS、工作目录与命令执行风险 |
| `.env` | 本机 API 默认配置 | 已忽略，绝不提交 |
| `.env.example` | 环境变量模板 | 仅保留无密钥示例 |

## 新增学习模式的执行链路

```text
用户划词 / 右键
  -> content.js 生成 contextData
  -> background/panel-capabilities.js 选择面板宿主
  -> 支持 chrome.sidePanel：sidepanel.js 接收并发送请求
  -> 不支持：fallback/in-page-panel.js 显示网页右侧面板
  -> LLM 评估选区是否充分 -> 必要时 content.js 重取上下各 5 / 10 / 20 行
  -> background/fallback-chat.js 发起最终模型流并把文本块回传
```

## 配置参数

根目录 `.env` 的值不会被浏览器直接读取。修改后必须执行 `npm run build:env`，它会生成被忽略的 `sidepanel/config.local.js`；随后在扩展管理页面重新加载扩展。

| 参数 | 示例 | 作用 |
| --- | --- | --- |
| `CONTEXTLENS_USE_LOCAL_MODEL` | `false` | 默认远程模型；仅 `true` / `1` / `yes` 时选择 `LOCAL_*` 本地模型 |
| `CONTEXTLENS_API_PROVIDER` | `openai` / `custom` | 远程供应商；支持 `gemini`、`openai`、`claude`、`custom` |
| `CONTEXTLENS_API_KEY` | 真实 Key | 远程 API Key |
| `CONTEXTLENS_API_URL` | `https://provider.example/v1` | 远程 OpenAI 兼容接口基地址；未设完整 Endpoint 时自动补 `/chat/completions` |
| `CONTEXTLENS_API_ENDPOINT` | `https://provider.example/api/chat` | 可选完整请求地址；填写后原样请求，不会拼接路径 |
| `CONTEXTLENS_MODEL` | `gpt-4o-mini` | 远程模型标识 |
| `CONTEXTLENS_LEARNING_TRANSLATION_ENABLED` | `true` | 学习解释默认是否包含翻译；面板语言/上下文选择可单次覆盖其他设置 |
| `CONTEXTLENS_LEARNING_TARGET_LANGUAGE` | `zh-CN` | 学习回答和翻译的默认目标语言 |
| `CONTEXTLENS_LEARNING_RESPONSE_DETAIL` | `compact` | `compact`（默认短答）或 `normal` |
| `CONTEXTLENS_LEARNING_SOURCE_LANGUAGE` | `auto` | 语言提示默认值，例如 `typescript`、`python`、`vue` |
| `CONTEXTLENS_LEARNING_CONTEXT_MODE` | `auto` | `auto` 让模型判断并按 5/10/20 行扩展；`manual` 使用下方行数 |
| `CONTEXTLENS_LEARNING_MANUAL_LINES` | `5` | 手动上下文模式下的上、下各行数，只支持 5 / 10 / 20 |
| `CONTEXTLENS_LOCAL_API_URL` / `CONTEXTLENS_LOCAL_MODEL` | `http://localhost:11434/v1` / `qwen2.5-coder:7b` | 仅本地开关开启后生效的本地模型配置 |
| `CONTEXTLENS_BRIDGE_URL` | `http://localhost:3100` | 可选本地 Agent Bridge 地址 |

## 本地运行与检查

```powershell
npm install
npm run build:env
npm run check
npm run bridge  # 只有本地 Agent 模式需要
```

扩展加载方式：在 Chromium 浏览器打开扩展管理页，启用开发者模式，选择“加载已解压的扩展程序”，并指向本项目根目录。每次修改 `manifest.json`、内容脚本、背景脚本或侧边栏文件后都需要重新加载扩展。

## LLM 调用诊断

网页内面板右上角的“诊断”会显示最近 15 条脱敏运行日志；日志实际保存在扩展的 `chrome.storage.local`，以便浏览器扩展在无本机文件写入权限时仍能稳定记录。每条日志包含时间、展示面板、阶段、供应商、传输方式、HTTP 状态（如有）和错误摘要；不会保存 API Key、完整 URL、选区、提示词、请求头或模型回答。静态排查记录放在 `diagnostics/`。

自动上下文会额外产生短的“充分性评估”模型请求。评估请求不展示给用户；模型只返回 JSON 决策。最终回答才使用流式请求。若 20 行仍不足，界面必须明确告诉用户缺少什么，不能继续自动扩大到全文。

## 重要边界与安全要求

- 普通“学习解释”模式不需要启动 Bridge，也不应拥有写本机文件的能力。
- 不要把 API Key、用户选区全文或聊天历史写入日志、README 或任何会提交的文件。
- `host_permissions` 当前为 `<all_urls>`；新增采集能力时须避免采集密码框、支付页或无关隐私内容。
- `bridge/server.js` 目前是本机服务；如准备公开发布或允许任意网页调用，必须收紧 CORS、验证扩展来源，并要求用户确认工作目录与执行动作。
- Chromium 的 `sidePanel` 是当前 UI 基础。Firefox/Safari 支持应新增适配层，不要把浏览器判断散落进 DOM 提取或提示词模块。
- 面板选择使用“能力路由 + 策略对象”：`panel-capabilities.js` 先检测 API，再按原生侧栏、网页内面板的优先级调用统一 `open()`；这不是在各业务文件堆叠浏览器 `if/else`。
- 网页内面板不能运行在浏览器内置页、扩展商店、受企业策略限制页面或无法注入内容脚本的跨域环境。

## 代码风格与后续开发

- 每个新增文件顶部写一句简短中文职责注释。
- 一个文件只承担一种职责：状态、提示词、UI、样式、浏览器适配和模型协议不得混杂。
- 新增环境变量时，同时更新 `.env.example`、`scripts/build-env.js` 和本表格。
- 新增提示词字段时，同时检查 token 成本、隐私影响与上下文不足时的回退说明。
- 任何改动完成后至少执行 `npm run check`；涉及页面采集时还要手工验证 Chrome/Edge 的左键和右键链路。
