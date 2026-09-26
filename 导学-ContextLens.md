# ContextLens 项目导学

## 1. 前置知识

| 知识点 | 为何需要 | 在本项目中的位置 | 高频度 |
| --- | --- | --- | --- |
| Chrome Extension Manifest V3 | 理解权限、后台生命周期和脚本注入 | `manifest.json`、`background.js` | 高 |
| DOM Range / Selection | 获取划词位置、范围和文本 | `content.js` | 高 |
| Content Script 消息通信 | 把网页 DOM 里的信息传到扩展 UI | `content.js`、`background.js` | 高 |
| 浏览器侧边栏差异 | 判断 Chrome/Edge 和 Firefox 的实现边界 | `manifest.json`、`background.js` | 高 |
| LLM 提示词与上下文裁剪 | 让模型稳定回答翻译、作用和结构 | `sidepanel/sidepanel.js` | 高 |
| SSE 流式传输 | 理解模型回答的逐字显示 | `sidepanel/sidepanel.js`、`bridge/server.js` | 中 |
| Node.js 本地服务与安全 | 判断本地 Agent 是否需要后端 | `bridge/server.js` | 中 |

## 2. 重点亮点与学习顺序（先看这个）

| 亮点标题 | 为什么重要 | 通用技术关键词 | 先看哪些文件 | 建议学习顺序 |
| --- | --- | --- | --- | --- |
| 选区到上下文的采集 | 你的目标需求已有大部分实现 | Selection、Range、DOM 祖先遍历 | `content.js` | 1 |
| 跨进程状态传递 | 网页脚本不能直接操控侧边栏 | extension messaging、session storage | `content.js`、`background.js` | 2 |
| 可解释的提示词编译 | 决定“翻译/含义/作用/结构”回答质量 | structured prompt、token budget | `sidepanel/sidepanel.js` | 3 |
| 多模型直连 | 普通问答不需要自建后端 | provider adapter、SSE | `sidepanel/sidepanel.js` | 4 |
| 本地编码 Agent 桥接 | 仅在需要读写本机代码时才需要 | localhost bridge、CLI orchestration | `bridge/server.js` | 5 |
| 浏览器适配层 | 现项目目前被 Chrome Side Panel API 锁定 | capability detection、adapter | `manifest.json`、`background.js` | 6 |

## 3. 必备知识点

- [ ] `window.getSelection()`、`Range.getClientRects()` 与跨节点选区。
- [ ] `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`。
- [ ] `chrome.storage.session` 与 `chrome.storage.local` 的用途差异。
- [ ] `pre > code`、Markdown 渲染器、虚拟列表和 Shadow DOM 的页面差异。
- [ ] API Key 不应由无鉴权的远程后端代管；本地扩展存储也应提示用户风险。
- [ ] 浏览器扩展权限最小化与网站内容发送的用户同意。

## 4. 推荐阅读（结合仓库）

| 主题 | 通用技术点 | 建议阅读位置 | 预计时间 | 读完能回答什么 |
| --- | --- | --- | --- | --- |
| 扩展边界 | MV3、权限、内容脚本 | `manifest.json` | 10 分钟 | 为何目前是 Chromium 优先 |
| DOM 提取 | 完整代码块、标题、段落窗口、表格 | `content.js` 的 `findEnclosingCodeBlock` 至 `compileElementContext` | 35 分钟 | 选区上下文怎样生成 |
| 右键链路 | 菜单、帧、回退与缓存 | `background.js` 的菜单重建和点击处理 | 25 分钟 | 右键为何比左键更复杂 |
| Prompt 组装 | 代码与自然语言的不同上下文 | `sidepanel/sidepanel.js` 的 `handleSendMessage` 附近 | 30 分钟 | 怎样固定输出“翻译/含义/作用/结构” |
| 模型请求 | OpenAI/Gemini/Claude 的流式适配 | `sidepanel/sidepanel.js` 的请求分支 | 25 分钟 | 为什么普通模式不必有后端 |
| 本地 Agent | CLI 发现、SSE 转发、工作目录 | `bridge/server.js` | 25 分钟 | 哪些功能必须启动本地服务 |

## 5. 项目技术定位

**前端浏览器扩展 + AI 应用交叉项目。** 核心能力运行在网页内容脚本、扩展 Service Worker 和侧边栏 UI；Node Bridge 是可选的本地 Agent 配件，不是基础划词问答的必备后端。

## 6. 核心原理解析

1. **问题：只把一行代码给模型往往无法解释。** -> **机制：** 内容脚本通过选区共同祖先向上寻找 `pre/code`、`table`，并获取标题、前后各约 800 字符、页面语义路径和页面元数据。-> **落点：** `content.js`。
2. **问题：网页 DOM 与扩展侧边栏互相隔离。** -> **机制：** 内容脚本将结构化 `contextData` 传给后台，后台写入 `chrome.storage.session`，侧边栏监听后恢复对应标签页状态。-> **落点：** `content.js`、`background.js`、`sidepanel/sidepanel.js`。
3. **问题：左键划词和右键元素并不总是同一目标。** -> **机制：** 左键缓存选区；右键缓存命中的 DOM 元素，菜单触发时优先取高质量上下文，失败时退化为菜单文本。-> **落点：** `content.js`、`background.js`。
4. **问题：不同类型的页面内容需要不同提示。** -> **机制：** 代码选区发送完整代码块和语言；表格发送 Markdown 行；普通文本发送前后文。-> **落点：** `sidepanel/sidepanel.js`。
5. **问题：用户可能需要让本地 CLI 改代码。** -> **机制：** 浏览器请求 `localhost:3100`，Bridge 调度已安装的 CLI，并将事件转为 SSE。-> **落点：** `bridge/server.js`。

## 7. 关键设计决策：把它改成“文档代码学习 Agent”

| 备选 | 推荐取舍 | 风险 | 验证 |
| --- | --- | --- | --- |
| 在现项目上做 MVP | **推荐。** 主链路已具备，改输出产品化逻辑即可 | 现有 28 万字节单文件难维护 | 先拆 `context`、`prompt`、`providers` 模块 |
| 新建扩展 | 适合长期产品化或要支持 Firefox/Safari | 会重做已成熟的选区/右键/流式能力 | 将当前仓库的 context extractor 抽成无浏览器依赖模块后复用 |
| 只做浏览器端直连模型 | **MVP 推荐。** 不新增后端 | Key 在本地，需要可见的隐私说明 | Chrome/Edge 上完成选区问答 E2E |
| 加云端后端 | 仅多账户、统一计费、团队知识库、审计/缓存时做 | 成本、登录、数据合规、安全面增加 | 明确隐私政策与数据留存后再上线 |
| 本地 Bridge | 仅“让 Agent 操作本机项目”需要 | `localhost` CORS 当前过宽，CLI 权限高 | 限制 Origin、弹窗确认 CWD 与执行动作 |

## 8. 建议的最小产品形态

```text
网页划词 / 右键
        ↓
内容脚本：选中代码 + 完整代码块 + 标题/前后文/URL
        ↓
浏览器适配层：Chrome Side Panel / Edge Side Panel / Firefox Sidebar 回退
        ↓
学习提示词编译器（固定四栏）
        ↓
模型直连或用户自选代理
        ↓
翻译｜含义｜作用｜结构｜可选追问
```

固定提示词建议：要求模型先标明语言与不确定点，再按“逐句翻译、整体意图、输入输出与副作用、控制/数据结构、相关概念、可能误解”回答；选区很短时明确说明只能推断并引用需要的外部上下文。

## 9. 浏览器兼容性结论

- **Chrome、Edge、联想浏览器等 Chromium 内核浏览器：高可行。** `content scripts`、`contextMenus`、`storage`、`tabs` 与 MV3 是共同基础；实际发布前需逐个加载测试。
- **Edge：高可行，但侧边栏 API 的细节要实测。** 需要用 capability detection 包住 `chrome.sidePanel`，不可用时改为扩展弹窗或独立扩展页。
- **Firefox：中等可行。** DOM 提取和右键菜单可大量复用，但不能假设 `chrome.sidePanel`；要增加 Firefox `sidebar_action`/`sidebarAction` 实现和构建配置。
- **Safari：可行但成本最高。** 需 Safari Web Extension 工程、签名与真机适配；不要把它放在 MVP 阶段。
- **所有浏览器共同限制：** `chrome://`/商店页、浏览器内置 PDF 阅读器、跨域 iframe、Shadow DOM、Canvas 渲染的代码和受 CSP/企业策略限制的页面，不能保证能取得完整 DOM。

## 10. 量化与验证（待测，建议）

- 待测：在 Chrome、Edge、至少一款国产 Chromium 浏览器各选 20 个文档页，统计左键、右键、代码块识别成功率。
- 待测：对 Markdown、GitHub、MDN、语雀/飞书文档、在线 IDE 和普通博客分别记录“完整代码块、标题、前后文”准确率。
- 待测：分别统计纯选区、代码块、全文上下文的 prompt token 数与首字延迟。
- 待测：建立 30 个有标准答案的代码片段集，对“语言识别、翻译准确、作用解释、结构说明”人工评分。

## 11. 自学提醒

若某文件或原理看不懂，请继续追问 AI；本技能负责给学习路径与题目，不提供逐行讲解。
