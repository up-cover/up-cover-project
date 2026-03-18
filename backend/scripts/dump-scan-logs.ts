/**
 * dump-scan-logs
 *
 * Extracts scan job logs from the SQLite database and writes them to files
 * so they can be read by Claude Code to diagnose scan failures.
 *
 * Usage:
 *   cd backend && npm run dump-logs
 *   cd backend && npm run dump-logs -- --all
 *   cd backend && npm run dump-logs -- --repo owner/name
 *   cd backend && npm run dump-logs -- --repo owner/name --out /tmp/logs
 *
 * Flags:
 *   --all            Include all statuses (default: FAILED only)
 *   --repo owner/name  Filter to a specific repository
 *   --out <dir>      Output directory (default: ./scan-logs)
 */

import Database = require('better-sqlite3');
import * as fs from 'fs';
import * as path from 'path';

// ── Config ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

const filterAll = args.includes('--all');

const repoIndex = args.indexOf('--repo');
const repoFilter = repoIndex !== -1 ? args[repoIndex + 1] ?? null : null;

const outIndex = args.indexOf('--out');
const outDir = path.resolve(
  outIndex !== -1 ? (args[outIndex + 1] ?? './scan-logs') : './scan-logs',
);

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, '../data/upcover.db');

// ── Validate ──────────────────────────────────────────────────────────────────

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found at: ${dbPath}`);
  console.error('Set DB_PATH env var or run from the backend/ directory.');
  process.exit(1);
}

// ── Query ─────────────────────────────────────────────────────────────────────

interface Row {
  id: string;
  status: string;
  log_output: string | null;
  error_message: string | null;
  created_at: string;
  work_dir: string;
  owner: string;
  name: string;
}

const db = new Database(dbPath, { readonly: true });

// Build WHERE clause with parameterized values
const conditions: string[] = [];
const params: string[] = [];

if (!filterAll) {
  conditions.push("sj.status = 'FAILED'");
}

if (repoFilter) {
  conditions.push("r.owner || '/' || r.name = ?");
  params.push(repoFilter);
}

const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

// Latest job per repo (ORDER BY created_at DESC, dedup in JS)
const sql = `
  SELECT
    sj.id,
    sj.status,
    sj.log_output,
    sj.error_message,
    sj.created_at,
    sj.work_dir,
    r.owner,
    r.name
  FROM scan_jobs sj
  JOIN repositories r ON r.id = sj.repository_id
  ${where}
  ORDER BY sj.created_at DESC
`;

const allRows = db.prepare(sql).all(...params) as Row[];
db.close();

// Keep only the latest job per repo
const seen = new Set<string>();
const rows = allRows.filter((row) => {
  const key = `${row.owner}/${row.name}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

// ── Output ────────────────────────────────────────────────────────────────────

if (rows.length === 0) {
  const scope = filterAll ? 'any' : 'failed';
  const repoMsg = repoFilter ? ` for ${repoFilter}` : '';
  console.log(`No ${scope} scan jobs found${repoMsg}.`);
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

for (const row of rows) {
  const safeName = `${row.owner}-${row.name}`.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = `${safeName}-${row.id}.log`;
  const filepath = path.join(outDir, filename);

  const lines: string[] = [
    `# Scan log: ${row.owner}/${row.name}`,
    `# Job ID:   ${row.id}`,
    `# Status:   ${row.status}`,
    `# Created:  ${row.created_at}`,
    `# Work dir: ${row.work_dir}`,
  ];
  if (row.error_message) {
    lines.push(`# Error:    ${row.error_message}`);
  }
  lines.push('', row.log_output?.trim() || '(no log output)');

  fs.writeFileSync(filepath, lines.join('\n') + '\n', 'utf-8');
  console.log(`Written: ${filepath}`);
}

console.log(`\n${rows.length} file(s) written to ${outDir}`);
