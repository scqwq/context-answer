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
      error: details.error || "",
      chainId: details.chainId,
      stage: details.stage,
      detail: details.detail,
      elapsedMs: details.elapsedMs,
      contextRadius: details.contextRadius,
      timeoutMs: details.timeoutMs
    });
  }

  async function assess({ context, question, languageHint, radius, assessmentConfig, signal, surface, chainId, chainLabel, llmAssess, onStage = () => {} }) {
    const startedMs = Date.now();
    const trace = (phase, stage, details = {}) => record(phase, {
      surface,
      provider: details.provider || "typesafe",
      transport: details.transport || "typesafe-systemone",
      chainId,
      stage,
      detail: details.detail,
      status: details.status,
      error: details.error,
      elapsedMs: Date.now() - startedMs,
      contextRadius: radius,
      timeoutMs: details.timeoutMs
    });
    const config = assessmentConfig || {};
    const jev = config.jev || {};
    const llmEnabled = config.llmEnabled !== false;
    let unavailableReason = "";

    void trace("context-assessment-router-entered", "router-entered", {
      detail: `进入第 ${Number(radius) || 0} 行上下文评估阶段`
    });

    if (jev.enabled && global.ContextLensJevAssessment.isConfigured(jev)) {
      try {
        void trace("context-assessment-jev-route-selected", "jev-route-selected", {
          detail: "Jev 配置完整，选择 Jev 主判断路线"
        });
        void trace("context-assessment-status", "ui-status-send-start", {
          detail: "准备向界面发送 Jev 判断状态"
        });
        const jevStageDelivery = await onStage({ stage: "jev", text: "正在由 Jev 判断选区是否足够回答…" });
        void trace("context-assessment-status", jevStageDelivery?.ok === false ? "ui-status-send-failed" : "ui-status-send-finished", {
          detail: jevStageDelivery?.ok === false ? "界面状态消息发送失败" : "界面状态消息发送调用已返回",
          error: jevStageDelivery?.error?.message
        });
        void trace("context-assessment-jev-started", "jev-call-start", {
          detail: "即将进入 Jev 适配器并发起请求"
        });
        const result = await global.ContextLensJevAssessment.assess({ context, question, languageHint, radius, config: jev, signal, surface, chainId, chainLabel });
        if (result.status === "decision") {
          void trace("context-assessment-jev-completed", "jev-decision-returned", {
            detail: `Jev 已返回明确判断：${result.decision.sufficient ? "sufficient" : "insufficient"}`
          });
          return result.decision;
        }
        unavailableReason = result.reason;
        void trace("context-assessment-jev-uncertain", "jev-low-confidence", {
          detail: "Jev 返回低置信度或不确定判断",
          error: result.reason
        });
        // 低置信度不再额外调用 LLM；按信息不足扩展窗口后，继续交给 Jev 判断。
        return {
          sufficient: false,
          direction: "both",
          source: "jev-low-confidence",
          missing: "Jev 对当前上下文置信度不足，正在扩展相邻上下文后重新判断。"
        };
      } catch (error) {
        void trace("context-assessment-jev-failed", signal?.aborted ? "jev-aborted" : "jev-failed", {
          status: error.status,
          error: error.message,
          detail: signal?.aborted ? "Jev 请求被取消或超时信号中止" : "Jev 请求抛出异常"
        });
        if (!llmEnabled) {
          return { sufficient: true, direction: "both", source: "disabled", disabled: true, reason: "Jev 判断请求不可用，且 LLM 回退判断已关闭。" };
        }
        void trace("context-assessment-jev-fallback", "fallback-to-llm", {
          provider: "unknown",
          transport: "model-api",
          detail: "Jev 失败，准备回退到 LLM JSON 判断"
        });
      }
    } else if (jev.enabled) {
      unavailableReason = "Jev 已开启但 API Key、URL 或模型名未配置完整。";
      void trace("context-assessment-jev-unconfigured", "jev-config-incomplete", {
        transport: "configuration",
        detail: "Jev 已开启但配置不完整",
        error: unavailableReason
      });
    }

    if (llmEnabled) {
      void trace("context-assessment-status", "llm-status-send-start", {
        provider: "model",
        transport: "model-api",
        detail: "准备向界面发送 LLM 回退状态"
      });
      const llmStageDelivery = await onStage({ stage: "llm", text: "Jev 不可用，正在由 LLM 判断选区是否足够回答…" });
      void trace("context-assessment-status", llmStageDelivery?.ok === false ? "llm-status-send-failed" : "llm-status-send-finished", {
        provider: "model",
        transport: "model-api",
        detail: llmStageDelivery?.ok === false ? "LLM 回退状态消息发送失败" : "LLM 回退状态消息发送调用已返回",
        error: llmStageDelivery?.error?.message
      });
      void trace("context-assessment-llm-started", "llm-fallback-start", {
        provider: "model",
        transport: "model-api",
        detail: "即将进入 LLM JSON 评估"
      });
      const decision = await llmAssess();
      void trace("context-assessment-llm-completed", "llm-fallback-finished", {
        provider: "model",
        transport: "model-api",
        detail: decision ? "LLM 已返回评估结果" : "LLM 未返回可解析结果"
      });
      return { ...decision, source: "llm" };
    }

    void trace("context-assessment-disabled", "assessment-disabled", {
      detail: "Jev 和 LLM 评估均不可用，直接使用当前选区"
    });
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
