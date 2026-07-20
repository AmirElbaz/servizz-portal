import { linter, type Diagnostic } from "@codemirror/lint";
import { getLinter } from "./harper";

// A CodeMirror 6 lint source backed by Harper. Each Harper lint becomes a
// CodeMirror Diagnostic — which renders as an inline (red/amber) underline
// with a hover tooltip whose action buttons apply Harper's suggestions in
// place. This is the Grammarly-style "squiggle + click to fix" UX.
//
// We capture only PRIMITIVES (offsets + replacement strings) inside the map,
// never the WASM-backed Lint/Suggestion objects — those may be freed after the
// lint callback returns, so holding them across the later (on-click) apply()
// would be unsafe.
//
// Harper SuggestionKind at runtime: 0 = Replace, 1 = Remove, 2 = InsertAfter.
export const harperLinter = linter(
  async (view): Promise<readonly Diagnostic[]> => {
    const text = view.state.doc.toString();
    if (!text.trim()) return [];

    const engine = await getLinter();
    // 'plaintext' so prose isn't parsed as Markdown (e.g. a stray * or #).
    const lints = await engine.lint(text, { language: "plaintext" });

    return lints.map((l): Diagnostic => {
      const span = l.span();
      const kind = l.lint_kind();
      return {
        from: span.start,
        to: span.end,
        severity: kind === "Spelling" || kind === "Typo" ? "error" : "warning",
        source: kind,
        message: l.message(),
        actions: l.suggestions().slice(0, 5).map((s) => {
          const repl = s.get_replacement_text();
          const sk = s.kind() as unknown as number;
          return {
            name: sk === 1 ? "Remove" : repl && repl.length ? repl : "Apply",
            apply(v, aFrom, aTo) {
              if (sk === 2) v.dispatch({ changes: { from: aTo, insert: repl } });
              else v.dispatch({ changes: { from: aFrom, to: aTo, insert: repl } });
            },
          };
        }),
      };
    });
  },
  { delay: 600 } // debounce: lint after the user pauses typing
);
