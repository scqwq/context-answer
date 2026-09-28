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

  function formatStartedAt(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || "未知时间");
    return date.toLocaleString("zh-CN", { hour12: false });
  }

  function formatContextWindow(raw) {
    if (!raw) return "上下文：未记录（旧日志）";
    const radius = Number(raw.radius) || 0;
    if (radius === 0) return "上下文：仅选区（0 行）";
    const kind = raw.kind === "code-line" ? "代码" : (raw.kind === "text-line" ? "网页文本" : "内容");
    const start = Number(raw.startLine);
    const end = Number(raw.endLine);
    const total = Number(raw.totalLines);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      const windowStart = Math.max(1, start - radius);
      const windowEnd = Number.isFinite(total) ? Math.min(total, end + radius) : end + radius;
      return `上下文：${kind}上下各 ${radius} 行（源文本第 ${windowStart}–${windowEnd} 行）`;
    }
    return `上下文：上下各 ${radius} 行`;
  }

  function purposeLabel(purpose) {
    return {
      "context-assessment-jev": "Jev 充分性评估",
      "context-assessment": "LLM 充分性评估",
      "learning-answer": "最终学习回答",
      "chat-answer": "普通聊天回答",
      "learning-memory-summary": "学习记忆摘要"
    }[purpose] || String(purpose || "模型调用");
  }

  function formatRun(run, markdown, index) {
    const metrics = run.metrics || {};
    const total = Number.isFinite(metrics.totalMs) ? `${metrics.totalMs}ms` : "进行中";
    const responseEvent = (run.events || []).find((event) => event.type === "http-response");
    const errorEvent = [...(run.events || [])].reverse().find((event) => event.error);
    const http = responseEvent?.status ? `HTTP ${responseEvent.status} @${metrics.firstResponseMs ?? "—"}ms` : "未收到 HTTP 响应";
    const output = metrics.firstOutputMs === undefined ? "未收到可展示结果" : `首段结果 @${metrics.firstOutputMs}ms`;
    const requestSize = run.purpose === "context-assessment-jev" && metrics.requestChars
      ? ` · 请求体 ${metrics.requestChars} 字符`
      : "";
    const firstLine = `${index + 1}. ${formatStartedAt(run.startedAt)} · ${purposeLabel(run.purpose)} · ${run.provider}/${run.model || "未命名模型"} · ${formatContextWindow(run.contextWindow)}`;
    const secondLine = `   ${http} · ${output} · ${run.outcome || "unknown"} @${total}${requestSize}${errorEvent?.error ? ` · ${errorEvent.error}` : ""}`;
    return markdown ? `${firstLine}\n${secondLine}` : `${firstLine}\n${secondLine}`;
  }

  function isJevCall(run) {
    return run?.purpose === "context-assessment-jev"
      && (run.events || []).some((event) => event.type === "request-dispatched");
  }

  function formatJevCallIndex(groups, markdown) {
    const rows = [];
    groups.forEach((group, groupIndex) => {
      group.runs.filter(isJevCall).forEach((run) => {
        const requestChars = Number(run.metrics?.requestChars);
        rows.push(`${rows.length + 1}. 请求链 ${groupIndex + 1}（${group.label}）· ${formatStartedAt(run.startedAt)} · ${formatContextWindow(run.contextWindow)}${requestChars ? ` · 请求体 ${requestChars} 字符` : ""}`);
      });
    });
    if (!rows.length) return markdown ? "**Jev 实际请求：0 次**" : "Jev 实际请求：0 次";
    const title = markdown ? `**Jev 实际请求：${rows.length} 次（逐次对应如下）**` : `Jev 实际请求：${rows.length} 次（逐次对应如下）`;
    return `${title}\n${rows.map((row) => markdown ? `- ${row}` : row).join("\n")}`;
  }

  function format(runs, { markdown = false, maxChains = 15 } = {}) {
    const separator = markdown ? "\n\n---\n\n" : "\n\n════════════════════\n\n";
    const groups = groupRuns(runs).slice(0, Math.max(1, Number(maxChains) || 15));
    const body = groups.map((group, index) => {
      const groupJevCalls = group.runs.filter(isJevCall).length;
      const heading = markdown
        ? `### 请求链 ${index + 1} · ${group.label}（${group.runs.length} 次模型调用，Jev ${groupJevCalls} 次）`
        : `【请求链 ${index + 1} · ${group.label} · ${group.runs.length} 次模型调用 · Jev ${groupJevCalls} 次】`;
      return `${heading}\n开始时间：${formatStartedAt(group.startedAt)}\n${group.runs.map((run, runIndex) => formatRun(run, markdown, runIndex)).join("\n")}`;
    }).join(separator);
    const summary = formatJevCallIndex(groups, markdown);
    return body ? `${summary}\n\n${body}` : `${summary}\n\n${markdown ? "暂无调用记录。" : "暂无调用记录。"}`;
  }

  global.ContextLensLlmTimelineView = { groupRuns, format };
})(globalThis);
