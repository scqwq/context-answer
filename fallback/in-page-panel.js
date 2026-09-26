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
    panel.innerHTML = `<header class="header"><span class="title">ContextLens · 学习解释</span><span><button class="diagnostics" title="查看脱敏诊断日志">诊断</button><button class="close" title="关闭">×</button></span></header><main class="body"><pre class="context"></pre><div class="options"><label>语言<select class="source-language"></select></label><label>上下文<select class="context-mode"><option value="auto">自动选择</option><option value="manual">手动选择</option></select></label><label class="manual-lines">上下各<select class="context-lines"><option value="5">5 行</option><option value="10">10 行</option><option value="20">20 行</option></select></label></div><p class="option-hint">自动模式会先由模型判断，必要时按 5、10、20 行扩展。</p><textarea placeholder="例如：逐行解释这段代码"></textarea><div class="actions"><button class="primary">一键学习解释</button><button class="secondary">发送问题</button></div><div class="status">已准备就绪</div><article class="answer">请选择内容后开始学习。</article></main>`;
    shadow.appendChild(panel);
    document.documentElement.appendChild(host);
    elements = {
      context: panel.querySelector(".context"),
      input: panel.querySelector("textarea"),
      learn: panel.querySelector(".primary"),
      send: panel.querySelector(".secondary"),
      language: panel.querySelector(".source-language"),
      contextMode: panel.querySelector(".context-mode"),
      contextLines: panel.querySelector(".context-lines"),
      manualLines: panel.querySelector(".manual-lines"),
      diagnostics: panel.querySelector(".diagnostics"),
      status: panel.querySelector(".status"),
      answer: panel.querySelector(".answer")
    };
    panel.querySelector(".close").addEventListener("click", () => host.remove());
    elements.learn.addEventListener("click", () => send("请按学习模式解释选中内容。"));
    elements.send.addEventListener("click", () => send(elements.input.value));
    elements.diagnostics.addEventListener("click", showDiagnostics);
    elements.language.addEventListener("change", saveOptions);
    elements.contextMode.addEventListener("change", saveOptions);
    elements.contextLines.addEventListener("change", saveOptions);
    void loadOptions();
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
    elements.answer.textContent = "上下文已载入。可一键学习解释，或输入具体问题。";
    elements.status.textContent = "已载入选区";
    elements.status.className = "status";
  }

  async function send(instruction) {
    if (!currentPayload?.contextData) {
      elements.status.textContent = "没有可用的选区上下文，请重新选取内容。";
      elements.status.className = "status error";
      return;
    }
    activeRequestId = `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    elements.answer.textContent = "";
    elements.status.textContent = "正在请求模型…";
    elements.status.className = "status";
    const response = await chrome.runtime.sendMessage({
      type: "FALLBACK_CHAT_REQUEST",
      requestId: activeRequestId,
      payload: currentPayload,
      instruction: instruction || "请解释选中内容。",
      // 仅传递本次界面可改字段；翻译等默认策略由后台读取 .env 后合并。
      requestOptions: requestOptions ? {
        sourceLanguage: requestOptions.sourceLanguage,
        contextMode: requestOptions.contextMode,
        manualLines: requestOptions.manualLines
      } : null
    });
    if (!response?.success) {
      elements.status.textContent = response?.error || "模型请求无法启动。";
      elements.status.className = "status error";
    }
  }

  async function showDiagnostics() {
    const response = await chrome.runtime.sendMessage({ type: "GET_REQUEST_DIAGNOSTICS" });
    if (!response?.success) {
      elements.status.textContent = response?.error || "无法读取诊断日志。";
      elements.status.className = "status error";
      return;
    }
    const text = (response.entries || []).map((entry) => {
      const status = entry.status ? ` HTTP ${entry.status}` : "";
      const error = entry.error ? `\n  错误：${entry.error}` : "";
      return `${entry.timestamp} · ${entry.surface} · ${entry.phase} · ${entry.provider} · ${entry.transport}${status}${error}`;
    }).join("\n\n");
    elements.answer.textContent = text || "暂无 LLM 请求诊断记录。";
    elements.status.textContent = "显示最近 15 条脱敏诊断记录";
    elements.status.className = "status";
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "OPEN_IN_PAGE_PANEL") open(message.payload);
    if (message.type !== "FALLBACK_STREAM_EVENT" || message.requestId !== activeRequestId || !elements) return;
    if (message.event === "chunk") elements.answer.textContent += message.text;
    if (message.event === "done") elements.status.textContent = "回答完成";
    if (message.event === "status") elements.status.textContent = message.text;
    if (message.event === "needs-context") {
      elements.answer.textContent = `需要更多上下文：${message.message}\n\n请将相关定义、调用处或章节内容粘贴到问题框后重新发送。`;
      elements.status.textContent = "自动上下文已达到上下各 20 行";
      elements.status.className = "status error";
      elements.input.focus();
    }
    if (message.event === "error") {
      elements.status.textContent = message.error;
      elements.status.className = "status error";
    }
  });

  global.ContextLensInPagePanel = { open };
})(globalThis);
