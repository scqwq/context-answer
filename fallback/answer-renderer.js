/** 网页内面板回答渲染器：安全渲染有限 Markdown，绝不把模型文本作为 HTML 注入。 */
(function registerAnswerRenderer(global) {
  function appendInline(parent, value) {
    const parts = String(value || "").split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith("`") && part.endsWith("`")) {
        const code = document.createElement("code");
        code.textContent = part.slice(1, -1);
        parent.appendChild(code);
      } else if (part.startsWith("**") && part.endsWith("**")) {
        const strong = document.createElement("strong");
        strong.textContent = part.slice(2, -2);
        parent.appendChild(strong);
      } else {
        parent.appendChild(document.createTextNode(part));
      }
    }
  }

  function render(container, markdown) {
    const fragment = document.createDocumentFragment();
    const lines = String(markdown || "").replace(/\r/g, "").split("\n");
    let paragraph = [];
    let list = null;
    function flushParagraph() {
      if (!paragraph.length) return;
      const node = document.createElement("p");
      appendInline(node, paragraph.join(" "));
      fragment.appendChild(node);
      paragraph = [];
    }
    function flushList() {
      if (!list) return;
      fragment.appendChild(list);
      list = null;
    }
    for (const rawLine of lines) {
      const line = rawLine.trim();
      const heading = line.match(/^#{1,3}\s+(.+)$/);
      const bullet = line.match(/^(?:[-*]|\d+\.)\s+(.+)$/);
      if (heading) {
        flushParagraph(); flushList();
        const node = document.createElement("h2");
        appendInline(node, heading[1]);
        fragment.appendChild(node);
      } else if (bullet) {
        flushParagraph();
        if (!list) list = document.createElement("ul");
        const item = document.createElement("li");
        appendInline(item, bullet[1]);
        list.appendChild(item);
      } else if (!line) {
        flushParagraph(); flushList();
      } else {
        flushList();
        paragraph.push(line);
      }
    }
    flushParagraph(); flushList();
    container.replaceChildren(fragment);
  }

  global.ContextLensAnswerRenderer = { render };
})(globalThis);
