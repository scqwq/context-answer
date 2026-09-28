// Background Service Worker for ContextLens
// 先加载独立能力路由与网页内面板的流式客户端；本地 .env 生成文件缺失时安全回退。
try { importScripts("sidepanel/config.local.js"); } catch (error) { console.warn("[ContextLens] 未生成本地环境配置：", error.message); }
importScripts("sidepanel/config.js", "shared/panel-preferences.js", "shared/context-answer-models.js", "shared/chat-prompt.js", "shared/learning-options.js", "shared/learning-prompt.js", "shared/learning-memory.js", "shared/context-assessment.js", "shared/context-orchestrator.js", "shared/request-diagnostics.js", "shared/llm-timeline.js", "background/jev-assessment.js", "background/context-assessment-router.js", "background/panel-capabilities.js", "background/fallback-chat.js");

// Track which tabs have side panel active
let activeSidePanelTabs = new Set();
const SIDE_PANEL_PATH = "sidepanel/sidepanel.html";
const nativeAssessmentRequests = new Map();

// Cache of the latest right-clicked context per tab
let tabRightClickContexts = {};

const LOCAL_AGENT_LABELS = {
  zh: {
    "claude-agent": "Claude Code 本地 Agent",
    "codex-agent": "Codex CLI 本地 Agent",
    "antigravity-agent": "Antigravity CLI 本地 Agent"
  },
  en: {
    "claude-agent": "Claude Code Local Agent",
    "codex-agent": "Codex CLI Local Agent",
    "antigravity-agent": "Antigravity CLI Local Agent"
  }
};

const LEGACY_LOCAL_AGENT_IDS = {
  "gemini-agent": "antigravity-agent"
};

function normalizeLocalAgentId(id) {
  return LEGACY_LOCAL_AGENT_IDS[id] || id;
}

const DEFAULT_MODEL_LABELS = {
  zh: "默认模型",
  en: "Default Model"
};

function createContextMenuSafe(options) {
  chrome.contextMenus.create(options, () => {
    const err = chrome.runtime.lastError;
    if (err) {
      console.warn(`🔮 [ContextLens Background] Suppressed contextMenus.create error for ID "${options.id}":`, err.message);
    }
  });
}

let isRebuilding = false;
let hasPendingRebuild = false;

async function rebuildContextMenus() {
  if (isRebuilding) {
    hasPendingRebuild = true;
    return;
  }
  isRebuilding = true;

  try {
    do {
      hasPendingRebuild = false;

      try {
        await chrome.contextMenus.removeAll();
      } catch (err) {
        console.warn("🔮 [ContextLens Background] Failed to clear context menus:", err);
      }

      const result = await chrome.storage.local.get(["contextMenuModelIds", "configuredApiModels", "uiLanguage"]);
      const contextMenuModelIds = [...new Set((result.contextMenuModelIds || []).map(normalizeLocalAgentId))];
      const configuredApiModels = result.configuredApiModels || [];
      const uiLang = result.uiLanguage === "en" ? "en" : "zh";

      // If a new rebuild request arrived while we were waiting for storage,
      // restart the loop directly without registering obsolete menu items.
      if (hasPendingRebuild) {
        continue;
      }

      if (contextMenuModelIds.length === 0) {
        createContextMenuSafe({
          id: "ask-contextlens",
          title: "Ask ContextLens",
          contexts: ["all"]
        });
        console.log("🔮 [ContextLens Background] Registered single top-level context menu.");
      } else {
        createContextMenuSafe({
          id: "ask-contextlens-parent",
          title: "Ask ContextLens",
          contexts: ["all"]
        });

        const defaultLabel = DEFAULT_MODEL_LABELS[uiLang] || "Default Model";
        createContextMenuSafe({
          id: "ask-contextlens-default",
          parentId: "ask-contextlens-parent",
          title: defaultLabel,
          contexts: ["all"]
        });

        for (const modelId of contextMenuModelIds) {
          let label = modelId;
          const localLabels = LOCAL_AGENT_LABELS[uiLang] || LOCAL_AGENT_LABELS.zh;
          if (localLabels[modelId]) {
            label = localLabels[modelId];
          } else {
            const apiModel = configuredApiModels.find(m => m.id === modelId);
            if (apiModel) {
              label = apiModel.label || apiModel.provider || modelId;
            }
          }

          createContextMenuSafe({
          id: `ask-contextlens-model-${modelId}`,
            parentId: "ask-contextlens-parent",
            title: label,
            contexts: ["all"]
          });
        }

        console.log(`🔮 [ContextLens Background] Registered context menu tree with ${contextMenuModelIds.length} pinned models.`);
      }
    } while (hasPendingRebuild);
  } finally {
    isRebuilding = false;
  }
}

// Initialize context menus at startup
rebuildContextMenus();

// Rebuild context menus on storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && (changes.contextMenuModelIds || changes.configuredApiModels || changes.uiLanguage)) {
    rebuildContextMenus();
  }
});

async function enableSidePanelForTab(tabId, { silent = false } = {}) {
  if (!tabId || !(await ContextLensPanelCapabilities.shouldUseNativePanel())) return false;
  activeSidePanelTabs.add(tabId);
  return ContextLensPanelCapabilities.prepareNativePanel(tabId).catch((err) => {
    if (!silent) {
      console.warn(`🔮 [ContextLens Background] Failed to enable side panel for tab ${tabId}:`, err);
    }
  });
}

async function resolveTabMeta(tabId, fallbackUrl = "", fallbackTitle = "") {
  let url = fallbackUrl || "";
  let title = fallbackTitle || "";
  if (!tabId) return { url, title };

  if (url && title) return { url, title };

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!url) url = tab?.url || "";
    if (!title) title = tab?.title || "";
  } catch (err) {
    // Ignore resolution failures and keep fallback values.
  }
  return { url, title };
}

function buildFallbackContextFromMenuInfo(info, tab) {
  const fallbackText = (
    info.selectionText ||
    info.linkUrl ||
    info.srcUrl ||
    tab?.title ||
    info.pageUrl ||
    tab?.url ||
    ""
  ).trim();
  if (!fallbackText) return null;

  return {
    selectedText: fallbackText,
    contentType: "text",
    surroundingBefore: "",
    surroundingAfter: "",
    parentHeading: "",
    semanticPath: "",
    pageDescription: "",
    fullPageSimplifiedText: "",
    pageUrl: info.pageUrl || tab?.url || "",
    frameUrl: info.frameUrl || "",
    source: "context-menu-fallback"
  };
}

// 仅在浏览器实现原生 Side Panel 时初始化，避免不支持该 API 的浏览器使后台崩溃。
ContextLensPanelCapabilities.disableNativeByDefault();

// Create Context Menu on install and disable side panel globally by default
chrome.runtime.onInstalled.addListener(() => {
  rebuildContextMenus();

  ContextLensPanelCapabilities.disableNativeByDefault();
});

// Handle toolbar action clicks (extension icon)
chrome.action.onClicked.addListener((tab) => {
  const payload = { tabId: tab.id, text: "", pageUrl: tab.url, pageTitle: tab.title, timestamp: Date.now(), contextData: null };
  chrome.storage.session.set({ lastSelection: payload });
  ContextLensPanelCapabilities.open(tab.id, payload).catch((err) => console.error("🔮 [ContextLens Background] Failed to open panel on icon click:", err));
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const isTargetMenu = info.menuItemId === "ask-contextlens" || 
                       info.menuItemId === "ask-contextlens-default" || 
                       info.menuItemId.startsWith("ask-contextlens-model-");
                       
  if (isTargetMenu) {
    // 原生侧栏需在用户手势期间打开；网页内回退面板则等待完整选区上下文。
    if (await ContextLensPanelCapabilities.shouldUseNativePanel()) {
      ContextLensPanelCapabilities.open(tab.id, null).catch((err) => {
        console.error("🔮 [ContextLens Background] Failed to open native panel on context menu click:", err);
      });
    }

    let selectionPayload = {
      tabId: tab.id,
      text: info.selectionText || "",
      pageUrl: tab?.url || info.pageUrl || "",
      pageTitle: tab?.title || "",
      timestamp: Date.now(),
      contextData: null
    };

    if (info.menuItemId.startsWith("ask-contextlens-model-")) {
      const modelId = info.menuItemId.replace("ask-contextlens-model-", "");
      selectionPayload.temporaryModelOverride = modelId;
    } else if (info.menuItemId === "ask-contextlens-default") {
      selectionPayload.temporaryModelOverride = "";
    }

    // 2. Query cache first, and fall back to content script message querying if cache is missing or stale
    (async () => {
      const cached = tabRightClickContexts[tab.id];
      const isCacheFresh = cached && (Date.now() - cached.timestamp < 5000); // 5 seconds threshold

      if (isCacheFresh) {
        console.log("🔮 [ContextLens Background] Using fresh cached right-click context!");
        selectionPayload.contextData = cached.contextData;
        if (!selectionPayload.text && cached.text) {
          selectionPayload.text = cached.text;
        }
      } else {
        let resolvedResponse = null;
        
        // 1. Try to send message to the specific frame clicked
        try {
          const response = await chrome.tabs.sendMessage(
            tab.id, 
            { type: "GET_RICH_CONTEXT" }, 
            { frameId: info.frameId }
          );
          if (response && response.success && response.contextData) {
            resolvedResponse = response;
            console.log(`🔮 [ContextLens Background] Successfully retrieved rich DOM context from frame ${info.frameId}!`);
          }
        } catch (err) {
          console.log(`🔮 [ContextLens Background] Specific frame ${info.frameId} failed:`, err.message);
        }

        // 2. If specific frame failed and it was a sub-frame, try main frame (frameId: 0) as fallback
        if (!resolvedResponse && info.frameId !== 0) {
          try {
            console.log("🔮 [ContextLens Background] Trying main frame (frameId: 0) fallback...");
            const response = await chrome.tabs.sendMessage(
              tab.id, 
              { type: "GET_RICH_CONTEXT" }, 
              { frameId: 0 }
            );
            if (response && response.success && response.contextData) {
              resolvedResponse = response;
              console.log("🔮 [ContextLens Background] Successfully recovered context from main frame!");
            }
          } catch (err) {
            console.log("🔮 [ContextLens Background] Main frame fallback also failed:", err.message);
          }
        }

        // 3. Self-heal/Inject if both failed due to content script missing
        if (!resolvedResponse) {
          const targetFrameId = info.frameId || 0;
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id, frameIds: [targetFrameId] },
              files: ["shared/panel-preferences.js", "shared/context-answer-models.js", "shared/chat-prompt.js", "shared/learning-options.js", "shared/learning-prompt.js", "shared/learning-history.js", "shared/llm-timeline-view.js", "fallback/panel-drag.js", "fallback/answer-renderer.js", "fallback/in-page-panel.js", "content.js"]
            });
            await chrome.scripting.insertCSS({
              target: { tabId: tab.id, frameIds: [targetFrameId] },
              files: ["content.css"]
            });
            console.log(`🔮 [ContextLens Background] Dynamically self-healed and injected content script into frame ${targetFrameId}!`);

            // Retry after injection
            try {
              const response = await chrome.tabs.sendMessage(
                tab.id,
                { type: "GET_RICH_CONTEXT" },
                { frameId: targetFrameId }
              );
              if (response && response.success && response.contextData) {
                resolvedResponse = response;
              }
            } catch (retryErr) {
              console.log("🔮 [ContextLens Background] Retry after injection failed:", retryErr.message);
            }
          } catch (injectErr) {
            console.warn("🔮 [ContextLens Background] Self-healing injection failed:", injectErr.message || injectErr);
          }
        }

        // 4. Assign compiled context or fall back to context menu fallback
        if (resolvedResponse) {
          selectionPayload.contextData = resolvedResponse.contextData;
          if (!selectionPayload.text && resolvedResponse.contextData.selectedText) {
            selectionPayload.text = resolvedResponse.contextData.selectedText;
          }
        } else {
          const fallbackContext = buildFallbackContextFromMenuInfo(info, tab);
          if (fallbackContext) {
            selectionPayload.contextData = fallbackContext;
            if (!selectionPayload.text) {
              selectionPayload.text = fallbackContext.selectedText;
            }
            console.log("🔮 [ContextLens Background] Using context-menu fallback context.");
          }
        }
      }

      // Ensure page URL/title are always available for sidepanel rendering and prompt context.
      if (!selectionPayload.pageUrl && selectionPayload.contextData?.pageUrl) {
        selectionPayload.pageUrl = selectionPayload.contextData.pageUrl;
      }
      if (!selectionPayload.pageTitle && selectionPayload.contextData?.pageTitle) {
        selectionPayload.pageTitle = selectionPayload.contextData.pageTitle;
      }

      const resolvedMeta = await resolveTabMeta(
        tab.id,
        selectionPayload.pageUrl,
        selectionPayload.pageTitle
      );
      selectionPayload.pageUrl = resolvedMeta.url || selectionPayload.pageUrl || "";
      selectionPayload.pageTitle = resolvedMeta.title || selectionPayload.pageTitle || "";

      // 3. Save selection details to session storage (notifies side panel)
      await chrome.storage.session.set({
        lastSelection: selectionPayload
      });
      if (!(await ContextLensPanelCapabilities.shouldUseNativePanel())) {
        await ContextLensPanelCapabilities.openInPagePanel(tab.id, selectionPayload);
      }
    })();
  }
});

// Handle messages from content script (Floating Action Button click or right click caching)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RIGHT_CLICK_CONTEXT") {
    const tabId = sender.tab?.id;
    if (tabId) {
      tabRightClickContexts[tabId] = {
        contextData: message.contextData,
        text: message.text,
        isSelection: message.isSelection,
        timestamp: Date.now()
      };
      console.log(`🔮 [ContextLens Background] Cached right-click context for tab ${tabId}. IsSelection: ${message.isSelection}`);
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "FALLBACK_CHAT_REQUEST") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false, error: "无法定位当前浏览器标签页。" });
      return false;
    }
    ContextLensFallbackChat.start({
      tabId,
      requestId: message.requestId,
      payload: message.payload,
      instruction: message.instruction,
      requestOptions: message.requestOptions,
      mode: message.mode,
      conversation: message.conversation
    }).catch(async (error) => {
      await ContextLensRequestDiagnostics.record({
        surface: "in-page-panel",
        phase: "failed-before-request",
        provider: "unknown",
        transport: "configuration",
        error: error.message
      });
      await chrome.tabs.sendMessage(tabId, {
        type: "FALLBACK_STREAM_EVENT",
        requestId: message.requestId,
        event: "error",
        error: error.message || "模型请求失败。"
      }).catch(() => {});
    });
    sendResponse({ success: true });
    return false;
  }

  if (message.type === "CANCEL_FALLBACK_REQUEST") {
    const cancelled = ContextLensFallbackChat.cancel(message.requestId);
    if (cancelled && sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, {
        type: "FALLBACK_STREAM_EVENT",
        requestId: message.requestId,
        event: "cancelled"
      }).catch(() => {});
    }
    sendResponse({ success: true, cancelled });
    return false;
  }

  if (message.type === "GET_REQUEST_DIAGNOSTICS") {
    ContextLensRequestDiagnostics.list(15)
      .then((entries) => sendResponse({ success: true, entries }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "GET_LLM_TIMELINES") {
    ContextLensLlmTimeline.list(message.limit || 15)
      .then((runs) => sendResponse({ success: true, runs }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "GET_LEARNING_OPTIONS") {
    ContextLensLearningOptions.get()
      .then((options) => sendResponse({ success: true, options }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "GET_PANEL_PREFERENCES") {
    ContextAnswerPanelPreferences.get()
      .then((preferences) => sendResponse({ success: true, preferences }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "GET_CONTEXT_ANSWER_MODELS") {
    Promise.all([ContextAnswerModels.list(), ContextAnswerModels.active()])
      .then(([models, activeModel]) => sendResponse({ success: true, models, activeModel }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "SAVE_CONTEXT_ANSWER_MODEL") {
    ContextAnswerModels.save(message.model || {}, { activate: message.activate === true })
      .then((model) => sendResponse({ success: true, model }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "REMOVE_CONTEXT_ANSWER_MODEL") {
    ContextAnswerModels.remove(String(message.id || ""))
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "SET_CONTEXT_ANSWER_ACTIVE_MODEL") {
    ContextAnswerModels.setActive(String(message.id || ""))
      .then((model) => sendResponse({ success: true, model }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "CLEAR_CONTEXT_ANSWER_ACTIVE_MODEL") {
    ContextAnswerModels.clearActive()
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "SET_PANEL_PREFERENCES") {
    ContextAnswerPanelPreferences.set(message.preferences || {})
      .then(async (preferences) => {
        await ContextLensPanelCapabilities.disableNativeByDefault();
        sendResponse({ success: true, preferences });
      })
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "SET_LEARNING_OPTIONS") {
    ContextLensLearningOptions.set(message.options || {})
      .then((options) => sendResponse({ success: true, options }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "ASSESS_LEARNING_CONTEXT") {
    const model = message.model || {};
    if (!model.provider || model.provider.endsWith("-agent")) {
      sendResponse({ success: false, error: "当前模型不支持上下文评估。" });
      return false;
    }
    const transport = model.apiEndpoint ? "direct-endpoint" : "streaming-api";
    const requestId = String(message.requestId || "");
    const controller = new AbortController();
    const timeoutMs = Math.min(300000, Math.max(5000, Number(message.timeoutMs) || 15000));
    if (requestId) nativeAssessmentRequests.set(requestId, controller);
    const timer = setTimeout(() => controller.abort(new Error("上下文评估超时")), timeoutMs);
    const assessmentConfig = ContextLensRuntimeConfig.getLearningDefaults().assessment || {};
    ContextLensRequestDiagnostics.record({ surface: "native-side-panel", phase: "context-assessment-started", provider: model.provider, transport })
      .then(() => ContextLensAssessmentRouter.assess({
        context: message.context || {},
        question: String(message.question || ""),
        languageHint: String(message.languageHint || "自动识别"),
        radius: Number(message.radius) || 0,
        assessmentConfig,
        signal: controller.signal,
        surface: "native-side-panel",
        chainId: requestId,
        chainLabel: "原生学习解释",
        llmAssess: async () => {
          const text = await ContextLensFallbackChat.assess(model, String(message.prompt || ""), controller.signal, { surface: "native-side-panel", transport, chainId: requestId, chainLabel: "原生学习解释" });
          return ContextLensContextAssessment.parse(text);
        }
      }))
      .then(async (decision) => {
        await ContextLensRequestDiagnostics.record({ surface: "native-side-panel", phase: "context-assessment-completed", provider: decision?.source === "jev" ? "typesafe" : model.provider, transport: decision?.source === "jev" ? "typesafe-systemone" : transport });
        sendResponse({ success: true, decision });
      })
      .catch(async (error) => {
        await ContextLensRequestDiagnostics.record({ surface: "native-side-panel", phase: "context-assessment-failed", provider: model.provider, transport, status: error.status || null, error: error.message });
        sendResponse({ success: false, error: error.message });
      }).finally(() => {
        clearTimeout(timer);
        if (requestId && nativeAssessmentRequests.get(requestId) === controller) nativeAssessmentRequests.delete(requestId);
      });
    return true;
  }

  if (message.type === "CANCEL_CONTEXT_ASSESSMENT") {
    const controller = nativeAssessmentRequests.get(String(message.requestId || ""));
    if (controller) controller.abort(new Error("用户取消上下文评估"));
    sendResponse({ success: true, cancelled: !!controller });
    return false;
  }

  if (message.type === "OPEN_SIDE_PANEL") {
    // 保存后统一交给能力路由器决定原生侧栏或网页内面板。
    (async () => {
      try {
        const fallbackUrl = sender.tab?.url || message?.contextData?.pageUrl || "";
        const fallbackTitle = sender.tab?.title || message?.contextData?.pageTitle || "";
        if (!sender.tab?.url && fallbackUrl) {
          console.log("🔮 [ContextLens Background] sender.tab.url is empty. Using fallback URL from context payload or tab lookup.");
        }
        const resolvedMeta = await resolveTabMeta(sender.tab?.id, fallbackUrl, fallbackTitle);

        const selectionPayload = {
            tabId: sender.tab.id,
            text: message.text,
            pageUrl: resolvedMeta.url || fallbackUrl || "",
            pageTitle: resolvedMeta.title || fallbackTitle || "",
            timestamp: Date.now(),
            contextData: message.contextData || null // Enriched DOM details
          };
        await chrome.storage.session.set({ lastSelection: selectionPayload });
        const panel = await ContextLensPanelCapabilities.open(sender.tab.id, selectionPayload);
        sendResponse({ success: true, host: panel.host });
      } catch (err) {
        console.error("Failed to save selection context in message listener:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async sendResponse
  }
});

// Keep side panel available while navigating tabs once user has opened it.
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (activeSidePanelTabs.size > 0) {
    await enableSidePanelForTab(activeInfo.tabId, { silent: true });
  }
});

// Clean up set on tab closure
chrome.tabs.onRemoved.addListener(async (tabId) => {
  activeSidePanelTabs.delete(tabId);
  try {
    const result = await chrome.storage.local.get("tabStates");
    if (result.tabStates && result.tabStates[tabId]) {
      delete result.tabStates[tabId];
      await chrome.storage.local.set({ tabStates: result.tabStates });
      console.log(`🔮 [ContextLens Background] Cleaned up persisted tabState for closed tab ${tabId}`);
    }
  } catch (err) {
    console.error("🔮 [ContextLens Background] Failed to clean up closed tab state:", err);
  }
});
