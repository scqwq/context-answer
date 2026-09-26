/**
 * LLM 请求诊断日志：仅保存脱敏元数据到 chrome.storage.local，供故障排查。
 * 禁止记录 API Key、完整 URL、选区、提示词、模型回答或请求头。
 */
(function registerRequestDiagnostics(global) {
  const STORAGE_KEY = "contextLensRequestDiagnostics";
  const MAX_ENTRIES = 80;

  function sanitizeError(error) {
    return String(error || "未知错误")
      .replace(/https?:\/\/[^\s)]+/gi, "[URL 已隐藏]")
      .replace(/Bearer\s+[^\s]+/gi, "Bearer [已隐藏]")
      .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{8,})\b/g, "[密钥已隐藏]")
      .replace(/(["']?(?:api[_ -]?key|authorization)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, "$1[已隐藏]")
      .slice(0, 400);
  }

  async function record({ surface, phase, provider = "unknown", transport = "unknown", status = null, error = "" }) {
    const entry = { timestamp: new Date().toISOString(), surface, phase, provider, transport, status, error: error ? sanitizeError(error) : "" };
    const saved = await chrome.storage.local.get(STORAGE_KEY);
    const entries = Array.isArray(saved[STORAGE_KEY]) ? saved[STORAGE_KEY] : [];
    entries.push(entry);
    await chrome.storage.local.set({ [STORAGE_KEY]: entries.slice(-MAX_ENTRIES) });
    return entry;
  }

  async function list(limit = 20) {
    const saved = await chrome.storage.local.get(STORAGE_KEY);
    const entries = Array.isArray(saved[STORAGE_KEY]) ? saved[STORAGE_KEY] : [];
    return entries.slice(-Math.max(1, Math.min(limit, MAX_ENTRIES))).reverse();
  }

  global.ContextLensRequestDiagnostics = { record, list };
})(globalThis);
