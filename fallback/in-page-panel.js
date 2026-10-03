/**
 * 网页内回退面板：在不支持原生侧栏的浏览器中，用 Shadow DOM 提供独立学习界面。
 * LLM 请求由后台执行，避免内容脚本受到网页 CORS 限制。
 */
(function registerInPagePanel(global) {
  let host;
  let panelRoot;
  let elements;
  let uiLanguage = "zh";
  let activeRequestId = null;
  let currentPayload = null;
  let requestOptions = null;
  let currentMode = "learning";
  let chatTurns = [];
  let pendingQuestion = "";
  let modelChoices = [];
  let activeAnswerText = "";
  let activeInstruction = "";
  let activeLearningScopeKey = "";
  let viewMode = "home";
  let homeStatus = { text: "已准备就绪", className: "status" };

  function t(key) { return global.ContextAnswerI18n?.t?.(uiLanguage, key) || key; }

  function setLeadingText(element, text) {
    if (!element) return;
    const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.nodeValue = text;
    else element.prepend(document.createTextNode(text));
  }

  function setTrailingText(element, text) {
    if (!element) return;
    const textNode = Array.from(element.childNodes).reverse().find((node) => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.nodeValue = text;
    else element.append(document.createTextNode(text));
  }

  function sourceLanguageLabel(value, fallback) {
    if (uiLanguage !== "en") return fallback;
    return ({ auto: "Auto detect", data: "JSON / YAML / XML", markdown: "Markdown", document: "Technical document" })[value] || fallback;
  }

  // 静态控件由此处集中翻译；模型名称、选区和模型回答保持原样。
  function applyLanguage() {
    if (!elements || !panelRoot) return;
    panelRoot.lang = uiLanguage === "en" ? "en" : "zh-CN";
    elements.languageToggle.textContent = uiLanguage === "zh" ? "中文 / EN" : "ZH / English";
    elements.languageToggle.title = uiLanguage === "zh" ? "Switch to English" : "切换到中文";
    elements.home.textContent = t("home");
    elements.history.textContent = t("history");
    elements.diagnostics.textContent = t("log");
    elements.exportLogs.textContent = t("exportLogs");
    elements.exportLogs.title = t("exportLogs");
    elements.settings.title = t("settings");
    elements.settings.setAttribute("aria-label", t("settings"));
    elements.close.title = t("close");
    elements.modelSelect.title = t("modelSelectTitle");
    elements.modeLearning.textContent = t("learning");
    elements.modeChat.textContent = t("chat");
    setLeadingText(elements.language.closest("label"), t("language"));
    setLeadingText(elements.contextMode.closest("label"), t("context"));
    setLeadingText(elements.contextLines.closest("label"), t("lines"));
    elements.contextMode.querySelector('option[value="auto"]').textContent = t("automatic");
    elements.contextMode.querySelector('option[value="manual"]').textContent = t("manual");
    elements.contextMode.querySelector('option[value="custom"]').textContent = t("custom");
    const lineLabels = { 0: "selectionOnly", 5: "lines5", 10: "lines10", 20: "lines20" };
    Object.entries(lineLabels).forEach(([value, key]) => { elements.contextLines.querySelector(`option[value="${value}"]`).textContent = t(key); });
    elements.supplemental.placeholder = t("supplementalPlaceholder");
    elements.optionHint.textContent = t("contextHint");
    elements.input.placeholder = currentMode === "chat" ? t("chatPlaceholder") : t("questionPlaceholder");
    elements.send.textContent = t("send");
    elements.stop.textContent = t("stop");
    elements.learn.textContent = currentMode === "chat" ? t("chatSend") : t("learnAction");
    panelRoot.querySelector(".settings-heading h2").textContent = t("settingsTitle");
    panelRoot.querySelector(".settings-heading p").textContent = t("settingsHint");
    setLeadingText(settingField("setting-panel-mode").closest("label"), t("panelMode"));
    settingField("setting-panel-mode").querySelector('option[value="in-page"]').textContent = t("panelInPage");
    settingField("setting-panel-mode").querySelector('option[value="auto"]').textContent = t("panelAuto");
    settingField("setting-panel-mode").querySelector('option[value="native"]').textContent = t("panelNative");
    setTrailingText(settingField("setting-assessment").parentElement, ` ${t("assessment")}`);
    setTrailingText(settingField("setting-jev").parentElement, ` ${t("jevAssessment")}`);
    setTrailingText(settingField("setting-llm").parentElement, ` ${t("llmAssessment")}`);
    setLeadingText(settingField("setting-assessment-timeout").closest("label"), t("assessmentTimeout"));
    const timeoutLabels = uiLanguage === "en" ? ["5 s", "10 s", "15 s", "30 s", "60 s", "120 s"] : ["5 秒", "10 秒", "15 秒", "30 秒", "60 秒", "120 秒"];
    Array.from(settingField("setting-assessment-timeout").options).forEach((option, index) => { option.textContent = timeoutLabels[index] || option.textContent; });
    elements.settingsPreferences.textContent = t("savePanel");
    panelRoot.querySelector(".model-form-heading h3").textContent = t("modelEditTitle");
    elements.modelNew.textContent = t("newModel");
    setLeadingText(settingField("setting-provider").closest("label"), t("provider"));
    setLeadingText(settingField("setting-label").closest("label"), t("name"));
    setLeadingText(settingField("setting-model").closest("label"), t("model"));
    setLeadingText(settingField("setting-key").closest("label"), t("apiKey"));
    setLeadingText(settingField("setting-url").closest("label"), t("apiUrl"));
    setLeadingText(settingField("setting-endpoint").closest("label"), t("endpoint"));
    setLeadingText(settingField("setting-bridge").closest("label"), t("bridge"));
    setLeadingText(settingField("setting-command").closest("label"), t("command"));
    const providerKeys = { custom: "providerCustom", openai: "providerOpenai", gemini: "providerGemini", claude: "providerClaude", "claude-agent": "providerClaudeAgent", "codex-agent": "providerCodexAgent", "antigravity-agent": "providerAntigravityAgent", "copilot-agent": "providerCopilotAgent" };
    Object.entries(providerKeys).forEach(([value, key]) => { settingField("setting-provider").querySelector(`option[value="${value}"]`).textContent = t(key); });
    elements.modelSave.textContent = elements.settingsView.dataset.modelId ? t("saveEdit") : t("addModel");
    elements.modelCancel.textContent = t("cancelEdit");
    panelRoot.querySelector(".settings-view > h3").textContent = t("modelList");
    elements.modelListNote.textContent = t("modelListNote");
    if (requestOptions) renderOptions(requestOptions);
    renderModelList(modelChoices);
  }

  function renderAnswer(text) {
    if (global.ContextLensAnswerRenderer) global.ContextLensAnswerRenderer.render(elements.answer, text);
    else elements.answer.textContent = text;
  }

  function setVisibleStatus(text, className = "status") {
    elements.status.textContent = text;
    elements.status.className = className;
    if (elements.settingsStatus) {
      elements.settingsStatus.textContent = text;
      elements.settingsStatus.className = className;
    }
  }

  function setHomeStatus(text, className = "status") {
    homeStatus = { text, className };
    if (viewMode === "home") setVisibleStatus(text, className);
  }

  function showHome() {
    viewMode = "home";
    elements.workspace.hidden = false;
    elements.settingsView.hidden = true;
    elements.exportLogs.hidden = true;
    elements.answer.dataset.rawAnswer = activeAnswerText;
    if (currentMode === "chat") renderChatConversation();
    else renderAnswer(activeAnswerText || "上下文已载入。可一键学习解释，或输入具体问题。");
    setVisibleStatus(homeStatus.text, homeStatus.className);
  }

  // 历史、日志和详情复用主工作区，避免从设置页进入后内容仍被隐藏。
  function showWorkspaceView(nextView) {
    viewMode = nextView;
    elements.workspace.hidden = false;
    elements.settingsView.hidden = true;
    elements.exportLogs.hidden = nextView !== "diagnostics";
  }

  function settingField(className) {
    return elements.settingsView.querySelector(`.${className}`);
  }

  function syncProviderFields() {
    const isAgent = settingField("setting-provider").value.endsWith("-agent");
    elements.settingsView.querySelectorAll(".api-setting").forEach((item) => { item.hidden = isAgent; });
    elements.settingsView.querySelectorAll(".agent-setting").forEach((item) => { item.hidden = !isAgent; });
  }

  function populateSettings(model = null, preferences = null, learningOptions = null) {
    settingField("setting-panel-mode").value = preferences?.panelMode || "in-page";
    settingField("setting-assessment").checked = preferences?.contextAssessmentEnabled !== false;
    settingField("setting-jev").checked = preferences?.jevEnabled === true;
    settingField("setting-llm").checked = preferences?.llmAssessmentEnabled !== false;
    settingField("setting-assessment-timeout").value = String(learningOptions?.assessmentTimeoutMs || requestOptions?.assessmentTimeoutMs || 15000);
    populateModelForm(model);
  }

  // 模型表单只属于设置页；主页只保留无密钥的模型选择器。
  function populateModelForm(model = null) {
    settingField("setting-provider").value = model?.provider || "custom";
    settingField("setting-label").value = model?.label || "";
    settingField("setting-model").value = model?.model || "";
    settingField("setting-key").value = model?.apiKey || "";
    settingField("setting-url").value = model?.apiUrl || "";
    settingField("setting-endpoint").value = model?.apiEndpoint || "";
    settingField("setting-bridge").value = model?.bridgeUrl || "";
    settingField("setting-command").value = model?.commandPath || "";
    elements.settingsView.dataset.modelId = model?.id || "";
    elements.modelSave.textContent = model ? t("saveEdit") : t("addModel");
    elements.modelCancel.hidden = !model;
    syncProviderFields();
  }

  function modelFromForm() {
    return {
      id: elements.settingsView.dataset.modelId || undefined,
      provider: settingField("setting-provider").value,
      label: settingField("setting-label").value,
      model: settingField("setting-model").value,
      apiKey: settingField("setting-key").value,
      apiUrl: settingField("setting-url").value,
      apiEndpoint: settingField("setting-endpoint").value,
      bridgeUrl: settingField("setting-bridge").value,
      commandPath: settingField("setting-command").value
    };
  }

  function validateModel(model) {
    const isAgent = model.provider.endsWith("-agent");
    if (!model.label || (!isAgent && !model.model) || (model.provider === "custom" && !model.apiUrl && !model.apiEndpoint)) {
      setVisibleStatus("请填写显示名称和模型名；自定义兼容接口还需要 API URL 或完整 Endpoint。", "status error");
      return false;
    }
    return true;
  }

  function renderModelList(models = []) {
    elements.modelList.replaceChildren();
    if (!models.length) {
      const empty = document.createElement("p");
      empty.className = "model-list-empty";
      empty.textContent = uiLanguage === "en" ? "No saved or .env preset models yet." : "暂无已保存或 .env 预置的额外模型。";
      elements.modelList.appendChild(empty);
      return;
    }
    models.forEach((model) => {
      const row = document.createElement("section");
      row.className = "model-list-row";
      const text = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = model.label || model.model || model.provider;
      const detail = document.createElement("small");
      detail.textContent = `${model.provider}${model.model ? ` · ${model.model}` : ""}${model.readOnly ? (uiLanguage === "en" ? " · .env preset (read-only)" : " · .env 预置（只读）") : ""}`;
      text.append(name, detail);
      const actions = document.createElement("div");
      actions.className = "model-row-actions";
      if (model.readOnly) {
        const copy = document.createElement("button");
        copy.type = "button";
        copy.textContent = t("copyEdit");
        copy.addEventListener("click", () => populateModelForm({ ...model, id: undefined, label: `${model.label} 副本` }));
        actions.appendChild(copy);
      } else {
        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = t("edit");
        edit.addEventListener("click", () => populateModelForm(model));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "model-remove";
        remove.textContent = t("remove");
        remove.addEventListener("click", () => removeModel(model));
        actions.append(edit, remove);
      }
      row.append(text, actions);
      elements.modelList.appendChild(row);
    });
  }

  async function loadModels() {
    const response = await chrome.runtime.sendMessage({ type: "GET_CONTEXT_ANSWER_MODELS" }).catch(() => null);
    modelChoices = response?.success ? response.models : [];
    elements.modelSelect.replaceChildren();
    const environment = document.createElement("option");
    environment.value = "";
    environment.textContent = t("environment");
    elements.modelSelect.appendChild(environment);
    modelChoices.filter((model) => model.id !== "env-default").forEach((model) => {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.label || model.model || model.provider;
      elements.modelSelect.appendChild(option);
    });
    elements.modelSelect.value = response?.activeModel?.id || "";
  }

  async function switchModel() {
    const id = elements.modelSelect.value;
    if (!id) return useEnvironmentModel();
    const response = await chrome.runtime.sendMessage({ type: "SET_CONTEXT_ANSWER_ACTIVE_MODEL", id }).catch(() => null);
    if (!response?.success) setHomeStatus(response?.error || "模型切换失败。", "status error");
    else setHomeStatus(`已切换到 ${response.model.label || response.model.model || response.model.provider}`);
  }

  async function showSettings() {
    viewMode = "settings";
    elements.workspace.hidden = true;
    elements.settingsView.hidden = false;
    elements.exportLogs.hidden = true;
    const [preferencesResponse, modelsResponse, learningOptionsResponse] = await Promise.all([
      chrome.runtime.sendMessage({ type: "GET_PANEL_PREFERENCES" }).catch(() => null),
      chrome.runtime.sendMessage({ type: "GET_CONTEXT_ANSWER_MODELS" }).catch(() => null),
      chrome.runtime.sendMessage({ type: "GET_LEARNING_OPTIONS" }).catch(() => null)
    ]);
    if (viewMode !== "settings") return;
    populateSettings(null, preferencesResponse?.preferences, learningOptionsResponse?.options);
    renderModelList(modelsResponse?.success ? modelsResponse.models : []);
    setVisibleStatus("设置页：保存后将立即应用到后续请求。");
  }

  async function saveModelForm() {
    const model = modelFromForm();
    if (!validateModel(model)) return;
    const editing = Boolean(model.id);
    const response = await chrome.runtime.sendMessage({ type: "SAVE_CONTEXT_ANSWER_MODEL", model, activate: false }).catch(() => null);
    if (!response?.success) {
      setVisibleStatus(response?.error || "模型保存失败。", "status error");
      return;
    }
    await loadModels();
    const modelsResponse = await chrome.runtime.sendMessage({ type: "GET_CONTEXT_ANSWER_MODELS" }).catch(() => null);
    renderModelList(modelsResponse?.success ? modelsResponse.models : []);
    populateModelForm(null);
    setVisibleStatus(editing ? "模型已修改；可在主页下拉菜单切换。" : "模型已添加；可在主页下拉菜单切换。");
  }

  async function removeModel(model) {
    if (!window.confirm(`删除模型“${model.label || model.model || model.provider}”？`)) return;
    const response = await chrome.runtime.sendMessage({ type: "REMOVE_CONTEXT_ANSWER_MODEL", id: model.id }).catch(() => null);
    if (!response?.success) {
      setVisibleStatus(response?.error || "模型删除失败。", "status error");
      return;
    }
    await loadModels();
    const modelsResponse = await chrome.runtime.sendMessage({ type: "GET_CONTEXT_ANSWER_MODELS" }).catch(() => null);
    renderModelList(modelsResponse?.success ? modelsResponse.models : []);
    if (elements.settingsView.dataset.modelId === model.id) populateModelForm(null);
    setVisibleStatus("模型已删除。");
  }

  async function savePreferences() {
    const preferences = {
      panelMode: settingField("setting-panel-mode").value,
      contextAssessmentEnabled: settingField("setting-assessment").checked,
      jevEnabled: settingField("setting-jev").checked,
      llmAssessmentEnabled: settingField("setting-llm").checked
    };
    const [response, optionsResponse] = await Promise.all([
      chrome.runtime.sendMessage({ type: "SET_PANEL_PREFERENCES", preferences }).catch(() => null),
      chrome.runtime.sendMessage({
        type: "SET_LEARNING_OPTIONS",
        options: { ...(requestOptions || {}), assessmentTimeoutMs: Number(settingField("setting-assessment-timeout").value) }
      }).catch(() => null)
    ]);
    if (!response?.success || !optionsResponse?.success) {
      setVisibleStatus(response?.error || optionsResponse?.error || "设置保存失败。", "status error");
      return;
    }
    renderOptions({ ...(requestOptions || {}), ...(optionsResponse.options || {}) });
    setVisibleStatus("面板、Jev、LLM 判断和超时设置已保存。");
  }

  async function useEnvironmentModel() {
    const response = await chrome.runtime.sendMessage({ type: "CLEAR_CONTEXT_ANSWER_ACTIVE_MODEL" }).catch(() => null);
    if (!response?.success) {
      setVisibleStatus(response?.error || "无法切换到 .env 默认模型。", "status error");
      return;
    }
    await loadModels();
    setHomeStatus("已切换到 .env 默认模型。");
  }

  function createPanel() {
    if (host) return;
    host = document.createElement("div");
    host.id = "contextlens-in-page-panel-host";
    const shadow = host.attachShadow({ mode: "closed" });
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = chrome.runtime.getURL("fallback/in-page-panel.css");
    shadow.appendChild(stylesheet);
    const panel = document.createElement("section");
    panel.className = "panel";
    panel.innerHTML = `<header class="header drag-handle"><span class="title">ContextAnswer</span><span class="header-actions"><button class="home header-utility" title="返回当前会话">主页</button><button class="history header-utility" title="查看已完成的学习回答">历史</button><button class="diagnostics header-utility" title="查看 LLM 调用时间线与脱敏诊断">日志</button><button class="export-logs header-utility" title="导出日志" hidden>导出</button><button class="settings header-utility" title="打开设置" aria-label="打开设置">⚙</button><button class="language-toggle header-utility" title="Switch to English">中文 / EN</button><button class="close" title="关闭">×</button></span></header><main class="body"><section class="workspace"><div class="mode-row"><div class="mode-switch"><button class="mode-learning active" type="button">学习模式</button><button class="mode-chat" type="button">普通聊天</button></div><select class="model-select" title="切换当前模型"></select></div><pre class="context"></pre><div class="learning-controls"><div class="options"><label>语言<select class="source-language"></select></label><label>上下文<select class="context-mode"><option value="auto">自动选择</option><option value="manual">手动选择</option><option value="custom">自行添加</option></select></label><label class="manual-lines">上下各<select class="context-lines"><option value="0">0 行（仅选区）</option><option value="5">5 行</option><option value="10">10 行</option><option value="20">20 行</option></select></label></div><textarea class="supplemental-context" placeholder="粘贴远处的结构体、接口定义、调用方或文档段落…" hidden></textarea><p class="option-hint">自动模式会先由模型判断；自行添加仅使用选区和此处的补充资料。</p></div><textarea class="question-input" placeholder="例如：逐行解释这段代码"></textarea><div class="actions"><button class="secondary learning-action">一键学习解释</button><button class="primary question-action">发送问题</button><button class="stop" disabled>停止</button></div><div class="status">已准备就绪</div><article class="answer">请选择内容后开始学习。</article></section><section class="settings-view" hidden><div class="settings-heading"><h2>设置</h2><p>主页只用于选择当前模型；模型密钥和连接参数仅在此页显示。</p></div><label>面板展现<select class="setting-panel-mode"><option value="in-page">网页内面板（默认）</option><option value="auto">自动选择</option><option value="native">原生侧边栏优先</option></select></label><label class="setting-check"><input class="setting-assessment" type="checkbox"> 自动上下文评估（仅自动选择模式）</label><label class="setting-check"><input class="setting-jev" type="checkbox"> 启用 Jev 选区判断</label><label class="setting-check"><input class="setting-llm" type="checkbox"> 启用 LLM 兜底判断</label><label class="setting-timeout-label">Jev / 上下文判断单次超时<select class="setting-assessment-timeout"><option value="5000">5 秒</option><option value="10000">10 秒</option><option value="15000">15 秒</option><option value="30000">30 秒</option><option value="60000">60 秒</option><option value="120000">120 秒</option></select></label><div class="settings-actions"><button class="settings-preferences" type="button">保存面板设置</button></div><hr><div class="model-form-heading"><h3>添加 / 修改模型</h3><button class="model-new" type="button">新建</button></div><label>供应商<select class="setting-provider"><option value="custom">自定义兼容 API</option><option value="openai">OpenAI</option><option value="gemini">Gemini</option><option value="claude">Claude</option><option value="claude-agent">Claude Code 本地 Agent</option><option value="codex-agent">Codex CLI 本地 Agent</option><option value="antigravity-agent">Antigravity 本地 Agent</option><option value="copilot-agent">Copilot CLI 本地 Agent</option></select></label><label>显示名称<input class="setting-label" placeholder="例如 DeepSeek Flash"></label><label>模型名<input class="setting-model" placeholder="例如 deepseek-flash"></label><label class="api-setting">API Key<input class="setting-key" type="password"></label><label class="api-setting">API URL / 基地址<input class="setting-url" placeholder="https://provider.example/v1"></label><label class="api-setting">完整 Endpoint（可选）<input class="setting-endpoint" placeholder="https://provider.example/api/chat"></label><label class="agent-setting" hidden>Bridge URL<input class="setting-bridge" placeholder="http://localhost:3100"></label><label class="agent-setting" hidden>命令路径（可选）<input class="setting-command" placeholder="codex / claude / agy"></label><div class="settings-actions"><button class="model-save" type="button">添加模型</button><button class="model-cancel" type="button" hidden>取消修改</button></div><h3>模型列表</h3><p class="model-list-note">.env 预置模型仅供选择；如需修改，请编辑 .env 后重新构建配置。</p><div class="model-list"></div><div class="settings-status status">设置就绪</div></section></main>`;
    panelRoot = panel;
    shadow.appendChild(panel);
    document.documentElement.appendChild(host);
    elements = {
      context: panel.querySelector(".context"),
      input: panel.querySelector(".question-input"),
      learn: panel.querySelector(".learning-action"),
      send: panel.querySelector(".question-action"),
      stop: panel.querySelector(".stop"),
      language: panel.querySelector(".source-language"),
      contextMode: panel.querySelector(".context-mode"),
      contextLines: panel.querySelector(".context-lines"),
      manualLines: panel.querySelector(".manual-lines"),
      supplemental: panel.querySelector(".supplemental-context"),
      learningControls: panel.querySelector(".learning-controls"),
      workspace: panel.querySelector(".workspace"),
      settingsView: panel.querySelector(".settings-view"),
      modeLearning: panel.querySelector(".mode-learning"),
      modeChat: panel.querySelector(".mode-chat"),
      modelSelect: panel.querySelector(".model-select"),
      languageToggle: panel.querySelector(".language-toggle"),
      modelSave: panel.querySelector(".model-save"),
      modelCancel: panel.querySelector(".model-cancel"),
      modelNew: panel.querySelector(".model-new"),
      modelList: panel.querySelector(".model-list"),
      home: panel.querySelector(".home"),
      history: panel.querySelector(".history"),
      settings: panel.querySelector(".settings"),
      close: panel.querySelector(".close"),
      diagnostics: panel.querySelector(".diagnostics"),
      exportLogs: panel.querySelector(".export-logs"),
      optionHint: panel.querySelector(".option-hint"),
      settingsPreferences: panel.querySelector(".settings-preferences"),
      modelListNote: panel.querySelector(".model-list-note"),
      status: panel.querySelector(".status"),
      settingsStatus: panel.querySelector(".settings-status"),
      answer: panel.querySelector(".answer")
    };
    elements.close.addEventListener("click", () => {
      if (activeRequestId) void stopRequest();
      host.remove();
    });
    elements.learn.addEventListener("click", () => send(currentMode === "learning" ? "请按学习模式解释选中内容。" : elements.input.value));
    elements.send.addEventListener("click", () => send(elements.input.value));
    elements.stop.addEventListener("click", stopRequest);
    elements.home.addEventListener("click", showHome);
    elements.history.addEventListener("click", showHistory);
    elements.diagnostics.addEventListener("click", showDiagnostics);
    elements.exportLogs.addEventListener("click", exportLogs);
    elements.settings.addEventListener("click", showSettings);
    elements.languageToggle.addEventListener("click", async () => {
      uiLanguage = await global.ContextAnswerI18n.toggle(uiLanguage);
      applyLanguage();
      await loadModels();
    });
    elements.modeLearning.addEventListener("click", () => setMode("learning"));
    elements.modeChat.addEventListener("click", () => setMode("chat"));
    elements.modelSelect.addEventListener("change", switchModel);
    elements.language.addEventListener("change", saveOptions);
    elements.contextMode.addEventListener("change", saveOptions);
    elements.contextLines.addEventListener("change", saveOptions);
    elements.supplemental.addEventListener("input", saveOptions);
    elements.settingsView.querySelector(".settings-preferences").addEventListener("click", savePreferences);
    elements.modelSave.addEventListener("click", saveModelForm);
    elements.modelCancel.addEventListener("click", () => populateModelForm(null));
    elements.modelNew.addEventListener("click", () => populateModelForm(null));
    elements.settingsView.querySelector(".setting-provider").addEventListener("change", syncProviderFields);
    global.ContextAnswerPanelDrag?.attach?.(panel, panel.querySelector(".drag-handle"));
    global.ContextAnswerI18n?.subscribe?.((language) => {
      uiLanguage = language;
      applyLanguage();
      void loadModels();
    });
    void loadOptions();
    void loadPanelState();
  }

  function setRunning(running) {
    elements.learn.disabled = running;
    elements.send.disabled = running;
    elements.stop.disabled = !running;
    elements.input.disabled = running;
    elements.modeLearning.disabled = running;
    elements.modeChat.disabled = running;
    elements.modelSelect.disabled = running;
  }

  function renderMode() {
    const learning = currentMode === "learning";
    elements.modeLearning.classList.toggle("active", learning);
    elements.modeChat.classList.toggle("active", !learning);
    elements.learningControls.hidden = !learning;
    elements.context.hidden = !learning && !currentPayload?.contextData?.selectedText;
    elements.learn.textContent = learning ? t("learnAction") : t("chatSend");
    elements.send.hidden = !learning;
    elements.input.placeholder = learning ? t("questionPlaceholder") : t("chatPlaceholder");
    if (viewMode === "home") showHome();
  }

  async function setMode(mode) {
    if (activeRequestId) return;
    currentMode = mode === "chat" ? "chat" : "learning";
    await chrome.storage.local.set({ contextAnswerConversationMode: currentMode });
    renderMode();
  }

  async function loadPanelState() {
    const [stored, language] = await Promise.all([
      chrome.storage.local.get("contextAnswerConversationMode"),
      global.ContextAnswerI18n?.get?.() || Promise.resolve("zh")
    ]);
    uiLanguage = language;
    applyLanguage();
    currentMode = stored.contextAnswerConversationMode === "chat" ? "chat" : "learning";
    renderMode();
    await loadModels();
  }

  function renderChatConversation() {
    elements.answer.replaceChildren();
    if (!chatTurns.length && !activeAnswerText) {
      elements.answer.textContent = "普通聊天会保留本次面板内的近期问答；可直接提问，也可先选取网页内容。";
      return;
    }
    chatTurns.forEach((turn) => {
      const question = document.createElement("section");
      question.className = "chat-bubble user";
      question.textContent = turn.question;
      const answer = document.createElement("section");
      answer.className = "chat-bubble assistant";
      if (global.ContextLensAnswerRenderer) global.ContextLensAnswerRenderer.render(answer, turn.answer);
      else answer.textContent = turn.answer;
      elements.answer.append(question, answer);
    });
    if (pendingQuestion) {
      const question = document.createElement("section");
      question.className = "chat-bubble user";
      question.textContent = pendingQuestion;
      const answer = document.createElement("section");
      answer.className = "chat-bubble assistant";
      if (activeAnswerText) {
        if (global.ContextLensAnswerRenderer) global.ContextLensAnswerRenderer.render(answer, activeAnswerText);
        else answer.textContent = activeAnswerText;
      } else answer.textContent = "正在回答…";
      elements.answer.append(question, answer);
    }
  }

  function renderOptions(options) {
    requestOptions = global.ContextLensLearningOptions.normalize(options);
    elements.language.innerHTML = global.ContextLensLearningOptions.LANGUAGES
      .map(([value, label]) => `<option value="${value}">${sourceLanguageLabel(value, label)}</option>`).join("");
    elements.language.value = requestOptions.sourceLanguage;
    elements.contextMode.value = requestOptions.contextMode;
    elements.contextLines.value = String(requestOptions.manualLines);
    elements.contextLines.disabled = requestOptions.contextMode !== "manual";
    elements.manualLines.classList.toggle("disabled", requestOptions.contextMode !== "manual");
    elements.supplemental.hidden = requestOptions.contextMode !== "custom";
    elements.supplemental.value = requestOptions.supplementalContext || "";
  }

  async function loadOptions() {
    const response = await chrome.runtime.sendMessage({ type: "GET_LEARNING_OPTIONS" }).catch(() => null);
    renderOptions(response?.success ? response.options : await global.ContextLensLearningOptions.get());
  }

  async function saveOptions() {
    if (!elements) return;
    const next = {
      ...(requestOptions || {}),
      sourceLanguage: elements.language.value,
      contextMode: elements.contextMode.value,
      manualLines: Number(elements.contextLines.value),
      supplementalContext: elements.supplemental.value
    };
    const response = await chrome.runtime.sendMessage({ type: "SET_LEARNING_OPTIONS", options: next }).catch(() => null);
    renderOptions({ ...(response?.success ? response.options : next), supplementalContext: next.supplementalContext });
  }

  function open(payload) {
    if (host && !host.isConnected) host = null;
    createPanel();
    currentPayload = payload || currentPayload;
    const selected = currentPayload?.contextData?.selectedText || currentPayload?.text || "未取得选区";
    elements.context.textContent = selected.slice(0, 1600);
    activeAnswerText = "";
    activeInstruction = "";
    activeLearningScopeKey = "";
    pendingQuestion = "";
    elements.answer.dataset.rawAnswer = "";
    setHomeStatus("已载入选区");
    showHome();
  }

  async function send(instruction) {
    if (activeRequestId) return;
    if (currentMode === "learning" && !currentPayload?.contextData) {
      setHomeStatus("没有可用的选区上下文，请重新选取内容。", "status error");
      return;
    }
    const question = String(instruction || "").trim();
    if (currentMode === "chat" && !question) {
      setHomeStatus("请输入需要讨论的问题。", "status error");
      return;
    }
    activeRequestId = `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activeInstruction = question || "请解释选中内容。";
    activeLearningScopeKey = "";
    pendingQuestion = currentMode === "chat" ? activeInstruction : "";
    activeAnswerText = "";
    viewMode = "home";
    setRunning(true);
    elements.answer.dataset.rawAnswer = "";
    if (currentMode === "chat") renderChatConversation();
    else renderAnswer("");
    setHomeStatus("正在请求模型…");
    const response = await chrome.runtime.sendMessage({
      type: "FALLBACK_CHAT_REQUEST",
      requestId: activeRequestId,
      payload: currentPayload,
      instruction: activeInstruction,
      mode: currentMode,
      conversation: currentMode === "chat" ? chatTurns : [],
      // 仅传递本次界面可改字段；翻译等默认策略由后台读取 .env 后合并。
      requestOptions: requestOptions ? {
        sourceLanguage: requestOptions.sourceLanguage,
        contextMode: requestOptions.contextMode,
        manualLines: requestOptions.manualLines,
        supplementalContext: requestOptions.supplementalContext,
        assessmentTimeoutMs: requestOptions.assessmentTimeoutMs
      } : null
    });
    if (!response?.success) {
      setHomeStatus(response?.error || "模型请求无法启动。", "status error");
      activeRequestId = null;
      setRunning(false);
    }
  }

  async function stopRequest() {
    if (!activeRequestId) return;
    const requestId = activeRequestId;
    setHomeStatus("正在停止请求…");
    await chrome.runtime.sendMessage({ type: "CANCEL_FALLBACK_REQUEST", requestId }).catch(() => null);
  }

  async function exportLogs() {
    if (!elements?.exportLogs) return;
    elements.exportLogs.disabled = true;
    setVisibleStatus("正在准备日志导出…");
    try {
      const [timelineResponse, diagnosticResponse] = await Promise.all([
        chrome.runtime.sendMessage({ type: "GET_LLM_TIMELINES", limit: 60 }),
        chrome.runtime.sendMessage({ type: "GET_REQUEST_DIAGNOSTICS", limit: 80 })
      ]);
      if (!timelineResponse?.success || !diagnosticResponse?.success) {
        throw new Error(timelineResponse?.error || diagnosticResponse?.error || "无法读取调用日志。");
      }
      const text = global.ContextLensLogExport.buildText({ runs: timelineResponse.runs, entries: diagnosticResponse.entries });
      const response = await chrome.runtime.sendMessage({
        type: "DOWNLOAD_LOG_TEXT",
        text,
        filename: global.ContextLensLogExport.filename()
      });
      if (!response?.success) throw new Error(response?.error || "无法启动日志下载。");
      setVisibleStatus("日志已准备下载，请在浏览器对话框中选择保存位置。");
    } catch (error) {
      setVisibleStatus(error.message || "日志导出失败。", "status error");
    } finally {
      elements.exportLogs.disabled = false;
    }
  }

  async function showDiagnostics() {
    showWorkspaceView("diagnostics");
    const [timelineResponse, diagnosticResponse] = await Promise.all([
      chrome.runtime.sendMessage({ type: "GET_LLM_TIMELINES", limit: 60 }),
      chrome.runtime.sendMessage({ type: "GET_REQUEST_DIAGNOSTICS", limit: 80 })
    ]);
    if (viewMode !== "diagnostics") return;
    if (!timelineResponse?.success || !diagnosticResponse?.success) {
      setVisibleStatus(timelineResponse?.error || diagnosticResponse?.error || "无法读取调用日志。", "status error");
      return;
    }
    const timelineText = global.ContextLensLlmTimelineView?.format?.(timelineResponse.runs || [], { maxChains: 15 }) || "";
    const diagnosticText = global.ContextLensLogExport?.formatDiagnostics?.(diagnosticResponse.entries || []) || "";
    elements.answer.textContent = `LLM 调用时间线（最近 15 条请求链）\n\n${timelineText || "暂无 LLM 调用记录。"}\n\n———— 脱敏诊断 ————\n\n${diagnosticText || "暂无诊断记录。"}`;
    setVisibleStatus("显示最近 15 条请求链及其模型调用");
  }

  function appendTextNode(parent, className, text) {
    const node = document.createElement("span");
    node.className = className;
    node.textContent = text;
    parent.appendChild(node);
  }

  function showHistoryConversation(conversation) {
    showWorkspaceView("history-detail");
    elements.answer.replaceChildren();
    const back = document.createElement("button");
    back.type = "button";
    back.className = "history-back";
    back.textContent = t("historyBack");
    back.addEventListener("click", showHistory);
    const title = document.createElement("h2");
    title.className = "history-heading";
    title.textContent = conversation.legacy ? t("historyLegacy") : t("historyTitle");
    elements.answer.append(back, title);
    conversation.entries.forEach((entry, index) => {
      const turn = document.createElement("section");
      turn.className = "history-turn";
      const meta = document.createElement("div");
      meta.className = "history-turn-meta";
      meta.textContent = `${index + 1}. ${new Date(entry.createdAt).toLocaleString(uiLanguage === "en" ? "en" : "zh-CN")}`;
      const question = document.createElement("h3");
      question.className = "history-turn-question";
      question.textContent = entry.question || "一键学习解释";
      const answer = document.createElement("div");
      answer.className = "history-answer";
      if (global.ContextLensAnswerRenderer) global.ContextLensAnswerRenderer.render(answer, entry.answer);
      else answer.textContent = entry.answer;
      turn.append(meta, question, answer);
      elements.answer.appendChild(turn);
    });
    setVisibleStatus(t("historyTurns").replace("{count}", String(conversation.entries.length)));
  }

  async function showHistory() {
    showWorkspaceView("history");
    elements.answer.replaceChildren();
    const title = document.createElement("h2");
    title.className = "history-heading";
    title.textContent = t("historyTitle");
    const list = document.createElement("div");
    list.className = "history-list";
    elements.answer.append(title, list);
    try {
      const conversations = await global.ContextLensLearningHistory?.listConversations?.(30) || [];
      if (viewMode !== "history") return;
      if (!conversations.length) {
        const empty = document.createElement("p");
        empty.className = "history-empty";
        empty.textContent = t("historyEmpty");
        list.appendChild(empty);
      } else {
        conversations.forEach((conversation) => {
          const latest = conversation.entries[conversation.entries.length - 1];
          const button = document.createElement("button");
          button.type = "button";
          button.className = "history-entry";
          appendTextNode(button, "history-entry-time", new Date(latest.createdAt).toLocaleString(uiLanguage === "en" ? "en" : "zh-CN"));
          appendTextNode(button, "history-entry-question", conversation.legacy ? t("historyLegacy") : t("historyTurns").replace("{count}", String(conversation.entries.length)));
          appendTextNode(button, "history-entry-preview", latest.question || "一键学习解释");
          button.addEventListener("click", () => showHistoryConversation(conversation));
          list.appendChild(button);
        });
      }
      setVisibleStatus(t("historyTitle"));
    } catch (error) {
      if (viewMode !== "history") return;
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = t("historyLoadFailed");
      list.appendChild(empty);
      setVisibleStatus(t("historyLoadFailed"), "status error");
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "OPEN_IN_PAGE_PANEL") open(message.payload);
    if (message.type !== "FALLBACK_STREAM_EVENT" || message.requestId !== activeRequestId || !elements) return;
    if (message.event === "chunk") {
      const next = activeAnswerText + message.text;
      activeAnswerText = next;
      elements.answer.dataset.rawAnswer = next;
      if (viewMode === "home") {
        if (currentMode === "chat") renderChatConversation();
        else renderAnswer(next);
      }
    }
    if (message.event === "done") {
      setHomeStatus("回答完成");
      if (currentMode === "chat") {
        chatTurns.push({ question: pendingQuestion, answer: activeAnswerText });
        chatTurns = chatTurns.slice(-20);
        pendingQuestion = "";
        if (viewMode === "home") renderChatConversation();
      } else {
        activeLearningScopeKey = String(message.learningScopeKey || "");
        void global.ContextLensLearningHistory?.save?.({
          question: activeInstruction,
          answer: activeAnswerText,
          surface: "in-page-panel",
          scopeKey: activeLearningScopeKey
        });
      }
      activeRequestId = null;
      setRunning(false);
    }
    if (message.event === "status") setHomeStatus(message.text);
    if (message.event === "needs-context") {
      activeAnswerText = `## 需要更多上下文\n${message.message}\n\n请将相关定义、调用处或章节内容粘贴到问题框后重新发送。`;
      elements.answer.dataset.rawAnswer = activeAnswerText;
      if (viewMode === "home") renderAnswer(activeAnswerText);
      setHomeStatus("自动上下文已达到上下各 20 行", "status error");
      activeRequestId = null;
      setRunning(false);
      elements.input.focus();
    }
    if (message.event === "error") {
      setHomeStatus(message.error, "status error");
      pendingQuestion = "";
      activeRequestId = null;
      setRunning(false);
    }
    if (message.event === "cancelled") {
      setHomeStatus("已停止请求");
      pendingQuestion = "";
      activeRequestId = null;
      setRunning(false);
    }
  });

  global.ContextLensInPagePanel = { open };
})(globalThis);
