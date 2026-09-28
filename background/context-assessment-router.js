/**
 * 上下文判断路由：Jev 高置信度直接决策；低置信度按上下文不足扩展，异常或未配置时才可回退 LLM。
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

  async function assess({ context, question, languageHint, radius, assessmentConfig, signal, surface, chainId, chainLabel, llmAssess, onStage = () => {} }) {
    const config = assessmentConfig || {};
    const jev = config.jev || {};
    const llmEnabled = config.llmEnabled !== false;
    let unavailableReason = "";

    if (jev.enabled && global.ContextLensJevAssessment.isConfigured(jev)) {
      try {
        await onStage({ stage: "jev", text: "正在由 Jev 判断选区是否足够回答…" });
        await record("context-assessment-jev-started", { surface, provider: "typesafe", transport: "typesafe-systemone" });
        const result = await global.ContextLensJevAssessment.assess({ context, question, languageHint, radius, config: jev, signal, surface, chainId, chainLabel });
        if (result.status === "decision") {
          await record("context-assessment-jev-completed", { surface, provider: "typesafe", transport: "typesafe-systemone" });
          return result.decision;
        }
        unavailableReason = result.reason;
        await record("context-assessment-jev-uncertain", { surface, provider: "typesafe", transport: "typesafe-systemone", error: result.reason });
        // 低置信度不再额外调用 LLM；按信息不足扩展窗口后，继续交给 Jev 判断。
        return {
          sufficient: false,
          direction: "both",
          source: "jev-low-confidence",
          missing: "Jev 对当前上下文置信度不足，正在扩展相邻上下文后重新判断。"
        };
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
      await onStage({ stage: "llm", text: "Jev 不可用，正在由 LLM 判断选区是否足够回答…" });
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
