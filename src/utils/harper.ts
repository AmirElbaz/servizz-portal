import type { Linter } from "harper.js";

// One app-wide Harper linter, constructed lazily. The WASM binary (~2-3 MB)
// and its web worker only load the first time a grammar field needs them
// (via the dynamic imports below), so they never touch the initial bundle.
//
// Why Harper over the browser's native spellcheck: Harper bundles its OWN
// English dictionary and runs entirely on-device, so spell/grammar checking
// works regardless of the browser/OS language. Native spellcheck depends on
// the user having an English dictionary enabled — which the Arabic-locale
// hosts here do not, hence "the spellcheck ain't working".
let linterPromise: Promise<Linter> | null = null;

export function getLinter(): Promise<Linter> {
  if (!linterPromise) {
    linterPromise = (async () => {
      const { LocalLinter, Dialect } = await import("harper.js");
      const { binary } = await import("harper.js/binary");
      // LocalLinter (main thread) over WorkerLinter: our fields are short
      // paragraphs, so main-thread linting is imperceptible, and it avoids
      // web-worker bundling fragility in the production build.
      // Servizz.gov is Maltese government → British English.
      const linter = new LocalLinter({ binary, dialect: Dialect.British });
      await linter.setup(); // downloads + compiles the WASM once
      return linter;
    })();
  }
  return linterPromise;
}
