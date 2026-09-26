/**
 * 网页内面板的后台 LLM 客户端。
 * 统一在扩展 Service Worker 中请求并转发 SSE，避免网页内容脚本的跨域限制。
 */
(function registerFallbackChat(global) {
  const requests = new Map();

  function withAssessmentTimeout(operation, parentSignal, timeoutMs) {
    const controller = new AbortController();
    let timedOut = false;
    const onParentAbort = () => controller.abort(parentSignal.reason);
    parentSignal.addEventListener("abort", onParentAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("上下文评估超时"));
    }, timeoutMs);
    return operation(controller.signal).catch((error) => {
      if (timedOut) throw new Error(`上下文评估超过 ${Math.round(timeoutMs / 1000)} 秒，请重试或改用手动上下文。`);
      throw error;
    }).finally(() => {
      clearTimeout(timer);
      parentSignal.removeEventListener("abort", onParentAbort);
    });
  }

  async function resolveModel() {
    const saved = await chrome.storage.local.get(["configuredApiModels", "activeModelId", "defaultModelId", "apiProvider", "providers"]);
    const defaults = global.ContextLensRuntimeConfig?.getDefaults?.() || {};
    // 网页内回退面板没有原生设置页，因此用户明确写入 .env 的完整配置应具有最高优先级。
    // 这也避免旧版侧边栏遗留的本地 Agent 选择覆盖当前 API 配置。
    if (defaults.isConfigured) {
      return {
        provider: defaults.provider,
        apiKey: defaults.apiKey,
        apiUrl: defaults.apiUrl,
        apiEndpoint: defaults.apiEndpoint,
        model: defaults.model
      };
    }

    const selectedId = saved.activeModelId || saved.defaultModelId;
    const selected = (saved.configuredApiModels || []).find((model) => model.id === selectedId);
    if (selected) return selected;

    if (defaults.useLocalModel) {
      throw new Error("已启用本地模型，但 LOCAL_API_URL 或 LOCAL_MODEL 未配置完整。");
    }

    const provider = saved.apiProvider || defaults.provider || "";
    if (provider.endsWith("-agent")) {
      throw new Error("远程模型模式已启用，请在 .env 填写远程 Key、URL 和 Model，而不是使用本地 Agent。" );
    }
    const stored = saved.providers?.[provider] || {};
    return {
      provider,
      apiKey: stored.apiKey || defaults.apiKey || "",
      apiUrl: stored.apiUrl || defaults.apiUrl || "",
      model: stored.modelName || defaults.model || ""
    };
  }

  function event(tabId, requestId, payload) {
    return chrome.tabs.sendMessage(tabId, { type: "FALLBACK_STREAM_EVENT", requestId, ...payload }).catch(() => {});
  }

  async function streamLines(response, onData) {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("接口没有返回可读取的流式响应。");
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const cleaned = line.trim();
        if (cleaned.startsWith("data: ")) onData(cleaned.slice(6));
      }
    }
  }

  // 将 HTTP 状态附在错误对象上，供诊断日志记录，不保留响应正文。
  async function throwResponseError(response, fallbackMessage) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.error?.message || payload.error || fallbackMessage);
    error.status = response.status;
    throw error;
  }

  async function streamOpenAiCompatible(model, prompt, signal, sendChunk) {
    const baseUrl = model.provider === "openai" ? "https://api.openai.com/v1" : String(model.apiUrl || "").replace(/\/+$/, "");
    const url = String(model.apiEndpoint || "").trim() || (baseUrl ? `${baseUrl}/chat/completions` : "");
    if (!url || !model.model) throw new Error("请在 .env 或模型设置中填写 API 地址与模型名。");
    const headers = { "Content-Type": "application/json" };
    if (model.apiKey) headers.Authorization = `Bearer ${model.apiKey}`;
    const response = await fetch(url, {
      method: "POST", signal, headers,
      body: JSON.stringify({ model: model.model, messages: [{ role: "user", content: prompt }], temperature: 0.3, stream: true })
    });
    if (!response.ok) await throwResponseError(response, `模型请求失败（${response.status}）。`);
    await streamLines(response, (data) => {
      if (data === "[DONE]") return;
      try {
        const chunk = JSON.parse(data).choices?.[0]?.delta?.content;
        if (chunk) sendChunk(chunk);
      } catch {}
    });
  }

  async function streamGemini(model, prompt, signal, sendChunk) {
    if (!model.apiKey || !model.model) throw new Error("Gemini 需要 API Key 和模型名。");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.model}:streamGenerateContent?alt=sse&key=${model.apiKey}`;
    const response = await fetch(url, {
      method: "POST", signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } })
    });
    if (!response.ok) await throwResponseError(response, `Gemini 请求失败（${response.status}）。`);
    await streamLines(response, (data) => {
      try {
        const chunk = JSON.parse(data).candidates?.[0]?.content?.parts?.[0]?.text;
        if (chunk) sendChunk(chunk);
      } catch {}
    });
  }

  async function streamClaude(model, prompt, signal, sendChunk) {
    if (!model.apiKey || !model.model) throw new Error("Claude 需要 API Key 和模型名。");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal,
      headers: { "content-type": "application/json", "x-api-key": model.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: model.model, max_tokens: 4000, temperature: 0.3, stream: true, messages: [{ role: "user", content: prompt }] })
    });
    if (!response.ok) await throwResponseError(response, `Claude 请求失败（${response.status}）。`);
    await streamLines(response, (data) => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "content_block_delta" && parsed.delta?.text) sendChunk(parsed.delta.text);
      } catch {}
    });
  }

  // 评估阶段使用非流式短请求；与最终答案的流式请求分离，便于稳定解析 JSON。
  async function completeOpenAiCompatible(model, prompt, signal) {
    const baseUrl = model.provider === "openai" ? "https://api.openai.com/v1" : String(model.apiUrl || "").replace(/\/+$/, "");
    const url = String(model.apiEndpoint || "").trim() || (baseUrl ? `${baseUrl}/chat/completions` : "");
    const headers = { "Content-Type": "application/json" };
    if (model.apiKey) headers.Authorization = `Bearer ${model.apiKey}`;
    const response = await fetch(url, { method: "POST", signal, headers, body: JSON.stringify({ model: model.model, messages: [{ role: "user", content: prompt }], temperature: 0, stream: false }) });
    if (!response.ok) await throwResponseError(response, `上下文评估失败（${response.status}）。`);
    return (await response.json()).choices?.[0]?.message?.content || "";
  }

  async function completeGemini(model, prompt, signal) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.model}:generateContent?key=${model.apiKey}`;
    const response = await fetch(url, { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }) });
    if (!response.ok) await throwResponseError(response, `Gemini 上下文评估失败（${response.status}）。`);
    return (await response.json()).candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  }

  async function completeClaude(model, prompt, signal) {
    const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal, headers: { "content-type": "application/json", "x-api-key": model.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, body: JSON.stringify({ model: model.model, max_tokens: 300, temperature: 0, messages: [{ role: "user", content: prompt }] }) });
    if (!response.ok) await throwResponseError(response, `Claude 上下文评估失败（${response.status}）。`);
    return (await response.json()).content?.map((part) => part.text || "").join("") || "";
  }

  async function assess(model, prompt, signal) {
    if (model.provider === "gemini") return completeGemini(model, prompt, signal);
    if (model.provider === "claude") return completeClaude(model, prompt, signal);
    return completeOpenAiCompatible(model, prompt, signal);
  }

  async function start({ tabId, requestId, payload, instruction, requestOptions }) {
    const context = payload?.contextData;
    if (!context) throw new Error("未收到选区上下文。");
    const model = await resolveModel();
    if (!model.provider || model.provider.endsWith("-agent")) throw new Error("网页内学习面板仅支持 API 模型，请配置 Gemini、OpenAI、Claude 或自定义兼容接口。");
    const options = global.ContextLensLearningOptions.normalize(requestOptions || await global.ContextLensLearningOptions.get());
    const controller = new AbortController();
    const requestState = { controller, cancelled: false, timedOut: false, timeoutId: null };
    requestState.timeoutId = setTimeout(() => {
      requestState.timedOut = true;
      controller.abort(new Error("学习请求总超时"));
    }, options.requestTimeoutMs);
    requests.set(requestId, requestState);
    const sendChunk = (text) => event(tabId, requestId, { event: "chunk", text });
    const transport = model.apiEndpoint ? "direct-endpoint" : "openai-compatible-base-url";
    try {
      await global.ContextLensRequestDiagnostics.record({ surface: "in-page-panel", phase: "context-preparation-started", provider: model.provider, transport });
      const prepared = await global.ContextLensContextOrchestrator.prepare({
        context,
        question: instruction,
        options,
        assess: async (candidate, radius) => {
          await event(tabId, requestId, { event: "status", text: radius === 0 ? "正在评估选区是否足够回答…" : `正在评估上下各 ${radius} 行上下文…` });
          const assessmentPrompt = global.ContextLensContextAssessment.buildPrompt({ context: candidate, question: instruction, languageHint: global.ContextLensLearningOptions.languageLabel(options.sourceLanguage), radius });
          return withAssessmentTimeout(
            (assessmentSignal) => assess(model, assessmentPrompt, assessmentSignal),
            controller.signal,
            options.assessmentTimeoutMs
          );
        },
        expand: async (radius) => {
          await event(tabId, requestId, { event: "status", text: `信息不足，正在读取上下各 ${radius} 行…` });
          const response = await chrome.tabs.sendMessage(tabId, { type: "GET_CONTEXT_WINDOW", radius }).catch(() => null);
          return response?.success ? response.contextData : null;
        }
      });
      if (prepared.status === "needs-user-context") {
        await global.ContextLensRequestDiagnostics.record({ surface: "in-page-panel", phase: "needs-user-context", provider: model.provider, transport, error: prepared.message });
        await event(tabId, requestId, { event: "needs-context", message: prepared.message });
        return;
      }
      const prompt = global.ContextLensLearningPrompt.buildPrompt({
        context: prepared.context,
        pageTitle: payload.pageTitle,
        pageUrl: payload.pageUrl,
        instruction,
        options: { ...options, sourceLanguageLabel: global.ContextLensLearningOptions.languageLabel(options.sourceLanguage), contextModeLabel: options.contextMode === "manual" ? `手动上下各 ${options.manualLines} 行` : "自动选择" }
      });
      await global.ContextLensRequestDiagnostics.record({ surface: "in-page-panel", phase: "started", provider: model.provider, transport });
      if (model.provider === "gemini") await streamGemini(model, prompt, controller.signal, sendChunk);
      else if (model.provider === "claude") await streamClaude(model, prompt, controller.signal, sendChunk);
      else await streamOpenAiCompatible(model, prompt, controller.signal, sendChunk);
      await global.ContextLensRequestDiagnostics.record({ surface: "in-page-panel", phase: "completed", provider: model.provider, transport });
      await event(tabId, requestId, { event: "done" });
    } catch (error) {
      const message = requestState.timedOut
        ? `学习请求超过 ${Math.round(options.requestTimeoutMs / 1000)} 秒，请重试。`
        : (error.message || "请求失败。");
      await global.ContextLensRequestDiagnostics.record({ surface: "in-page-panel", phase: requestState.cancelled ? "cancelled" : "failed", provider: model.provider, transport, status: error.status || null, error: message });
      if (!requestState.cancelled) await event(tabId, requestId, { event: "error", error: message });
    } finally {
      clearTimeout(requestState.timeoutId);
      requests.delete(requestId);
    }
  }

  function cancel(requestId) {
    const requestState = requests.get(requestId);
    if (!requestState) return false;
    requestState.cancelled = true;
    clearTimeout(requestState.timeoutId);
    requestState.controller.abort(new Error("用户取消请求"));
    return true;
  }

  global.ContextLensFallbackChat = { start, assess, cancel };
})(globalThis);
