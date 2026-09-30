/** ContextAnswer 网页内面板国际化：复用 uiLanguage 偏好并提供中英文文案。 */
(function registerInPageI18n(global) {
  const STORAGE_KEY = "uiLanguage";
  const TEXT = {
    zh: {
      home: "主页", history: "历史", log: "日志", exportLogs: "导出", settings: "打开设置", close: "关闭", modelSelectTitle: "切换当前模型",
      learning: "学习模式", chat: "普通聊天", environment: "环境默认模型（.env）",
      language: "语言", context: "上下文", automatic: "自动选择", manual: "手动选择", custom: "自行添加",
      lines: "上下各", selectionOnly: "0 行（仅选区）", lines5: "5 行", lines10: "10 行", lines20: "20 行",
      supplementalPlaceholder: "粘贴远处的结构体、接口定义、调用方或文档段落…",
      contextHint: "自动模式会先由模型判断；自行添加仅使用选区和此处的补充资料。",
      questionPlaceholder: "例如：逐行解释这段代码", chatPlaceholder: "输入你的问题…",
      learnAction: "一键学习解释", send: "发送问题", chatSend: "发送消息", stop: "停止",
      loaded: "已载入选区", ready: "已准备就绪", noSelection: "未取得选区",
      historyTitle: "学习会话历史", historyTurns: "共 {count} 轮问答", historyLegacy: "旧版单条回答", historyBack: "← 返回历史列表", historyEmpty: "暂无已完成的学习回答。", historyLoadFailed: "无法读取学习回答历史。",
      settingsTitle: "设置", settingsHint: "主页只用于选择当前模型；模型密钥和连接参数仅在此页显示。",
      panelMode: "面板展现", panelInPage: "网页内面板（默认）", panelAuto: "自动选择", panelNative: "原生侧边栏优先",
      assessment: "自动上下文评估（仅自动选择模式）", jevAssessment: "启用 Jev 选区判断", llmAssessment: "启用 LLM 兜底判断", savePanel: "保存面板设置",
      modelEditTitle: "添加 / 修改模型", newModel: "新建", provider: "供应商", name: "显示名称", model: "模型名",
      apiKey: "API Key", apiUrl: "API URL / 基地址", endpoint: "完整 Endpoint（可选）", bridge: "Bridge URL", command: "命令路径（可选）",
      addModel: "添加模型", saveEdit: "保存修改", cancelEdit: "取消修改", modelList: "模型列表",
      modelListNote: ".env 预置模型仅供选择；如需修改，请编辑 .env 后重新构建配置。", copyEdit: "复制编辑", edit: "修改", remove: "删除",
      providerCustom: "自定义兼容 API", providerOpenai: "OpenAI", providerGemini: "Gemini", providerClaude: "Claude",
      providerClaudeAgent: "Claude Code 本地 Agent", providerCodexAgent: "Codex CLI 本地 Agent", providerAntigravityAgent: "Antigravity 本地 Agent", providerCopilotAgent: "Copilot CLI 本地 Agent"
    },
    en: {
      home: "Home", history: "History", log: "Logs", exportLogs: "Export", settings: "Open settings", close: "Close", modelSelectTitle: "Choose current model",
      learning: "Learn", chat: "Chat", environment: "Environment default (.env)",
      language: "Language", context: "Context", automatic: "Auto", manual: "Manual", custom: "Add context",
      lines: "Lines each side", selectionOnly: "0 (selection only)", lines5: "5 lines", lines10: "10 lines", lines20: "20 lines",
      supplementalPlaceholder: "Paste a remote type, interface, call site, or document section…",
      contextHint: "Auto asks the model first; Add context uses only the selection and your pasted reference.",
      questionPlaceholder: "For example: explain this code line by line", chatPlaceholder: "Ask a question…",
      learnAction: "Explain selection", send: "Send question", chatSend: "Send message", stop: "Stop",
      loaded: "Selection loaded", ready: "Ready", noSelection: "No selection available",
      historyTitle: "Learning conversations", historyTurns: "{count} Q&A turns", historyLegacy: "Legacy single answer", historyBack: "← Back to history", historyEmpty: "No completed learning answers yet.", historyLoadFailed: "Unable to load learning history.",
      settingsTitle: "Settings", settingsHint: "Home only chooses the active model; keys and connection fields appear here only.",
      panelMode: "Panel host", panelInPage: "In-page panel (default)", panelAuto: "Automatic", panelNative: "Native side panel first",
      assessment: "Automatic context assessment (Auto mode only)", jevAssessment: "Enable Jev selection assessment", llmAssessment: "Enable LLM fallback assessment", savePanel: "Save panel settings",
      modelEditTitle: "Add / edit model", newModel: "New", provider: "Provider", name: "Display name", model: "Model name",
      apiKey: "API key", apiUrl: "API URL / base URL", endpoint: "Full endpoint (optional)", bridge: "Bridge URL", command: "Command path (optional)",
      addModel: "Add model", saveEdit: "Save changes", cancelEdit: "Cancel edit", modelList: "Model list",
      modelListNote: ".env profiles are selectable only. Edit .env and rebuild to change them.", copyEdit: "Copy to edit", edit: "Edit", remove: "Delete",
      providerCustom: "Custom compatible API", providerOpenai: "OpenAI", providerGemini: "Gemini", providerClaude: "Claude",
      providerClaudeAgent: "Claude Code local Agent", providerCodexAgent: "Codex CLI local Agent", providerAntigravityAgent: "Antigravity local Agent", providerCopilotAgent: "Copilot CLI local Agent"
    }
  };

  function normalize(value) { return value === "en" ? "en" : "zh"; }
  async function get() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return normalize(stored[STORAGE_KEY]);
  }
  async function toggle(current) {
    const next = normalize(current) === "zh" ? "en" : "zh";
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    return next;
  }
  function t(language, key) { return TEXT[normalize(language)]?.[key] || TEXT.zh[key] || key; }
  function subscribe(listener) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes[STORAGE_KEY]) listener(normalize(changes[STORAGE_KEY].newValue));
    });
  }

  global.ContextAnswerI18n = { get, toggle, t, subscribe };
})(globalThis);
