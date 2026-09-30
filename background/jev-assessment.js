/**
 * Jev 上下文判断适配器：调用 TypeSafe System One，并把 Choice 结果转换为扩展的上下文决策。
 * 仅在后台执行；不记录选区、问题、响应原文或 API Key。
 */
(function registerJevAssessment(global) {
  const DIRECTIONS = new Set(["before", "after", "both", "none"]);

  function clip(value, limit) {
    const text = String(value || "").trim();
    return text.length > limit ? `${text.slice(0, limit)}\n[内容已截断]` : text;
  }

  function isConfigured(config) {
    return Boolean(config?.enabled && config.apiKey && config.apiUrl && config.model);
  }

  function buildState({ context, question, languageHint, radius }) {
    return {
      question: clip(question, 1600),
      language_hint: clip(languageHint, 80),
      context_radius: Number(radius) || 0,
      selected_text: clip(context?.selectedText, 12000),
      surrounding_before: clip(context?.surroundingBefore, 6000),
      surrounding_after: clip(context?.surroundingAfter, 6000),
      code_window: context?.codeBlock ? clip(context.codeBlock.fullCode, 12000) : "",
      content_type: clip(context?.contentType, 40)
    };
  }

  async function responseError(response) {
    const error = new Error(`Jev 上下文判断请求失败（HTTP ${response.status}）。`);
    error.status = response.status;
    throw error;
  }

  function toDecision(answers, threshold) {
    const answerability = answers?.answerability;
    const choice = answerability?.choice;
    const confidence = Number(answerability?.confidence);
    if (!['sufficient', 'insufficient'].includes(choice) || !Number.isFinite(confidence) || confidence < threshold) {
      return null;
    }
    const directionChoice = answers?.context_direction?.choice;
    return {
      sufficient: choice === "sufficient",
      direction: DIRECTIONS.has(directionChoice) && directionChoice !== "none" ? directionChoice : "both",
      missing: choice === "insufficient" ? "Jev 判断当前选区仍需要相邻上下文。" : "",
      source: "jev",
      confidence
    };
  }

  async function assess({ context, question, languageHint, radius, config, signal, surface, chainId, chainLabel }) {
    if (!isConfigured(config)) return { status: "unavailable", reason: "Jev 未启用或配置不完整。" };
    const startedMs = Date.now();
    const trace = (phase, stage, details = {}) => global.ContextLensRequestDiagnostics?.record?.({
      surface: surface || "in-page-panel",
      phase,
      provider: "typesafe",
      transport: "typesafe-systemone",
      chainId,
      stage,
      detail: details.detail,
      status: details.status,
      error: details.error,
      elapsedMs: Date.now() - startedMs,
      contextRadius: radius,
      requestChars: details.requestChars
    });
    const timeline = global.ContextLensLlmTimeline.start({
      surface: surface || "in-page-panel",
      purpose: "context-assessment-jev",
      provider: "typesafe",
      model: config.model,
      transport: "typesafe-systemone",
      chainId,
      chainLabel,
      contextWindow: context?.contextWindow
    });
    try {
      const requestBody = JSON.stringify({
        model: config.model,
        state: buildState({ context, question, languageHint, radius }),
        questions: global.ContextLensPromptTemplates.buildJevQuestions()
      });
      // 只记录请求字符数，不记录请求内容，便于区分服务端慢与请求体过大。
      void timeline.dispatch({ requestChars: requestBody.length });
      void trace("context-assessment-jev-http-started", "jev-fetch-start", {
        detail: "Jev 请求体已准备，开始发起 HTTP 请求",
        requestChars: requestBody.length
      });
      const response = await fetch(config.apiUrl, {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: requestBody
      });
      void timeline.response(response.status);
      void trace("context-assessment-jev-http-response", "jev-http-response", {
        detail: "已收到 Jev HTTP 响应，准备检查状态码",
        status: response.status,
        requestChars: requestBody.length
      });
      if (!response.ok) await responseError(response);
      const payload = await response.json();
      void timeline.assessmentReceived(JSON.stringify(payload.answers || {}).length);
      void trace("context-assessment-jev-response-parsed", "jev-response-parsed", {
        detail: "Jev 响应 JSON 已解析，已读取 answers 字段"
      });
      void timeline.finish("completed");
      const decision = toDecision(payload.answers, config.confidenceThreshold);
      if (decision) {
        void trace("context-assessment-jev-decision", "jev-decision-accepted", {
          detail: `Jev 判断为 ${decision.sufficient ? "sufficient" : "insufficient"}`
        });
        return { status: "decision", decision };
      }
      void trace("context-assessment-jev-decision", "jev-decision-rejected", {
        detail: "Jev 返回低置信度、不确定结果或不符合 Choice 契约"
      });
      return { status: "uncertain", reason: "Jev 返回低置信度或不确定判断。" };
    } catch (error) {
      const outcome = /超时|timeout/i.test(error.message || "") ? "timed-out" : (signal?.aborted ? "cancelled" : "failed");
      void trace("context-assessment-jev-ended", outcome === "timed-out" ? "jev-timeout" : (outcome === "cancelled" ? "jev-cancelled" : "jev-failed"), {
        detail: outcome === "timed-out" ? "Jev 请求超时" : (outcome === "cancelled" ? "Jev 请求被取消" : "Jev 请求失败"),
        status: error.status,
        error: error.message
      });
      void timeline.finish(outcome, error.message);
      throw error;
    }
  }

  global.ContextLensJevAssessment = { assess, isConfigured };
})(globalThis);
