/**
 * 网页内面板的后台 LLM 客户端。
 * 统一在扩展 Service Worker 中请求并转发 SSE，避免网页内容脚本的跨域限制。
 */
(function registerFallbackChat(global) {
  const requests = new Map();
  const memoryCompactions = new Set();

  function withAssessmentTimeout(operation, parentSignal, timeoutMs, onTimeout = () => {}) {
    const controller = new AbortController();
    let timedOut = false;
    if (parentSignal?.aborted) {
      return Promise.reject(parentSignal.reason || new Error("学习请求已取消。"));
    }
    const onParentAbort = () => controller.abort(parentSignal.reason);
    parentSignal.addEventListener("abort", onParentAbort, { once: true });
    let timer;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      parentSignal.removeEventListener("abort", onParentAbort);
      callback(value);
    };
    return new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        try { onTimeout(); } catch {}
        controller.abort(new Error("上下文评估超时"));
        // 超时不终止整个学习请求：编排器收到 null 后会保留当前窗口，直接进入最终回答。
        finish(resolve, null);
      }, timeoutMs);
      Promise.resolve()
        .then(() => operation(controller.signal))
        .then((value) => finish(resolve, value))
        .catch((error) => {
          if (timedOut) return;
          finish(reject, error);
        });
    });
  }

  async function resolveModel() {
    const saved = await chrome.storage.local.get(["configuredApiModels", "activeModelId", "defaultModelId", "apiProvider", "providers"]);
    const defaults = global.ContextLensRuntimeConfig?.getDefaults?.() || {};
    const panelModel = await global.ContextAnswerModels?.active?.();
    if (panelModel) return panelModel;
    // 网页内回退面板没有原生设置页，因此用户明确写入 .env 的完整配置应具有最高优先级。
    // 这也避免旧版侧边栏遗留的本地 Agent 选择覆盖当前 API 配置。
    if (defaults.isConfigured) {
      return {
        provider: defaults.provider,
        apiKey: defaults.apiKey,
        apiUrl: defaults.apiUrl,
        apiEndpoint: defaults.apiEndpoint,
        model: defaults.model,
        bridgeUrl: defaults.bridgeUrl,
        commandPath: defaults.commandPath
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
    return chrome.tabs.sendMessage(tabId, { type: "FALLBACK_STREAM_EVENT", requestId, ...payload })
      .then(() => ({ ok: true }))
      .catch((error) => ({ ok: false, error }));
  }

  async function streamLines(response, onData, timeline) {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("接口没有返回可读取的流式响应。");
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      void timeline?.streamChunk(value?.byteLength || 0);
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const cleaned = line.trim();
        if (cleaned.startsWith("data: ")) onData(cleaned.slice(6));
      }
    }
  }

  async function fetchWithTimeline(timeline, url, options) {
    void timeline?.dispatch();
    const response = await fetch(url, options);
    void timeline?.response(response.status);
    return response;
  }

  // 将 HTTP 状态附在错误对象上，供诊断日志记录，不保留响应正文。
  async function throwResponseError(response, fallbackMessage) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.error?.message || payload.error || fallbackMessage);
    error.status = response.status;
    throw error;
  }

  async function streamOpenAiCompatible(model, prompt, signal, sendChunk, timeline) {
    const baseUrl = model.provider === "openai" ? "https://api.openai.com/v1" : String(model.apiUrl || "").replace(/\/+$/, "");
    const url = String(model.apiEndpoint || "").trim() || (baseUrl ? `${baseUrl}/chat/completions` : "");
    if (!url || !model.model) throw new Error("请在 .env 或模型设置中填写 API 地址与模型名。");
    const headers = { "Content-Type": "application/json" };
    if (model.apiKey) headers.Authorization = `Bearer ${model.apiKey}`;
    const response = await fetchWithTimeline(timeline, url, {
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
    }, timeline);
  }

  async function streamGemini(model, prompt, signal, sendChunk, timeline) {
    if (!model.apiKey || !model.model) throw new Error("Gemini 需要 API Key 和模型名。");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.model}:streamGenerateContent?alt=sse&key=${model.apiKey}`;
    const response = await fetchWithTimeline(timeline, url, {
      method: "POST", signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } })
    });
    if (!response.ok) await throwResponseError(response, `Gemini 请求失败（${response.status}）。`);
    await streamLines(response, (data) => {
      try {
        const chunk = JSON.parse(data).candidates?.[0]?.content?.parts?.[0]?.text;
        if (chunk) sendChunk(chunk);
      } catch {}
    }, timeline);
  }

  async function streamClaude(model, prompt, signal, sendChunk, timeline) {
    if (!model.apiKey || !model.model) throw new Error("Claude 需要 API Key 和模型名。");
    const response = await fetchWithTimeline(timeline, "https://api.anthropic.com/v1/messages", {
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
    }, timeline);
  }

  async function streamLocalAgent(model, prompt, signal, sendChunk, timeline) {
    const defaults = global.ContextLensRuntimeConfig?.getDefaults?.() || {};
    const bridgeUrl = String(model.bridgeUrl || defaults.bridgeUrl || "http://localhost:3100").replace(/\/+$/, "");
    const response = await fetchWithTimeline(timeline, `${bridgeUrl}/api/chat`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, agentId: model.provider, commandPath: model.commandPath || "" })
    });
    if (!response.ok) await throwResponseError(response, `本地 Agent 请求失败（${response.status}）。`);
    await streamLines(response, (data) => {
      if (data === "[DONE]") return;
      let event;
      try { event = JSON.parse(data); } catch { return; }
      if (event.type === "text" && event.text) sendChunk(event.text);
      if (event.type === "error") throw new Error(event.text || "本地 Agent 返回错误。");
    }, timeline);
  }

  async function streamAnswer(model, prompt, signal, sendChunk, timeline) {
    if (model.provider === "gemini") return streamGemini(model, prompt, signal, sendChunk, timeline);
    if (model.provider === "claude") return streamClaude(model, prompt, signal, sendChunk, timeline);
    if (String(model.provider || "").endsWith("-agent")) return streamLocalAgent(model, prompt, signal, sendChunk, timeline);
    return streamOpenAiCompatible(model, prompt, signal, sendChunk, timeline);
  }

  // 评估阶段使用非流式短请求；与最终答案的流式请求分离，便于稳定解析 JSON。
  async function completeOpenAiCompatible(model, prompt, signal, timeline) {
    const baseUrl = model.provider === "openai" ? "https://api.openai.com/v1" : String(model.apiUrl || "").replace(/\/+$/, "");
    const url = String(model.apiEndpoint || "").trim() || (baseUrl ? `${baseUrl}/chat/completions` : "");
    const headers = { "Content-Type": "application/json" };
    if (model.apiKey) headers.Authorization = `Bearer ${model.apiKey}`;
    const response = await fetchWithTimeline(timeline, url, { method: "POST", signal, headers, body: JSON.stringify({ model: model.model, messages: [{ role: "user", content: prompt }], temperature: 0, stream: false }) });
    if (!response.ok) await throwResponseError(response, `上下文评估失败（${response.status}）。`);
    return (await response.json()).choices?.[0]?.message?.content || "";
  }

  async function completeGemini(model, prompt, signal, timeline) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.model}:generateContent?key=${model.apiKey}`;
    const response = await fetchWithTimeline(timeline, url, { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }) });
    if (!response.ok) await throwResponseError(response, `Gemini 上下文评估失败（${response.status}）。`);
    return (await response.json()).candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  }

  async function completeClaude(model, prompt, signal, timeline) {
    const response = await fetchWithTimeline(timeline, "https://api.anthropic.com/v1/messages", { method: "POST", signal, headers: { "content-type": "application/json", "x-api-key": model.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, body: JSON.stringify({ model: model.model, max_tokens: 300, temperature: 0, messages: [{ role: "user", content: prompt }] }) });
    if (!response.ok) await throwResponseError(response, `Claude 上下文评估失败（${response.status}）。`);
    return (await response.json()).content?.map((part) => part.text || "").join("") || "";
  }

  async function completeForModel(model, prompt, signal, timeline) {
    if (model.provider === "gemini") return completeGemini(model, prompt, signal, timeline);
    if (model.provider === "claude") return completeClaude(model, prompt, signal, timeline);
    if (String(model.provider || "").endsWith("-agent")) throw new Error("本地 Agent 不参与后台学习记忆压缩。");
    return completeOpenAiCompatible(model, prompt, signal, timeline);
  }

  // 摘要只在最终回答送达后低频后台执行，永远不阻塞当前用户看到回答。
  async function compactLearningMemory(task, model, metadata) {
    if (!task || String(model.provider || "").endsWith("-agent") || memoryCompactions.has(task.key)) return;
    memoryCompactions.add(task.key);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error("学习记忆压缩超时")), 25000);
    const timeline = global.ContextLensLlmTimeline.start({
      surface: "in-page-panel", purpose: "learning-memory-summary", provider: model.provider,
      model: model.model || model.label, transport: metadata.transport,
      chainId: metadata.chainId, chainLabel: "网页内学习解释"
    });
    try {
      const summary = await completeForModel(model, global.ContextLensPromptTemplates.buildMemorySummary(task), controller.signal, timeline);
      await global.ContextAnswerLearningMemory.applySummary(task, summary);
      void timeline.outputChunk(summary.length);
      void timeline.finish("completed");
      await global.ContextLensRequestDiagnostics.record({ surface: "in-page-panel", phase: "learning-memory-summarized", provider: model.provider, transport: metadata.transport });
    } catch (error) {
      void timeline.finish(controller.signal.aborted ? "timed-out" : "failed", error.message);
      // 压缩失败不影响已保存的完整问答；下一次达到阈值时会再尝试。
      console.warn("[ContextAnswer] 学习记忆压缩失败：", error.message);
    } finally {
      clearTimeout(timeoutId);
      memoryCompactions.delete(task.key);
    }
  }

  async function saveLearningMemory({ key, question, answer, model, transport, chainId }) {
    if (!key || !answer?.trim() || !global.ContextAnswerLearningMemory) return;
    const task = await global.ContextAnswerLearningMemory.append(key, { question, answer });
    void compactLearningMemory(task, model, { transport, chainId });
  }

  async function assess(model, prompt, signal, metadata = {}) {
    const timeline = global.ContextLensLlmTimeline.start({
      surface: metadata.surface || "in-page-panel",
      purpose: "context-assessment",
      provider: model.provider,
      model: model.model,
      transport: metadata.transport || (model.apiEndpoint ? "direct-endpoint" : "api"),
      chainId: metadata.chainId,
      chainLabel: metadata.chainLabel,
      contextWindow: metadata.contextWindow
    });
    try {
      let text;
      if (model.provider === "gemini") text = await completeGemini(model, prompt, signal, timeline);
      else if (model.provider === "claude") text = await completeClaude(model, prompt, signal, timeline);
      else text = await completeOpenAiCompatible(model, prompt, signal, timeline);
      void timeline.assessmentReceived(text.length);
      void timeline.finish("completed");
      return text;
    } catch (error) {
      const outcome = /超时|timeout/i.test(error.message || "") ? "timed-out" : (signal?.aborted ? "cancelled" : "failed");
      void timeline.finish(outcome, error.message);
      throw error;
    }
  }

  async function start({ tabId, requestId, payload, instruction, requestOptions, mode = "learning", conversation = [] }) {
    const context = payload?.contextData || { selectedText: "", surroundingBefore: "", surroundingAfter: "", contentType: "text" };
    if (mode === "learning" && !context.selectedText) throw new Error("学习模式需要先选取网页内容。");
    const model = await resolveModel();
    if (!model.provider) throw new Error("请在设置或 .env 中配置模型。");
    const preferences = await global.ContextAnswerPanelPreferences?.get?.().catch(() => null);
    const storedOptions = await global.ContextLensLearningOptions.get();
    const options = {
      ...global.ContextLensLearningOptions.normalize({ ...storedOptions, ...(requestOptions || {}) }),
      // 本地 CLI Agent 没有稳定的短 JSON 评估协议，直接使用当前选区回答。
      contextAssessmentEnabled: !String(model.provider || "").endsWith("-agent") && preferences?.contextAssessmentEnabled !== false
    };
    const controller = new AbortController();
    const requestState = { controller, cancelled: false, timedOut: false, timeoutId: null };
    const requestStartedMs = Date.now();
    requestState.timeoutId = setTimeout(() => {
      requestState.timedOut = true;
      void global.ContextLensRequestDiagnostics?.record?.({
        surface: "in-page-panel",
        phase: "learning-request-timeout",
        provider: model.provider,
        transport,
        chainId: requestId,
        stage: "workflow-timeout",
        detail: "学习请求总超时，正在中止当前请求链",
        elapsedMs: Date.now() - requestStartedMs,
        timeoutMs: options.requestTimeoutMs
      });
      controller.abort(new Error("学习请求总超时"));
    }, options.requestTimeoutMs);
    requests.set(requestId, requestState);
    let answerTimeline = null;
    let collectedAnswer = "";
    const sendChunk = (text) => {
      collectedAnswer += String(text || "");
      void answerTimeline?.outputChunk(text.length);
      return event(tabId, requestId, { event: "chunk", text });
    };
    const transport = model.provider?.endsWith("-agent") ? "local-agent-bridge" : (model.apiEndpoint ? "direct-endpoint" : "openai-compatible-base-url");
    const assessmentConfig = global.ContextAnswerPanelPreferences?.getEffectiveAssessment
      ? await global.ContextAnswerPanelPreferences.getEffectiveAssessment()
      : (global.ContextLensRuntimeConfig?.getLearningDefaults?.().assessment || {});
    try {
      if (mode === "chat") {
        const prompt = global.ContextAnswerChatPrompt.build({ context, question: instruction, conversation });
        await global.ContextLensRequestDiagnostics.record({ surface: "in-page-panel", phase: "started", provider: model.provider, transport });
        answerTimeline = global.ContextLensLlmTimeline.start({ surface: "in-page-panel", purpose: "chat-answer", provider: model.provider, model: model.model || model.label, transport, chainId: requestId, chainLabel: "网页内普通聊天" });
        await streamAnswer(model, prompt, controller.signal, sendChunk, answerTimeline);
        void answerTimeline.finish("completed");
        await global.ContextLensRequestDiagnostics.record({ surface: "in-page-panel", phase: "completed", provider: model.provider, transport });
        await event(tabId, requestId, { event: "done" });
        return;
      }
      await global.ContextLensRequestDiagnostics.record({ surface: "in-page-panel", phase: "context-preparation-started", provider: model.provider, transport });
      const prepared = await global.ContextLensContextOrchestrator.prepare({
        context,
        question: instruction,
        options,
        assess: async (candidate, radius) => {
          const languageHint = global.ContextLensLearningOptions.languageLabel(options.sourceLanguage);
          const jevReady = assessmentConfig.jev?.enabled && global.ContextLensJevAssessment.isConfigured(assessmentConfig.jev);
          const judgingLabel = jevReady
            ? "正在由 Jev 判断选区是否足够回答…"
            : (assessmentConfig.llmEnabled === false ? "自动上下文判断已关闭，正在仅使用当前选区…" : "正在由 LLM 判断选区是否足够回答…");
          const assessmentStartedMs = Date.now();
          // 单次超时必须覆盖状态消息、提示词编译和实际 Jev 请求，不能只包住 fetch。
          const assessmentTimeoutMs = Math.min(
            options.assessmentTimeoutMs,
            Math.max(5000, options.requestTimeoutMs)
          );
          return withAssessmentTimeout(
            async (assessmentSignal) => {
              void global.ContextLensRequestDiagnostics?.record?.({
                surface: "in-page-panel",
                phase: "context-assessment-status",
                provider: jevReady ? "typesafe" : model.provider,
                transport: jevReady ? "typesafe-systemone" : transport,
                chainId: requestId,
                stage: "ui-status-send-start",
                detail: `准备发送第 ${Number(radius) || 0} 行评估状态`,
                elapsedMs: Date.now() - requestStartedMs,
                contextRadius: radius,
                timeoutMs: assessmentTimeoutMs
              });
              const statusDelivery = await event(tabId, requestId, { event: "status", text: radius === 0 ? judgingLabel : `正在判断上下各 ${radius} 行上下文…` });
              void global.ContextLensRequestDiagnostics?.record?.({
                surface: "in-page-panel",
                phase: "context-assessment-status",
                provider: jevReady ? "typesafe" : model.provider,
                transport: jevReady ? "typesafe-systemone" : transport,
                chainId: requestId,
                stage: statusDelivery?.ok === false ? "ui-status-send-failed" : "ui-status-send-finished",
                detail: statusDelivery?.ok === false ? `第 ${Number(radius) || 0} 行评估状态发送失败` : `第 ${Number(radius) || 0} 行评估状态发送调用已返回`,
                error: statusDelivery?.error?.message,
                elapsedMs: Date.now() - requestStartedMs,
                contextRadius: radius
              });
              const assessmentPrompt = global.ContextLensContextAssessment.buildPrompt({ context: candidate, question: instruction, languageHint, radius });
              void global.ContextLensRequestDiagnostics?.record?.({
                surface: "in-page-panel",
                phase: "context-assessment-attempt",
                provider: jevReady ? "typesafe" : model.provider,
                transport: jevReady ? "typesafe-systemone" : transport,
                chainId: requestId,
                stage: "assessment-attempt-start",
                detail: `开始第 ${Number(radius) || 0} 行上下文评估`,
                elapsedMs: Date.now() - requestStartedMs,
                contextRadius: radius,
                timeoutMs: assessmentTimeoutMs
              });
              return global.ContextLensAssessmentRouter.assess({
                context: candidate,
                question: instruction,
                languageHint,
                radius,
                assessmentConfig,
                signal: assessmentSignal,
                surface: "in-page-panel",
                chainId: requestId,
                chainLabel: "网页内学习解释",
                onStage: ({ text }) => event(tabId, requestId, { event: "status", text }),
                llmAssess: async () => {
                  const text = await assess(model, assessmentPrompt, assessmentSignal, {
                    surface: "in-page-panel", transport, chainId: requestId, chainLabel: "网页内学习解释",
                    contextWindow: candidate.contextWindow
                  });
                  return global.ContextLensContextAssessment.parse(text);
                }
              });
            },
            controller.signal,
            assessmentTimeoutMs,
            () => {
              void global.ContextLensRequestDiagnostics?.record?.({
                surface: "in-page-panel",
                phase: "context-assessment-timeout",
                provider: jevReady ? "typesafe" : model.provider,
                transport: jevReady ? "typesafe-systemone" : transport,
                chainId: requestId,
                stage: "assessment-timeout-triggered",
                detail: `第 ${Number(radius) || 0} 行评估达到单次超时上限`,
                elapsedMs: Date.now() - assessmentStartedMs,
                contextRadius: radius,
                timeoutMs: assessmentTimeoutMs
              });
            }
          );
        },
        expand: async (radius) => {
          void global.ContextLensRequestDiagnostics?.record?.({
            surface: "in-page-panel",
            phase: "context-expansion",
            provider: model.provider,
            transport,
            chainId: requestId,
            stage: "context-window-read-start",
            detail: `准备读取上下各 ${Number(radius) || 0} 行上下文`,
            elapsedMs: Date.now() - requestStartedMs,
            contextRadius: radius
          });
          await event(tabId, requestId, { event: "status", text: `信息不足，正在读取上下各 ${radius} 行…` });
          const response = await chrome.tabs.sendMessage(tabId, { type: "GET_CONTEXT_WINDOW", radius }).catch(() => null);
          void global.ContextLensRequestDiagnostics?.record?.({
            surface: "in-page-panel",
            phase: "context-expansion",
            provider: model.provider,
            transport,
            chainId: requestId,
            stage: response?.success ? "context-window-read-finished" : "context-window-read-failed",
            detail: response?.success ? `上下各 ${Number(radius) || 0} 行上下文读取完成` : "内容脚本没有返回可用的上下文窗口",
            elapsedMs: Date.now() - requestStartedMs,
            contextRadius: radius
          });
          return response?.success ? response.contextData : null;
        }
      });
      void global.ContextLensRequestDiagnostics?.record?.({
        surface: "in-page-panel",
        phase: "context-preparation-completed",
        provider: model.provider,
        transport,
        chainId: requestId,
        stage: "context-preparation-finished",
        detail: "上下文评估与扩展流程已返回，准备生成最终学习提示词",
        elapsedMs: Date.now() - requestStartedMs,
        contextRadius: prepared.context?.contextWindow?.radius
      });
      if (prepared.status === "needs-user-context") {
        await global.ContextLensRequestDiagnostics.record({ surface: "in-page-panel", phase: "needs-user-context", provider: model.provider, transport, error: prepared.message });
        await event(tabId, requestId, { event: "needs-context", message: prepared.message });
        return;
      }
      if (prepared.assessment?.disabled) {
        await event(tabId, requestId, { event: "status", text: prepared.assessment.reason || "自动上下文判断已关闭，正在仅使用当前选区回答…" });
      }
      const memoryState = await global.ContextAnswerLearningMemory.get({
        context: prepared.context,
        pageUrl: payload.pageUrl,
        sourceLanguage: options.sourceLanguage
      });
      const prompt = global.ContextLensLearningPrompt.buildPrompt({
        context: prepared.context,
        pageTitle: payload.pageTitle,
        pageUrl: payload.pageUrl,
        instruction,
        options: { ...options, sourceLanguageLabel: global.ContextLensLearningOptions.languageLabel(options.sourceLanguage), contextModeLabel: options.contextMode === "manual" ? `手动上下各 ${options.manualLines} 行` : (options.contextMode === "custom" ? "自行添加补充上下文" : "自动选择") },
        memory: memoryState.memory
      });
      await global.ContextLensRequestDiagnostics.record({ surface: "in-page-panel", phase: "started", provider: model.provider, transport });
      answerTimeline = global.ContextLensLlmTimeline.start({
        surface: "in-page-panel", purpose: "learning-answer", provider: model.provider, model: model.model,
        transport, chainId: requestId, chainLabel: "网页内学习解释", contextWindow: prepared.context?.contextWindow
      });
      await streamAnswer(model, prompt, controller.signal, sendChunk, answerTimeline);
      void answerTimeline.finish("completed");
      await global.ContextLensRequestDiagnostics.record({ surface: "in-page-panel", phase: "completed", provider: model.provider, transport, chainId: requestId, stage: "learning-answer-completed", elapsedMs: Date.now() - requestStartedMs });
      await event(tabId, requestId, { event: "done", learningScopeKey: memoryState.key });
      void saveLearningMemory({ key: memoryState.key, question: instruction, answer: collectedAnswer, model, transport, chainId: requestId });
    } catch (error) {
      const message = requestState.timedOut
        ? `学习请求超过 ${Math.round(options.requestTimeoutMs / 1000)} 秒，请重试。`
        : (error.message || "请求失败。");
      await global.ContextLensRequestDiagnostics.record({ surface: "in-page-panel", phase: requestState.cancelled ? "cancelled" : "failed", provider: model.provider, transport, chainId: requestId, stage: requestState.cancelled ? "workflow-cancelled" : (requestState.timedOut ? "workflow-timeout-ended" : "workflow-failed"), elapsedMs: Date.now() - requestStartedMs, status: error.status || null, error: message });
      if (answerTimeline) void answerTimeline.finish(requestState.cancelled ? "cancelled" : (requestState.timedOut ? "timed-out" : "failed"), message);
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
