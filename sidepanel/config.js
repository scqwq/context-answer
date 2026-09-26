/**
 * 侧边栏运行时配置读取器。
 * 本地值来自 .env 经 build-env.js 生成的 config.local.js；没有生成文件时安全回退为空配置。
 */
(function registerRuntimeConfig(global) {
  const allowedProviders = new Set(["gemini", "openai", "claude", "custom"]);

  function getDefaults() {
    const raw = global.CONTEXT_LENS_LOCAL_ENV || {};
    // 兼容旧生成配置；新版由显式开关在 remote 与 local 配置间选择。
    const useLocalModel = raw.useLocalModel === true;
    const source = useLocalModel ? (raw.local || {}) : (raw.remote || raw);
    const provider = allowedProviders.has(source.provider) ? source.provider : "";
    const apiKey = String(source.apiKey || "");
    const apiUrl = String(source.apiUrl || "");
    const model = String(source.model || "");
    return {
      provider,
      apiKey,
      apiUrl,
      apiEndpoint: String(source.apiEndpoint || ""),
      model,
      useLocalModel,
      isConfigured: Boolean(provider && model && (provider === "custom" ? (apiUrl || source.apiEndpoint) : apiKey)),
      learning: {
        translationEnabled: raw.learning?.translationEnabled !== false,
        responseLanguage: String(raw.learning?.responseLanguage || raw.learning?.targetLanguage || "zh-CN"),
        translationLanguage: String(raw.learning?.translationLanguage || raw.learning?.targetLanguage || "zh-CN"),
        responseDetail: raw.learning?.responseDetail === "normal" ? "normal" : "compact",
        outputStyle: raw.learning?.outputStyle === "standard" ? "standard" : "focus",
        maxKeyPoints: Math.min(5, Math.max(2, Number(raw.learning?.maxKeyPoints) || 3)),
        codeExamples: ["never", "on-demand", "always"].includes(raw.learning?.codeExamples) ? raw.learning.codeExamples : "on-demand",
        requestTimeoutMs: Math.min(300000, Math.max(5000, Number(raw.learning?.requestTimeoutMs) || 90000)),
        assessmentTimeoutMs: Math.min(300000, Math.max(5000, Number(raw.learning?.assessmentTimeoutMs) || 15000)),
        sourceLanguage: String(raw.learning?.sourceLanguage || "auto"),
        contextMode: raw.learning?.contextMode === "manual" ? "manual" : "auto",
        manualLines: [5, 10, 20].includes(Number(raw.learning?.manualLines)) ? Number(raw.learning.manualLines) : 5
      },
      bridgeUrl: String(raw.bridgeUrl || source.bridgeUrl || "")
    };
  }

  function getLearningDefaults() {
    return getDefaults().learning;
  }

  global.ContextLensRuntimeConfig = { getDefaults, getLearningDefaults };
})(globalThis);
