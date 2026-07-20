import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { harperLinter } from "../../utils/harperLinter";

// Make CodeMirror read like a plain prose textarea (not a code editor): the
// app's sans font, comfortable padding/leading, no focus outline (the wrapper
// shows focus), transparent background (the wrapper paints it).
const proseTheme = EditorView.theme({
  "&": { fontSize: "14px", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit" },
  ".cm-content": {
    fontFamily: "inherit",
    padding: "8px 12px",
    lineHeight: "1.6",
    caretColor: "#1B2A3A",
  },
  ".cm-line": { padding: "0" },
  ".cm-placeholder": { color: "#9aa3ad" },

  // ── Suggestion popup (the lint tooltip) — modern restyle ──────────────
  ".cm-tooltip": {
    borderRadius: "12px",
    border: "1px solid rgba(27,42,58,0.08)",
    backgroundColor: "#ffffff",
    boxShadow: "0 14px 38px -10px rgba(12,30,51,0.28)",
    fontFamily: "inherit",
    overflow: "hidden",
  },
  ".cm-tooltip.cm-tooltip-arrow:before, .cm-tooltip.cm-tooltip-arrow:after": {
    display: "none",
  },
  ".cm-tooltip-lint": {
    padding: "4px",
    margin: "0",
    maxWidth: "320px",
  },
  ".cm-diagnostic": {
    listStyle: "none",
    fontFamily: "inherit",
    fontSize: "12.5px",
    lineHeight: "1.5",
    color: "#1B2A3A",
    padding: "9px 11px",
    margin: "0",
    borderRadius: "9px",
    borderLeft: "3px solid transparent",
  },
  ".cm-diagnostic-error": {
    borderLeftColor: "#dc2626",
    backgroundColor: "rgba(220,38,38,0.045)",
  },
  ".cm-diagnostic-warning": {
    borderLeftColor: "#d97706",
    backgroundColor: "rgba(217,119,6,0.045)",
  },
  ".cm-diagnosticSource": {
    fontSize: "9px",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#6B7682",
    display: "block",
    marginBottom: "4px",
  },
  ".cm-diagnosticAction": {
    fontFamily: "inherit",
    fontSize: "11.5px",
    fontWeight: "600",
    color: "#ffffff",
    backgroundColor: "#2EB2FF",
    borderRadius: "8px",
    padding: "4px 11px",
    marginTop: "9px",
    marginRight: "6px",
    border: "none",
    cursor: "pointer",
    display: "inline-block",
    transition: "background-color 120ms ease",
  },
  ".cm-diagnosticAction:hover": { backgroundColor: "#1a9eea" },
});

export interface GrammarTextAreaProps {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  placeholder?: string;
  hasError?: boolean;
  minHeight?: string;
}

// A prose editor with inline Harper grammar/spell underlines. Drop-in for the
// narrative <textarea> on report/record fields.
export default function GrammarTextArea({
  value,
  onChange,
  disabled,
  placeholder,
  hasError,
  minHeight = "96px",
}: GrammarTextAreaProps) {
  return (
    <div
      className={`rounded-lg border transition-colors overflow-hidden ${
        hasError
          ? "border-error/50 bg-error/5"
          : "border-on-surface-variant/10 bg-surface-container-high/50"
      } focus-within:bg-white focus-within:border-primary/30`}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        editable={!disabled}
        readOnly={disabled}
        placeholder={placeholder}
        minHeight={minHeight}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          highlightSelectionMatches: false,
          autocompletion: false,
          searchKeymap: false,
          bracketMatching: false,
          closeBrackets: false,
          indentOnInput: false,
        }}
        extensions={[EditorView.lineWrapping, proseTheme, harperLinter]}
      />
    </div>
  );
}
