// What each piece of furniture is, how it reacts when you poke it, and the
// little card it shows: for the work stations, what Claude actually did there.

import { badgeHtml } from './brands.js';
import { icon } from './icons.js';
import { brandFor } from './items.js';
import { asDoing, simplify } from './plain.js';
import { clock, esc, fmtAgo, fmtDur, mascotName } from './util.js';

// react: bounce (default) | spin | wiggle | squish | globe | door | drawers | steam | none
// Pieces missing here (rugs, LED strips, cable trays) aren't clickable.
export const PROPS = {
  officeChair: { name: 'Office chair', blurb: 'It spins. Of course it spins.', react: 'spin' },
  stool: { name: 'Stool', blurb: 'For perching while typing.', react: 'spin' },
  plant: { name: 'Plant', blurb: 'Keeps the air fresh on long sessions.', react: 'wiggle' },
  wallWindow: { name: 'Window', blurb: 'The sky outside follows your real time of day.', react: 'none' },
  wallClock: { name: 'Clock', react: 'wiggle' },
  poster: { name: 'Poster', blurb: 'Wall art for the room.', react: 'wiggle' },
  artPoster: { name: 'Art print', blurb: 'A little color for the wall.', react: 'wiggle' },
  door: { name: 'Helper door', react: 'door' },
  wallBoard: { name: 'Whiteboard', react: 'wiggle' },
  rollingBoard: { name: 'Rolling whiteboard', react: 'wiggle' },
  onAirSign: { name: 'On-air sign', blurb: 'Lights up when Clawd talks to you on camera.', react: 'wiggle' },
  foamPanels: { name: 'Sound panels', blurb: 'Shh, recording.', react: 'none' },
  pennants: { name: 'Pennants', blurb: 'Go team.', react: 'wiggle' },
  statusScreen: { name: 'Status screen', blurb: 'Shows the latest command and whether it passed.', react: 'none' },
  pegboard: { name: 'Pegboard', blurb: 'Every tool in its place.', react: 'wiggle' },
  polaroids: { name: 'Polaroids', blurb: 'Snapshots from past shoots.', react: 'wiggle' },
  cozyDesk: { name: 'Desk' },
  workstation: { name: 'Workstation' },
  editingDesk: { name: 'Editing desk' },
  draftingTable: { name: 'Drafting table' },
  teacherDesk: { name: 'Teacher’s desk' },
  studentDesk: { name: 'Student desk', blurb: 'Nobody’s late today.' },
  bookshelf: { name: 'Bookshelf' },
  terminalTable: { name: 'Terminal' },
  serverRack: { name: 'Server rack', blurb: 'One row lights up for each background job.' },
  renderTower: { name: 'Render tower' },
  plotter: { name: 'Plotter' },
  computerDesk: { name: 'Computer corner' },
  fileCabinet: { name: 'Filing cabinet', react: 'drawers' },
  partsDrawers: { name: 'Parts drawers', react: 'drawers' },
  roadCases: { name: 'Road cases', react: 'drawers' },
  flatFiles: { name: 'Flat files', react: 'drawers' },
  cardCatalog: { name: 'Card catalog', react: 'drawers' },
  globe: { name: 'Globe', react: 'globe' },
  holoGlobe: { name: 'Hologram globe', react: 'globe' },
  fieldMonitor: { name: 'Field monitor' },
  laptopTable: { name: 'Laptop' },
  workbench: { name: 'Workbench' },
  electronicsBench: { name: 'Electronics bench' },
  scienceTable: { name: 'Science table' },
  cameraRig: { name: 'Camera', blurb: 'Rolling.' },
  easel: { name: 'Easel', react: 'wiggle' },
  paintTable: { name: 'Paint table', blurb: 'Mind the wet paint.' },
  bigWorkTable: { name: 'Work table', blurb: 'Room to spread out.' },
  armchair: { name: 'Armchair', react: 'squish' },
  beanbag: { name: 'Beanbag', react: 'squish' },
  directorsChair: { name: 'Director’s chair', blurb: 'Reserved for Clawd.', react: 'squish' },
  couch: { name: 'Couch', react: 'squish' },
  futon: { name: 'Futon', react: 'squish' },
  petBed: { name: 'Bed', react: 'squish' },
  poufs: { name: 'Poufs', blurb: 'Soft seats for story time.', react: 'squish' },
  readingNook: { name: 'Reading nook', react: 'squish' },
  softbox: { name: 'Softbox light', blurb: 'Soft, flattering light.', react: 'wiggle' },
  ringLight: { name: 'Ring light', blurb: 'For that catchlight in Clawd’s eyes.', react: 'wiggle' },
  backdrop: { name: 'Green screen', blurb: 'Anything can go behind Clawd here.', react: 'none' },
  coffeeCounter: { name: 'Coffee counter', react: 'steam' },
  bust: { name: 'Plaster bust', blurb: 'A very patient drawing model.', react: 'wiggle' },
  trashCan: { name: 'Trash can', blurb: 'Where deleted code goes.', react: 'wiggle' },
  micStand: { name: 'Microphone', blurb: 'For voiceovers and narration.', react: 'wiggle' },
};

// What happens at each work station, and which icon goes with it.
const ROLES = {
  desk: { what: '{m} edits and writes files here', icon: 'pencil', verb: 'Edit files' },
  terminal: { what: '{m} runs commands here', icon: 'terminal', verb: 'Run commands' },
  bookshelf: { what: '{m} reads files and opens skills here', icon: 'book', verb: 'Read' },
  cabinet: { what: '{m} searches the project here', icon: 'search', verb: 'Search' },
  globe: { what: '{m} goes online and drives the browser here', icon: 'globe', verb: 'Browse' },
  whiteboard: { what: 'The plan lives on this board', icon: 'list', verb: 'Plan' },
  workbench: { what: '{m} uses connectors and other tools here', icon: 'tool', verb: 'Tinker' },
  portal: { what: 'Helpers come and go through this door', icon: 'agent', verb: 'Send helpers' },
  armchair: { what: '{m} sits here to think long thoughts', icon: 'thought', verb: 'Think' },
  bed: { what: '{m} naps here while it’s your turn', icon: 'moon', verb: 'Nap' },
};

export const roleIcon = (role) => ROLES[role]?.icon || 'sparkle';

/** The hover tooltip. */
export function tipHtml(prop) {
  const role = ROLES[prop.role];
  return `<div class="proptip"><b>${esc(prop.info.name)}</b>${role ? `<span>${esc(role.verb)} · click for details</span>` : '<span>click me</span>'}</div>`;
}

function stepsAt(s, station) {
  const start = s.turn?.startedAt || 0;
  return (s.log || []).filter((e) => e.kind === 'tool' && e.station === station && e.at >= start);
}

function countAt(s, station) {
  const tools = s.turn?.tools || [];
  if (tools.some((x) => x.station)) return tools.filter((x) => x.station === station).reduce((n, x) => n + x.n, 0);
  return stepsAt(s, station).length;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function stepRows(s, station, max = 4) {
  const now = clock.now();
  return (s.log || []).filter((e) => e.kind === 'tool' && e.station === station).slice(-max).reverse().map((e) => {
    const brand = brandFor(e);
    return {
      cls: e.status === 'error' ? 'bad' : e.status === 'running' ? 'live' : '',
      mark: brand ? badgeHtml(brand) : e.status === 'error' ? '✗' : e.status === 'running' ? '●' : '✓',
      text: simplify(asDoing(e.text), 9),
      meta: e.status === 'running' ? 'now' : e.duration != null ? fmtDur(e.duration) : fmtAgo(now - e.at),
    };
  });
}

/** What goes inside the card shown when you click a piece. */
export function cardHtml(prop, s, extra = {}) {
  const now = clock.now();
  const role = ROLES[prop.role];
  let sub = prop.info.blurb || '';
  let stat = '';
  let rows = [];
  let empty = '';
  if (role) sub = role.what.replace('{m}', mascotName());
  if (role && s) {
    switch (prop.role) {
      case 'desk': {
        const steps = stepsAt(s, 'desk');
        const add = steps.reduce((n, e) => n + (e.delta?.add || 0), 0);
        const del = steps.reduce((n, e) => n + (e.delta?.del || 0), 0);
        stat = `${plural(countAt(s, 'desk'), 'edit')} this request${add || del ? ` · <b class="add">+${add}</b> <b class="del">−${del}</b> lines` : ''}`;
        rows = (s.files || []).filter((f) => f.edits).slice(0, 4).map((f) => ({ mark: '✎', text: f.name, meta: `${plural(f.edits, 'edit')} · ${fmtAgo(now - f.lastAt)}` }));
        empty = 'No files edited in this session yet.';
        break;
      }
      case 'bookshelf':
        stat = `${plural(countAt(s, 'bookshelf'), 'read')} this request`;
        rows = (s.files || []).filter((f) => f.reads).slice(0, 4).map((f) => ({ mark: '▤', text: f.name, meta: `${plural(f.reads, 'read')} · ${fmtAgo(now - f.lastAt)}` }));
        empty = 'Nothing read yet.';
        break;
      case 'terminal': {
        const failed = stepsAt(s, 'terminal').filter((e) => e.status === 'error').length;
        const jobs = (s.jobs || []).filter((j) => j.status === 'running').length;
        stat = `${plural(countAt(s, 'terminal'), 'command')} this request${failed ? ` · <b class="del">${failed} failed</b>` : ''}${jobs ? ` · ${plural(jobs, 'job')} in the background` : ''}`;
        rows = stepRows(s, 'terminal');
        empty = 'No commands yet.';
        break;
      }
      case 'cabinet':
        stat = `${plural(countAt(s, 'cabinet'), 'search', 'searches')} this request`;
        rows = stepRows(s, 'cabinet');
        empty = 'No searches yet.';
        break;
      case 'globe':
        stat = `${plural(countAt(s, 'globe'), 'web step')} this request`;
        rows = stepRows(s, 'globe');
        empty = 'Nothing looked up online yet.';
        break;
      case 'workbench': {
        const apps = (s.turn?.tools || []).filter((x) => x.server);
        stat = apps.length
          ? `<span class="pc-apps">${apps.slice(0, 5).map((x) => `${badgeHtml(brandFor({ server: x.name, serverName: x.name, brand: x.brand }))}<span>${esc(x.name)} ×${x.n}</span>`).join('')}</span>`
          : 'No connectors used in this request.';
        rows = stepRows(s, 'workbench');
        empty = 'Nothing built here yet.';
        break;
      }
      case 'whiteboard': {
        const tasks = s.tasks || [];
        const done = tasks.filter((t) => t.status === 'completed').length;
        stat = tasks.length ? `${done} of ${plural(tasks.length, 'task')} done` : 'No task list for this request.';
        const order = { in_progress: 0, pending: 1, completed: 2 };
        rows = tasks.slice().sort((a, b) => (order[a.status] ?? 1) - (order[b.status] ?? 1)).slice(0, 5).map((t) => ({
          cls: t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'live' : '',
          mark: t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '▸' : '○',
          text: t.status === 'in_progress' && t.activeForm ? t.activeForm : t.subject,
          meta: '',
        }));
        break;
      }
      case 'portal': {
        const agents = (s.agents || []).slice().reverse();
        const running = agents.filter((a) => a.status === 'running' || a.status === 'starting').length;
        stat = running ? `${plural(running, 'helper')} working right now` : `${plural(agents.length, 'helper')} recently`;
        rows = agents.slice(0, 4).map((a) => ({
          cls: a.status === 'running' || a.status === 'starting' ? 'live' : a.status === 'failed' ? 'bad' : 'done',
          mark: a.status === 'running' || a.status === 'starting' ? '●' : a.status === 'failed' ? '✗' : '✓',
          text: a.description,
          meta: `${a.toolCalls} steps`,
        }));
        empty = 'No helpers sent yet.';
        break;
      }
      case 'armchair':
        if (s.thought?.text) rows = [{ mark: '“', text: simplify(s.thought.text, 14), meta: fmtAgo(now - s.thought.at) }];
        empty = `Nothing on ${mascotName()}’s mind right now.`;
        break;
      case 'bed':
        stat = s.status === 'idle' ? `Your turn for ${fmtDur(now - (s.statusSince || now))}` : `${mascotName()} is busy right now, no naps.`;
        break;
      default:
        break;
    }
  } else if (s) {
    // A few decorations know something about the session too.
    if (prop.kind === 'wallClock') sub = `It’s ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
    if (prop.kind === 'serverRack') {
      const jobs = (s.jobs || []).filter((j) => j.status === 'running').length;
      stat = jobs ? `${plural(jobs, 'background job')} running right now` : 'No background jobs right now.';
    }
    if (prop.kind === 'coffeeCounter') {
      sub = 'Fuel for long sessions.';
      stat = `Cups so far: ${extra.cups || 0}`;
    }
  }
  const list = rows.length
    ? `<ul class="pc-list">${rows.map((r) => `<li class="${r.cls || ''}"><i>${r.mark}</i><span>${esc(r.text)}</span>${r.meta ? `<em>${esc(r.meta)}</em>` : ''}</li>`).join('')}</ul>`
    : empty ? `<div class="pc-empty">${esc(empty)}</div>` : '';
  const hint = extra.hint ? `<div class="pc-hint">${esc(extra.hint)}</div>` : '';
  return `<div class="pc-head"><span class="pc-ic">${icon(role ? role.icon : 'sparkle')}</span><div><b>${esc(prop.info.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>
    ${stat ? `<div class="pc-stat">${stat}</div>` : ''}${list}${hint}`;
}
