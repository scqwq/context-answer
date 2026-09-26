# 网页内学习面板诊断记录（2026-09-26）

## 当前现象

用户在联想浏览器中选中文本并打开网页内学习面板后，点击“一键学习解释”，看到：

> 网页内学习面板仅支持 API 模型，请配置 Gemini、OpenAI、Claude 或自定义兼容接口。

## 本次已确认的根因

`.env` 的 `CONTEXTLENS_API_PROVIDER` 被填写成了服务地址。该字段只能填供应商类型：`gemini`、`openai`、`claude` 或 `custom`。对于 DeepSeek 等 OpenAI 兼容接口，应使用 `CONTEXTLENS_API_PROVIDER=custom`，并将服务地址填在 `CONTEXTLENS_API_URL`。

由于 URL 不是有效供应商类型，运行时会将供应商置空，模型请求因此在发出前被拒绝。现已改为 `custom`，并将 DeepSeek 的 OpenAI 兼容基地址补全为 `/v1`，然后重新生成 `sidepanel/config.local.js`；Key 和模型值未改动。

## 高概率原因与核对顺序

1. **扩展仍在运行旧版后台脚本。**
   - 依据：最新代码在远程模式遇到历史本地 Agent 时，会提示“远程模型模式已启用”，而不是上述旧提示。
   - 处理：扩展管理页点击“重新加载”，再刷新目标网页；扩展重载和网页刷新缺一不可。

2. **`.env` 没有重新生成 `sidepanel/config.local.js`。**
   - 浏览器扩展不能直接读取 `.env`，只读取生成文件。
   - 处理：在项目根目录运行 `pnpm run build` 或 `npm run build:env`。两者现在都会执行 `scripts/build-env.js`。

3. **`.env` 仍是旧版单组配置，或远程配置未填写完整。**
   - 远程模式需要 `CONTEXTLENS_USE_LOCAL_MODEL=false`，以及远程 `CONTEXTLENS_API_PROVIDER`、`CONTEXTLENS_API_KEY`、`CONTEXTLENS_API_URL`（或 `CONTEXTLENS_API_ENDPOINT`）、`CONTEXTLENS_MODEL`。
   - 本地模型只在 `CONTEXTLENS_USE_LOCAL_MODEL=true` 时读取 `LOCAL_*` 参数。

4. **浏览器加载的不是当前项目根目录。**
   - 处理：在扩展详情页确认“加载已解压的扩展程序”的目录是 `D:\moresoftware\context-lens`，而不是旧复制目录或构建产物目录。

5. **本地 Agent 历史状态仍存在。**
   - 最新回退面板会优先使用 `.env` 中完整的 API 配置；若生成配置没有载入，才可能落到历史 Agent 状态。
   - 处理：优先解决第 1、2 项；不要通过启动 Bridge 来解决普通 LLM 问答。

## 安全提醒

- 本记录不包含 API Key、完整远程 URL、选区内容或聊天历史。
- 查看扩展 Service Worker 控制台时，只记录错误类型和发生时间，不复制认证请求头。

## 已实施的修复

- 新增 `pnpm run build` / `npm run build` 入口，执行与 `build:env` 相同的本地配置生成。
- 网页内面板支持远程优先、本地模型显式开关，以及完整 Endpoint 原样请求。

## 运行时 LLM 调用日志

为便于下一步定位真实失败原因，网页内面板右上角新增“诊断”按钮。点击后会显示最近 15 条脱敏运行记录，包括请求开始/完成/失败阶段、供应商、请求方式、HTTP 状态码（若服务端已响应）和错误摘要。

日志保存在扩展自身的 `chrome.storage.local`，而不是写入项目目录：网页扩展不能安全、稳定地直接写本机项目文件。日志不会保存 API Key、完整 URL、选区文本、提示词、请求头或模型回答。
