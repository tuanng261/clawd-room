// Quick check: replay recent transcripts and print what the room would show.
//   node server/selftest.js [sessionId]

import { Watcher } from './watcher.js';

const w = new Watcher({ lookbackMs: 6 * 3600e3 });
const t0 = Date.now();
await w.scan(true);
const now = Date.now();
console.log(`Parsed ${w.sessions.size} sessions (${w.tails.size} files) in ${now - t0} ms\n`);

for (const s of w.list(now)) {
  const cur = s.current ? `${s.current.verb} ${s.current.label}` : '';
  console.log(`${s.live ? '●' : '○'} ${s.status.padEnd(8)} ${s.project.slice(0, 22).padEnd(22)} ${s.title.slice(0, 44).padEnd(44)} helpers:${s.helpers} ${cur}`);
}

const pick = process.argv[2] || w.list(now).find((s) => s.live)?.id;
const m = pick && w.sessions.get(pick);
if (m) {
  const snap = m.snapshot(now);
  console.log('\n── snapshot of', snap.title);
  console.log({
    status: snap.status, statusSince: new Date(snap.statusSince).toISOString(), model: snap.model,
    turn: snap.turn && { prompt: snap.turn.prompt.slice(0, 80), toolCalls: snap.turn.toolCalls },
    current: snap.current && `${snap.current.verb} ${snap.current.label} [${snap.current.station}] ${snap.current.status}`,
    narration: snap.narration?.text.slice(0, 120), context: snap.context, stats: snap.stats,
  });
  console.log('tasks:', snap.tasks.map((t) => `${t.status}: ${t.subject}`));
  console.log('agents:', snap.agents.map((a) => `${a.status} ${a.description} (${a.toolCalls} calls) ${a.current ? a.current.verb + ' ' + a.current.label : ''}`));
  console.log('jobs:', snap.jobs.map((j) => `${j.status} ${j.kind} ${j.label}`));
  console.log('files:', snap.files.slice(0, 6).map((f) => `${f.name} r${f.reads} e${f.edits}`));
  console.log('log tail:');
  for (const e of snap.log.slice(-10)) console.log('  ', e.kind.padEnd(6), (e.status || '').padEnd(7), e.text.slice(0, 100));
}
