/** 学习请求选项：统一保存语言、上下文和回答风格，供两种面板共用。 */
(function registerLearningOptions(global) {
  const STORAGE_KEY = "contextLensLearningOptions";
  const LANGUAGES = [
    ["auto", "自动识别"], ["javascript", "JavaScript"], ["typescript", "TypeScript"],
    ["react", "React JSX / TSX"], ["vue", "Vue SFC"], ["html", "HTML"], ["css", "CSS / SCSS"],
    ["python", "Python"], ["java", "Java"], ["kotlin", "Kotlin"], ["c", "C"], ["cpp", "C++"],
    ["csharp", "C#"], ["go", "Go"], ["rust", "Rust"], ["php", "PHP"], ["ruby", "Ruby"],
    ["swift", "Swift"], ["sql", "SQL"], ["shell", "Shell / PowerShell"],
    ["data", "JSON / YAML / XML"], ["markdown", "Markdown"], ["document", "普通技术文档"]
  ];
  const CONTEXT_MODES = new Set(["auto", "manual"]);
  const DETAIL_LEVELS = new Set(["compact", "normal"]);

  function runtimeDefaults() {
    return global.ContextLensRuntimeConfig?.getLearningDefaults?.() || {};
  }

  function normalize(raw = {}, defaults = runtimeDefaults()) {
    const sourceLanguage = LANGUAGES.some(([value]) => value === raw.sourceLanguage)
      ? raw.sourceLanguage
      : (LANGUAGES.some(([value]) => value === defaults.sourceLanguage) ? defaults.sourceLanguage : "auto");
    const contextMode = CONTEXT_MODES.has(raw.contextMode) ? raw.contextMode
      : (CONTEXT_MODES.has(defaults.contextMode) ? defaults.contextMode : "auto");
    const manualLines = [0, 5, 10, 20].includes(Number(raw.manualLines))
      ? Number(raw.manualLines)
      : ([0, 5, 10, 20].includes(Number(defaults.manualLines)) ? Number(defaults.manualLines) : 5);
    return {
      sourceLanguage,
      contextMode,
      manualLines,
      translationEnabled: raw.translationEnabled ?? defaults.translationEnabled ?? true,
      responseLanguage: String(raw.responseLanguage || defaults.responseLanguage || defaults.targetLanguage || "zh-CN"),
      translationLanguage: String(raw.translationLanguage || defaults.translationLanguage || defaults.targetLanguage || "zh-CN"),
      responseDetail: DETAIL_LEVELS.has(raw.responseDetail) ? raw.responseDetail : (DETAIL_LEVELS.has(defaults.responseDetail) ? defaults.responseDetail : "compact"),
      outputStyle: raw.outputStyle === "standard" ? "standard" : (defaults.outputStyle === "standard" ? "standard" : "focus"),
      maxKeyPoints: Math.min(5, Math.max(2, Number(raw.maxKeyPoints || defaults.maxKeyPoints) || 3)),
      codeExamples: ["never", "on-demand", "always"].includes(raw.codeExamples) ? raw.codeExamples : (["never", "on-demand", "always"].includes(defaults.codeExamples) ? defaults.codeExamples : "on-demand"),
      requestTimeoutMs: Math.min(300000, Math.max(5000, Number(defaults.requestTimeoutMs) || 90000)),
      assessmentTimeoutMs: Math.min(300000, Math.max(5000, Number(defaults.assessmentTimeoutMs) || 15000))
    };
  }

  async function get() {
    const saved = await chrome.storage.local.get(STORAGE_KEY);
    return normalize(saved[STORAGE_KEY]);
  }

  async function set(next) {
    const options = normalize(next);
    // 仅保存用户可在面板改动的字段；翻译与回答风格继续由 .env 作为默认策略控制。
    await chrome.storage.local.set({ [STORAGE_KEY]: {
      sourceLanguage: options.sourceLanguage,
      contextMode: options.contextMode,
      manualLines: options.manualLines
    } });
    return options;
  }

  function languageLabel(value) {
    return LANGUAGES.find(([key]) => key === value)?.[1] || "自动识别";
  }

  global.ContextLensLearningOptions = { STORAGE_KEY, LANGUAGES, get, set, normalize, languageLabel };
})(globalThis);
