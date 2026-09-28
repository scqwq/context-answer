/**
 * 网页内回退面板：在不支持原生侧栏的浏览器中，用 Shadow DOM 提供独立学习界面。
 * LLM 请求由后台执行，避免内容脚本受到网页 CORS 限制。
 */
(function registerInPagePanel(global) {
  let host;
  let elements;
  let activeRequestId = null;
  let currentPayload = null;
  let requestOptions = null;
  let activeAnswerText = "";
  let activeInstruction = "";
  let viewMode = "home";
  let homeStatus = { text: "已准备就绪", className: "status" };

  function renderAnswer(text) {
    if (global.ContextLensAnswerRenderer) global.ContextLensAnswerRenderer.render(elements.answer, text);
    else elements.answer.textContent = text;
  }

  function setVisibleStatus(text, className = "status") {
    elements.status.textContent = text;
    elements.status.className = className;
  }

  function setHomeStatus(text, className = "status") {
    homeStatus = { text, className };
    if (viewMode === "home") setVisibleStatus(text, className);
  }

  function showHome() {
    viewMode = "home";
    elements.answer.dataset.rawAnswer = activeAnswerText;
    renderAnswer(activeAnswerText || "上下文已载入。可一键学习解释，或输入具体问题。");
    setVisibleStatus(homeStatus.text, homeStatus.className);
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
    panel.innerHTML = `<header class="header"><span class="title">ContextLens · 学习解释</span><span class="header-actions"><button class="home header-utility" title="返回当前回答">主页</button><button class="history header-utility" title="查看已完成的学习回答">查看历史</button><button class="diagnostics header-utility" title="查看 LLM 调用时间线与脱敏诊断">日志</button><button class="close" title="关闭">×</button></span></header><main class="body"><pre class="context"></pre><div class="options"><label>语言<select class="source-language"></select></label><label>上下文<select class="context-mode"><option value="auto">自动选择</option><option value="manual">手动选择</option></select></label><label class="manual-lines">上下各<select class="context-lines"><option value="0">0 行（仅选区）</option><option value="5">5 行</option><option value="10">10 行</option><option value="20">20 行</option></select></label></div><p class="option-hint">自动模式会先由模型判断，必要时按 5、10、20 行扩展。</p><textarea placeholder="例如：逐行解释这段代码"></textarea><div class="actions"><button class="primary">一键学习解释</button><button class="secondary">发送问题</button><button class="stop" disabled>停止</button></div><div class="status">已准备就绪</div><article class="answer">请选择内容后开始学习。</article></main>`;
    shadow.appendChild(panel);
    document.documentElement.appendChild(host);
    elements = {
      context: panel.querySelector(".context"),
      input: panel.querySelector("textarea"),
      learn: panel.querySelector(".primary"),
      send: panel.querySelector(".secondary"),
      stop: panel.querySelector(".stop"),
      language: panel.querySelector(".source-language"),
      contextMode: panel.querySelector(".context-mode"),
      contextLines: panel.querySelector(".context-lines"),
      manualLines: panel.querySelector(".manual-lines"),
      home: panel.querySelector(".home"),
      history: panel.querySelector(".history"),
      diagnostics: panel.querySelector(".diagnostics"),
      status: panel.querySelector(".status"),
      answer: panel.querySelector(".answer")
    };
    panel.querySelector(".close").addEventListener("click", () => {
      if (activeRequestId) void stopRequest();
      host.remove();
    });
    elements.learn.addEventListener("click", () => send("请按学习模式解释选中内容。"));
    elements.send.addEventListener("click", () => send(elements.input.value));
    elements.stop.addEventListener("click", stopRequest);
    elements.home.addEventListener("click", showHome);
    elements.history.addEventListener("click", showHistory);
    elements.diagnostics.addEventListener("click", showDiagnostics);
    elements.language.addEventListener("change", saveOptions);
    elements.contextMode.addEventListener("change", saveOptions);
    elements.contextLines.addEventListener("change", saveOptions);
    void loadOptions();
  }

  function setRunning(running) {
    elements.learn.disabled = running;
    elements.send.disabled = running;
    elements.stop.disabled = !running;
    elements.input.disabled = running;
  }

  function renderOptions(options) {
    requestOptions = global.ContextLensLearningOptions.normalize(options);
    elements.language.innerHTML = global.ContextLensLearningOptions.LANGUAGES
      .map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
    elements.language.value = requestOptions.sourceLanguage;
    elements.contextMode.value = requestOptions.contextMode;
    elements.contextLines.value = String(requestOptions.manualLines);
    elements.contextLines.disabled = requestOptions.contextMode !== "manual";
    elements.manualLines.classList.toggle("disabled", requestOptions.contextMode !== "manual");
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
      manualLines: Number(elements.contextLines.value)
    };
    const response = await chrome.runtime.sendMessage({ type: "SET_LEARNING_OPTIONS", options: next }).catch(() => null);
    renderOptions(response?.success ? response.options : next);
  }

  function open(payload) {
    if (host && !host.isConnected) host = null;
    createPanel();
    currentPayload = payload || currentPayload;
    const selected = currentPayload?.contextData?.selectedText || currentPayload?.text || "未取得选区";
    elements.context.textContent = selected.slice(0, 1600);
    activeAnswerText = "";
    activeInstruction = "";
    elements.answer.dataset.rawAnswer = "";
    setHomeStatus("已载入选区");
    showHome();
  }

  async function send(instruction) {
    if (activeRequestId) return;
    if (!currentPayload?.contextData) {
      setHomeStatus("没有可用的选区上下文，请重新选取内容。", "status error");
      return;
    }
    activeRequestId = `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activeInstruction = instruction || "请解释选中内容。";
    activeAnswerText = "";
    viewMode = "home";
    setRunning(true);
    elements.answer.dataset.rawAnswer = "";
    renderAnswer("");
    setHomeStatus("正在请求模型…");
    const response = await chrome.runtime.sendMessage({
      type: "FALLBACK_CHAT_REQUEST",
      requestId: activeRequestId,
      payload: currentPayload,
      instruction: activeInstruction,
      // 仅传递本次界面可改字段；翻译等默认策略由后台读取 .env 后合并。
      requestOptions: requestOptions ? {
        sourceLanguage: requestOptions.sourceLanguage,
        contextMode: requestOptions.contextMode,
        manualLines: requestOptions.manualLines
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

  async function showDiagnostics() {
    viewMode = "diagnostics";
    const [timelineResponse, diagnosticResponse] = await Promise.all([
      chrome.runtime.sendMessage({ type: "GET_LLM_TIMELINES", limit: 60 }),
      chrome.runtime.sendMessage({ type: "GET_REQUEST_DIAGNOSTICS" })
    ]);
    if (viewMode !== "diagnostics") return;
    if (!timelineResponse?.success || !diagnosticResponse?.success) {
      setVisibleStatus(timelineResponse?.error || diagnosticResponse?.error || "无法读取调用日志。", "status error");
      return;
    }
    const timelineText = global.ContextLensLlmTimelineView?.format?.(timelineResponse.runs || [], { maxChains: 15 }) || "";
    const diagnosticText = (diagnosticResponse.entries || []).map((entry) => {
      const status = entry.status ? ` HTTP ${entry.status}` : "";
      const error = entry.error ? `\n  错误：${entry.error}` : "";
      return `${entry.timestamp} · ${entry.surface} · ${entry.phase} · ${entry.provider} · ${entry.transport}${status}${error}`;
    }).join("\n\n");
    elements.answer.textContent = `LLM 调用时间线（最近 15 条请求链）\n\n${timelineText || "暂无 LLM 调用记录。"}\n\n———— 脱敏诊断 ————\n\n${diagnosticText || "暂无诊断记录。"}`;
    setVisibleStatus("显示最近 15 条请求链及其模型调用");
  }

  function appendTextNode(parent, className, text) {
    const node = document.createElement("span");
    node.className = className;
    node.textContent = text;
    parent.appendChild(node);
  }

  function showHistoryEntry(entry) {
    viewMode = "history-detail";
    elements.answer.replaceChildren();
    const back = document.createElement("button");
    back.type = "button";
    back.className = "history-back";
    back.textContent = "← 返回历史列表";
    back.addEventListener("click", showHistory);
    const title = document.createElement("h2");
    title.className = "history-heading";
    title.textContent = entry.question || "一键学习解释";
    const content = document.createElement("div");
    content.className = "history-answer";
    elements.answer.append(back, title, content);
    if (global.ContextLensAnswerRenderer) global.ContextLensAnswerRenderer.render(content, entry.answer);
    else content.textContent = entry.answer;
    setVisibleStatus(`查看历史回答 · ${new Date(entry.createdAt).toLocaleString("zh-CN")}`);
  }

  async function showHistory() {
    viewMode = "history";
    elements.answer.replaceChildren();
    const title = document.createElement("h2");
    title.className = "history-heading";
    title.textContent = "学习回答历史";
    const list = document.createElement("div");
    list.className = "history-list";
    elements.answer.append(title, list);
    try {
      const records = await global.ContextLensLearningHistory?.list?.(30) || [];
      if (viewMode !== "history") return;
      if (!records.length) {
        const empty = document.createElement("p");
        empty.className = "history-empty";
        empty.textContent = "暂无已完成的学习回答。";
        list.appendChild(empty);
      } else {
        records.forEach((entry) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "history-entry";
          appendTextNode(button, "history-entry-time", new Date(entry.createdAt).toLocaleString("zh-CN"));
          appendTextNode(button, "history-entry-question", entry.question || "一键学习解释");
          appendTextNode(button, "history-entry-preview", entry.answer.replace(/\s+/g, " ").slice(0, 150));
          button.addEventListener("click", () => showHistoryEntry(entry));
          list.appendChild(button);
        });
      }
      setVisibleStatus("显示最近 30 条已完成的学习回答");
    } catch (error) {
      if (viewMode !== "history") return;
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = "无法读取学习回答历史。";
      list.appendChild(empty);
      setVisibleStatus("无法读取学习回答历史。", "status error");
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "OPEN_IN_PAGE_PANEL") open(message.payload);
    if (message.type !== "FALLBACK_STREAM_EVENT" || message.requestId !== activeRequestId || !elements) return;
    if (message.event === "chunk") {
      const next = activeAnswerText + message.text;
      activeAnswerText = next;
      elements.answer.dataset.rawAnswer = next;
      if (viewMode === "home") renderAnswer(next);
    }
    if (message.event === "done") {
      setHomeStatus("回答完成");
      void global.ContextLensLearningHistory?.save?.({
        question: activeInstruction,
        answer: activeAnswerText,
        surface: "in-page-panel"
      });
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
      activeRequestId = null;
      setRunning(false);
    }
    if (message.event === "cancelled") {
      setHomeStatus("已停止请求");
      activeRequestId = null;
      setRunning(false);
    }
  });

  global.ContextLensInPagePanel = { open };
})(globalThis);
