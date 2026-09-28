/** ContextAnswer 模型清单：统一保存网页内面板的 API 模型与本地 Agent 选择。 */
(function registerContextAnswerModels(global) {
  const MODELS_KEY = "contextAnswerModels";
  const ACTIVE_KEY = "contextAnswerActiveModelId";
  const API_PROVIDERS = new Set(["gemini", "openai", "claude", "custom"]);
  const AGENT_PROVIDERS = new Set(["claude-agent", "codex-agent", "antigravity-agent", "copilot-agent"]);

  function createId() {
    return global.crypto?.randomUUID?.() || `model-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function normalize(model = {}) {
    const provider = String(model.provider || "custom");
    const isAgent = AGENT_PROVIDERS.has(provider);
    return {
      id: String(model.id || createId()),
      label: String(model.label || model.model || provider).trim().slice(0, 80),
      provider: API_PROVIDERS.has(provider) || isAgent ? provider : "custom",
      apiKey: String(model.apiKey || ""),
      apiUrl: String(model.apiUrl || ""),
      apiEndpoint: String(model.apiEndpoint || ""),
      model: String(model.model || ""),
      bridgeUrl: String(model.bridgeUrl || ""),
      commandPath: String(model.commandPath || "")
    };
  }

  async function listSaved() {
    const stored = await chrome.storage.local.get(MODELS_KEY);
    return Array.isArray(stored[MODELS_KEY]) ? stored[MODELS_KEY].map(normalize) : [];
  }

  function environmentModels() {
    const defaults = global.ContextLensRuntimeConfig?.getDefaults?.() || {};
    const defaultModel = defaults.isConfigured ? [{
      id: "env-default",
      label: "环境默认模型（.env）",
      provider: defaults.provider,
      apiKey: defaults.apiKey,
      apiUrl: defaults.apiUrl,
      apiEndpoint: defaults.apiEndpoint,
      model: defaults.model,
      bridgeUrl: defaults.bridgeUrl,
      commandPath: defaults.commandPath,
      readOnly: true,
      source: "environment"
    }] : [];
    return [...defaultModel, ...(global.ContextLensRuntimeConfig?.getExtraModels?.() || [])];
  }

  // .env 预置项与浏览器内保存项共用选择器，但前者只读，不能被网页设置覆盖。
  async function list() {
    const saved = await listSaved();
    return [...environmentModels(), ...saved];
  }

  async function activeId() {
    const stored = await chrome.storage.local.get(ACTIVE_KEY);
    return String(stored[ACTIVE_KEY] || "");
  }

  async function active() {
    const [models, id] = await Promise.all([list(), activeId()]);
    return models.find((model) => model.id === id) || null;
  }

  async function save(rawModel, { activate = false } = {}) {
    const model = normalize(rawModel);
    if (model.id.startsWith("env-")) throw new Error(".env 预置模型请在 .env 中修改后重新构建。");
    const models = await listSaved();
    const index = models.findIndex((item) => item.id === model.id);
    if (index >= 0) models[index] = model;
    else models.push(model);
    await chrome.storage.local.set({ [MODELS_KEY]: models.slice(-20) });
    if (activate) await chrome.storage.local.set({ [ACTIVE_KEY]: model.id });
    return model;
  }

  async function setActive(id) {
    const models = await list();
    const model = models.find((item) => item.id === id) || null;
    if (!model) throw new Error("未找到要切换的模型。");
    await chrome.storage.local.set({ [ACTIVE_KEY]: model.id });
    return model;
  }

  async function clearActive() {
    await chrome.storage.local.remove(ACTIVE_KEY);
    return null;
  }

  async function remove(id) {
    const modelId = String(id || "");
    if (!modelId || modelId.startsWith("env-")) throw new Error(".env 预置模型不能在网页设置中删除。");
    const models = await listSaved();
    if (!models.some((model) => model.id === modelId)) throw new Error("未找到要删除的模型。");
    const activeModelId = await activeId();
    await chrome.storage.local.set({ [MODELS_KEY]: models.filter((model) => model.id !== modelId) });
    if (activeModelId === modelId) await chrome.storage.local.remove(ACTIVE_KEY);
  }

  global.ContextAnswerModels = { MODELS_KEY, ACTIVE_KEY, API_PROVIDERS, AGENT_PROVIDERS, normalize, listSaved, list, active, save, setActive, clearActive, remove };
})(globalThis);
