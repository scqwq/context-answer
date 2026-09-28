/** 学习回答历史：将用户主动要求保留的问题与最终回答限量保存到扩展本地存储。 */
(function registerLearningHistory(global) {
  const STORAGE_KEY = "contextLensLearningAnswerHistory";
  const MAX_ENTRIES = 30;
  const MAX_ANSWER_CHARS = 16000;
  const MAX_QUESTION_CHARS = 1200;
  const MAX_SCOPE_KEY_CHARS = 128;
  let writeChain = Promise.resolve();

  function limitText(value, maxLength) {
    const text = String(value || "").trim();
    return text.length > maxLength ? `${text.slice(0, maxLength)}\n\n（历史回答已按本地容量限制截断）` : text;
  }

  function createId() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    return `learning-history-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  // 仅接收学习记忆生成的哈希键，用于历史分组；不保存选区或页面地址。
  function normalizeScopeKey(value) {
    const key = String(value || "").trim();
    return /^[a-z0-9-]{8,128}$/i.test(key) ? key.slice(0, MAX_SCOPE_KEY_CHARS) : "";
  }

  function normalizeEntry(entry) {
    if (!entry || typeof entry.answer !== "string" || !entry.answer.trim()) return null;
    return {
      id: String(entry.id || createId()),
      createdAt: String(entry.createdAt || new Date().toISOString()),
      question: limitText(entry.question || "一键学习解释", MAX_QUESTION_CHARS),
      answer: limitText(entry.answer, MAX_ANSWER_CHARS),
      surface: String(entry.surface || "learning-panel").slice(0, 80),
      scopeKey: normalizeScopeKey(entry.scopeKey)
    };
  }

  function enqueue(mutator) {
    writeChain = writeChain
      .catch(() => undefined)
      .then(async () => {
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        const entries = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
        const next = mutator(entries.map(normalizeEntry).filter(Boolean)) || entries;
        await chrome.storage.local.set({ [STORAGE_KEY]: next.slice(-MAX_ENTRIES) });
      });
    return writeChain;
  }

  function save({ question, answer, surface, scopeKey } = {}) {
    const entry = normalizeEntry({
      id: createId(),
      createdAt: new Date().toISOString(),
      question,
      answer,
      surface,
      scopeKey
    });
    if (!entry) return Promise.resolve(null);
    return enqueue((entries) => [...entries, entry]).then(() => entry);
  }

  async function list(limit = MAX_ENTRIES) {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const entries = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
    return entries
      .map(normalizeEntry)
      .filter(Boolean)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, Math.max(1, Math.min(Number(limit) || MAX_ENTRIES, MAX_ENTRIES)));
  }

  async function listConversations(limit = MAX_ENTRIES) {
    const entries = await list(limit);
    const groups = new Map();
    entries.forEach((entry) => {
      // 旧记录没有分组键，必须独立展示，避免把无关问答错误合并。
      const key = entry.scopeKey || `legacy-${entry.id}`;
      const existing = groups.get(key);
      if (existing) existing.entries.push(entry);
      else groups.set(key, { key, legacy: !entry.scopeKey, latestAt: entry.createdAt, entries: [entry] });
    });
    return Array.from(groups.values()).map((conversation) => ({
      ...conversation,
      entries: conversation.entries.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    }));
  }

  global.ContextLensLearningHistory = { save, list, listConversations };
})(globalThis);
