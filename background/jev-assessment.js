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

  function buildQuestions() {
    return {
      answerability: {
        type: "choice",
        instructions: "Can the user question be answered accurately from this state alone, without guessing missing definitions, callers, return-value sources, control flow, or document context?",
        criteria: {
          sufficient: "The available selection and context are enough for an accurate answer.",
          insufficient: "Additional webpage context is required for an accurate answer.",
          uncertain: "The state does not support a reliable judgment either way."
        }
      },
      context_direction: {
        type: "choice",
        instructions: "If more context is needed to answer the user question, which adjacent webpage area is most useful? Return none when no adjacent context is needed or the direction cannot be determined.",
        criteria: {
          before: "Definitions, setup, or preceding explanation are likely needed.",
          after: "Implementation, result handling, or following explanation are likely needed.",
          both: "Both preceding and following context are likely needed.",
          none: "No adjacent context is needed or a direction cannot be determined."
        }
      }
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
        questions: buildQuestions()
      });
      // 只记录请求字符数，不记录请求内容，便于区分服务端慢与请求体过大。
      void timeline.dispatch({ requestChars: requestBody.length });
      const response = await fetch(config.apiUrl, {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: requestBody
      });
      void timeline.response(response.status);
      if (!response.ok) await responseError(response);
      const payload = await response.json();
      void timeline.assessmentReceived(JSON.stringify(payload.answers || {}).length);
      void timeline.finish("completed");
      const decision = toDecision(payload.answers, config.confidenceThreshold);
      return decision
        ? { status: "decision", decision }
        : { status: "uncertain", reason: "Jev 返回低置信度或不确定判断。" };
    } catch (error) {
      const outcome = /超时|timeout/i.test(error.message || "") ? "timed-out" : (signal?.aborted ? "cancelled" : "failed");
      void timeline.finish(outcome, error.message);
      throw error;
    }
  }

  global.ContextLensJevAssessment = { assess, isConfigured };
})(globalThis);
