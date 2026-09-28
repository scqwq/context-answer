/** 日志导出文本编译器：合并脱敏时间线与诊断记录，不写入选区、提示词或密钥。 */
(function registerLogExport(global) {
  function buildText({ runs = [], entries = [] } = {}) {
    const timelineText = global.ContextLensLlmTimelineView?.format?.(runs, { maxChains: 60 }) || "暂无 LLM 调用记录。";
    const diagnosticText = (Array.isArray(entries) ? entries : []).map((entry) => {
      const status = entry.status ? ` HTTP ${entry.status}` : "";
      const error = entry.error ? `\n  错误：${entry.error}` : "";
      return `${entry.timestamp || "未知时间"} · ${entry.surface || "未知面板"} · ${entry.phase || "未知阶段"} · ${entry.provider || "未知供应商"} · ${entry.transport || "未知传输"}${status}${error}`;
    }).join("\n\n");
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

  global.ContextLensLogExport = { buildText, filename };
})(globalThis);
