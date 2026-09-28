/** LLM 时间线视图：按一次用户请求归组脱敏模型调用，供不同面板共用展示。 */
(function registerLlmTimelineView(global) {
  function groupRuns(runs) {
    const groups = new Map();
    (Array.isArray(runs) ? runs : []).forEach((run) => {
      const chainId = String(run.chainId || run.id || "legacy");
      if (!groups.has(chainId)) {
        groups.set(chainId, {
          label: String(run.chainLabel || "旧版未归组调用"),
          startedAt: run.startedAt,
          runs: []
        });
      }
      groups.get(chainId).runs.push(run);
    });
    return [...groups.values()].map((group) => {
      group.runs.sort((left, right) => String(left.startedAt).localeCompare(String(right.startedAt)));
      group.startedAt = group.runs[0]?.startedAt || group.startedAt;
      return group;
    });
  }

  function formatRun(run, markdown) {
    const metrics = run.metrics || {};
    const total = Number.isFinite(metrics.totalMs) ? `${metrics.totalMs}ms` : "进行中";
    const events = (run.events || []).map((event) => {
      const status = event.status ? ` HTTP ${event.status}` : "";
      const error = event.error ? `：${event.error}` : "";
      return markdown ? `- t+${event.tMs}ms ${event.type}${status}${error}` : `  t+${event.tMs}ms ${event.type}${status}${error}`;
    }).join("\n");
    const heading = markdown
      ? `#### ${run.purpose} · ${run.outcome}`
      : `${run.purpose} · ${run.outcome}`;
    return `${heading}\n模型：${run.provider} / ${run.model || "未命名模型"} · 总耗时：${total}\nHTTP 响应：${metrics.firstResponseMs ?? "—"}ms · 首个流数据：${metrics.firstStreamDataMs ?? "—"}ms · 首段输出：${metrics.firstOutputMs ?? "—"}ms\n流数据：${metrics.responseChunks || 0} 块 / ${metrics.responseBytes || 0} B\n${events || "  暂无阶段事件"}`;
  }

  function format(runs, { markdown = false, maxChains = 15 } = {}) {
    const separator = markdown ? "\n\n---\n\n" : "\n\n════════════════════\n\n";
    const groups = groupRuns(runs).slice(0, Math.max(1, Number(maxChains) || 15));
    return groups.map((group, index) => {
      const heading = markdown
        ? `### 请求链 ${index + 1} · ${group.label}（${group.runs.length} 次模型调用）`
        : `【请求链 ${index + 1} · ${group.label} · ${group.runs.length} 次模型调用】`;
      return `${heading}\n开始时间：${group.startedAt || "未知"}\n\n${group.runs.map((run) => formatRun(run, markdown)).join("\n\n")}`;
    }).join(separator);
  }

  global.ContextLensLlmTimelineView = { groupRuns, format };
})(globalThis);
