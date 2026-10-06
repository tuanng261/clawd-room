#!/usr/bin/env node
// clawd-room — a little 3D room where Claude Code's mascot acts out your sessions.
//
//   clawd-room [--port 4747] [--hours 6] [--no-demo] [--open] [--projects <dir>]

import { spawn } from 'node:child_process';
import { Demo } from '../server/demo.js';
import { createServer } from '../server/server.js';
import { defaultCodexDir } from '../server/codex.js';
import { Watcher, defaultProjectsDir } from '../server/watcher.js';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

if (flag('help') || flag('h')) {
  console.log(`clawd-room — watch Claude Code work in a tiny 3D room

  --port <n>        port to serve on (default 4747)
  --hours <n>       show sessions active in the last n hours (default 6)
  --projects <dir>  Claude Code transcripts folder (default ~/.claude/projects)
  --codex <dir>     Codex sessions folder (default ~/.codex/sessions)
  --no-codex        leave Codex sessions out
  --no-demo         hide the built-in demo session
  --open            open the room in your browser`);
  process.exit(0);
}

const port = Number(opt('port', process.env.PORT || 4747));
const hours = Number(opt('hours', 6));
const projectsDir = opt('projects', defaultProjectsDir());

const codexDir = flag('no-codex') ? null : opt('codex', defaultCodexDir());
const watcher = new Watcher({ projectsDir, codexDir, lookbackMs: hours * 3600e3 });
const demo = flag('no-demo') ? null : new Demo();

await watcher.start();
demo?.start();

let server;
try {
  server = await createServer({ watcher, demo, port });
} catch (err) {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is busy. Is clawd-room already running? Try --port ${port + 1}`);
    process.exit(1);
  }
  throw err;
}

const url = `http://localhost:${port}`;
const live = watcher.list().filter((s) => s.live).length;
console.log(`\n  🦀  Clawd's room is open at ${url}`);
console.log(`      watching ${projectsDir}${codexDir ? ` and ${codexDir}` : ''}`);
console.log(`      ${watcher.sessions.size} recent session${watcher.sessions.size === 1 ? '' : 's'}, ${live} live right now\n`);

if (flag('open')) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}

const shutdown = () => { watcher.stop(); demo?.stop(); server.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
