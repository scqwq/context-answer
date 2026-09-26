/**
 * 侧边栏学习提示词适配器。
 * 实际编译逻辑放在 shared/learning-prompt.js，保证网页内面板与侧边栏使用同一契约。
 */
(function registerSidePanelPromptBuilder(global) {
  global.ContextLensLearning = global.ContextLensLearning || {};
  global.ContextLensLearning.buildPrompt = function buildPrompt(options) {
    return global.ContextLensLearningPrompt.buildPrompt(options);
  };
})(globalThis);
