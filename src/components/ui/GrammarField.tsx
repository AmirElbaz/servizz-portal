import { lazy, Suspense } from "react";
import type { GrammarTextAreaProps } from "./GrammarTextArea";

// Lazy boundary: CodeMirror + the Harper glue only load when a narrative field
// is actually rendered, keeping them out of the main record-page chunk. While
// the editor loads, a plain (read-only) textarea stands in so there's no
// layout jump.
const GrammarTextArea = lazy(() => import("./GrammarTextArea"));

export default function GrammarField(props: GrammarTextAreaProps) {
  return (
    <Suspense
      fallback={
        <textarea
          rows={4}
          value={props.value}
          readOnly
          placeholder={props.placeholder}
          className={`w-full rounded-lg border px-3 py-2 text-sm leading-relaxed resize-y ${
            props.hasError
              ? "border-error/50 bg-error/5"
              : "border-on-surface-variant/10 bg-surface-container-high/50"
          }`}
        />
      }
    >
      <GrammarTextArea {...props} />
    </Suspense>
  );
}
