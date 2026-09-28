/** 学习模式记忆：按选区身份保存近期问答，并为后台低频摘要提供受限数据。 */
(function registerLearningMemory(global) {
  const STORAGE_KEY = "contextAnswerLearningMemory";
  const MAX_SCOPES = 8;
  const MAX_TURNS = 20;
  const RECENT_TURNS = 4;
  const SUMMARY_TRIGGER = 8;
  const SUMMARY_INTERVAL = 4;
  const MAX_QUESTION_CHARS = 900;
  const MAX_ANSWER_CHARS = 8000;
  const MAX_SUMMARY_CHARS = 5000;
  let writeChain = Promise.resolve();

  function trim(value, maxLength) {
    const text = String(value || "").trim();
    return text.length > maxLength ? `${text.slice(0, maxLength)}\n（已按本地记忆容量限制截断）` : text;
  }

  function normalizeText(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
  function originOf(pageUrl) { try { return new URL(String(pageUrl || "")).origin; } catch { return ""; } }

  async function fingerprint({ context = {}, pageUrl = "", sourceLanguage = "auto" } = {}) {
    const source = [originOf(pageUrl), String(sourceLanguage || "auto"), normalizeText(context.selectedText)].join("\n");
    const bytes = new TextEncoder().encode(source);
    if (global.crypto?.subtle) {
      const digest = await global.crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
    }
    let hash = 2166136261;
    bytes.forEach((value) => { hash = Math.imul(hash ^ value, 16777619); });
    return `fallback-${(hash >>> 0).toString(16)}`;
  }

  function normalizeTurn(turn = {}) {
    const question = trim(turn.question, MAX_QUESTION_CHARS);
    const answer = trim(turn.answer, MAX_ANSWER_CHARS);
    return question && answer ? { question, answer, createdAt: String(turn.createdAt || new Date().toISOString()) } : null;
  }

  function normalizeScope(scope = {}) {
    const turns = Array.isArray(scope.turns) ? scope.turns.map(normalizeTurn).filter(Boolean).slice(-MAX_TURNS) : [];
    return {
      key: String(scope.key || ""), updatedAt: String(scope.updatedAt || new Date().toISOString()),
      summary: trim(scope.summary, MAX_SUMMARY_CHARS),
      summarizedThrough: Math.max(0, Math.min(Number(scope.summarizedThrough) || 0, turns.length)), turns
    };
  }

  async function readAll() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY].map(normalizeScope).filter((scope) => scope.key) : [];
  }

  async function write(mutator) {
    writeChain = writeChain.catch(() => undefined).then(async () => {
      const current = await readAll();
      const next = mutator(current) || current;
      await chrome.storage.local.set({ [STORAGE_KEY]: next.map(normalizeScope).slice(-MAX_SCOPES) });
    });
    return writeChain;
  }

  function presentation(scope) {
    return { summary: scope.summary, recentTurns: scope.turns.slice(-RECENT_TURNS).map((turn) => ({ question: turn.question, answer: turn.answer })) };
  }

  async function get(input) {
    const key = await fingerprint(input);
    const scopes = await readAll();
    return { key, memory: presentation(scopes.find((item) => item.key === key) || normalizeScope({ key })) };
  }

  function nextSummaryTask(scope) {
    const target = scope.turns.length - RECENT_TURNS;
    if (scope.turns.length < SUMMARY_TRIGGER || target <= scope.summarizedThrough || target - scope.summarizedThrough < SUMMARY_INTERVAL) return null;
    return {
      key: scope.key, from: scope.summarizedThrough, through: target, previousSummary: scope.summary,
      turns: scope.turns.slice(scope.summarizedThrough, target).map((turn) => ({ question: trim(turn.question, 600), answer: trim(turn.answer, 2400) }))
    };
  }

  async function append(key, turn) {
    const normalized = normalizeTurn(turn);
    if (!key || !normalized) return null;
    let task = null;
    await write((scopes) => {
      const index = scopes.findIndex((scope) => scope.key === key);
      const previous = index >= 0 ? normalizeScope(scopes[index]) : normalizeScope({ key });
      const allTurns = [...previous.turns, normalized];
      const turns = allTurns.slice(-MAX_TURNS);
      const dropped = allTurns.length - turns.length;
      const updated = {
        ...previous, updatedAt: new Date().toISOString(), turns,
        // 摘要保留已裁掉的旧事实；同步移动游标，仍然按每四轮低频更新。
        summary: previous.summary,
        summarizedThrough: Math.max(0, previous.summarizedThrough - dropped)
      };
      task = nextSummaryTask(updated);
      if (index >= 0) scopes[index] = updated;
      else scopes.push(updated);
      return scopes;
    });
    return task;
  }

  async function applySummary(task, summary) {
    const cleaned = trim(summary, MAX_SUMMARY_CHARS);
    if (!task?.key || !cleaned) return false;
    let saved = false;
    await write((scopes) => {
      const index = scopes.findIndex((scope) => scope.key === task.key);
      if (index < 0) return scopes;
      const scope = normalizeScope(scopes[index]);
      if (scope.summarizedThrough > task.from) return scopes;
      scopes[index] = { ...scope, summary: cleaned, summarizedThrough: Math.min(task.through, scope.turns.length), updatedAt: new Date().toISOString() };
      saved = true;
      return scopes;
    });
    return saved;
  }

  global.ContextAnswerLearningMemory = { STORAGE_KEY, MAX_TURNS, RECENT_TURNS, get, append, applySummary };
})(globalThis);
