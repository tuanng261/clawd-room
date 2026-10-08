// Turns a Claude Code tool call into something the room can act out:
// which station Clawd walks to, an icon, and a short human sentence.

import path from 'node:path';
import { brandById, pickBrand } from '../web/js/brands.js';

export const STATIONS = [
  'desk',        // Edit / Write — typing at the computer
  'terminal',    // Bash and background shells
  'bookshelf',   // Read, skills
  'cabinet',     // Grep / Glob / searching
  'globe',       // the web and browsers
  'whiteboard',  // the task list / planning
  'workbench',   // MCP connectors and other tools
  'portal',      // spawning and messaging helpers (subagents)
  'stage',       // talking to you: questions, plans, files
];

const clip = (s, n = 64) => {
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};
const base = (p) => (p ? path.basename(String(p)) : '');
const host = (u) => {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return clip(u, 40); }
};
const humanize = (s) => clip(String(s || '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), 40);

export function prettyServer(server = '') {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(server)) return 'a connector';
  const s = server.replace(/^claude_ai_/i, '').replace(/^Claude_/, '');
  if (/chrome/i.test(s)) return 'Chrome';
  if (/^computer-use$/i.test(s)) return 'the computer';
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const BROWSER_SERVERS = /browser|chrome|preview|playwright|puppeteer/i;

// ── which app is behind an MCP server ─────────────────────────────────
// claude.ai connectors show up with random ids (mcp__05b47507-…__search), so we
// learn what each server is from the tool lists and instructions that Claude
// Code saves in the transcript. Shared by all sessions: the ids are stable.

const HINTS = new Map(); // server key → { tools: Set, text, ver }
const BRAND_CACHE = new Map(); // server key → { ver, id }

export const serverKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export function learnServer(server, { tools = [], text = '' } = {}) {
  const key = serverKey(server);
  if (!key) return;
  let h = HINTS.get(key);
  if (!h) { h = { tools: new Set(), text: '', ver: 0 }; HINTS.set(key, h); }
  let changed = false;
  for (const t of tools) if (t && !h.tools.has(t) && h.tools.size < 200) { h.tools.add(t); changed = true; }
  if (text && h.text.length < 8000 && !h.text.includes(text.slice(0, 80))) { h.text += ' ' + text.slice(0, 2000); changed = true; }
  if (changed) h.ver++;
}

/** Learn from a full tool name like mcp__server__tool (plus its description, if any). */
export function learnTool(name, description = '') {
  if (typeof name !== 'string' || !name.startsWith('mcp__')) return;
  const [, server = '', ...rest] = name.split('__');
  learnServer(server, { tools: [rest.join('__')], text: description });
}

export function brandOf(server) {
  const key = serverKey(server);
  if (!key) return null;
  const h = HINTS.get(key);
  const ver = h?.ver ?? -1;
  const hit = BRAND_CACHE.get(key);
  if (hit && hit.ver === ver) return hit.id;
  const id = pickBrand({ server: key, tools: h ? [...h.tools] : [], text: h?.text || '' });
  BRAND_CACHE.set(key, { ver, id });
  return id;
}

export function serverLabel(server) {
  return brandById(brandOf(server))?.name || prettyServer(server);
}

// ── what exactly is Clawd doing? ──────────────────────────────────────
// Stations say roughly where the work happens; activities say what it looks
// like (cutting clips, committing, launching a deploy…), so the room can act
// each step out differently.

const ext = (p) => (/\.([a-z0-9]+)$/i.exec(String(p || '')) || [])[1]?.toLowerCase() || '';
const SET = (s) => new Set(s.split(' '));
const DOC = SET('md mdx txt rst adoc org tex rtf');
const STYLE = SET('css scss sass less styl svg');
const CONFIG = SET('json jsonc yaml yml toml ini env cfg conf xml plist lock properties');
const SUBS = SET('srt vtt ass ssa sbv');
const IMAGE = SET('png jpg jpeg gif webp bmp tif tiff heic avif ico');

function fileActivity(file, editing) {
  const e = ext(file);
  const base = path.basename(String(file || '')).toLowerCase();
  if (editing) {
    if (/(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[a-z]+$/.test(String(file || '').toLowerCase())) return 'write-tests';
    if (SUBS.has(e)) return 'captions';
    if (STYLE.has(e)) return 'style';
    if (DOC.has(e)) return 'notes';
    if (CONFIG.has(e) || /^\.env|^dockerfile$|rc$/.test(base)) return 'config';
    return 'code';
  }
  if (IMAGE.has(e)) return 'look-image';
  if (e === 'pdf') return 'research';
  return 'read';
}

/** Heredoc bodies and long quoted strings are data (scripts, messages), not commands. */
function commandsOnly(cmd) {
  return cmd
    .replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n\s*\1\b/g, ' ')
    .replace(/'[^']{40,}'|"(?:[^"\\]|\\.){40,}"/g, ' ');
}

/** What a shell command is, from the command itself (most specific first). */
function commandActivity(c, d, raw = c) {
  const has = (re) => re.test(c);
  const cmd = (names) => new RegExp(`(^|[;&|(]\\s*|\\s)(${names})(\\s|$)`).test(c);
  if (has(/\b(vercel|netlify)\b[^|;&]*\b(deploy|--prod)\b|\bfly (deploy|launch)\b|\bfirebase deploy\b|\bwrangler (deploy|publish)\b|\bgh-pages\b|\bdocker push\b|\bkubectl (apply|rollout)\b|\bterraform apply\b|\beas (submit|update)\b|\bnpm publish\b/)) return 'deploy';
  if (has(/\bgit push\b|\bgh pr (create|merge)\b/)) return 'push';
  if (has(/\bgit commit\b/)) return 'commit';
  if (has(/\bgit (clone|pull|fetch)\b|\byt-dlp\b|\byoutube-dl\b|\bgdown\b|\bwget\b|\bcurl\b[^|;&]*\s(-o|-O|--output|--remote-name)\b/)) return 'download';
  if (has(/\b(npm|pnpm|yarn|bun) (i|install|ci|add)\b|\bpip3? install\b|\buv (pip install|add|sync)\b|\bbrew install\b|\bcargo (add|install)\b|\bgem install\b|\bgo get\b|\bpoetry (add|install)\b/)) return 'install';
  if (has(/\b(jest|vitest|pytest|mocha|rspec|phpunit)\b|\bcypress run\b|\bplaywright test\b|\b(npm|pnpm|yarn|bun) (run )?test\b|\b(go|cargo|deno) test\b|\bmake test\b/)) return 'test';
  if (has(/\b(eslint|prettier|ruff|black|flake8|rubocop|stylelint|biome|gofmt|rustfmt|clippy)\b|\b(npm|pnpm|yarn|bun) (run )?(lint|format|fmt)\b|\btsc\b[^|;&]*--noEmit/)) return 'tidy';
  if (has(/\b(npm|pnpm|yarn|bun) (run )?build\b|\bvite build\b|\bnext build\b|\b(webpack|esbuild|rollup|xcodebuild|gradle|mvn)\b|\b(cargo|go) build\b|\bdocker (build|compose build)\b/) || cmd('make|tsc')) return 'build';
  if (has(/\b(npm|pnpm|yarn|bun) (run )?(dev|start|serve|preview)\b|\bnext (dev|start)\b|\bhttp\.server\b|\b(uvicorn|gunicorn|flask run|rails s|rails server)\b|\bdocker (run|compose up)\b|\bnpx (serve|vite)\b/) || cmd('vite')) return 'serve';
  if (has(/\b(psql|mysql|sqlite3|mongosh|redis-cli|prisma|drizzle-kit)\b|\bsupabase db\b/)) return 'db';
  if (has(/\b(whisper|whisperx)\b/)) return 'listen';
  if (cmd('say') || has(/\b(elevenlabs|piper|espeak)\b/)) return 'voice';
  if (has(/\b(ffprobe|mediainfo)\b/)) return 'review';
  if (has(/\bffmpeg\b/)) {
    // Filters live in quoted strings, so look at the whole command here.
    if (/overlay|chroma|colorkey|composit|\bpip\b|picture.in.picture/i.test(raw) || /overlay|composit|picture.in.picture|\bpip\b|green.?screen/.test(d)) return 'composite';
    if (/(-vf|-filter:v)\s+\S*(fps=|select=|thumbnail)|-frames:v|-vframes|%0?\d*d\.(png|jpe?g)/i.test(raw) || /\b(frames?|thumbnails?|stills?|snapshot)\b/.test(d)) return 'frames';
    if (/\b(eq=|curves|lut3d|colorbalance|colorlevels|hue=)/i.test(raw) || /\b(grade|grading|colou?r)\b/.test(d)) return 'grade';
    if (/\s-ss\s|\s-to\s|\s-t\s|\btrim\b|segment|concat/i.test(raw) || /\b(cut|trim|split|clip|join|concat)/.test(d)) return 'cut';
    return 'render';
  }
  if (has(/\b(remotion|hyperframes|blender|melt|avconvert|handbrakecli)\b/)) return 'render';
  if (has(/\b(magick|mogrify|sips|pngquant|optipng|cwebp|svgo|imagemin)\b/) || cmd('convert')) return 'image';
  if (has(/\b(curl|httpie|xh)\b/)) return 'http';
  if (has(/\b(while|for|until)\b[^|]*\bsleep\b/) || cmd('sleep|wait')) return 'wait';
  // Output piped through grep/tail/wc… is just being trimmed: those don't say what the step is.
  const core = c.replace(/\|\s*(grep|rg|head|tail|wc|sort|uniq|awk|sed|cut|tr|tee|cat|less|jq)\b[^|;&]*/g, ' ');
  const plumb = (names) => new RegExp(`(^|[;&|(]\\s*|\\s)(${names})(\\s|$)`).test(core);
  if (plumb('rm|rmdir|trash|unlink')) return 'delete';
  if (plumb('mv|cp|mkdir|rsync|ln|zip|unzip|tar|ditto')) return 'files';
  if (cmd('kill|pkill|killall') || /\bxargs kill\b/.test(c)) return 'stop';
  if (cmd('open|xdg-open')) return 'deliver';
  if (has(/\bgit (status|diff|log|show|blame|branch|checkout|switch|stash|add|restore|reset|rebase|merge|tag|remote|worktree)\b/)) return 'git';
  if (plumb('ls|find|tree|du|wc|cat|head|tail|grep|rg|ag|fd|stat|file|less|which')) return 'search';
  return null;
}

// What a step says it does, from its first verb: "Capture the console pages", "Re-voice the lead",
// "Convert both takes to SDR". Checked in order; the first match wins.
const VERB_ACTIVITY = [
  [/^(capture|screenshot|snap|grab) /, 'screenshot'],
  [/^(make|generate|extract|pull|build) .*\b(frames?|proxies|proxy|thumbnails?|stills|contact sheets?|review sheets?)\b/, 'frames'],
  [/^(convert|make|transcode) .*\b(takes?|clips?|videos?|footage|prores|h\.?26[45]|hevc|sdr|hdr|4k|mp4|mov)\b/, 'render'],
  [/^(convert|resize|crop|compress|optimi[sz]e) .*\b(images?|photos?|pngs?|jpe?gs?|webp|icons?|screenshots?)\b/, 'image'],
  [/^(render|export|encode|transcode|bounce) /, 'render'],
  [/^(grade|colou?r[- ]grade|colou?r[- ]correct|match the colou?r)/, 'grade'],
  [/^(cut|trim|split|splice|join|concat) /, 'cut'],
  [/^(voice|narrate|dub|speak) /, 'voice'],
  [/^(caption|subtitle) /, 'captions'],
  [/^transcribe /, 'listen'],
  [/^(explore|browse|crawl|scrape|click through|navigate) /, 'browse'],
  [/^(test |run (the )?(unit |e2e |browser |integration |end-to-end )?tests?\b)/, 'test'],
  [/^(build|compile|bundle) /, 'build'],
  [/^(deploy|ship|publish) /, 'deploy'],
  [/^install /, 'install'],
  [/^(download|fetch|clone) /, 'download'],
  [/^(copy|move|rename|organi[sz]e|archive|zip|unzip|back ?up) /, 'files'],
  [/^(delete|remove|clean ?up|clear out) /, 'delete'],
  [/^(search|find|look for|list|count) /, 'search'],
  [/^(wait|poll|keep waiting)\b/, 'wait'],
];

/** The activity a description's first verb names ("Re-capture …" counts as capture), or null. */
function leadVerbActivity(d) {
  const s = `${d.trim().replace(/^(now|then|also|first|next|quickly)\s+/, '').replace(/^re-?(?=(capture|render|run|voice|grade|cut|export|encode|build|test|deploy|download|convert)\b)/, '')} `;
  for (const [re, act] of VERB_ACTIVITY) if (re.test(s)) return act;
  return null;
}

/** A project script's name often says what it does: capture-screens.mjs, look_and_cut.sh, enhance_voice.sh. */
function scriptActivity(raw) {
  const names = [...raw.matchAll(/([\w.-]+)\.(m?js|ts|py|sh|zsh|rb)\b/g)].map((m) => m[1].toLowerCase()).join(' ');
  if (!names) return null;
  for (const [re, act] of [[/captur|screenshot|snap/, 'screenshot'], [/render|export|encode/, 'render'], [/grade|look|lut|colou?r/, 'grade'], [/cut|trim/, 'cut'],
    [/voice|tts|speech|narrat/, 'voice'], [/transcri|whisper/, 'listen'], [/explor|crawl|browse|scrape/, 'browse'], [/frame|prox|thumb/, 'frames'],
    [/deploy|publish/, 'deploy'], [/build|compile/, 'build'], [/test|spec/, 'test']]) {
    if (re.test(names)) return act;
  }
  return null;
}

/** What the description says it's for, when the command alone doesn't tell. */
function descriptionActivity(d) {
  if (/\bdeploy/.test(d)) return 'deploy';
  if (/\brender|\bexport (the )?(video|teaser|cut|demo)/.test(d)) return 'render';
  if (/\b(run|rerun) (the )?(unit |e2e |browser )?tests?\b|\btests? (pass|fail)/.test(d)) return 'test';
  if (/\b(lint|format|type.?check)/.test(d)) return 'tidy';
  if (/\b(build|compile)\b/.test(d)) return 'build';
  if (/\bdownload/.test(d)) return 'download';
  if (/\b(dev )?server\b/.test(d)) return 'serve';
  if (/\b(database|sql)\b/.test(d)) return 'db';
  if (/transcri/.test(d)) return 'listen';
  if (/voice.?over|narrat|record (the )?(audio|voice)/.test(d)) return 'voice';
  if (/\b(resize|crop|compress) (the )?(image|photo|png|jpe?g)/.test(d)) return 'image';
  if (/^(wait|poll|keep waiting)/.test(d)) return 'wait';
  return null;
}

/**
 * Shell commands: a specific tool in the command decides (ffmpeg, git push, pytest…).
 * Plumbing (mkdir, cd, piping through tail) says little, so then what the step says
 * it does (its first verb), or the script it runs, decides. A wait loop happens
 * wherever the thing it waits for lives.
 */
export function bashActivity(command, description = '') {
  const raw = ` ${String(command || '').replace(/\s+/g, ' ')} `;
  const c = ` ${commandsOnly(String(command || '')).replace(/\s+/g, ' ')} `;
  const d = String(description || '').toLowerCase();
  const byCmd = commandActivity(c, d, raw);
  const waitingFor = descriptionActivity(d); // "Wait for the render" → at the render tower
  if (byCmd === 'wait' && waitingFor && waitingFor !== 'wait') return waitingFor;
  if (byCmd && byCmd !== 'files' && byCmd !== 'search') return byCmd;
  return leadVerbActivity(d) || scriptActivity(raw) || byCmd || descriptionActivity(d) || 'run';
}

/** A command with no description, in plain words ("Checking what changed", "Reading app.tsx"). */
export function commandSentence(command) {
  const c = ` ${commandsOnly(String(command || '')).replace(/\s+/g, ' ')} `;
  if (!c.trim()) return null;
  const git = /\bgit (\w+)/.exec(c)?.[1];
  const file = (re) => base((re.exec(c) || [])[1] || '');
  const said = {
    commit: 'Committing the changes', push: 'Pushing the branch', deploy: 'Deploying', install: 'Installing packages',
    test: 'Running the tests', build: 'Building the project', tidy: 'Tidying up the code', serve: 'Starting the dev server',
    db: 'Querying the database', http: 'Calling an API', delete: 'Deleting files', files: 'Moving files around',
    render: 'Rendering', cut: 'Cutting a clip', composite: 'Compositing the video', frames: 'Grabbing frames',
    grade: 'Grading the color', review: 'Checking the media file', voice: 'Recording a voiceover', listen: 'Transcribing audio',
    image: 'Processing images', wait: 'Waiting', stop: 'Stopping a process', deliver: 'Opening the result',
  };
  const activity = bashActivity(command);
  if (activity === 'download') return git === 'pull' ? 'Pulling the latest changes' : git === 'fetch' ? 'Fetching the latest changes' : git === 'clone' ? 'Cloning a repo' : 'Downloading';
  if (activity === 'git') return { status: 'Checking what changed', diff: 'Looking at the changes', log: 'Reading the history', show: 'Looking at a commit', checkout: 'Switching branches', switch: 'Switching branches', branch: 'Checking branches', stash: 'Stashing changes', add: 'Staging changes' }[git] || 'Checking git';
  if (activity === 'search') {
    const read = file(/\b(?:cat|head|tail|less|bat|nl)\s+(?:-\S+\s+)*([^\s|;&]+)/);
    if (read) return `Reading ${read}`;
    const sed = file(/\bsed -n\s+\S+\s+([^\s|;&]+)/);
    if (sed) return `Reading ${sed}`;
    return /\b(rg|grep|ag)\b/.test(c) ? 'Searching the code' : 'Looking through files';
  }
  if (activity === 'run') {
    const sed = file(/\bsed -n\s+\S+\s+([^\s|;&]+)/);
    if (sed) return `Reading ${sed}`;
    const script = file(/\b(?:python3?|node|deno|bun|ruby|bash|sh|tsx|ts-node)\s+(?:-\S+\s+)*([^\s|;&]+\.\w+)/);
    return script ? `Running ${script}` : 'Running a command';
  }
  return said[activity] || null;
}

/** MCP connectors: what the app call amounts to. */
function mcpActivity(server, tool, i) {
  const brand = brandOf(server) || '';
  const t = String(tool).toLowerCase();
  const writes = /create|update|append|insert|write|edit|add|post|send|reply|upload|delete|move|merge|publish|batch/.test(t);
  if (brand === 'premiere' || brand === 'aftereffects' || brand === 'davinci') {
    const what = String(i.name || i.tool_name || tool).toLowerCase();
    if (/export|render|encode|queue/.test(what)) return 'render';
    if (/razor|trim|cut|split|ripple/.test(what)) return 'cut';
    if (/lumetri|colou?r|grade/.test(what)) return 'grade';
    if (/caption|subtitle|title|text|mogrt|graphic/.test(what)) return 'captions';
    if (/import|bin|relink/.test(what)) return 'files';
    if (/audio|volume|mix|voice/.test(what)) return 'listen';
    if (/^(list|get|verify|search|inspect)|schema|status/.test(what) || /^(list|get|verify|search)/.test(t)) return 'review';
    return 'video-edit';
  }
  if (brand === 'figma' || brand === 'canva' || brand === 'photoshop' || brand === 'illustrator') {
    if (/export|download/.test(t)) return 'print';
    if (/screenshot|context|metadata|variable|^get|search|list|whoami/.test(t)) return 'design-look';
    return 'style';
  }
  if (['chrome', 'browser', 'computer', 'simulator'].includes(brand) || BROWSER_SERVERS.test(server)) {
    const act = String(i.action || '').toLowerCase();
    if (/screenshot|snapshot|zoom/.test(t) || /screenshot|zoom/.test(act)) return 'screenshot';
    if (/read_page|page_text|get_text|find|console|network|logs|accessibility/.test(t)) return 'web-read';
    if (/javascript|eval/.test(t)) return 'inspect';
    return 'browse';
  }
  if (['notion', 'claudedocs', 'gdrive', 'dropbox', 'obsidian', 'jira'].includes(brand) && !/jira/.test(brand)) return writes ? 'notes' : 'research';
  if (['slack', 'gmail', 'discord', 'telegram', 'intercom', 'zendesk'].includes(brand)) return writes ? 'message' : 'research';
  if (['github', 'gitlab'].includes(brand)) return /pull_request|merge|push|create_branch/.test(t) && writes ? 'push' : 'git';
  if (['linear', 'jira', 'asana', 'trello', 'todoist'].includes(brand)) return 'plan';
  if (['posthog', 'mixpanel', 'amplitude', 'datadog', 'grafana', 'sentry'].includes(brand)) return 'review';
  if (['database', 'supabase', 'mongodb'].includes(brand)) return 'db';
  if (['vercel', 'netlify', 'cloudflare', 'aws'].includes(brand)) return /deploy|publish/.test(t) ? 'deploy' : 'connector';
  if (brand === 'scheduler') return 'schedule';
  if (brand === 'terminal') return 'run';
  if (brand === 'visualize' || brand === 'claudeapp') return 'deliver';
  return 'connector';
}

export function activityOf(name, i = {}) {
  switch (name) {
    case 'Read': case 'NotebookRead': return fileActivity(i.file_path || i.notebook_path, false);
    case 'Edit': case 'MultiEdit': case 'Write': case 'NotebookEdit': return fileActivity(i.file_path || i.notebook_path, true);
    case 'Bash': case 'PowerShell': return bashActivity(i.command, i.description);
    case 'BashOutput': case 'TaskOutput': case 'Monitor': return 'monitor';
    case 'KillShell': case 'KillBash': case 'TaskStop': return 'stop';
    case 'Grep': case 'Glob': case 'LS': case 'ToolSearch': return 'search';
    case 'LSP': return 'read';
    case 'WebSearch': return 'web-search';
    case 'WebFetch': return 'web-read';
    case 'TaskUpdate': return i.status === 'completed' ? 'check-off' : 'plan';
    case 'TaskCreate': case 'TaskList': case 'TaskGet': case 'TodoWrite': case 'EnterPlanMode': return 'plan';
    case 'AskUserQuestion': case 'ExitPlanMode': return 'ask';
    case 'Agent': case 'Task': case 'Workflow': case 'WaitForHelpers': return 'helper';
    case 'SendMessage': return 'message';
    case 'Skill': return 'skill';
    case 'SendUserFile': case 'Artifact': return 'deliver';
    case 'PushNotification': return 'ring';
    case 'ScheduleWakeup': case 'CronCreate': case 'CronDelete': case 'CronList': return 'schedule';
    default: break;
  }
  if (typeof name === 'string' && name.startsWith('mcp__')) {
    const [, server = '', ...rest] = name.split('__');
    return mcpActivity(server, rest.join('__'), i);
  }
  return 'connector';
}

/** "notion search" → "search" when we already say it's Notion. */
function stripBrand(label, server) {
  const word = (brandById(brandOf(server))?.name || '').split(' ')[0].toLowerCase();
  if (!word) return label;
  const out = label.replace(new RegExp(`^${word}\\s+`), '');
  return out || label;
}

/** Rough "+added −removed" line counts for an edit (lines in common don't count). */
export function lineDelta(before, after) {
  const lines = (x) => (x == null || x === '' ? [] : String(x).split('\n'));
  const left = new Map();
  for (const l of lines(before)) left.set(l, (left.get(l) || 0) + 1);
  let add = 0;
  for (const l of lines(after)) {
    const n = left.get(l) || 0;
    if (n) left.set(l, n - 1); else add++;
  }
  let del = 0;
  for (const n of left.values()) del += n;
  return { add, del };
}

function editDelta(name, i) {
  if (name === 'Edit') return lineDelta(i.old_string, i.new_string);
  if (name === 'MultiEdit' && Array.isArray(i.edits)) {
    return i.edits.reduce((acc, e) => { const d = lineDelta(e.old_string, e.new_string); return { add: acc.add + d.add, del: acc.del + d.del }; }, { add: 0, del: 0 });
  }
  if (name === 'Write') return { add: (typeof i.content === 'string' && i.content ? i.content.split('\n').length : 0), del: 0, whole: true };
  if (name === 'NotebookEdit') return lineDelta('', i.new_source);
  return null;
}

function taskVerb(status) {
  if (status === 'in_progress') return 'Starting';
  if (status === 'completed') return 'Finished';
  if (status === 'deleted') return 'Dropping';
  return 'Updating';
}

/**
 * @returns {{station:string, icon:string, verb:string, label:string, detail?:string,
 *            file?:string, fileOp?:'read'|'edit'|'write', background?:boolean, asksUser?:boolean}}
 */
function browserAction(tool, i) {
  const t = tool.toLowerCase();
  const act = String(i.action || '').toLowerCase();
  if (t.includes('screenshot') || act === 'screenshot') return { verb: 'Looking at', label: 'the page' };
  if (t === 'computer' && /click/.test(act)) return { verb: 'Clicking', label: 'on the page' };
  if (t === 'computer' && /type|key/.test(act)) return { verb: 'Typing', label: 'into the page' };
  if (t === 'computer' && /scroll/.test(act)) return { verb: 'Scrolling', label: 'the page' };
  if (/batch/.test(t)) return { verb: 'Clicking around', label: 'in the browser', detail: (i.actions || []).map((a) => a.name || a.action).filter(Boolean).join(' → ') };
  if (/javascript|eval/.test(t)) return { verb: 'Inspecting', label: 'the page with a script', detail: clip(i.text || i.expression, 300) };
  if (/read_page|page_text|snapshot|find/.test(t)) return { verb: 'Reading', label: 'the page' };
  if (/console|network|logs/.test(t)) return { verb: 'Checking', label: 'the browser logs' };
  if (/preview_start|tabs_create|open/.test(t)) return { verb: 'Opening', label: 'a browser tab' };
  if (/preview_stop|close/.test(t)) return { verb: 'Closing', label: 'a browser tab' };
  if (/resize/.test(t)) return { verb: 'Resizing', label: 'the browser' };
  if (/form|fill/.test(t)) return { verb: 'Filling in', label: 'a form' };
  return { verb: 'Using the browser:', label: humanize(tool) };
}

export function describeTool(name, input) {
  const i = input && typeof input === 'object' ? input : {};
  const d = describeInner(name, i);
  d.activity = activityOf(name, i);
  if (typeof name === 'string' && name.startsWith('mcp__')) {
    const [, server = '', ...rest] = name.split('__');
    d.server = serverKey(server);
    d.toolName = stripBrand(humanize(rest.join('__')), server);
  } else {
    d.toolName = name;
  }
  const delta = editDelta(name, i);
  if (delta) d.delta = delta;
  return d;
}

function describeInner(name, i) {
  switch (name) {
    case 'Read':
      return { station: 'bookshelf', icon: 'book', verb: 'Reading', label: base(i.file_path), detail: i.file_path, file: i.file_path, fileOp: 'read' };
    case 'NotebookRead':
      return { station: 'bookshelf', icon: 'book', verb: 'Reading', label: base(i.notebook_path), detail: i.notebook_path, file: i.notebook_path, fileOp: 'read' };
    case 'Edit':
    case 'MultiEdit':
      return { station: 'desk', icon: 'pencil', verb: 'Editing', label: base(i.file_path), detail: i.file_path, file: i.file_path, fileOp: 'edit' };
    case 'Write':
      return { station: 'desk', icon: 'pencil', verb: 'Writing', label: base(i.file_path), detail: i.file_path, file: i.file_path, fileOp: 'write' };
    case 'NotebookEdit':
      return { station: 'desk', icon: 'pencil', verb: 'Editing', label: base(i.notebook_path), detail: i.notebook_path, file: i.notebook_path, fileOp: 'edit' };
    case 'Bash':
    case 'PowerShell': {
      // Descriptions are already sentences ("Run the tests"); without one (Codex never sends
      // one), say what the command does in plain words instead of showing the raw command.
      const said = i.description ? clip(i.description, 70) : commandSentence(i.command);
      return {
        station: 'terminal', icon: 'terminal',
        verb: i.run_in_background ? 'Starting in the background' : 'Running',
        label: clip(i.description || i.command, 60), detail: clip(i.command, 600),
        about: i.run_in_background && i.description ? clip(i.description, 240) : null,
        text: said ? said + (i.run_in_background ? ' (background)' : '') : null,
        background: !!i.run_in_background, timeoutMs: i.timeout || null,
      };
    }
    case 'BashOutput':
    case 'TaskOutput':
      return { station: 'terminal', icon: 'terminal', verb: 'Checking on', label: 'a background task', detail: i.task_id || i.bash_id || '' };
    case 'KillShell':
    case 'KillBash':
    case 'TaskStop':
      return { station: 'terminal', icon: 'stop', verb: 'Stopping', label: 'a background task', detail: i.task_id || i.shell_id || '' };
    case 'Monitor':
      return { station: 'terminal', icon: 'eye', verb: 'Watching', label: clip(i.description || i.command, 56), detail: clip(i.command, 600), text: i.description ? `Watching: ${clip(i.description, 60)}` : null };
    case 'Grep':
      return {
        station: 'cabinet', icon: 'search', verb: 'Searching for', label: `“${clip(i.pattern, 40)}”`,
        detail: [i.path, i.glob, i.type].filter(Boolean).join(' · ') || 'the whole project',
      };
    case 'Glob':
      return { station: 'cabinet', icon: 'search', verb: 'Finding files', label: clip(i.pattern, 50), detail: i.path || '' };
    case 'LS':
      return { station: 'cabinet', icon: 'search', verb: 'Listing', label: base(i.path) || 'a folder', detail: i.path };
    case 'ToolSearch':
      return { station: 'cabinet', icon: 'search', verb: 'Looking up tools', label: clip(i.query, 48) };
    case 'LSP':
      return { station: 'bookshelf', icon: 'book', verb: 'Inspecting', label: 'code symbols', detail: clip(JSON.stringify(i), 200) };
    case 'WebSearch':
      return { station: 'globe', icon: 'globe', verb: 'Searching the web for', label: `“${clip(i.query, 48)}”` };
    case 'WebFetch':
      return { station: 'globe', icon: 'globe', verb: 'Reading', label: host(i.url), detail: i.url };
    case 'TaskCreate':
      return { station: 'whiteboard', icon: 'list', verb: 'Planning', label: clip(i.subject, 56) };
    case 'TaskUpdate':
      return { station: 'whiteboard', icon: 'list', verb: taskVerb(i.status), label: `task #${i.taskId}` };
    case 'TaskList':
    case 'TaskGet':
      return { station: 'whiteboard', icon: 'list', verb: 'Reviewing', label: 'the plan' };
    case 'TodoWrite':
      return { station: 'whiteboard', icon: 'list', verb: 'Updating', label: 'the plan' };
    case 'EnterPlanMode':
      return { station: 'whiteboard', icon: 'list', verb: 'Drafting', label: 'a plan' };
    case 'ExitPlanMode':
      return { station: 'stage', icon: 'question', verb: 'Presenting', label: 'a plan for your OK', asksUser: true };
    case 'AskUserQuestion':
      return { station: 'stage', icon: 'question', verb: 'Asking you', label: clip(i.questions?.[0]?.question || 'a question', 60), asksUser: true };
    case 'Agent':
    case 'Task':
      return { station: 'portal', icon: 'agent', verb: 'Sending a helper', label: clip(i.description, 50), detail: i.subagent_type || 'general-purpose', text: `Sending a helper: ${clip(i.description, 50)}` };
    case 'SendMessage':
      return { station: 'portal', icon: 'agent', verb: 'Messaging', label: clip(i.to || i.recipient || 'a helper', 40), detail: clip(i.summary || i.message, 160) };
    case 'Workflow': {
      const m = /name:\s*['"]([^'"]+)/.exec(i.script || '');
      return { station: 'portal', icon: 'agent', verb: 'Launching workflow', label: clip(i.name || m?.[1] || 'a workflow', 48) };
    }
    case 'Skill':
      return { station: 'bookshelf', icon: 'sparkle', verb: 'Opening the skill', label: clip(i.skill, 40), detail: clip(i.args, 160) };
    case 'SendUserFile':
      return { station: 'stage', icon: 'file', verb: 'Handing you', label: `${(i.files || []).length || 1} file${(i.files || []).length > 1 ? 's' : ''}`, detail: (i.files || []).map(base).join(', ') };
    case 'PushNotification':
      return { station: 'stage', icon: 'bell', verb: 'Pinging', label: 'you' };
    case 'Artifact':
      return { station: 'workbench', icon: 'sparkle', verb: i.action === 'read' ? 'Reading' : 'Publishing', label: 'an artifact', detail: i.file_path || i.url || '' };
    case 'ScheduleWakeup':
    case 'CronCreate':
      return { station: 'workbench', icon: 'clock', verb: 'Scheduling', label: 'a wake-up' };
    case 'WaitForHelpers':
      return { station: 'portal', icon: 'agent', verb: 'Waiting for', label: 'the helpers' };
    case 'SubagentHandback':
      return { station: 'portal', icon: 'agent', verb: 'Handing back', label: 'the report' };
    default:
      break;
  }
  if (typeof name === 'string' && name.startsWith('mcp__')) {
    const [, server = '', ...rest] = name.split('__');
    const tool = rest.join('__');
    // Editing and design apps are "the desk" for that kind of work.
    if (/premiere|davinci|resolve|final.?cut/i.test(server)) {
      const what = i.name || i.tool_name || tool;
      return { station: 'desk', icon: 'film', verb: 'In Premiere:', label: humanize(what), detail: clip(JSON.stringify(i.arguments || i), 200) };
    }
    if (/figma|figjam|canva|penpot|framer/i.test(server) || /figma|design_context|figjam/i.test(tool)) {
      return { station: 'desk', icon: 'palette', verb: 'In Figma:', label: humanize(tool), detail: clip(i.description || i.nodeId || '', 160) };
    }
    if (BROWSER_SERVERS.test(server)) {
      if (i.description) return { station: 'globe', icon: 'globe', verb: 'In the browser:', label: clip(i.description, 56), text: clip(i.description, 70) };
      const url = i.url && /^https?:/.test(i.url) ? host(i.url) : null;
      if (url) return { station: 'globe', icon: 'globe', verb: 'Browsing', label: url, detail: i.url };
      return { station: 'globe', icon: 'globe', ...browserAction(tool, i) };
    }
    return { station: 'workbench', icon: 'plug', verb: `Using ${serverLabel(server)}:`, label: stripBrand(humanize(tool), server) };
  }
  return { station: 'workbench', icon: 'tool', verb: 'Using', label: humanize(name) };
}
