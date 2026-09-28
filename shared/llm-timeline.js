/**
 * LLM 调用时间线：以一次模型调用为单位保存脱敏的时序与传输指标，供性能分析使用。
 * 禁止记录 API Key、URL、提示词、选区、响应原文、请求头或模型思维链。
 */
(function registerLlmTimeline(global) {
  const STORAGE_KEY = "contextLensLlmTimelines";
  const MAX_RUNS = 60;
  const MAX_EVENTS = 24;
  let writeChain = Promise.resolve();

  function sanitizeError(error) {
    return String(error || "未知错误")
      .replace(/https?:\/\/[^\s)]+/gi, "[URL 已隐藏]")
      .replace(/Bearer\s+[^\s]+/gi, "Bearer [已隐藏]")
      .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{8,})\b/g, "[密钥已隐藏]")
      .slice(0, 240);
  }

  function createId() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    return `llm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function elapsed(startedMs) {
    return Math.max(0, Date.now() - startedMs);
  }

  function enqueue(mutator) {
    writeChain = writeChain
      .catch(() => undefined)
      .then(async () => {
        const saved = await chrome.storage.local.get(STORAGE_KEY);
        const runs = Array.isArray(saved[STORAGE_KEY]) ? saved[STORAGE_KEY] : [];
        const next = mutator(runs) || runs;
        await chrome.storage.local.set({ [STORAGE_KEY]: next.slice(-MAX_RUNS) });
      });
    return writeChain;
  }

  function appendEvent(run, type, details = {}) {
    run.events.push({
      at: new Date().toISOString(),
      tMs: elapsed(run.startedMs),
      type,
      ...details
    });
    if (run.events.length > MAX_EVENTS) run.events = run.events.slice(-MAX_EVENTS);
  }

  function update(id, mutator) {
    return enqueue((runs) => {
      const run = runs.find((item) => item.id === id);
      if (run) mutator(run);
      return runs;
    });
  }

  function start({ surface, purpose, provider = "unknown", model = "未命名模型", transport = "unknown", chainId = "", chainLabel = "" }) {
    const id = createId();
    const startedMs = Date.now();
    const run = {
      id,
      startedAt: new Date(startedMs).toISOString(),
      startedMs,
      surface,
      purpose,
      provider,
      model: String(model || "未命名模型").slice(0, 160),
      transport,
      chainId: String(chainId || id).slice(0, 160),
      chainLabel: String(chainLabel || "单次模型调用").slice(0, 80),
      outcome: "running",
      events: [],
      metrics: { responseChunks: 0, responseBytes: 0, outputChunks: 0, outputChars: 0 }
    };
    appendEvent(run, "request-created", { description: "已创建模型调用" });
    void enqueue((runs) => [...runs, run]);

    return {
      id,
      dispatch() {
        return update(id, (current) => appendEvent(current, "request-dispatched", { description: "已发起 HTTP 请求" }));
      },
      response(status) {
        return update(id, (current) => {
          if (!current.metrics.firstResponseMs) current.metrics.firstResponseMs = elapsed(current.startedMs);
          appendEvent(current, "http-response", { status: Number(status) || null, description: `收到 HTTP ${status}` });
        });
      },
      streamChunk(byteLength = 0) {
        return update(id, (current) => {
          current.metrics.responseChunks += 1;
          current.metrics.responseBytes += Number(byteLength) || 0;
          if (!current.metrics.firstStreamDataMs) {
            current.metrics.firstStreamDataMs = elapsed(current.startedMs);
            appendEvent(current, "first-stream-data", { description: "收到首个流式数据块" });
          }
        });
      },
      outputChunk(charLength = 0) {
        return update(id, (current) => {
          current.metrics.outputChunks += 1;
          current.metrics.outputChars += Number(charLength) || 0;
          if (!current.metrics.firstOutputMs) {
            current.metrics.firstOutputMs = elapsed(current.startedMs);
            appendEvent(current, "first-output", { description: "解析到首段可展示输出" });
          }
        });
      },
      assessmentReceived(charLength = 0) {
        return update(id, (current) => {
          current.metrics.outputChars = Number(charLength) || 0;
          current.metrics.firstOutputMs = elapsed(current.startedMs);
          appendEvent(current, "assessment-response", { description: "收到上下文评估结果（内容未记录）" });
        });
      },
      finish(outcome = "completed", error = "") {
        return update(id, (current) => {
          if (current.outcome !== "running") return;
          current.outcome = outcome;
          current.metrics.totalMs = elapsed(current.startedMs);
          appendEvent(current, outcome, {
            description: outcome === "completed" ? "调用完成" : "调用未完成",
            ...(error ? { error: sanitizeError(error) } : {})
          });
        });
      }
    };
  }

  async function list(limit = 15) {
    await writeChain.catch(() => undefined);
    const saved = await chrome.storage.local.get(STORAGE_KEY);
    const runs = Array.isArray(saved[STORAGE_KEY]) ? saved[STORAGE_KEY] : [];
    return runs.slice(-Math.max(1, Math.min(limit, MAX_RUNS))).reverse().map(({ startedMs, ...run }) => run);
  }

  global.ContextLensLlmTimeline = { start, list };
})(globalThis);
