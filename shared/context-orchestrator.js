/** 上下文编排器：执行充分性评估、5/10/20 扩展，并在最大窗口直接回答。 */
(function registerContextOrchestrator(global) {
  const AUTO_STEPS = [0, 5, 10, 20];

  function minimalContext(context) {
    const result = { ...context, surroundingBefore: "", surroundingAfter: "", contextWindow: { radius: 0, kind: "selection" } };
    if (context.codeBlock) result.codeBlock = { ...context.codeBlock, fullCode: String(context.selectedText || "") };
    if (context.tableBlock) result.tableBlock = "";
    return result;
  }

  // 兼容旧 LLM 的 JSON 文本结果与 Jev 路由器直接返回的结构化决策。
  function normalizeDecision(result) {
    if (typeof result === "string") return global.ContextLensContextAssessment.parse(result);
    if (result && typeof result.sufficient === "boolean") return result;
    return null;
  }

  async function prepare({ context, question, options, assess, expand, onProgress = () => {} }) {
    if (!context?.selectedText) return { status: "ready", context };
    if (options.contextMode === "custom") {
      return {
        status: "ready",
        context: { ...minimalContext(context), userSupplement: String(options.supplementalContext || "").trim() },
        assessment: { skipped: true, reason: "自行添加模式仅使用选区和用户补充资料。" }
      };
    }
    if (options.contextMode === "manual") {
      if (Number(options.manualLines) === 0) {
        onProgress("手动模式：仅使用当前选区，不读取额外上下文。");
        return { status: "ready", context: minimalContext(context) };
      }
      onProgress(`正在载入上下各 ${options.manualLines} 行上下文…`);
      return { status: "ready", context: await expand(options.manualLines, "both") || context };
    }

    let working = minimalContext(context);
    if (options.contextAssessmentEnabled === false) {
      return {
        status: "ready",
        context: working,
        assessment: { disabled: true, reason: "自动上下文评估已关闭，正在仅使用当前选区回答。" }
      };
    }
    for (let index = 0; index < AUTO_STEPS.length; index += 1) {
      const radius = AUTO_STEPS[index];
      onProgress(radius === 0 ? "正在评估选区是否足够回答…" : `正在评估上下各 ${radius} 行上下文…`);
      const assessmentResult = await assess(working, radius);
      const decision = normalizeDecision(assessmentResult);
      // 供应商未遵守 JSON 契约时直接回答，避免出现无意义的自动重试循环。
      if (!decision || decision.sufficient) return { status: "ready", context: working, assessment: decision };
      const nextRadius = AUTO_STEPS[index + 1];
      onProgress(`信息不足，正在扩展到上下各 ${nextRadius} 行…`);
      working = await expand(nextRadius, decision.direction) || working;
      // 20 行是自动扩展的上限：拿到最大窗口后直接交给最终回答模型，
      // 不再额外进行一次 Jev 或 LLM 充分性判断。
      if (nextRadius === AUTO_STEPS[AUTO_STEPS.length - 1]) {
        onProgress(`已读取上下各 ${nextRadius} 行最大上下文，正在直接生成回答…`);
        return {
          status: "ready",
          context: working,
          assessment: { ...decision, reachedMaxContext: true, reason: "已达到自动上下文最大行数，跳过后续充分性判断。" }
        };
      }
    }
    return { status: "ready", context: working };
  }

  global.ContextLensContextOrchestrator = { AUTO_STEPS, minimalContext, prepare };
})(globalThis);
