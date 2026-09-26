/**
 * 面板宿主能力路由器。
 * 以统一 open() 约定封装原生 Side Panel 与网页内回退面板，避免业务层判断浏览器类型。
 */
(function registerPanelCapabilities(global) {
  const supportsNativeSidePanel = () => Boolean(
    chrome.sidePanel &&
    typeof chrome.sidePanel.setOptions === "function" &&
    typeof chrome.sidePanel.open === "function"
  );

  async function prepareNativePanel(tabId) {
    if (!supportsNativeSidePanel()) return false;
    await chrome.sidePanel.setOptions({ tabId, path: "sidepanel/sidepanel.html", enabled: true });
    return true;
  }

  async function openNativePanel(tabId) {
    await prepareNativePanel(tabId);
    await chrome.sidePanel.open({ tabId });
    return { host: "native-side-panel" };
  }

  async function openInPagePanel(tabId, payload) {
    await chrome.tabs.sendMessage(tabId, { type: "OPEN_IN_PAGE_PANEL", payload });
    return { host: "in-page-panel" };
  }

  async function open(tabId, payload) {
    if (supportsNativeSidePanel()) {
      try {
        return await openNativePanel(tabId);
      } catch (error) {
        console.warn("[ContextLens] 原生侧边栏打开失败，改用网页内面板：", error.message);
      }
    }
    return openInPagePanel(tabId, payload);
  }

  async function disableNativeByDefault() {
    if (!supportsNativeSidePanel()) return;
    try {
      await chrome.sidePanel.setOptions({ enabled: false });
    } catch (error) {
      console.warn("[ContextLens] 无法初始化原生侧边栏：", error.message);
    }
  }

  global.ContextLensPanelCapabilities = {
    supportsNativeSidePanel,
    prepareNativePanel,
    open,
    openInPagePanel,
    disableNativeByDefault
  };
})(globalThis);
