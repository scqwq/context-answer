/** 原生侧边栏上下文流程：调用后台评估模型并向内容脚本请求有限行窗口。 */
(function registerSidePanelContextFlow(global) {
  function assertNotAborted(signal) {
    if (signal?.aborted) throw signal.reason || new Error("用户已停止请求。");
  }

  async function prepare({ tabId, context, question, model, options, signal, workflowId }) {
    return global.ContextLensContextOrchestrator.prepare({
      context,
      question,
      options,
      assess: async (candidate, radius) => {
        assertNotAborted(signal);
        const prompt = global.ContextLensContextAssessment.buildPrompt({
          context: candidate,
          question,
          languageHint: global.ContextLensLearningOptions.languageLabel(options.sourceLanguage),
          radius
        });
        const response = await chrome.runtime.sendMessage({
          type: "ASSESS_LEARNING_CONTEXT",
          requestId: workflowId,
          timeoutMs: options.assessmentTimeoutMs,
          model,
          prompt
        });
        assertNotAborted(signal);
        if (!response?.success) throw new Error(response?.error || "上下文评估请求失败。");
        return response.text;
      },
      expand: async (radius) => {
        assertNotAborted(signal);
        const response = await chrome.tabs.sendMessage(tabId, { type: "GET_CONTEXT_WINDOW", radius }).catch(() => null);
        assertNotAborted(signal);
        return response?.success ? response.contextData : null;
      }
    });
  }

  global.ContextLensLearningContextFlow = { prepare };
})(window);
