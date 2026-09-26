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
const learning = {
  translationEnabled: !/^(0|false|no)$/i.test(env.CONTEXTLENS_LEARNING_TRANSLATION_ENABLED || "true"),
  targetLanguage: env.CONTEXTLENS_LEARNING_TARGET_LANGUAGE || "zh-CN",
  responseDetail: env.CONTEXTLENS_LEARNING_RESPONSE_DETAIL || "compact",
  sourceLanguage: env.CONTEXTLENS_LEARNING_SOURCE_LANGUAGE || "auto",
  contextMode: env.CONTEXTLENS_LEARNING_CONTEXT_MODE || "auto",
  manualLines: Number(env.CONTEXTLENS_LEARNING_MANUAL_LINES || 5)
};
const config = { useLocalModel: isTrue, remote, local, learning, bridgeUrl: env.CONTEXTLENS_BRIDGE_URL || "" };

const output = `// 由 scripts/build-env.js 自动生成；不要提交此文件。\nglobalThis.CONTEXT_LENS_LOCAL_ENV = ${JSON.stringify(config, null, 2)};\n`;
fs.writeFileSync(outputPath, output, "utf8");
console.log("已生成 sidepanel/config.local.js");
