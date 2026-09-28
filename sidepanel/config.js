/**
 * 侧边栏运行时配置读取器。
 * 本地值来自 .env 经 build-env.js 生成的 config.local.js；没有生成文件时安全回退为空配置。
 */
(function registerRuntimeConfig(global) {
  const allowedProviders = new Set(["gemini", "openai", "claude", "custom"]);
  const agentProviders = new Set(["claude-agent", "codex-agent", "antigravity-agent", "copilot-agent"]);

  function normalizeExtraModel(raw = {}, index = 0) {
    const provider = allowedProviders.has(raw.provider) || agentProviders.has(raw.provider) ? raw.provider : "";
    const isAgent = agentProviders.has(provider);
    const model = String(raw.model || "");
    const apiUrl = String(raw.apiUrl || "");
    const apiEndpoint = String(raw.apiEndpoint || "");
    const apiKey = String(raw.apiKey || "");
    const configured = isAgent
      ? Boolean(provider)
      : Boolean(provider && model && (provider === "custom" ? (apiUrl || apiEndpoint) : apiKey));
    if (!configured) return null;
    return {
      id: String(raw.id || `env-extra-${index + 1}`),
      label: String(raw.label || model || provider).slice(0, 80), provider,
      apiKey, apiUrl, apiEndpoint, model,
      bridgeUrl: String(raw.bridgeUrl || ""),
      commandPath: String(raw.commandPath || ""),
      readOnly: true,
      source: "environment"
    };
  }

  function getDefaults() {
    const raw = global.CONTEXT_LENS_LOCAL_ENV || {};
    // 兼容旧生成配置；新版由显式开关在 remote 与 local 配置间选择。
    const useLocalModel = raw.useLocalModel === true;
    const useLocalAgent = raw.useLocalAgent === true;
    const source = useLocalAgent ? (raw.localAgent || {}) : (useLocalModel ? (raw.local || {}) : (raw.remote || raw));
    const provider = allowedProviders.has(source.provider) || agentProviders.has(source.provider) ? source.provider : "";
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
      useLocalAgent,
      commandPath: String(source.commandPath || ""),
      isConfigured: agentProviders.has(provider)
        ? Boolean(provider)
        : Boolean(provider && model && (provider === "custom" ? (apiUrl || source.apiEndpoint) : apiKey)),
      learning: {
        assessmentEnabled: raw.learning?.assessmentEnabled !== false,
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
        contextMode: ["auto", "manual", "custom"].includes(raw.learning?.contextMode) ? raw.learning.contextMode : "auto",
        manualLines: [0, 5, 10, 20].includes(Number(raw.learning?.manualLines)) ? Number(raw.learning.manualLines) : 5,
        assessment: {
          jev: {
            enabled: raw.learning?.assessment?.jev?.enabled === true,
            apiKey: String(raw.learning?.assessment?.jev?.apiKey || ""),
            apiUrl: String(raw.learning?.assessment?.jev?.apiUrl || "https://api.typesafe.ai/v1/systemone"),
            model: String(raw.learning?.assessment?.jev?.model || "jev-latest"),
            confidenceThreshold: Math.min(0.95, Math.max(0.5, Number(raw.learning?.assessment?.jev?.confidenceThreshold) || 0.75))
          },
          llmEnabled: raw.learning?.assessment?.llmEnabled !== false
        }
      },
      panelMode: ["auto", "native", "in-page"].includes(raw.panelMode) ? raw.panelMode : "in-page",
      bridgeUrl: String(raw.bridgeUrl || source.bridgeUrl || "")
    };
  }

  function getLearningDefaults() {
    return getDefaults().learning;
  }

  // .env 的额外模型是只读预置项；修改或删除应在 .env 后重新构建配置。
  function getExtraModels() {
    const raw = global.CONTEXT_LENS_LOCAL_ENV || {};
    return Array.isArray(raw.extraModels) ? raw.extraModels.map(normalizeExtraModel).filter(Boolean) : [];
  }

  global.ContextLensRuntimeConfig = { getDefaults, getLearningDefaults, getExtraModels };
})(globalThis);
