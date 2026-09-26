/** 原生侧边栏上下文流程：调用后台评估模型并向内容脚本请求有限行窗口。 */
(function registerSidePanelContextFlow(global) {
  async function prepare({ tabId, context, question, model, options }) {
    return global.ContextLensContextOrchestrator.prepare({
      context,
      question,
      options,
      assess: async (candidate, radius) => {
        const prompt = global.ContextLensContextAssessment.buildPrompt({
          context: candidate,
          question,
          languageHint: global.ContextLensLearningOptions.languageLabel(options.sourceLanguage),
          radius
        });
        const response = await chrome.runtime.sendMessage({ type: "ASSESS_LEARNING_CONTEXT", model, prompt });
        if (!response?.success) throw new Error(response?.error || "上下文评估请求失败。");
        return response.text;
      },
      expand: async (radius) => {
        const response = await chrome.tabs.sendMessage(tabId, { type: "GET_CONTEXT_WINDOW", radius }).catch(() => null);
        return response?.success ? response.contextData : null;
      }
    });
  }

  global.ContextLensLearningContextFlow = { prepare };
})(window);
