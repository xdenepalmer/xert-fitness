import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseEnvFile(contents) {
  const parsed = {};
  for (const rawLine of String(contents || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    parsed[match[1]] = value;
  }
  return parsed;
}

export function loadOptionalLocalEnv({ cwd = process.cwd(), environment = process.env } = {}) {
  const path = resolve(cwd, '.env.local');
  if (!existsSync(path)) return { ...environment };
  // Explicit shell/CI values always win over developer-local defaults.
  return { ...parseEnvFile(readFileSync(path, 'utf8')), ...environment };
}

export async function runWithLocalEnv(args = process.argv.slice(2)) {
  const [script, ...scriptArgs] = args;
  if (!script) throw new Error('Choose a Node script to run.');
  const child = spawn(process.execPath, [resolve(process.cwd(), script), ...scriptArgs], {
    cwd: process.cwd(),
    env: loadOptionalLocalEnv(),
    stdio: 'inherit',
  });
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolveExit(code ?? 1));
  });
  process.exitCode = exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWithLocalEnv().catch(error => {
    console.error(`Launch command failed: ${error.message}`);
    process.exitCode = 1;
  });
}
