import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmClient, LlmGenerateParams } from '../llm/llm-client';

@Injectable()
export class OllamaClient extends LlmClient {
  private readonly ollamaUrl: string;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    super();
    this.ollamaUrl = this.configService.get<string>('OLLAMA_URL', 'http://localhost:11434');
    this.model = this.configService.get<string>('OLLAMA_MODEL', 'deepseek-coder');
  }

  async generateTests(
    params: LlmGenerateParams,
    onToken: (token: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const prompt = this.buildPrompt(params);

    const response = await fetch(`${this.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: true,
        options: { num_ctx: 16384 },
      }),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`Ollama request failed: ${response.status} ${errText}`);
    }

    if (!response.body) {
      throw new Error('Ollama response has no body');
    }

    let fullOutput = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let parsed: { response?: string; done?: boolean };
          try {
            parsed = JSON.parse(trimmed);
          } catch {
            continue;
          }
          if (parsed.response) {
            fullOutput += parsed.response;
            onToken(parsed.response);
          }
          if (parsed.done) break;
        }
      }
    } finally {
      reader.releaseLock();
    }

    const stripped = this.stripMarkdownFences(fullOutput);

    if (!this.looksLikeTypeScript(stripped)) {
      const preview = fullOutput.slice(0, 300).replace(/\n/g, '\\n');
      throw new Error(`Generated output is not valid TypeScript after stripping markdown fences. Raw output (first 300 chars): ${preview}`);
    }

    return this.fixSubjectImport(stripped, params.sourceFilePath);
  }
}
