import { useEffect, useRef, type ClipboardEvent } from "react";

// Lightweight, dependency-free rich-text editor for report narrative fields.
// Outputs a constrained HTML subset (b/i/u, span style color/background, ul/ol/li,
// div/p, br) that the backend PDF generator parses into QuestPDF formatting.
// Uncontrolled (seeded once from `value`) so the caret never jumps while typing —
// changes are pushed up via onChange; the parent never writes back into the DOM.

type Cmd = { icon: string; title: string; run: () => void };

// Strip anything the PDF parser won't honour and anything unsafe before saving.
function sanitize(html: string): string {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

// ── Paste normalization ────────────────────────────────────────────────────
// Pasting from a PDF either drops plain text (whose line/paragraph breaks the
// browser then mangles) or a soup of absolutely-positioned <span>s, so structure
// is lost. Canva pastes clean semantic HTML and already works. We normalise BOTH
// into the same constrained subset the PDF generator understands — block breaks
// become <div>/lists, emphasis is recovered from tags AND inline styles (so
// Canva's style-driven bold/colour survives), everything else is dropped.

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const BLOCK_TAGS = new Set([
  "P", "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "MAIN", "ASIDE",
  "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "TR", "PRE", "TABLE",
]);

function parseStyle(el: Element): Record<string, string> {
  const map: Record<string, string> = {};
  for (const decl of (el.getAttribute("style") || "").split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (prop && val) map[prop] = val;
  }
  return map;
}

// Recover emphasis + colour from inline styles and wrap `inner` accordingly.
function applyStyle(inner: string, el: Element): string {
  if (inner.replace(/<[^>]+>/g, "").trim().length === 0) return inner;
  const st = parseStyle(el);
  let s = inner;
  const w = (st["font-weight"] || "").trim();
  if (w === "bold" || w === "bolder" || (/^\d+$/.test(w) && parseInt(w, 10) >= 600)) s = `<b>${s}</b>`;
  if ((st["font-style"] || "").includes("italic")) s = `<i>${s}</i>`;
  if ((st["text-decoration"] || st["text-decoration-line"] || "").includes("underline")) s = `<u>${s}</u>`;
  const decls: string[] = [];
  if (st["color"]) decls.push(`color: ${st["color"]}`);
  const bg = st["background-color"];
  if (bg && bg !== "transparent") decls.push(`background-color: ${bg}`);
  if (decls.length) s = `<span style="${decls.join("; ")}">${s}</span>`;
  return s;
}

// Inline content of a node → constrained HTML (emphasis + colour + <br>).
function renderInline(node: Node): string {
  if (node.nodeType === 3) return escapeText((node.textContent ?? "").replace(/\s+/g, " "));
  if (node.nodeType !== 1) return "";
  const el = node as Element;
  const tag = el.tagName;
  if (tag === "BR") return "<br>";
  let inner = Array.from(el.childNodes).map(renderInline).join("");
  const hasText = inner.replace(/<[^>]+>/g, "").trim().length > 0;
  if (hasText) {
    if (tag === "B" || tag === "STRONG") inner = `<b>${inner}</b>`;
    else if (tag === "I" || tag === "EM") inner = `<i>${inner}</i>`;
    else if (tag === "U" || tag === "INS") inner = `<u>${inner}</u>`;
    else if (tag === "MARK") inner = `<mark>${inner}</mark>`;
    inner = applyStyle(inner, el);
  }
  return inner;
}

// Walk a container, emitting one block per paragraph/heading/list — grouping
// runs of inline siblings so a paragraph built of spans stays one <div>.
function renderContainer(container: ParentNode, out: string[]): void {
  let buf = "";
  const flush = () => {
    const t = buf.trim();
    if (t) out.push(`<div>${t}</div>`);
    buf = "";
  };
  container.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      buf += escapeText((child.textContent ?? "").replace(/\s+/g, " "));
      return;
    }
    if (child.nodeType !== 1) return;
    const el = child as Element;
    const tag = el.tagName;
    if (tag === "BR") { buf += "<br>"; return; }
    if (tag === "UL" || tag === "OL") {
      flush();
      const items = Array.from(el.children)
        .filter((c) => c.tagName === "LI")
        .map((li) => `<li>${renderInline(li).trim()}</li>`)
        .filter((s) => s.replace(/<[^>]+>/g, "").trim().length > 0);
      if (items.length) out.push(`<${tag.toLowerCase()}>${items.join("")}</${tag.toLowerCase()}>`);
      return;
    }
    if (BLOCK_TAGS.has(tag)) {
      flush();
      const hasBlockChild = Array.from(el.children).some(
        (c) => BLOCK_TAGS.has(c.tagName) || c.tagName === "UL" || c.tagName === "OL"
      );
      if (hasBlockChild) renderContainer(el, out);
      else {
        const inner = renderInline(el).trim();
        if (inner) out.push(`<div>${inner}</div>`);
      }
      return;
    }
    // inline element → keep accumulating into the current paragraph buffer
    buf += renderInline(el);
  });
  flush();
}

function normalizePastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,meta,title,link,head").forEach((n) => n.remove());
  const out: string[] = [];
  renderContainer(doc.body, out);
  return out.join("");
}

// Plain text (the common PDF case): blank lines split paragraphs; single
// newlines become <br> so the on-page line structure survives.
function plainTextToHtml(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((para) => {
      const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);
      return lines.length ? `<div>${lines.map(escapeText).join("<br>")}</div>` : "";
    })
    .filter(Boolean)
    .join("");
}

export default function RichTextField({
  value,
  onChange,
  disabled,
  placeholder,
  hasError,
  justify,
}: {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
  hasError?: boolean;
  // Render the prose justified (flush both margins) — only the Executive
  // Summary uses this, mirroring the PDF.
  justify?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Seed ONCE — like the grid buffer, the DOM is the source of truth afterwards.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emit() {
    if (ref.current) onChange(sanitize(ref.current.innerHTML));
  }

  // Normalise pasted content (PDFs especially) into our constrained subset so
  // structure survives, then insert it at the caret. Falls back to plain text.
  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const cd = e.clipboardData;
    if (!cd) return;
    const html = cd.getData("text/html");
    const text = cd.getData("text/plain");
    let cleaned = "";
    if (html && html.trim()) cleaned = normalizePastedHtml(html);
    if (!cleaned && text) cleaned = plainTextToHtml(text);
    if (!cleaned) return; // nothing usable — let the browser handle it
    e.preventDefault();
    ref.current?.focus();
    try {
      document.execCommand("insertHTML", false, cleaned);
    } catch {
      document.execCommand("insertText", false, text);
    }
    emit();
  }

  function exec(command: string, val?: string) {
    if (disabled) return;
    ref.current?.focus();
    // styleWithCSS → colour/highlight emit <span style> rather than <font>, which
    // is what the PDF parser expects.
    try { document.execCommand("styleWithCSS", false, "true"); } catch { /* ignore */ }
    try { document.execCommand(command, false, val); } catch { /* ignore */ }
    emit();
  }

  function highlight(color: string) {
    if (disabled) return;
    ref.current?.focus();
    try { document.execCommand("styleWithCSS", false, "true"); } catch { /* ignore */ }
    // hiliteColor (Firefox) / backColor (Chrome) — try both.
    if (!document.execCommand("hiliteColor", false, color))
      document.execCommand("backColor", false, color);
    emit();
  }

  const cmds: Cmd[] = [
    { icon: "format_bold", title: "Bold", run: () => exec("bold") },
    { icon: "format_italic", title: "Italic", run: () => exec("italic") },
    { icon: "format_underlined", title: "Underline", run: () => exec("underline") },
    { icon: "format_list_bulleted", title: "Bullet list", run: () => exec("insertUnorderedList") },
    { icon: "format_list_numbered", title: "Numbered list", run: () => exec("insertOrderedList") },
    { icon: "format_clear", title: "Clear formatting", run: () => exec("removeFormat") },
  ];

  const btn =
    "w-7 h-7 inline-flex items-center justify-center rounded-md text-on-surface-variant/70 hover:bg-surface-container-high hover:text-on-surface transition-colors disabled:opacity-40";

  return (
    <div
      className={`rounded-lg border ${hasError ? "border-error/60" : "border-on-surface-variant/15"} bg-surface-container-high/30 focus-within:border-primary/40 overflow-hidden`}
    >
      <div className="flex items-center gap-0.5 flex-wrap px-1.5 py-1 border-b border-on-surface-variant/10 bg-surface-container-low/40">
        {cmds.slice(0, 3).map((c) => (
          <button key={c.icon} type="button" title={c.title} disabled={disabled}
            onMouseDown={(e) => e.preventDefault()} onClick={c.run} className={btn}>
            <span className="material-symbols-outlined text-[18px]">{c.icon}</span>
          </button>
        ))}
        {/* Text colour */}
        <label title="Text colour" className={`${btn} relative cursor-pointer`}>
          <span className="material-symbols-outlined text-[18px]">format_color_text</span>
          <input type="color" disabled={disabled} defaultValue="#1b2a3a"
            onChange={(e) => exec("foreColor", e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
        {/* Highlight */}
        <label title="Highlight" className={`${btn} relative cursor-pointer`}>
          <span className="material-symbols-outlined text-[18px]">format_ink_highlighter</span>
          <input type="color" disabled={disabled} defaultValue="#fde68a"
            onChange={(e) => highlight(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
        <span className="w-px h-4 bg-on-surface-variant/15 mx-0.5" />
        {cmds.slice(3).map((c) => (
          <button key={c.icon} type="button" title={c.title} disabled={disabled}
            onMouseDown={(e) => e.preventDefault()} onClick={c.run} className={btn}>
            <span className="material-symbols-outlined text-[18px]">{c.icon}</span>
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emit}
        onPaste={onPaste}
        data-placeholder={placeholder ?? "Type here…"}
        className={`rte-content min-h-[120px] px-3 py-2 text-sm text-on-surface leading-relaxed focus:outline-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 ${justify ? "text-justify" : ""}`}
      />
    </div>
  );
}
