# ContextLens 项目协作说明

## 项目目标

这是一个 Chromium Manifest V3 浏览器扩展。用户左键划词或右键点击网页内容后，扩展采集 DOM 上下文，并交给大模型分析。默认 UI 是可拖动的网页内 **ContextAnswer** 面板；它包含“学习模式”和“普通聊天”，并可按配置退回原生侧边栏。

## 技术栈

| 层级 | 技术 | 作用 |
| --- | --- | --- |
| 浏览器扩展 | Manifest V3、Chrome Extension API | 权限、内容脚本、右键菜单、存储、侧边栏 |
| 网页采集 | 原生 DOM、`Selection`、`Range` | 获取选区、代码块、表格、章节、前后文和正文 |
| ContextAnswer 面板 | Shadow DOM、HTML、CSS、原生 JavaScript | 可拖动 UI、设置、模型切换、聊天和学习模式 |
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
| `shared/learning-memory.js` | 同一选区学习记忆与低频摘要任务 | 仅保存用户可见的问答；按“页面来源 + 语言 + 规范化选区”哈希隔离 |
| `shared/prompt-templates.js` | 统一运行时提示词模板与占位符编译 | 集中维护聊天、学习、评估、记忆摘要和 Jev Choice 指令；每段模板须注明原调用位置和功能 |
| `shared/chat-prompt.js` | 普通聊天提示词 | 只使用本次网页内面板的最近会话，勿混入学习模式记忆 |
| `shared/context-answer-models.js` | ContextAnswer 的模型清单与当前选择 | 合并 `.env` 只读预置项和网页保存项；Key 仅在 `chrome.storage.local`，不能写入日志或文档 |
| `shared/panel-preferences.js` | 面板宿主策略与充分性评估开关 | 设置页值优先于 `.env` 默认值 |
| `shared/learning-history.js` | 学习回答历史的限量持久化 | 保存学习模式已完成的问题与回答，并按学习记忆哈希分组供用户查看；不得保存选区原文或混入诊断、时间线键 |
| `shared/context-assessment.js` | LLM 上下文充分性评估提示词与 JSON 解析 | 只允许输出评估 JSON，解析失败时禁止无限重试 |
| `shared/context-orchestrator.js` | 自动上下文状态机 | 自动模式在 0、5、10 行判断；扩展到 20 行后直接进入最终回答 |
| `shared/request-diagnostics.js` | LLM 调用的脱敏诊断记录 | 仅保存阶段、供应商、传输方式、HTTP 状态和错误摘要，严禁记录密钥、URL、选区或回答 |
| `shared/llm-timeline.js` | LLM 调用时间线与耗时指标 | 以单次模型调用为单位记录 `t=0`、HTTP 响应、首个流数据、首段输出和结束状态；严禁记录模型原文 |
| `shared/llm-timeline-view.js` | 时间线请求链归组与格式化 | 按一次用户请求关联 Jev、LLM 评估和最终回答；不读取或显示提示词、选区或回答原文 |
| `shared/log-export.js` | 脱敏日志文本导出 | 只导出时间线与诊断记录，严禁读取学习记忆、回答历史、模型配置或任何密钥 |
| `background/panel-capabilities.js` | 原生侧栏与网页内面板的能力路由 | 以策略对象统一 `open()`，禁止业务层直接调用 `chrome.sidePanel` |
| `background/jev-assessment.js` | TypeSafe Jev 协议适配器 | 仅请求 `/v1/systemone` 的 `state + questions`；不得伪装成 OpenAI Chat API |
| `background/context-assessment-router.js` | 自动上下文判断路线选择 | Jev 高置信度直接决策，低置信度按不足扩展后重试 Jev；异常/未配置时可回退 LLM |
| `background/fallback-chat.js` | 网页内面板的模型流式请求与转发 | 请求在 Service Worker 中执行，支持 Gemini、Claude、OpenAI 兼容接口和本地 Agent Bridge |
| `fallback/` | 无原生侧栏时的 Shadow DOM 右侧学习面板 | 不读取网页样式；只通过消息与后台通信 |
| `fallback/panel-drag.js` | 网页内面板拖动与位置恢复 | 只保存安全的坐标，必须限制在当前视口内 |
| `fallback/in-page-i18n.js` | 网页内面板中英双语文案与偏好同步 | 复用 `chrome.storage.local.uiLanguage`；不得翻译模型原文、选区或回答 |
| `fallback/answer-renderer.js` | 网页内回答的安全有限 Markdown 渲染 | 只创建 DOM 节点，绝不能对模型输出使用 `innerHTML` |
| `diagnostics/` | 不含敏感信息的故障分析记录 | 记录现象、复现条件、排查顺序与已实施修复 |
| `sidepanel/config.js` | 读取生成后的本地运行时默认配置 | 不写真实密钥 |
| `scripts/build-env.js` | `.env` 转 `sidepanel/config.local.js` | 解析默认模型、最多 5 个额外模型槽位和学习设置；只允许白名单参数进入扩展 |
| `bridge/server.js` | 可选本地 CLI Agent Bridge | 修改前评估 CORS、工作目录与命令执行风险 |
| `.env` | 本机 API 默认配置 | 已忽略，绝不提交 |
| `.env.example` | 环境变量模板 | 仅保留无密钥示例 |

## 新增学习模式的执行链路

```text
用户划词 / 右键
  -> content.js 生成 contextData
  -> background/panel-capabilities.js 根据 auto/native/in-page 策略选择宿主
  -> 默认：fallback/in-page-panel.js 显示可拖动的 ContextAnswer 面板
  -> native/auto 且浏览器可用：sidepanel.js 接收并发送请求
  -> Jev 优先判断选区是否充分 -> 低置信度时扩展上下文重试 Jev；不可用时可由 LLM 回退判断
  -> 必要时 content.js 重取上下各 5 / 10 / 20 行
  -> background/fallback-chat.js 发起最终模型流并把文本块回传
  -> 学习完成后 shared/learning-memory.js 记录问答，必要时异步低频压缩旧轮次
```

### 学习请求布局与编排细则

- ContextAnswer 默认使用网页内面板，标题下可切换“学习模式 / 普通聊天”，右上角有主页、历史、日志、设置和中英切换；拖动标题空白处即可移动面板。`native` 策略保留既有原生侧边栏兼容路径。
- 网页内面板和原生侧边栏共用 `uiLanguage`（`zh` / `en`）偏好。切换只影响控件、标签与静态提示；不得翻译用户选区、历史回答、模型名称、模型输出或 API 参数。
- 学习模式在选区预览下显示语言、上下文模式和手动行数；上下文模式为 `auto`、`manual`、`custom`。`custom` 显示补充文本框，只发送选区和用户主动粘贴的远处资料。
- 普通聊天保留本面板最近 20 轮问答；学习模式记忆按选区哈希保存最多 20 轮原文，提示词仅注入已准备好的摘要和最近 4 轮。达到 8 轮后，每新增 4 轮才在回答完成后异步压缩一次，绝不阻塞当前回答。
- 主页只保留模型下拉选择，绝不显示 Key、URL 或模型编辑字段。设置页可修改面板策略、自动充分性评估开关，并通过“添加模型 / 模型列表”新增、修改、删除浏览器内模型。
- `.env` 默认模型始终可由主页“环境默认模型”切回；`CONTEXTLENS_EXTRA_MODEL_1_*` 至 `_5_*` 会作为只读预置项进入主页下拉和设置页列表。预置项需编辑 `.env` 后执行构建，不能在网页设置中直接删除；可“复制编辑”为浏览器内模型。
- 语言可选自动识别及常见前后端语言；它是提示信息，不应被当作网页内容的事实声明。
- 上下文模式：`auto` 先将最小选区交给判断路由：已启用且配置完整的 Jev 为主路线。Jev 高置信度 `sufficient` 后直接进入最终回答；高置信度 `insufficient` 或低置信度时按上下各 `5 -> 10 -> 20` 行扩展，并继续由 Jev 判断。若 10 行判断仍不足，扩展到最大 20 行后不再进行 Jev/LLM 充分性判断，直接交给最终回答模型；Jev 异常或未配置时才可由 LLM JSON 判断兜底。`manual` 可选 `0`（仅选区）或上下各 5/10/20 行；0 不触发自动评估、不调用 Jev/LLM、不发送 `GET_CONTEXT_WINDOW`，只将最小选区交给最终回答模型。
- Jev 使用 TypeSafe System One 的 `POST /v1/systemone`、`state + questions` 与结构化 `answers` 协议。`answerability` 和 `context_direction` 都是 `choice` 问题；只有 `sufficient` / `insufficient` 且置信度达到阈值时才作为自动决策，低置信度按信息不足扩展相邻上下文后重新交给 Jev。
- `CONTEXTLENS_JEV_ENABLED=false` 且 `CONTEXTLENS_LLM_ASSESSMENT_ENABLED=false` 时，自动判断和自动扩展均失效；界面必须明确提示“仅使用当前选区”，但最终解释模型仍照常调用。
- 自动模式最多评估三次（0、5、10）；若 10 行仍不足，则扩展至上下各 20 行并直接回答。模型 JSON 不可解析时立即回退为当前选区回答，禁止循环重试。
- 评估请求使用非流式短响应，最终学习回答才使用流式响应；两类阶段均写入脱敏诊断日志。
- `content.js` 的 `GET_CONTEXT_WINDOW` 是上下文扩展入口。代码按源码行取窗口；普通网页按可见文本逻辑行取窗口。不要把该接口改成默认全文采集。
- 网页内面板的回答必须通过 `fallback/answer-renderer.js` 安全渲染有限 Markdown；禁止用 `innerHTML` 渲染模型原始输出。
- 网页内面板请求期间禁用“一键学习解释”和“发送问题”，并启用“停止”。停止会发送 `CANCEL_FALLBACK_REQUEST`，后台必须中止对应 `AbortController`，不得仅隐藏旧结果。
- 最终学习回答使用 SSE 流式展示；上下文充分性判断仍是非流式短请求。网页内面板的“查看历史”最多保留 30 条已完成回答，“主页”只恢复本次仍在内存中的当前回答；关闭面板后可从历史中继续查看已完成回答。
- 原生侧边栏的充分性评估也属于活动请求：`contextWorkflowId` 与 `CANCEL_CONTEXT_ASSESSMENT` 负责取消后台评估。新增异步流程时必须复用或更新 `tabRequestStates`，避免重复点击产生并行请求。
- 总超时覆盖“评估 + 上下文扩展 + 最终流式回答”；单次评估有独立超时。超时应反馈给用户并写入脱敏日志。
- 每一个实际 LLM 调用必须单独写入时间线：至少记录模型供应商/模型名、调用用途、`t=0` 创建、HTTP 发出、HTTP 响应、首个流数据、首段可展示输出、完成/取消/超时/失败及对应耗时。不要用单一总请求掩盖多次自动评估。

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
| `CONTEXTLENS_EXTRA_MODEL_1_*` ～ `_5_*` | `NAME`、`PROVIDER`、`API_URL`、`API_KEY`、`MODEL` 等 | 最多 5 组额外预置模型；供应商支持 `gemini`、`openai`、`claude`、`custom` 和四种 `*-agent` |
| `CONTEXTLENS_PANEL_MODE` | `in-page` | `in-page`（默认统一网页内面板）、`auto` 或 `native`；设置页可覆盖 |
| `CONTEXTLENS_LEARNING_TRANSLATION_ENABLED` | `true` | 学习解释默认是否包含翻译；面板语言/上下文选择可单次覆盖其他设置 |
| `CONTEXTLENS_LEARNING_RESPONSE_LANGUAGE` | `zh-CN` | 学习回答的默认语言；旧 `TARGET_LANGUAGE` 仍兼容 |
| `CONTEXTLENS_LEARNING_TRANSLATION_LANGUAGE` | `zh-CN` | 启用翻译时的目标语言 |
| `CONTEXTLENS_LEARNING_RESPONSE_DETAIL` | `compact` | `compact`（默认短答）或 `normal` |
| `CONTEXTLENS_LEARNING_OUTPUT_STYLE` | `focus` | `focus` 强制“核心结论优先”；`standard` 允许较完整讲解 |
| `CONTEXTLENS_LEARNING_MAX_KEY_POINTS` | `3` | 解释要点上限，运行时收敛到 2～5 |
| `CONTEXTLENS_LEARNING_CODE_EXAMPLES` | `on-demand` | `never`、`on-demand` 或 `always`，控制是否主动给最小示例 |
| `CONTEXTLENS_LEARNING_REQUEST_TIMEOUT_MS` | `90000` | 单次学习任务总超时，范围自动收敛到 5,000～300,000 毫秒 |
| `CONTEXTLENS_LEARNING_ASSESSMENT_TIMEOUT_MS` | `15000` | 每次上下文充分性评估的超时，范围同上 |
| `CONTEXTLENS_LEARNING_SOURCE_LANGUAGE` | `auto` | 语言提示默认值，例如 `typescript`、`python`、`vue` |
| `CONTEXTLENS_LEARNING_CONTEXT_MODE` | `auto` | `auto` 让模型判断并按 5/10/20 行扩展；`manual` 使用下方行数 |
| `CONTEXTLENS_LEARNING_MANUAL_LINES` | `5` | 手动上下文模式下的上、下各行数，支持 0（仅选区）/ 5 / 10 / 20 |
| `CONTEXTLENS_LEARNING_CONTEXT_ASSESSMENT_ENABLED` | `true` | 是否允许 `auto` 模式调用 Jev / LLM 评估；设置页可覆盖 |
| `CONTEXTLENS_JEV_ENABLED` | `false` | 是否启用 Jev 主判断路线；需同时配置 Key、URL、Model |
| `CONTEXTLENS_JEV_API_KEY` | 真实 Key | TypeSafe Jev API Key；仅随被忽略的本地配置进入扩展 |
| `CONTEXTLENS_JEV_API_URL` | `https://api.typesafe.ai/v1/systemone` | Jev System One 完整请求地址，不走 OpenAI `/chat/completions` |
| `CONTEXTLENS_JEV_MODEL` | `jev-latest` | Jev 模型名；需可固定为具体版本以便复现实验 |
| `CONTEXTLENS_JEV_CONFIDENCE_THRESHOLD` | `0.75` | Choice 判断生效的最低置信度，运行时收敛到 0.50～0.95；低于此值按上下文不足扩展后重试 Jev |
| `CONTEXTLENS_LLM_ASSESSMENT_ENABLED` | `true` | Jev 未配置或请求失败时，是否保留 LLM JSON 判断作为兜底；与 Jev 同时关闭则禁用自动判断 |
| `CONTEXTLENS_LOCAL_API_URL` / `CONTEXTLENS_LOCAL_MODEL` | `http://localhost:11434/v1` / `qwen2.5-coder:7b` | 仅本地开关开启后生效的本地模型配置 |
| `CONTEXTLENS_USE_LOCAL_AGENT` | `false` | 为 `true` 时优先选择本地 Agent Bridge；与本地 API 开关同时开启时 Agent 优先 |
| `CONTEXTLENS_LOCAL_AGENT_PROVIDER` | `codex-agent` | `claude-agent`、`codex-agent`、`antigravity-agent` 或 `copilot-agent` |
| `CONTEXTLENS_LOCAL_AGENT_COMMAND_PATH` | 空 | 可选 CLI 可执行文件路径；Bridge 会校验其是否匹配当前 Agent |
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

网页内面板右上角的“日志”会显示最近 15 条脱敏运行日志；日志实际保存在扩展的 `chrome.storage.local`，以便浏览器扩展在无本机文件写入权限时仍能稳定记录。每条日志包含时间、展示面板、阶段、供应商、传输方式、HTTP 状态（如有）和错误摘要；不会保存 API Key、完整 URL、选区、提示词、请求头或模型回答。日志页的“导出”会调用浏览器下载对话框，导出全部保留的时间线与诊断记录为 `.txt`；不得把学习记忆、回答历史或模型配置混入导出内容。静态排查记录放在 `diagnostics/`。

自动上下文会额外产生短的“充分性评估”请求。Jev 启用时先返回带置信度的结构化 Choice；低置信度会扩展上下文并再次交给 Jev，只有 Jev 不可用时才调用既有 LLM JSON 评估。最终回答才使用流式请求。扩展至上下各 20 行这个上限后，跳过额外判断并直接生成回答，不再自动扩大到全文。

### LLM 调用时间线

性能日志由 `shared/llm-timeline.js` 单独维护，实际保存于 `chrome.storage.local` 的 `contextLensLlmTimelines`，而不是仓库中的 `.md`/`.txt` 文件：浏览器扩展无法可靠、安全地直接写本机文件，存储 API 可在 Service Worker 重启后保留数据。最多保留最近 60 次模型调用，每次最多 24 个阶段事件。

- 每次用户学习请求会带一个内部请求链标识；Jev 判断、Jev 不可用时的 LLM 兜底判断和最终回答均关联到该标识。旧日志没有标识，会被单独显示为“旧版未归组调用”。
- 网页内回退面板右上角“日志”与原生侧边栏顶部波形图均显示最近 15 条请求链（从最近 60 次独立模型调用中归组）和原有脱敏诊断。请求链顶部必须逐次列出实际发出的 Jev HTTP 请求，并给出发起时间、上下文窗口行数/范围和请求体字符数；不显示请求正文。
- `startedAt` 是绝对时间；每个事件的 `tMs` 从该次模型调用创建时开始计时。重点观察 `firstResponseMs`（HTTP 响应）、`firstStreamDataMs`（首个网络流数据）与 `firstOutputMs`（首段可展示文本），可区分服务端排队、网络和流式解析延迟。
- 记录“LLM 响应了什么”时仅保留响应类型（HTTP 状态、评估结果已收到、首段输出已解析）、片段数和字节/字符数；绝不保存选区、提示词、模型回答、思维链、密钥、请求头或完整 URL。

### 学习回答历史

`shared/learning-history.js` 使用独立的 `chrome.storage.local` 键 `contextLensLearningAnswerHistory` 保存网页内学习面板的已完成回答，最多 30 条；单条问题最多 1,200 字符、回答最多 16,000 字符。新记录只额外保存学习记忆的哈希键，用于将同一选区的问答展示为完整会话；旧记录无哈希键时必须独立展示。这里保存内容是“查看历史”这一用户可见功能的明确数据，不属于诊断或性能日志；不会保存选区、页面 URL、API Key、请求头或完整提示词。

## 重要边界与安全要求

- 普通“学习解释”模式不需要启动 Bridge，也不应拥有写本机文件的能力。
- 不要把 API Key、用户选区全文或聊天历史写入日志、README 或任何会提交的文件。
- LLM 时间线与脱敏诊断键永远不能保存响应正文；学习回答历史只能写入独立的 `contextLensLearningAnswerHistory` 键，并遵守条数与字符上限。导出仅允许读取这两类脱敏日志键，不能作为绕过该边界的途径。
- 学习记忆是用户明确需要的会话功能，单独保存在 `contextAnswerLearningMemory`：最多 8 个选区范围、每范围 20 轮。它可保存问题、回答和摘要，但绝不能被诊断、时间线或导出日志读取。
- `contextAnswerModels` 仅存浏览器内新增的可编辑模型；`.env` 预置模型不会复制到该键。两类模型的 Key 都不可记录到诊断、时间线、README 或 Git。
- Jev API Key 与普通模型 Key 同样敏感。当前个人本机扩展可由 `.env` 构建进本地忽略文件；若发布给他人，必须改由受认证的服务端或 Bridge 代理请求，不能把 Key 随扩展分发。
- `host_permissions` 当前为 `<all_urls>`；新增采集能力时须避免采集密码框、支付页或无关隐私内容。
- `bridge/server.js` 目前是本机服务；如准备公开发布或允许任意网页调用，必须收紧 CORS、验证扩展来源，并要求用户确认工作目录与执行动作。
- Chromium 的 `sidePanel` 是可选兼容宿主；默认 UI 是不依赖该 API 的网页内面板。Firefox/Safari 支持仍应新增适配层，不要把浏览器判断散落进 DOM 提取或提示词模块。
- 面板选择使用“能力路由 + 策略对象”：`panel-capabilities.js` 先检测 API，再按原生侧栏、网页内面板的优先级调用统一 `open()`；这不是在各业务文件堆叠浏览器 `if/else`。
- 网页内面板不能运行在浏览器内置页、扩展商店、受企业策略限制页面或无法注入内容脚本的跨域环境。

## 代码风格与后续开发

- 每个新增文件顶部写一句简短中文职责注释。
- 一个文件只承担一种职责：状态、提示词、UI、样式、浏览器适配和模型协议不得混杂。
- 新增环境变量时，同时更新 `.env.example`、`scripts/build-env.js` 和本表格。
- 新增或调整提示词时，统一在 `shared/prompt-templates.js` 操作；同时检查 token 成本、隐私影响与上下文不足时的回退说明，并在模板前标明调用位置和功能。
- 任何改动完成后至少执行 `npm run check`；涉及页面采集时还要手工验证 Chrome/Edge 的左键和右键链路。
