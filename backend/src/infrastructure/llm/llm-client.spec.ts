import { LlmClient, LlmGenerateParams } from './llm-client';
import { TestFramework } from '../../domain/enums/test-framework.enum';

/** Concrete subclass that exposes all protected methods for testing */
class TestLlmClient extends LlmClient {
  async generateTests(): Promise<string> {
    return '';
  }

  // Re-export protected methods as public for testing
  buildPromptPublic(params: LlmGenerateParams): string {
    return this.buildPrompt(params);
  }
  stripFences(content: string): string {
    return this.stripMarkdownFences(content);
  }
  looksLikeTs(content: string): boolean {
    return this.looksLikeTypeScript(content);
  }
  fixImport(content: string, sourceFilePath: string): string {
    return this.fixSubjectImport(content, sourceFilePath);
  }
}

function baseParams(overrides: Partial<LlmGenerateParams> = {}): LlmGenerateParams {
  return {
    sourceFilePath: 'src/utils.ts',
    sourceFileContent: 'export const add = (a: number, b: number) => a + b;',
    existingTestContent: null,
    contributingMd: null,
    agentsMd: null,
    packageJson: null,
    relatedFiles: [],
    testFramework: TestFramework.JEST,
    ...overrides,
  };
}

describe('LlmClient', () => {
  let client: TestLlmClient;

  beforeEach(() => {
    client = new TestLlmClient();
  });

  // ---------------------------------------------------------------------------
  describe('buildPrompt', () => {
    it('starts with import statement instruction (no leading prose)', () => {
      const prompt = client.buildPromptPublic(baseParams());
      expect(prompt.trim().split('\n').at(0)).toContain('You are an expert TypeScript test engineer');
    });

    it('contains the source file path', () => {
      const prompt = client.buildPromptPublic(baseParams({ sourceFilePath: 'src/special/thing.ts' }));
      expect(prompt).toContain('src/special/thing.ts');
    });

    it('contains the source file content', () => {
      const source = 'export function greet(name: string) { return `Hello ${name}`; }';
      const prompt = client.buildPromptPublic(baseParams({ sourceFileContent: source }));
      expect(prompt).toContain(source);
    });

    it('includes JEST framework line for JEST', () => {
      const prompt = client.buildPromptPublic(baseParams({ testFramework: TestFramework.JEST }));
      expect(prompt).toContain('TEST FRAMEWORK: jest');
      expect(prompt).toContain('globals');
    });

    it('includes VITEST framework line for VITEST', () => {
      const prompt = client.buildPromptPublic(baseParams({ testFramework: TestFramework.VITEST }));
      expect(prompt).toContain('TEST FRAMEWORK: vitest');
      expect(prompt).toContain('import from "vitest"');
    });

    it('includes EXISTING TEST FILE section when existingTestContent provided', () => {
      const prompt = client.buildPromptPublic(baseParams({ existingTestContent: 'describe("x", () => {})' }));
      expect(prompt).toContain('EXISTING TEST FILE (enhance this');
      expect(prompt).toContain('describe("x", () => {})');
    });

    it('shows "none — create a new test file" when existingTestContent is null', () => {
      const prompt = client.buildPromptPublic(baseParams({ existingTestContent: null }));
      expect(prompt).toContain('none — create a new test file from scratch');
    });

    it('includes CONTRIBUTING GUIDELINES section when contributingMd provided', () => {
      const prompt = client.buildPromptPublic(baseParams({ contributingMd: 'Use BDD style.' }));
      expect(prompt).toContain('CONTRIBUTING GUIDELINES');
      expect(prompt).toContain('Use BDD style.');
    });

    it('omits CONTRIBUTING section when contributingMd is null', () => {
      const prompt = client.buildPromptPublic(baseParams({ contributingMd: null }));
      expect(prompt).not.toContain('CONTRIBUTING GUIDELINES');
    });

    it('includes PROJECT CONVENTIONS section when agentsMd provided', () => {
      const prompt = client.buildPromptPublic(baseParams({ agentsMd: 'Follow project conventions.' }));
      expect(prompt).toContain('PROJECT CONVENTIONS');
      expect(prompt).toContain('Follow project conventions.');
    });

    it('includes package.json section when packageJson provided', () => {
      const prompt = client.buildPromptPublic(baseParams({ packageJson: { name: 'my-project' } }));
      expect(prompt).toContain('PROJECT package.json');
      expect(prompt).toContain('my-project');
    });

    it('lists runtime exports from source', () => {
      const prompt = client.buildPromptPublic(baseParams({
        sourceFileContent: 'export const add = (a: number, b: number) => a + b;',
      }));
      expect(prompt).toContain('subject.add');
    });

    it('shows "(none — check the source carefully)" when no runtime exports', () => {
      const prompt = client.buildPromptPublic(baseParams({ sourceFileContent: 'export type Foo = string;' }));
      expect(prompt).toContain('(none — check the source carefully)');
    });

    it('truncates packageJson content at 2000 chars', () => {
      const largeObj: Record<string, string> = {};
      for (let i = 0; i < 500; i++) largeObj[`key_${i}`] = 'value';
      const prompt = client.buildPromptPublic(baseParams({ packageJson: largeObj }));
      expect(prompt).toContain('... (truncated)');
    });

    it('uses the source basename (without extension) in the import line', () => {
      const prompt = client.buildPromptPublic(baseParams({ sourceFilePath: 'src/utils/string-helper.ts' }));
      expect(prompt).toContain('import * as subject from "./string-helper.js"');
    });
  });

  // ---------------------------------------------------------------------------
  describe('stripMarkdownFences', () => {
    it('returns content unchanged when no fences are present', () => {
      const code = 'import { foo } from "./foo.js";\ndescribe("foo", () => {});';
      expect(client.stripFences(code)).toBe(code);
    });

    it('extracts content from a complete typescript fence', () => {
      const inner = 'import { x } from "./x.js";\ndescribe("x", () => {});';
      const fenced = '```typescript\n' + inner + '\n```';
      expect(client.stripFences(fenced)).toBe(inner);
    });

    it('extracts content from a complete ts fence', () => {
      const inner = 'const x = 1;';
      expect(client.stripFences('```ts\n' + inner + '\n```')).toBe(inner);
    });

    it('extracts content from an unlabelled fence', () => {
      const inner = 'const x = 1;';
      expect(client.stripFences('```\n' + inner + '\n```')).toBe(inner);
    });

    it('discards trailing prose after the closing fence', () => {
      const inner = 'const x = 1;';
      const fenced = '```typescript\n' + inner + '\n```\nThis is a good test.';
      expect(client.stripFences(fenced)).toBe(inner);
    });

    it('strips an opening fence when no closing fence present', () => {
      const result = client.stripFences('```typescript\nconst x = 1;\n');
      expect(result).toContain('const x = 1;');
      expect(result).not.toContain('```');
    });

    it('drops leading prose lines before first TypeScript token', () => {
      const input = 'Here is your test:\n\nimport { x } from "./x.js";\ndescribe("x", () => {});';
      const result = client.stripFences(input);
      expect(result.startsWith('import')).toBe(true);
    });

    it('returns empty string when only prose (no code lines)', () => {
      expect(client.stripFences('This is just a description.')).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  describe('looksLikeTypeScript', () => {
    it('returns false for empty string', () => {
      expect(client.looksLikeTs('')).toBe(false);
    });

    it('returns false for whitespace-only string', () => {
      expect(client.looksLikeTs('   \n  ')).toBe(false);
    });

    it('returns true for content with an import statement', () => {
      expect(client.looksLikeTs('import { foo } from "./foo.js";')).toBe(true);
    });

    it('returns true for content with a describe block', () => {
      expect(client.looksLikeTs('describe("suite", () => {});')).toBe(true);
    });

    it('returns true for content with an it block', () => {
      expect(client.looksLikeTs("it('works', () => {});")).toBe(true);
    });

    it('returns true for content with a test block', () => {
      expect(client.looksLikeTs("test('x', () => {});")).toBe(true);
    });

    it('returns true for content with an export const', () => {
      expect(client.looksLikeTs('export const x = 1;')).toBe(true);
    });

    it('returns true for content with a class declaration', () => {
      expect(client.looksLikeTs('class Foo {}')).toBe(true);
    });

    it('returns false for plain prose', () => {
      expect(client.looksLikeTs('This looks good! Here is your test.')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  describe('fixSubjectImport', () => {
    it('corrects an import with wrong extension to .js', () => {
      const content = 'import * as subject from "./utils.ts";';
      expect(client.fixImport(content, 'src/utils.ts')).toBe('import * as subject from "./utils.js";');
    });

    it('does not change an already-correct import', () => {
      const content = 'import * as subject from "./utils.js";';
      expect(client.fixImport(content, 'src/utils.ts')).toBe(content);
    });

    it('corrects import using the basename only (not full path)', () => {
      const content = 'import * as subject from "./string-helper";';
      const result = client.fixImport(content, 'src/utils/string-helper.ts');
      expect(result).toBe('import * as subject from "./string-helper.js";');
    });

    it('leaves unrelated imports alone', () => {
      const content = 'import { describe, it } from "vitest";\nimport * as subject from "./utils.ts";';
      const result = client.fixImport(content, 'src/utils.ts');
      expect(result).toContain('import { describe, it } from "vitest"');
      expect(result).toContain('import * as subject from "./utils.js"');
    });
  });

  // ---------------------------------------------------------------------------
  describe('extractRuntimeExports (tested via buildPrompt)', () => {
    it('includes export const names in runtime exports list', () => {
      const prompt = client.buildPromptPublic(baseParams({
        sourceFileContent: 'export const foo = 1;\nexport const bar = 2;',
      }));
      expect(prompt).toContain('subject.bar');
      expect(prompt).toContain('subject.foo');
    });

    it('does NOT include export type in runtime exports list', () => {
      const prompt = client.buildPromptPublic(baseParams({
        sourceFileContent: 'export type Foo = string;\nexport const bar = 1;',
      }));
      expect(prompt).not.toContain('subject.Foo');
      expect(prompt).toContain('subject.bar');
    });

    it('includes named re-exports', () => {
      const prompt = client.buildPromptPublic(baseParams({
        sourceFileContent: 'export { foo, bar as baz } from "./other.js";',
      }));
      expect(prompt).toContain('subject.baz');
      expect(prompt).toContain('subject.foo');
    });

    it('returns sorted export names', () => {
      const prompt = client.buildPromptPublic(baseParams({
        sourceFileContent: 'export const z = 1;\nexport const a = 2;\nexport const m = 3;',
      }));
      const exportsLine = prompt.split('\n').find((l) => l.includes('RUNTIME EXPORTS'));
      expect(exportsLine).toContain('subject.a');
      // Verify 'a' comes before 'm' comes before 'z' in the string
      const aIdx = exportsLine!.indexOf('subject.a');
      const mIdx = exportsLine!.indexOf('subject.m');
      const zIdx = exportsLine!.indexOf('subject.z');
      expect(aIdx).toBeLessThan(mIdx);
      expect(mIdx).toBeLessThan(zIdx);
    });
  });
});
