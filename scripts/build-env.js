/**
 * 将根目录 .env 转成扩展可加载的本地配置。
 * 浏览器扩展无法在运行时读取 .env；生成的 config.local.js 同样被 Git 忽略。
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");
const outputPath = path.join(root, "sidepanel", "config.local.js");

function parseEnv(source) {
  return source.split(/\r?\n/).reduce((values, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return values;
    const separator = trimmed.indexOf("=");
    if (separator < 1) return values;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    values[key] = value;
    return values;
  }, {});
}

if (!fs.existsSync(envPath)) {
  console.error("找不到 .env，请先复制 .env.example 为 .env。");
  process.exit(1);
}

const env = parseEnv(fs.readFileSync(envPath, "utf8"));
const isTrue = /^(1|true|yes)$/i.test(env.CONTEXTLENS_USE_LOCAL_MODEL || "");
const isEnabled = (value, fallback) => value === undefined || value === ""
  ? fallback
  : /^(1|true|yes)$/i.test(value);
function boundedMs(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(300000, Math.max(5000, parsed)) : fallback;
}
const remote = {
  provider: env.CONTEXTLENS_API_PROVIDER || "",
  apiKey: env.CONTEXTLENS_API_KEY || "",
  apiUrl: env.CONTEXTLENS_API_URL || "",
  apiEndpoint: env.CONTEXTLENS_API_ENDPOINT || "",
  model: env.CONTEXTLENS_MODEL || ""
};
const local = {
  provider: env.CONTEXTLENS_LOCAL_API_PROVIDER || "custom",
  apiKey: env.CONTEXTLENS_LOCAL_API_KEY || "",
  apiUrl: env.CONTEXTLENS_LOCAL_API_URL || "",
  apiEndpoint: env.CONTEXTLENS_LOCAL_API_ENDPOINT || "",
  model: env.CONTEXTLENS_LOCAL_MODEL || ""
};
const localAgent = {
  provider: env.CONTEXTLENS_LOCAL_AGENT_PROVIDER || "",
  commandPath: env.CONTEXTLENS_LOCAL_AGENT_COMMAND_PATH || ""
};
// 固定槽位让 .env 保持易读；留空的槽位不会进入扩展模型列表。
const extraModels = Array.from({ length: 5 }, (_, index) => {
  const slot = index + 1;
  const prefix = `CONTEXTLENS_EXTRA_MODEL_${slot}_`;
  return {
    id: `env-extra-${slot}`,
    label: env[`${prefix}NAME`] || "",
    provider: env[`${prefix}PROVIDER`] || "",
    apiKey: env[`${prefix}API_KEY`] || "",
    apiUrl: env[`${prefix}API_URL`] || "",
    apiEndpoint: env[`${prefix}API_ENDPOINT`] || "",
    model: env[`${prefix}MODEL`] || "",
    bridgeUrl: env[`${prefix}BRIDGE_URL`] || "",
    commandPath: env[`${prefix}COMMAND_PATH`] || ""
  };
}).filter((model) => model.label || model.provider || model.model);
const learning = {
  assessmentEnabled: isEnabled(env.CONTEXTLENS_LEARNING_CONTEXT_ASSESSMENT_ENABLED, true),
  translationEnabled: !/^(0|false|no)$/i.test(env.CONTEXTLENS_LEARNING_TRANSLATION_ENABLED || "true"),
  // TARGET_LANGUAGE 保留为旧配置兼容项；新配置区分回答语言与翻译语言。
  responseLanguage: env.CONTEXTLENS_LEARNING_RESPONSE_LANGUAGE || env.CONTEXTLENS_LEARNING_TARGET_LANGUAGE || "zh-CN",
  translationLanguage: env.CONTEXTLENS_LEARNING_TRANSLATION_LANGUAGE || env.CONTEXTLENS_LEARNING_TARGET_LANGUAGE || "zh-CN",
  responseDetail: env.CONTEXTLENS_LEARNING_RESPONSE_DETAIL || "compact",
  outputStyle: env.CONTEXTLENS_LEARNING_OUTPUT_STYLE || "focus",
  maxKeyPoints: Number(env.CONTEXTLENS_LEARNING_MAX_KEY_POINTS || 3),
  codeExamples: env.CONTEXTLENS_LEARNING_CODE_EXAMPLES || "on-demand",
  requestTimeoutMs: boundedMs(env.CONTEXTLENS_LEARNING_REQUEST_TIMEOUT_MS, 90000),
  assessmentTimeoutMs: boundedMs(env.CONTEXTLENS_LEARNING_ASSESSMENT_TIMEOUT_MS, 15000),
  sourceLanguage: env.CONTEXTLENS_LEARNING_SOURCE_LANGUAGE || "auto",
  contextMode: env.CONTEXTLENS_LEARNING_CONTEXT_MODE || "auto",
  manualLines: Number(env.CONTEXTLENS_LEARNING_MANUAL_LINES || 5),
  assessment: {
    // Jev 是可选的主判断路线；未填 Key 时默认关闭，不影响现有 LLM 判断。
    jev: {
      enabled: isEnabled(env.CONTEXTLENS_JEV_ENABLED, false),
      apiKey: env.CONTEXTLENS_JEV_API_KEY || "",
      apiUrl: env.CONTEXTLENS_JEV_API_URL || "https://api.typesafe.ai/v1/systemone",
      model: env.CONTEXTLENS_JEV_MODEL || "jev-latest",
      confidenceThreshold: Math.min(0.95, Math.max(0.5, Number(env.CONTEXTLENS_JEV_CONFIDENCE_THRESHOLD) || 0.75))
    },
    // 仅在 Jev 未配置或请求失败时作为可选兜底；Jev 低置信度会直接扩展上下文后重试 Jev。
    llmEnabled: isEnabled(env.CONTEXTLENS_LLM_ASSESSMENT_ENABLED, true)
  }
};
const panelMode = ["auto", "native", "in-page"].includes(String(env.CONTEXTLENS_PANEL_MODE || "").trim())
  ? String(env.CONTEXTLENS_PANEL_MODE).trim()
  : "in-page";
const config = {
  useLocalModel: isTrue,
  useLocalAgent: isEnabled(env.CONTEXTLENS_USE_LOCAL_AGENT, false),
  remote,
  local,
  localAgent,
  extraModels,
  learning,
  panelMode,
  bridgeUrl: env.CONTEXTLENS_BRIDGE_URL || ""
};

const output = `// 由 scripts/build-env.js 自动生成；不要提交此文件。\nglobalThis.CONTEXT_LENS_LOCAL_ENV = ${JSON.stringify(config, null, 2)};\n`;
fs.writeFileSync(outputPath, output, "utf8");
console.log("已生成 sidepanel/config.local.js");
