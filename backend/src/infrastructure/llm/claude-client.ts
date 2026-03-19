import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { LlmClient, LlmGenerateParams } from './llm-client';

@Injectable()
export class ClaudeClient extends LlmClient {
  private readonly anthropic: Anthropic;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    super();
    this.anthropic = new Anthropic({
      apiKey: configService.get<string>('CLAUDE_API_KEY', ''),
    });
    this.model = configService.get<string>('CLAUDE_MODEL', 'claude-opus-4-6');
  }

  async generateTests(
    params: LlmGenerateParams,
    onToken: (token: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const prompt = this.buildPrompt(params);
    let fullOutput = '';

    const stream = this.anthropic.messages.stream(
      {
        model: this.model,
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal },
    );

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        fullOutput += event.delta.text;
        onToken(event.delta.text);
      }
    }

    const stripped = this.stripMarkdownFences(fullOutput);

    if (!this.looksLikeTypeScript(stripped)) {
      const preview = fullOutput.slice(0, 300).replace(/\n/g, '\\n');
      throw new Error(`Generated output is not valid TypeScript after stripping markdown fences. Raw output (first 300 chars): ${preview}`);
    }

    return this.fixSubjectImport(stripped, params.sourceFilePath);
  }
}
