/** 普通聊天提示词适配器：实际模板集中在 shared/prompt-templates.js。 */
(function registerChatPrompt(global) {
  function build(input) { return global.ContextLensPromptTemplates.buildChat(input); }

  global.ContextAnswerChatPrompt = { build };
})(globalThis);
