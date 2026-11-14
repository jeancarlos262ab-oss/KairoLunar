import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

function loadTypeScript() {
  try {
    const mod = require("typescript");
    const resolved = mod?.default ?? mod;
    if (resolved && typeof resolved.readConfigFile === "function") {
      return resolved;
    }
  } catch {
    // Fall back to bundled TypeScript in VS Code / Antigravity IDE.
  }

  const localAppData = process.env.LOCALAPPDATA ?? "";
    const candidates = [
      path.join(
        localAppData,
        "Programs",
        "Antigravity IDE",
        "resources",
        "app",
        "extensions",
        "node_modules",
        "typescript",
        "lib",
        "typescript.js",
      ),
      path.join(
        localAppData,
        "Programs",
        "Microsoft VS Code",
        "resources",
        "app",
        "extensions",
        "node_modules",
        "typescript",
        "lib",
        "typescript.js",
      ),
    ];

    const vscodeDir = path.join(localAppData, "Programs", "Microsoft VS Code");
    if (fs.existsSync(vscodeDir)) {
      for (const entry of fs.readdirSync(vscodeDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          candidates.push(
            path.join(
              vscodeDir,
              entry.name,
              "resources",
              "app",
              "extensions",
              "node_modules",
              "typescript",
              "lib",
              "typescript.js",
            ),
          );
        }
      }
    }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const mod = require(candidate);
      const resolved = mod?.default ?? mod;
      if (resolved && typeof resolved.readConfigFile === "function") {
        return resolved;
      }
    }
  }

  console.error(
    "Error: TypeScript compiler not found. Install 'typescript' or run from an environment with VS Code / Antigravity IDE.",
  );
  process.exit(1);
}

const ts = loadTypeScript();
const noEmit = process.argv.includes("--noEmit");
const tsconfigPath = path.join(projectRoot, "tsconfig.json");
const readFileUtf8 = (filePath) => fs.readFileSync(filePath, "utf8");
const configFile = ts.readConfigFile(tsconfigPath, readFileUtf8);

if (configFile.error) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext([configFile.error], {
      getCurrentDirectory: () => projectRoot,
      getCanonicalFileName: (f) => f,
      getNewLine: () => "\n",
    }),
  );
  process.exit(1);
}

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectRoot);
if (noEmit) {
  parsed.options.noEmit = true;
}

const program = ts.createProgram({
  rootNames: parsed.fileNames,
  options: parsed.options,
});
const emitResult = program.emit();
const diagnostics = ts
  .getPreEmitDiagnostics(program)
  .concat(emitResult.diagnostics);

if (diagnostics.length > 0) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => projectRoot,
      getCanonicalFileName: (f) => f,
      getNewLine: () => "\n",
    }),
  );
}

if (emitResult.emitSkipped && !noEmit) {
  process.exit(1);
}

const hasErrors = diagnostics.some(
  (d) => d.category === ts.DiagnosticCategory.Error,
);
if (hasErrors) {
  process.exit(1);
}

console.log(
  noEmit
    ? `TypeScript check passed (${parsed.fileNames.length} files, tsc ${ts.version}).`
    : `TypeScript build succeeded -> dist/ (${parsed.fileNames.length} files, tsc ${ts.version}).`,
);
