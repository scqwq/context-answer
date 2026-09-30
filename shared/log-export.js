/** 日志导出文本编译器：合并脱敏时间线与诊断记录，不写入选区、提示词或密钥。 */
(function registerLogExport(global) {
  function formatDiagnosticEntry(entry = {}) {
    const status = entry.status ? ` HTTP ${entry.status}` : "";
    const chain = entry.chainId ? ` · 链 ${String(entry.chainId).slice(-16)}` : "";
    const elapsed = Number.isFinite(Number(entry.elapsedMs)) ? ` · +${Math.round(Number(entry.elapsedMs))}ms` : "";
    const radius = Number.isFinite(Number(entry.contextRadius)) ? ` · 上下文半径 ${Math.round(Number(entry.contextRadius))}` : "";
    const timeout = Number.isFinite(Number(entry.timeoutMs)) ? ` · 单次上限 ${Math.round(Number(entry.timeoutMs))}ms` : "";
    const stage = entry.stage ? ` · 阶段 ${entry.stage}` : "";
    const detail = entry.detail ? `\n  说明：${entry.detail}` : "";
    const error = entry.error ? `\n  错误：${entry.error}` : "";
    return `${entry.timestamp || "未知时间"} · ${entry.surface || "未知面板"} · ${entry.phase || "未知阶段"} · ${entry.provider || "未知供应商"} · ${entry.transport || "未知传输"}${chain}${elapsed}${radius}${timeout}${stage}${status}${detail}${error}`;
  }

  function formatDiagnostics(entries = []) {
    return (Array.isArray(entries) ? entries : []).map(formatDiagnosticEntry).join("\n\n");
  }

  function buildText({ runs = [], entries = [] } = {}) {
    const timelineText = global.ContextLensLlmTimelineView?.format?.(runs, { maxChains: 60 }) || "暂无 LLM 调用记录。";
    const diagnosticText = formatDiagnostics(entries);
    return [
      "ContextLens 脱敏日志导出",
      `导出时间：${new Date().toISOString()}`,
      "",
      "======== LLM 调用时间线（全部保留记录） ========",
      timelineText,
      "",
      "======== 脱敏诊断记录（全部保留记录） ========",
      diagnosticText || "暂无诊断记录。",
      ""
    ].join("\n");
  }

  function filename() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `contextlens-logs-${stamp}.txt`;
  }

  global.ContextLensLogExport = { buildText, filename, formatDiagnosticEntry, formatDiagnostics };
})(globalThis);
