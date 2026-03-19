# UpCover — Configuration reference

> Source: `OUTLINE.md` → Section 3

## 3. Configuration Reference

All configuration is via environment variables. Copy `.env.example` and fill in required values.

| Env Var | Required | Default | Description |
|---|---|---|---|
| `GITHUB_TOKEN` | yes | — | GitHub Personal Access Token with `repo` scope |
| `LLM_PROVIDER` | no | `ollama` | `ollama` or `claude` — selects which LLM to use for test generation |
| `OLLAMA_URL` | no | `http://localhost:11434` | Base URL for the Ollama API |
| `OLLAMA_MODEL` | no | `deepseek-coder` | Ollama model name to use for test generation |
| `CLAUDE_API_KEY` | if claude | — | Anthropic API key when using Claude |
| `CLAUDE_MODEL` | no | `claude-opus-4-6` | Claude model name when using Claude |
| `PORT` | no | `3000` | HTTP port for the NestJS server |
| `DB_PATH` | no | `./data/upcover.db` | Path to the SQLite database file |
| `CLONE_DIR` | no | `./workspaces` | Base directory where repositories are cloned |
| `COVERAGE_THRESHOLD` | no | `80` | Coverage % below which a file is flagged for improvement |
| `TS_SIZE_THRESHOLD` | no | `1000` | Minimum total TypeScript bytes (from GitHub Languages API) to accept a repo |
| `CLEANUP_INTERVAL_MS` | no | `3600000` | Interval in ms to purge failed scan workspace directories |
| `DEBUG_OUTPUT` | no | `false` | If `true`, shows a terminal-style CLI log panel on repo cards and improvement job entries, streaming raw output (git, npm, ollama) in real time via SSE |
| `FILE_SIZE_LIMIT_KB` | no | `200` | Maximum source file size in KB for AI improvement. Larger files have the Improve button disabled. |
| `GIT_BOT_NAME` | no | `UpCover Bot` | Git commit author name used for improvement PR commits |
| `GIT_BOT_EMAIL` | no | `upcover@local` | Git commit author email used for improvement PR commits |

