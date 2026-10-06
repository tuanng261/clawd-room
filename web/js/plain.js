// Turns Claude's long, technical text into short, plain sentences for the
// bubbles and the chat feed. Pure string work, no AI involved.

const CUT_BEFORE = /,\s(?:and|so|then|which|but|while|plus|though|although|since)\s|\s(?:because|so that|since|though|while|although)\s/i;
const SOFT_CUT = /\s(?:and|then|to|so)\s/gi;

/** One short sentence: first sentence, no brackets or paths, cut at a natural break. */
export function simplify(text, maxWords = 12) {
  if (!text) return '';
  let s = String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // "Good news: the real point…" → keep what follows a short lead-in.
  const colon = s.indexOf(': ');
  if (colon > 0 && s.slice(0, colon).split(' ').length <= 3) s = s.slice(colon + 2);
  // First sentence only.
  const m = /^(.+?[.!?])(?:\s|$)/.exec(s);
  if (m && m[1].length > 12) s = m[1];
  // Drop asides and side notes.
  s = s.replace(/\s*\([^)]*\)/g, '').replace(/\s*\[[^\]]*\]/g, '');
  s = s.split(/\s*[—–]\s*|;\s|\s-\s/)[0];
  if (s.indexOf(': ') > 20) s = s.slice(0, s.indexOf(': '));
  // Paths → just the file name (folders may contain spaces).
  s = s.replace(/(?:~|\.{1,2})?\/(?:[^/\n]+\/)+([\w@.-]+\.[a-z0-9]{1,6})\b/gi, '$1');
  s = s.replace(/(?:~|\.{1,2})?\/?(?:[\w@.-]+\/)+([\w@.-]+)/g, '$1');
  if (s.split(' ').length > maxWords) {
    const cut = s.search(CUT_BEFORE);
    if (cut > 18) s = s.slice(0, cut);
  }
  // Still long: end at the last "and / then / to / so" that fits.
  if (s.split(' ').length > maxWords) {
    let best = -1;
    for (const m of s.matchAll(SOFT_CUT)) {
      const n = s.slice(0, m.index).split(' ').length;
      if (n >= 3 && n <= maxWords) best = m.index;
    }
    if (best > 0) s = s.slice(0, best);
  }
  const words = s.split(' ');
  if (words.length > maxWords) s = words.slice(0, maxWords).join(' ').replace(/[,;:]$/, '') + '…';
  s = s.replace(/[\s,;:.]+$/, '').replace(/^["“]|["”]$/g, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Imperative command descriptions ("Run the tests") read better as "Running the tests".
const VERBS = new Set(('add analyze annotate boot ensure mock monitor package patch ping poll probe publish query recheck release screenshot snapshot stub summarize tail transcribe translate tweak apply backup build bump capture check clean clear clone commit compare compile configure confirm convert copy count create crop cut debug delete deploy diff download encode edit export extract fetch find fix format generate get grab grep import inspect install kill launch lint list load look make measure merge migrate move open parse pick play preview print pull push read rebuild record refresh remove rename render replay rerun reset resize restart restore retry review run save scan search send serve set show sort split start stop sync take test tidy transcode trim try update upgrade upload validate verify view wait watch write zip').split(' '));
const DOUBLE = new Set('run get set put cut stop plan ship drop map zip grab tag log pin scan trim split commit submit rerun begin swap chop shop step snapshot stub'.split(' '));

export function gerund(word) {
  const dash = word.lastIndexOf('-');
  if (dash > 0) return word.slice(0, dash + 1) + gerund(word.slice(dash + 1)); // re-run → re-running
  const w = word.toLowerCase();
  if (w.endsWith('ing')) return word;
  let g;
  if (DOUBLE.has(w)) g = w + w.slice(-1) + 'ing';
  else if (w === 'see' || w === 'be') g = w + 'ing';
  else if (/[^aeiou]e$/.test(w) && !w.endsWith('ee')) g = w.slice(0, -1) + 'ing';
  else if (w.endsWith('ie')) g = w.slice(0, -2) + 'ying';
  else g = w + 'ing';
  return word[0] === word[0].toUpperCase() ? g.charAt(0).toUpperCase() + g.slice(1) : g;
}

/** "Run the unit tests" → "Running the unit tests"; anything else unchanged. */
export function asDoing(text) {
  const s = String(text || '').trim();
  const [first, ...rest] = s.split(' ');
  // "Keep waiting for the build" → "Still waiting for the build"
  if (/^keep$/i.test(first) && /ing$/.test(rest[0] || '')) return `Still ${rest.join(' ')}`;
  if (!first || !VERBS.has(first.toLowerCase().split('-').pop())) return s;
  // "…and extract frames" → "…and extracting frames"
  const tail = rest.join(' ').replace(/\b(and|then) (\w+)/g, (m, joiner, v) => (VERBS.has(v.toLowerCase()) ? `${joiner} ${gerund(v)}` : m));
  return `${gerund(first)} ${tail}`.trim();
}

// ── chat feed ────────────────────────────────────────────────

const GROUP = { bookshelf: 'read', desk: 'edit', cabinet: 'search', globe: 'web', whiteboard: 'plan', terminal: 'run', portal: 'helper', workbench: 'tool', stage: 'ask' };

function fileOf(text) {
  const m = /(?:Reading|Editing|Writing)\s+(.+)$/.exec(text || '');
  return m ? m[1] : null;
}

/**
 * Builds chat bubbles from the session log. Bursts of the same kind of step
 * merge into one bubble ("Reading 4 files") so the feed stays calm.
 */
export function chatBubbles(log, limit = 7) {
  const out = [];
  for (const e of log || []) {
    if (e.kind === 'tool') {
      const group = e.server ? `mcp:${e.server}` : GROUP[e.station] || 'tool';
      if (group === 'plan' && !/^Planning/.test(e.text)) continue; // task status updates show up as their own lines
      const last = out[out.length - 1];
      const mergeable = group !== 'run' && group !== 'ask' && group !== 'helper';
      if (last && last.kind === 'tool' && last.group === group && mergeable && e.at - last.at < 25000) {
        last.items.push(e);
        last.at = e.at;
        continue;
      }
      out.push({ key: `t${e.id}`, kind: 'tool', group, items: [e], at: e.at, icon: e.icon });
    } else if (e.kind === 'job' || (e.kind === 'agent' && /^Helper started/.test(e.text))) {
      // The command / helper bubble right before already says this.
      const last = out[out.length - 1];
      if (last?.kind === 'tool' && e.at - last.at < 10000) { if (e.kind === 'job') last.background = true; continue; }
      out.push({ key: `${e.kind}${e.id}`, kind: e.kind, at: e.at, icon: e.icon, entry: e });
    } else if (['say', 'think', 'prompt', 'task', 'agent', 'notify', 'end', 'note'].includes(e.kind)) {
      out.push({ key: `${e.kind}${e.id}`, kind: e.kind, at: e.at, icon: e.icon, entry: e });
    }
  }
  return out.slice(-limit).map((b) => ({ ...b, ...words(b) }));
}

function words(b) {
  if (b.kind === 'tool') {
    const n = b.items.length;
    const last = b.items[n - 1];
    const failed = last.status === 'error';
    const running = last.status === 'running';
    let text;
    if (b.group === 'read') text = n > 1 ? `Reading ${n} files` : `Reading ${fileOf(last.text) || 'a file'}`;
    else if (b.group === 'edit') text = n > 1 ? `Editing ${n} files` : `${/^Writing/.test(last.text) ? 'Writing' : 'Editing'} ${fileOf(last.text) || 'a file'}`;
    else if (b.group === 'search') text = n > 1 ? `Searching the project (${n} searches)` : 'Searching the project';
    else if (b.group === 'web') text = n > 1 ? `Looking things up online (${n} pages)` : simplify(last.text, 9);
    else if (b.group === 'plan') text = n > 1 ? `Planning ${n} steps` : simplify(last.text.replace(/^Planning\s*/, 'Planning: '), 10);
    else if (b.group.startsWith('mcp:')) text = n > 1 ? `Working in ${last.serverName || 'a connector'} (${n} steps)` : keepLead(last.text, 7);
    else if (b.group === 'run') text = simplify(asDoing(last.text), 10) + (b.background || /\(background\)/.test(last.text) ? ' in the background' : '');
    else text = keepLead(last.text, 8);
    if (failed) text += ', that failed';
    return { tone: failed ? 'bad' : running ? 'live' : '', text, side: 'clawd', caption: toolCaption(b.items), brand: last.server ? { id: last.brand || null, name: last.serverName || 'Connector' } : null };
  }
  const e = b.entry;
  switch (b.kind) {
    case 'prompt': return { side: 'you', text: simplify(e.text, 16), tone: e.icon === 'bell' ? 'note' : '' };
    case 'say': return { side: 'clawd', text: simplify(e.text, 16), tone: 'say' };
    case 'think': return { side: 'clawd', text: simplify(e.text, 12), tone: 'think' };
    case 'task': return { side: 'clawd', text: e.text.replace(/^Checked off:\s*/, 'Done: '), tone: 'good' };
    case 'end': return { side: 'clawd', text: e.text === 'Stopped by you' ? 'Okay, I stopped' : 'All done! Your turn', tone: 'good' };
    case 'job': return { side: 'clawd', text: `Running in the background: ${simplify(e.text.replace(/^In the background:\s*/, ''), 8)}`, tone: 'note' };
    case 'agent': return { side: 'clawd', text: keepLead(e.text.replace(/^Helper reported back/, 'Helper is back').replace(/^Helper started/, 'Sent a helper'), 8), tone: /back/.test(e.text) ? 'good' : 'note' };
    case 'notify': {
      const m = /^Background command "(.+?)" (completed|failed|was stopped)/i.exec(e.text);
      if (m) return { side: 'clawd', text: `${/completed/i.test(m[2]) ? 'Finished' : /failed/i.test(m[2]) ? 'Failed' : 'Stopped'} in the background: ${simplify(m[1], 8)}`, tone: /completed/i.test(m[2]) ? 'good' : 'bad' };
      return { side: 'clawd', text: simplify(e.text, 12), tone: e.icon === 'alert' ? 'bad' : 'good' };
    }
    default: return { side: 'clawd', text: simplify(e.text, 12), tone: 'note' };
  }
}

/** "Read ×4", "Bash", "Figma · get screenshot ×2", plus "+12 −3" for edits. */
function toolCaption(items) {
  const counts = new Map();
  for (const e of items) {
    const name = e.server ? `${e.serverName || 'Connector'} · ${e.tool || ''}` : e.tool || '';
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  const parts = [...counts].map(([name, c]) => (c > 1 ? `${name} ×${c}` : name));
  let cap = parts.slice(0, 2).join(', ') + (parts.length > 2 ? ` +${parts.length - 2}` : '');
  const add = items.reduce((a, e) => a + (e.delta?.add || 0), 0);
  const del = items.reduce((a, e) => a + (e.delta?.del || 0), 0);
  if (add || del) cap += ` · +${add} −${del}`;
  return cap;
}

/** "Sending a helper: Explore the auth flow" keeps its lead-in; only the rest gets shortened. */
function keepLead(text, maxWords) {
  const m = /^([^:]{3,30}):\s(.+)$/.exec(text || '');
  return m ? `${m[1]}: ${simplify(m[2], maxWords)}` : simplify(text, maxWords + 2);
}
