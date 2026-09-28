/**
 * 上下文判断路由：优先使用 Jev 的结构化决策，低置信度或不可用时回退既有 LLM JSON 判断。
 */
(function registerContextAssessmentRouter(global) {
  async function record(phase, details) {
    return global.ContextLensRequestDiagnostics.record({
      surface: details.surface,
      phase,
      provider: details.provider,
      transport: details.transport,
      status: details.status || null,
      error: details.error || ""
    });
  }

  async function assess({ context, question, languageHint, radius, assessmentConfig, signal, surface, llmAssess }) {
    const config = assessmentConfig || {};
    const jev = config.jev || {};
    const llmEnabled = config.llmEnabled !== false;
    let unavailableReason = "";

    if (jev.enabled && global.ContextLensJevAssessment.isConfigured(jev)) {
      try {
        await record("context-assessment-jev-started", { surface, provider: "typesafe", transport: "typesafe-systemone" });
        const result = await global.ContextLensJevAssessment.assess({ context, question, languageHint, radius, config: jev, signal, surface });
        if (result.status === "decision") {
          await record("context-assessment-jev-completed", { surface, provider: "typesafe", transport: "typesafe-systemone" });
          return result.decision;
        }
        unavailableReason = result.reason;
        await record("context-assessment-jev-uncertain", { surface, provider: "typesafe", transport: "typesafe-systemone", error: result.reason });
      } catch (error) {
        await record("context-assessment-jev-failed", { surface, provider: "typesafe", transport: "typesafe-systemone", status: error.status, error: error.message });
        if (!llmEnabled) {
          return { sufficient: true, direction: "both", source: "disabled", disabled: true, reason: "Jev 判断请求不可用，且 LLM 回退判断已关闭。" };
        }
      }
    } else if (jev.enabled) {
      unavailableReason = "Jev 已开启但 API Key、URL 或模型名未配置完整。";
      await record("context-assessment-jev-unconfigured", { surface, provider: "typesafe", transport: "configuration", error: "Jev 已开启但 API Key、URL 或模型名未配置完整。" });
    }

    if (llmEnabled) {
      const decision = await llmAssess();
      return { ...decision, source: "llm" };
    }

    return {
      sufficient: true,
      direction: "both",
      source: "disabled",
      disabled: true,
      reason: unavailableReason || "Jev 和 LLM 上下文判断均已关闭；自动模式将仅使用当前选区。"
    };
  }

  global.ContextLensAssessmentRouter = { assess };
})(globalThis);
