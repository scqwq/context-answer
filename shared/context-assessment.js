/** 上下文评估适配器：实际判断模板与占位符集中在 shared/prompt-templates.js。 */
(function registerContextAssessment(global) {
  function clean(value, limit = 12000) {
    const text = String(value || "").trim();
    return text.length > limit ? `${text.slice(0, limit)}\n[已按预算截断]` : text;
  }

  function buildPrompt(input) { return global.ContextLensPromptTemplates.buildAssessment(input); }

  function parse(text) {
    const source = String(text || "").trim();
    const match = source.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const value = JSON.parse(match[0]);
      if (typeof value.sufficient !== "boolean") return null;
      return {
        sufficient: value.sufficient,
        direction: ["before", "after", "both"].includes(value.direction) ? value.direction : "both",
        missing: clean(value.missing, 160)
      };
    } catch {
      return null;
    }
  }

  global.ContextLensContextAssessment = { buildPrompt, parse };
})(globalThis);
