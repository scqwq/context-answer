/** 学习模式界面：只负责模式选择，不处理模型请求和 DOM 上下文。 */
(function registerLearningUi(global) {
  async function mount() {
    const select = document.getElementById("learning-mode-select");
    if (!select || !global.ContextLensLearning) return;
    select.value = await global.ContextLensLearning.initialize();
    select.addEventListener("change", async () => {
      await global.ContextLensLearning.setMode(select.value);
      const hint = document.getElementById("learning-mode-hint");
      if (hint) hint.textContent = select.value === "learning"
        ? "将按翻译、含义、作用和结构回答。"
        : "沿用原有自由问答提示词。";
    });
  }

  global.ContextLensLearning = global.ContextLensLearning || {};
  global.ContextLensLearning.mount = mount;
})(window);
