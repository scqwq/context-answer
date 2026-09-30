/**
 * LLM 请求诊断日志：仅保存脱敏元数据到 chrome.storage.local，供故障排查。
 * 禁止记录 API Key、完整 URL、选区、提示词、模型回答或请求头。
 */
(function registerRequestDiagnostics(global) {
  const STORAGE_KEY = "contextLensRequestDiagnostics";
  const MAX_ENTRIES = 80;
  const STORAGE_TIMEOUT_MS = 1500;
  let writeChain = Promise.resolve();

  function sanitizeError(error) {
    return String(error || "未知错误")
      .replace(/https?:\/\/[^\s)]+/gi, "[URL 已隐藏]")
      .replace(/Bearer\s+[^\s]+/gi, "Bearer [已隐藏]")
      .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{8,})\b/g, "[密钥已隐藏]")
      .replace(/(["']?(?:api[_ -]?key|authorization)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, "$1[已隐藏]")
      .slice(0, 400);
  }

  function clip(value, limit) {
    return String(value || "").trim().slice(0, limit);
  }

  function normalizeChainId(value) {
    return clip(value, 120).replace(/[^A-Za-z0-9._:-]/g, "_");
  }

  function withTimeout(promise, timeoutMs, label) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}超时`)), timeoutMs);
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  function enqueueWrite(entry) {
    const task = writeChain.catch(() => undefined).then(async () => {
      const saved = await withTimeout(chrome.storage.local.get(STORAGE_KEY), STORAGE_TIMEOUT_MS, "读取诊断日志");
      const entries = Array.isArray(saved[STORAGE_KEY]) ? saved[STORAGE_KEY] : [];
      entries.push(entry);
      await withTimeout(
        chrome.storage.local.set({ [STORAGE_KEY]: entries.slice(-MAX_ENTRIES) }),
        STORAGE_TIMEOUT_MS,
        "写入诊断日志"
      );
    });
    writeChain = task.catch(() => undefined);
    return task;
  }

  async function record({
    surface,
    phase,
    provider = "unknown",
    transport = "unknown",
    status = null,
    error = "",
    chainId = "",
    stage = "",
    detail = "",
    elapsedMs = null,
    contextRadius = null,
    requestChars = null,
    timeoutMs = null
  } = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      surface: clip(surface || "unknown", 80),
      phase: clip(phase || "unknown", 100),
      provider: clip(provider || "unknown", 80),
      transport: clip(transport || "unknown", 80),
      ...(normalizeChainId(chainId) ? { chainId: normalizeChainId(chainId) } : {}),
      ...(clip(stage, 120) ? { stage: clip(stage, 120) } : {}),
      ...(clip(detail, 240) ? { detail: sanitizeError(detail).slice(0, 240) } : {}),
      ...(Number.isFinite(Number(elapsedMs)) && Number(elapsedMs) >= 0 ? { elapsedMs: Math.round(Number(elapsedMs)) } : {}),
      ...(Number.isFinite(Number(contextRadius)) && Number(contextRadius) >= 0 ? { contextRadius: Math.min(20, Math.round(Number(contextRadius))) } : {}),
      ...(Number.isFinite(Number(requestChars)) && Number(requestChars) >= 0 ? { requestChars: Math.min(200000, Math.round(Number(requestChars))) } : {}),
      ...(Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) >= 0 ? { timeoutMs: Math.min(300000, Math.round(Number(timeoutMs))) } : {}),
      status: Number.isFinite(Number(status)) ? Number(status) : null,
      error: error ? sanitizeError(error) : ""
    };
    try {
      await enqueueWrite(entry);
    } catch (writeError) {
      // 诊断日志不能阻塞实际模型请求；存储异常仅保留在控制台，不再次写入日志。
      console.warn("[ContextLens] 诊断日志写入失败：", writeError?.message || writeError);
    }
    return entry;
  }

  async function list(limit = 20) {
    try {
      await writeChain.catch(() => undefined);
      const saved = await withTimeout(chrome.storage.local.get(STORAGE_KEY), STORAGE_TIMEOUT_MS, "读取诊断日志");
      const entries = Array.isArray(saved[STORAGE_KEY]) ? saved[STORAGE_KEY] : [];
      return entries.slice(-Math.max(1, Math.min(limit, MAX_ENTRIES))).reverse();
    } catch (error) {
      console.warn("[ContextLens] 诊断日志读取失败：", error?.message || error);
      return [];
    }
  }

  global.ContextLensRequestDiagnostics = { record, list };
})(globalThis);
