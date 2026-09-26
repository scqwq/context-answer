/** 学习模式状态：保存用户偏好，供侧边栏 UI 与提示词模块共用。 */
(function registerLearningState(global) {
  const storageKey = "learningMode";
  let currentMode = "learning";

  async function initialize() {
    const result = await chrome.storage.local.get(storageKey);
    currentMode = result[storageKey] === "chat" ? "chat" : "learning";
    return currentMode;
  }

  async function setMode(mode) {
    currentMode = mode === "chat" ? "chat" : "learning";
    await chrome.storage.local.set({ [storageKey]: currentMode });
    return currentMode;
  }

  function isLearningMode() {
    return currentMode === "learning";
  }

  global.ContextLensLearning = global.ContextLensLearning || {};
  Object.assign(global.ContextLensLearning, { initialize, setMode, isLearningMode });
})(window);
