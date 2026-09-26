/** 侧边栏学习选项界面：只同步语言和上下文设置，不处理模型调用。 */
(function registerLearningOptionsUi(global) {
  async function mount() {
    const language = document.getElementById("learning-source-language");
    const contextMode = document.getElementById("learning-context-mode");
    const manualLines = document.getElementById("learning-manual-lines");
    if (!language || !contextMode || !manualLines || !global.ContextLensLearningOptions) return;

    language.innerHTML = global.ContextLensLearningOptions.LANGUAGES
      .map(([value, label]) => `<option value="${value}">${label}</option>`).join("");

    function render(options) {
      language.value = options.sourceLanguage;
      contextMode.value = options.contextMode;
      manualLines.value = String(options.manualLines);
      manualLines.disabled = options.contextMode !== "manual";
      manualLines.parentElement.classList.toggle("is-disabled", options.contextMode !== "manual");
    }

    let current = await global.ContextLensLearningOptions.get();
    render(current);
    async function save() {
      current = await global.ContextLensLearningOptions.set({
        ...current,
        sourceLanguage: language.value,
        contextMode: contextMode.value,
        manualLines: Number(manualLines.value)
      });
      render(current);
    }
    language.addEventListener("change", save);
    contextMode.addEventListener("change", save);
    manualLines.addEventListener("change", save);
  }

  global.ContextLensLearning = global.ContextLensLearning || {};
  global.ContextLensLearning.mountOptions = mount;
})(window);
