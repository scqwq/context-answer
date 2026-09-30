/** 统一面板偏好：管理面板宿主策略与跨界面生效的学习开关。 */
(function registerPanelPreferences(global) {
  const STORAGE_KEY = "contextAnswerPanelPreferences";
  const PANEL_MODES = new Set(["auto", "native", "in-page"]);

  function defaults() {
    const config = global.ContextLensRuntimeConfig?.getDefaults?.() || {};
    const assessment = config.learning?.assessment || {};
    return {
      panelMode: PANEL_MODES.has(config.panelMode) ? config.panelMode : "in-page",
      contextAssessmentEnabled: config.learning?.assessmentEnabled !== false,
      jevEnabled: assessment.jev?.enabled === true,
      llmAssessmentEnabled: assessment.llmEnabled !== false
    };
  }

  function normalize(raw = {}) {
    const fallback = defaults();
    return {
      panelMode: PANEL_MODES.has(raw.panelMode) ? raw.panelMode : fallback.panelMode,
      contextAssessmentEnabled: typeof raw.contextAssessmentEnabled === "boolean"
        ? raw.contextAssessmentEnabled
        : fallback.contextAssessmentEnabled,
      jevEnabled: typeof raw.jevEnabled === "boolean" ? raw.jevEnabled : fallback.jevEnabled,
      llmAssessmentEnabled: typeof raw.llmAssessmentEnabled === "boolean"
        ? raw.llmAssessmentEnabled
        : fallback.llmAssessmentEnabled
    };
  }

  async function getEffectiveAssessment() {
    const preferences = await get();
    const defaultsConfig = global.ContextLensRuntimeConfig?.getLearningDefaults?.() || {};
    const assessment = defaultsConfig.assessment || {};
    return {
      ...assessment,
      jev: {
        ...(assessment.jev || {}),
        enabled: preferences.jevEnabled
      },
      llmEnabled: preferences.llmAssessmentEnabled
    };
  }

  async function get() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return normalize(stored[STORAGE_KEY]);
  }

  async function set(next) {
    const current = await get();
    const preferences = normalize({ ...current, ...next });
    await chrome.storage.local.set({ [STORAGE_KEY]: preferences });
    return preferences;
  }

  async function reset() {
    await chrome.storage.local.remove(STORAGE_KEY);
    return defaults();
  }

  global.ContextAnswerPanelPreferences = { STORAGE_KEY, PANEL_MODES, defaults, normalize, get, set, reset, getEffectiveAssessment };
})(globalThis);
