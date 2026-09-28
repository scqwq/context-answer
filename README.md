# ContextLens / ContextAnswer

[中文说明](README_ZH.md)

ContextLens is a Manifest V3 Chromium extension for learning from webpages. Select code or technical text, then open the unified **ContextAnswer** in-page panel to get a concise explanation, translation, context-aware answer, or continue a normal chat.

The default panel is implemented with Shadow DOM rather than `chrome.sidePanel`, so it works in most Chromium-based browsers that allow extension content scripts. The legacy native side panel remains available as an optional compatibility host.

## Highlights

- Select text with the floating Lens button or the right-click menu; the extension extracts code blocks, tables, headings, surrounding content, and page metadata.
- ContextAnswer has **Learning** and **Chat** modes, a draggable title bar, streaming output, stop control, answer history, timing logs, and a shared Chinese/English switch.
- Learning mode supports language hints and three context strategies: automatic, manual `0 / 5 / 10 / 20` lines, and pasted supplemental context.
- Automatic context selection uses TypeSafe Jev when configured and falls back to a short LLM JSON assessment. It expands context in `0 → 5 → 10 → 20` steps only when necessary.
- Add, edit, remove, and select multiple Gemini, OpenAI, Claude, custom OpenAI-compatible API models, or local CLI Agents from the Settings page.
- Preload up to five additional models in `.env`; use a local Agent Bridge only when calling CLI Agents.
- Learning memory keeps up to 20 turns for the same normalized selection, injecting a prepared summary plus the latest four turns. Summaries run asynchronously after answers complete.
- Per-call LLM timelines group assessment, answer, and background memory-summary calls without logging prompts, selections, keys, or answer bodies.

## Requirements

- A Chromium-based browser that permits unpacked extensions: Chrome, Edge, Lenovo Browser, and similar Chromium browsers.
- Node.js 18+ and `pnpm` (or a compatible package manager) for generating local runtime configuration.
- An API key and model endpoint for a remote model, or a compatible local model endpoint.
- Optional local Agent mode: Node.js plus an installed Claude Code, Codex CLI, Antigravity CLI, or Copilot CLI.

## Quick start

1. Install dependencies:

   ```powershell
   pnpm install
   ```

2. Copy `.env.example` to `.env`, then configure one default model. For an OpenAI-compatible provider:

   ```env
   CONTEXTLENS_PANEL_MODE=in-page
   CONTEXTLENS_API_PROVIDER=custom
   CONTEXTLENS_API_KEY=your-key
   CONTEXTLENS_API_URL=https://provider.example/v1
   CONTEXTLENS_MODEL=your-model
   ```

3. Generate the extension-only runtime configuration:

   ```powershell
   pnpm run build:env
   ```

4. Open your browser extension page, enable Developer mode, choose **Load unpacked**, and select this repository root.

5. Select text on a webpage, click the floating Lens icon, and use ContextAnswer. After source, manifest, or `.env` changes, run `pnpm run build:env` when applicable and reload the extension.

## ContextAnswer usage

The default `in-page` host opens a draggable panel. Its header contains Home, History, Logs, Settings, Chinese/English, and Close controls.

- **Learning mode**: select a source language and context strategy, then choose “Explain selection” or ask a focused question.
- **Chat mode**: ask without a selection; the current panel keeps the latest 20 turns only.
- **Automatic context**: Jev first, LLM fallback; it stops after 20 lines each side and asks you to paste the missing definition or call site.
- **Manual context**: `0` sends only the selected text and never invokes Jev/LLM sufficiency assessment.
- **Add context**: paste remote types, function definitions, callers, or document paragraphs into the supplementary field.
- **Language**: the `中文 / EN` button shares the `uiLanguage` preference with the legacy native side panel. It translates ContextAnswer controls; response language remains a separate learning setting in `.env`.

## Model management

The Home page only contains the active-model selector. Keys, URLs, model form fields, and model lists are deliberately confined to **Settings**.

- Add a browser-local model with a provider, display name, model name, and the required endpoint/key fields.
- The saved-model list supports edit and delete. A saved model is selectable from Home after it is added.
- `.env` models appear as read-only presets. Use **Copy to edit** to create a browser-local editable copy.
- Choosing “Environment default (.env)” on Home clears the browser-local active model and returns to the default configuration.

### Default model variables

| Variable | Purpose |
| --- | --- |
| `CONTEXTLENS_API_PROVIDER` | `gemini`, `openai`, `claude`, or `custom` |
| `CONTEXTLENS_API_KEY` | API key for the default remote model |
| `CONTEXTLENS_API_URL` | Custom/OpenAI-compatible base URL; `/chat/completions` is appended when no full endpoint is set |
| `CONTEXTLENS_API_ENDPOINT` | Optional full endpoint; used exactly as written |
| `CONTEXTLENS_MODEL` | Default model identifier |
| `CONTEXTLENS_PANEL_MODE` | `in-page` (default), `auto`, or `native` |

### Extra `.env` model presets

Use slots `1` through `5` to preload models before opening the extension UI:

```env
# provider: gemini | openai | claude | custom | claude-agent | codex-agent | antigravity-agent | copilot-agent
CONTEXTLENS_EXTRA_MODEL_1_NAME=DeepSeek Flash
CONTEXTLENS_EXTRA_MODEL_1_PROVIDER=custom
CONTEXTLENS_EXTRA_MODEL_1_API_KEY=your-key
CONTEXTLENS_EXTRA_MODEL_1_API_URL=https://provider.example/v1
CONTEXTLENS_EXTRA_MODEL_1_API_ENDPOINT=
CONTEXTLENS_EXTRA_MODEL_1_MODEL=deepseek-flash
CONTEXTLENS_EXTRA_MODEL_1_BRIDGE_URL=
CONTEXTLENS_EXTRA_MODEL_1_COMMAND_PATH=
```

Copy the group and change the index to `2`, `3`, `4`, or `5`. Empty or incomplete slots are ignored. After editing `.env`, run `pnpm run build:env` and reload the extension. Presets are never copied to browser-local model storage.

### Learning and assessment variables

| Variable | Purpose |
| --- | --- |
| `CONTEXTLENS_LEARNING_RESPONSE_LANGUAGE` | Default answer language, such as `zh-CN` |
| `CONTEXTLENS_LEARNING_TRANSLATION_ENABLED` | Whether learning answers include translation when useful |
| `CONTEXTLENS_LEARNING_CONTEXT_MODE` | `auto`, `manual`, or `custom` default |
| `CONTEXTLENS_LEARNING_MANUAL_LINES` | `0`, `5`, `10`, or `20` |
| `CONTEXTLENS_LEARNING_CONTEXT_ASSESSMENT_ENABLED` | Allows automatic Jev/LLM sufficiency assessment |
| `CONTEXTLENS_JEV_ENABLED` | Enables the TypeSafe Jev primary assessment route |
| `CONTEXTLENS_LLM_ASSESSMENT_ENABLED` | Enables LLM JSON fallback assessment |
| `CONTEXTLENS_LEARNING_REQUEST_TIMEOUT_MS` | Total learning workflow timeout, default `90000` |
| `CONTEXTLENS_LEARNING_ASSESSMENT_TIMEOUT_MS` | Per-assessment timeout, default `15000` |

When both Jev and LLM assessment are disabled, automatic context mode answers from the selection only and clearly reports that no sufficiency decision ran.

### Local API models and local Agents

`CONTEXTLENS_USE_LOCAL_MODEL=true` selects `CONTEXTLENS_LOCAL_API_*` variables for an Ollama, LM Studio, vLLM, or other compatible endpoint.

Local CLI Agents are different: set `CONTEXTLENS_USE_LOCAL_AGENT=true`, choose a `CONTEXTLENS_LOCAL_AGENT_PROVIDER`, and start the Bridge:

```powershell
pnpm run bridge
```

`CONTEXTLENS_BRIDGE_URL` defaults to `http://localhost:3100`. It is required only for `*-agent` providers; regular Gemini, OpenAI, Claude, and compatible API models do not use it. If both local API and local Agent flags are enabled, the Agent has priority. Local Agents skip short context-assessment calls to avoid launching an extra CLI process.

## Existing capabilities and architecture

The project retains ContextLens’s original capabilities: right-click entry points, code/table/heading extraction, optional full-page reference in the legacy native panel, native side-panel conversations, URL model rules, and local Agent Bridge support.

```text
selection / right-click
  -> content.js extracts contextData
  -> background/panel-capabilities.js selects in-page or native host
  -> fallback/in-page-panel.js renders ContextAnswer by default
  -> background/fallback-chat.js orchestrates assessment and SSE answer streaming
  -> shared/learning-memory.js persists scoped learning memory after completion
```

Important directories:

| Path | Responsibility |
| --- | --- |
| `content.js` | Selection, context-menu element, DOM and context-window extraction |
| `background.js` | Browser message routing and panel lifecycle |
| `background/fallback-chat.js` | In-page API/Agent streaming, cancellation, assessment, and memory-summary calls |
| `fallback/` | Shadow DOM ContextAnswer UI, renderer, drag behavior, and i18n |
| `shared/` | Prompts, options, models, preferences, history, memory, diagnostics, and timelines |
| `sidepanel/` | Existing native side-panel implementation and generated local configuration |
| `bridge/` | Optional local Node Agent Bridge |

## Privacy and diagnostics

- `.env` and generated `sidepanel/config.local.js` are ignored by Git. Never commit keys.
- Browser-added models are saved in `chrome.storage.local`; they can contain keys and must not be exported casually.
- LLM timeline and diagnostic storage never retains keys, URLs, prompts, selections, headers, answer text, or reasoning content.
- User-visible answer history and learning memory intentionally retain bounded answer text in separate storage keys; they are never mixed into logs.
- In-page panels cannot run on browser internal pages, extension stores, or pages where content scripts are blocked.

## Development checks

```powershell
pnpm run check
pnpm run build:env
```

Use `AGENTS.md` for detailed module contracts, persistence boundaries, and future-maintenance rules.

## Origin and license

This project is based on [cola-sk/context-lens](https://github.com/cola-sk/context-lens). License: MIT.
