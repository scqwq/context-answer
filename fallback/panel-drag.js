/** 网页内面板拖拽：在 Shadow DOM 中保存并恢复安全的固定定位坐标。 */
(function registerPanelDrag(global) {
  const STORAGE_KEY = "contextAnswerInPagePosition";

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
  }

  async function restore(panel) {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const position = stored[STORAGE_KEY];
    if (!position || !Number.isFinite(position.left) || !Number.isFinite(position.top)) return;
    panel.style.left = `${clamp(position.left, 8, window.innerWidth - 80)}px`;
    panel.style.top = `${clamp(position.top, 8, window.innerHeight - 80)}px`;
    panel.style.right = "auto";
  }

  function attach(panel, handle) {
    let drag = null;
    void restore(panel);
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button, select, input, textarea")) return;
      const rect = panel.getBoundingClientRect();
      drag = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
      handle.setPointerCapture(event.pointerId);
      panel.classList.add("is-dragging");
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const rect = panel.getBoundingClientRect();
      const left = clamp(event.clientX - drag.offsetX, 8, window.innerWidth - rect.width - 8);
      const top = clamp(event.clientY - drag.offsetY, 8, window.innerHeight - rect.height - 8);
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.right = "auto";
    });
    const stop = (event) => {
      if (!drag) return;
      drag = null;
      panel.classList.remove("is-dragging");
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      const rect = panel.getBoundingClientRect();
      void chrome.storage.local.set({ [STORAGE_KEY]: { left: Math.round(rect.left), top: Math.round(rect.top) } });
    };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }

  global.ContextAnswerPanelDrag = { attach };
})(globalThis);
