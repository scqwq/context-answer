/** 跨界面学习提示词适配器：实际模板与占位符集中在 shared/prompt-templates.js。 */
(function registerLearningPromptBuilder(global) {
  function buildPrompt(input) { return global.ContextLensPromptTemplates.buildLearning(input); }

  global.ContextLensLearningPrompt = { buildPrompt };
})(globalThis);
