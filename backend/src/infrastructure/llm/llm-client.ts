import { TestFramework } from '../../domain/enums/test-framework.enum';

export interface LlmGenerateParams {
  sourceFilePath: string;
  sourceFileContent: string;
  existingTestContent: string | null;
  contributingMd: string | null;
  agentsMd: string | null;
  packageJson: Record<string, unknown> | null;
  relatedFiles: Array<{ path: string; content: string }>;
  testFramework: TestFramework;
}

export abstract class LlmClient {
  abstract generateTests(
    params: LlmGenerateParams,
    onToken: (token: string) => void,
    signal?: AbortSignal,
  ): Promise<string>;

  protected buildPrompt(params: LlmGenerateParams): string {
    const isVitest = params.testFramework === TestFramework.VITEST;
    const sourceBasename = params.sourceFilePath.replace(/\.[^.]+$/, '.js').split('/').at(-1) ?? 'index.js';

    const runtimeExports = this.extractRuntimeExports(params.sourceFileContent);
    const exportList = runtimeExports.length > 0
      ? runtimeExports.map(n => `subject.${n}`).join(', ')
      : '(none — check the source carefully)';

    const truncate = (s: string, maxChars: number) =>
      s.length > maxChars ? s.slice(0, maxChars) + '\n... (truncated)' : s;

    const packageJsonSection = params.packageJson
      ? `PROJECT package.json:\n${truncate(JSON.stringify(params.packageJson, null, 2), 2000)}\n\n`
      : '';

    const contributingSection = params.contributingMd
      ? `CONTRIBUTING GUIDELINES (you MUST follow these when writing tests):\n${truncate(params.contributingMd, 2000)}\n\n`
      : '';

    const agentsSection = params.agentsMd
      ? `PROJECT CONVENTIONS (AGENTS.md / CLAUDE.md):\n${truncate(params.agentsMd, 2000)}\n\n`
      : '';

    const existingSection = params.existingTestContent
      ? `EXISTING TEST FILE (enhance this, do not start from scratch):\n${params.existingTestContent}`
      : 'EXISTING TEST FILE: none — create a new test file from scratch.';

    const frameworkLine = isVitest
      ? `TEST FRAMEWORK: vitest — import from "vitest" only what you actually use. If you need mocking, include vi; if not, omit it. Example with mocking: import { describe, it, expect, vi } from "vitest"; Example without: import { describe, it, expect } from "vitest";`
      : `TEST FRAMEWORK: jest — describe, it, and expect are globals, do NOT import them.`;

    return `You are an expert TypeScript test engineer. Your task is to generate a complete, high-quality test file.

SOURCE FILE PATH: ${params.sourceFilePath}

SOURCE FILE CONTENT:
${params.sourceFileContent}

${existingSection}

${contributingSection}${agentsSection}${packageJsonSection}${frameworkLine}

RUNTIME EXPORTS (the ONLY names available on the subject module at runtime): ${exportList}
Everything declared as "export type" is TypeScript-only — it does NOT exist at runtime. Do NOT reference it in expect() calls.

STRICT REQUIREMENTS:
- Output ONLY valid TypeScript source code. No markdown. No explanations. No prose. No code fences.
- Your entire response must be a single valid .ts file that can be saved directly.
- Import the module under test as: import * as subject from "./${sourceBasename}"; — use subject.<name> to access exports.
- Do NOT import packages that are not listed in the project's package.json.
- Do NOT use toHaveProperty(), toEqual(), or toMatchObject() on re-exported values or empty enum stubs — only assert existence with toBeDefined() or check typeof.
- Only use deep equality assertions for values whose exact structure is explicitly defined in the source file you were given.
- Target 100% statement, branch, function, and line coverage of runtime code.
- Use describe/it blocks with clear, descriptive test names.
- Cover all branches: happy paths, error paths, null/undefined inputs, boundary values.
- If the module uses async functions, use async/await in tests.
- Do not add comments explaining what you are doing — only test code.
- Prefix unused callback/function parameters with an underscore (e.g. \`_issue\`, \`_ctx\`) to satisfy noUnusedParameters TypeScript rules.

Begin your response immediately with the import statements. Do not write anything before the first import.`;
  }

  protected stripMarkdownFences(content: string): string {
    // If there's a complete code fence, extract only the content inside it.
    // Anything the model writes after the closing ``` (prose, explanations) is discarded.
    const fenceMatch = content.match(/^```(?:typescript|tsx?)?[ \t]*\r?\n([\s\S]*?)\n```/i);
    if (fenceMatch) {
      return fenceMatch[1].trim();
    }

    // No complete fence — model may have been cut off before the closing ```,
    // or it output raw code followed by a stray ``` and/or trailing prose.
    // Strip any opening fence, then remove trailing non-TypeScript lines.
    let result = content.replace(/^```(?:typescript|tsx?)?[ \t]*\r?\n/i, '').trim();

    // Drop leading prose lines before the first TypeScript-looking token
    const lines = result.split('\n');
    const firstCodeLine = lines.findIndex((line) =>
      /^\s*(import|export|const|let|var|function|class|describe|it|test|\/\/|\/\*)/.test(line),
    );
    if (firstCodeLine === -1) {
      return '';
    }
    const codeLines = firstCodeLine > 0 ? lines.slice(firstCodeLine) : lines;

    // Drop trailing lines that are clearly prose or stray fences (scan backwards)
    let lastCodeIdx = codeLines.length - 1;
    while (lastCodeIdx >= 0) {
      const trimmed = codeLines[lastCodeIdx].trim();
      if (trimmed === '') { lastCodeIdx--; continue; }
      if (
        /^[{}\[\]();,]/.test(trimmed) ||
        /^(import|export|const|let|var|function|class|describe|it|test|expect|return|throw|if|else|\/\/|\/\*|\*\/)/.test(trimmed) ||
        /^["'`]/.test(trimmed)
      ) {
        break;
      }
      lastCodeIdx--;
    }

    return codeLines.slice(0, lastCodeIdx + 1).join('\n');
  }

  protected looksLikeTypeScript(content: string): boolean {
    if (!content || content.trim().length === 0) return false;
    return (
      /^import\s+/m.test(content) ||
      /^\s*(?:describe|it|test)\s*\(/m.test(content) ||
      /^\s*(?:export\s+)?(?:const|let|var|function|class|enum)\s+\w+/m.test(content)
    );
  }

  protected fixSubjectImport(content: string, sourceFilePath: string): string {
    const basename = sourceFilePath.replace(/\.[^.]+$/, '').split('/').at(-1) ?? 'index';
    const correctSpecifier = `./${basename}.js`;
    const pattern = new RegExp(
      `^(import\\b[^'"]+from\\s+)(['"])([^'"]*\\b${basename}\\b[^'"]*)(['"])`,
      'gm',
    );
    return content.replace(pattern, `$1"${correctSpecifier}"`);
  }

  private extractRuntimeExports(source: string): string[] {
    const names = new Set<string>();

    for (const m of source.matchAll(/^export\s+(?:const|let|var|function\*?|class|enum)\s+(\w+)/gm)) {
      names.add(m[1]);
    }

    for (const m of source.matchAll(/^export\s+(?!type\b)\{([^}]+)\}/gm)) {
      for (const part of m[1].split(',')) {
        const alias = part.trim().split(/\s+as\s+/).at(-1)?.trim();
        if (alias && /^\w+$/.test(alias)) names.add(alias);
      }
    }

    return [...names].sort();
  }
}
