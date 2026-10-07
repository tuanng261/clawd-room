// How Clawd feels. Working on something isn't neutral: running the tests is
// nerve-racking, a bug that won't budge is maddening, and a fix landing after
// three tries is the best feeling there is. Each feeling has a face, a way of
// moving, a line Clawd would say (shown when you hover it) and a few emoji
// that pop up now and then.
//
// The ongoing feeling comes from what Clawd is doing and how it's been going
// (feelingFor); reactions are short bursts when a step finishes (reactionFor).
//
// face: eyes (taller/shorter ×), look (eyes down −), uneven [left, right],
//       brow (angle: + cross, − worried), lift (brows up +, down −), quirk (one
//       brow up), mouth (smile | grin | o | frown | wavy | flat), happy (∩ ∩
//       eyes), glint (shiny eyes), blush, sweat, tears, vein (💢), yawn
// body: bounce, sway, wobble, tremble, lean, slump, puff, tempo (how fast it
//       moves), and extras: stomp, steam, sparkle, notes, stars, cheer, scratch
// emoji: what pops up; strong: always pop when the feeling starts (calm ones
//       only sometimes); every: seconds between pops while it lasts

import { activityFor } from './activities.js';
import { moodFor, moodOfText } from './thinking.js';
import { probablyNeedsApproval } from './util.js';

export const FEELINGS = {
  // ── starting and exploring ──
  eager: {
    word: 'Eager', says: 'Ooh, something new to make!', emoji: ['👀', '😃', '🙌'], strong: true, every: 20,
    face: { eyes: 1.15, lift: 0.35, glint: true, mouth: 'smile' }, body: { bounce: 0.035, tempo: 1.15 },
  },
  curious: {
    word: 'Curious', says: "Let's see how this works…", emoji: ['🧐', '🤔', '👀'], every: 28,
    face: { eyes: 1.1, lift: 0.15, quirk: 0.25, mouth: 'o' }, body: { sway: 0.035 },
  },
  thoughtful: {
    word: 'Thoughtful', says: 'Hmm, let me think…', emoji: ['🤔', '💭'], every: 30,
    face: { eyes: 0.92, brow: -0.1, lift: 0.1, quirk: 0.15 }, body: {},
  },
  puzzled: {
    word: 'Puzzled', says: "Huh, that's odd…", emoji: ['🤨', '😕', '❓'], every: 24,
    face: { uneven: [1.08, 0.72], brow: 0.08, quirk: 0.35, mouth: 'flat' }, body: { sway: 0.05, tempo: 0.95 },
  },
  // ── making things ──
  focused: {
    word: 'Focused', says: 'In the zone. One line at a time.', emoji: ['🎯', '🤓'], every: 36,
    face: { eyes: 0.85, brow: 0.12, lift: -0.15 }, body: { lean: 0.03, tempo: 1.05 },
  },
  inspired: {
    word: 'Inspired', says: 'Making something new is the best part.', emoji: ['✨', '💡', '🎨'], every: 26,
    face: { eyes: 1.1, lift: 0.3, glint: true, mouth: 'smile' }, body: { bounce: 0.02, sway: 0.03, tempo: 1.1 },
  },
  determined: {
    word: 'Determined', says: 'Okay. I can fix this.', emoji: ['💪', '🔧'], every: 28,
    face: { eyes: 0.8, brow: 0.32, lift: -0.12, mouth: 'flat' }, body: { puff: 0.03, tempo: 1.12 },
  },
  joyful: {
    word: 'Happy', says: "Everything's clicking ♪", emoji: ['🎶', '😊', '😄'], every: 24,
    face: { glint: true, mouth: 'smile', blush: true }, body: { sway: 0.055, bounce: 0.02, tempo: 1.15, notes: true },
  },
  // ── waiting ──
  patient: {
    word: 'Patient', says: "It'll be ready when it's ready.", emoji: ['⌛', '🙂', '📦'], every: 32,
    face: { eyes: 0.9, mouth: 'smile' }, body: { sway: 0.025, tempo: 0.95 },
  },
  impatient: {
    word: 'Impatient', says: 'Come on, come on…', emoji: ['⏳', '😑', '🙄'], strong: true, every: 24,
    face: { eyes: 0.6, brow: 0.14, lift: -0.2, mouth: 'flat' }, body: { tremble: 0.3, tempo: 1.25 },
  },
  bored: {
    word: 'Bored', says: 'Still going? *yawn*', emoji: ['🥱', '😪'], strong: true, every: 26,
    face: { eyes: 0.42, lift: -0.15, mouth: 'flat', yawn: true }, body: { slump: 0.6, tempo: 0.7 },
  },
  tired: {
    word: 'Tired', says: 'Long one. Still on it.', emoji: ['😮‍💨', '🥱', '😪'], every: 32,
    face: { eyes: 0.55, brow: -0.12, lift: -0.08, mouth: 'flat', yawn: true }, body: { slump: 0.7, tempo: 0.8 },
  },
  // ── risky moments ──
  nervous: {
    word: 'Nervous', says: 'Please work, please work…', emoji: ['😬', '🤞', '😰'], strong: true, every: 18,
    face: { eyes: 1.1, brow: -0.38, lift: 0.12, mouth: 'wavy', sweat: true }, body: { tremble: 1, tempo: 1.1 },
  },
  cautious: {
    word: 'Careful', says: 'Careful… careful…', emoji: ['😅', '🫣'], strong: true, every: 22,
    face: { eyes: 1.15, brow: -0.22, lift: 0.1, mouth: 'wavy', sweat: true }, body: { tremble: 0.4, lean: -0.06, tempo: 0.9 },
  },
  excited: {
    word: 'Excited', says: 'Sending it out into the world!', emoji: ['🚀', '🤩', '🙌'], strong: true, every: 20,
    face: { eyes: 1.2, lift: 0.32, glint: true, mouth: 'grin' }, body: { bounce: 0.05, tempo: 1.2 },
  },
  hopeful: {
    word: 'Hopeful', says: "Can I? I'll wait for you.", emoji: ['🥺', '🙏'], strong: true, every: 18,
    face: { eyes: 1.25, brow: -0.28, lift: 0.22, glint: true, mouth: 'smile', blush: true }, body: { sway: 0.04, bounce: 0.012 },
  },
  // ── when things go wrong ──
  startled: {
    word: 'Startled', says: "Whoa, that didn't work!", emoji: ['😳', '😲', '❗'], strong: true,
    face: { eyes: 1.45, lift: 0.4, mouth: 'o' }, body: { lean: -0.12 },
  },
  deflated: {
    word: 'Deflated', says: 'Aw. It failed.', emoji: ['😞', '😣', '💧'], strong: true, every: 22,
    face: { eyes: 0.72, look: -0.22, brow: -0.45, lift: -0.04, mouth: 'frown', tears: true }, body: { slump: 1, tempo: 0.85 },
  },
  frustrated: {
    word: 'Frustrated', says: "Why won't this work?!", emoji: ['😤', '💢', '😠'], strong: true, every: 18,
    face: { eyes: 0.7, brow: 0.5, lift: -0.25, mouth: 'frown', vein: true }, body: { tremble: 0.5, tempo: 1.3, stomp: true, steam: true },
  },
  exhausted: {
    word: 'Worn out', says: "Third try's the charm… right?", emoji: ['😩', '😓', '🫠'], strong: true, every: 20,
    face: { eyes: 0.62, brow: -0.32, lift: -0.06, mouth: 'wavy', sweat: true }, body: { slump: 1, tempo: 0.82 },
  },
  sheepish: {
    word: 'Sheepish', says: 'Oops. Sorry about that!', emoji: ['😅', '🙇'], strong: true, every: 24,
    face: { happy: true, brow: -0.3, lift: 0.08, mouth: 'wavy', blush: true, sweat: true }, body: { tempo: 0.9, scratch: true },
  },
  dazed: {
    word: 'Dazed', says: 'Wait… where was I?', emoji: ['😵‍💫', '💫'], strong: true,
    face: { uneven: [1.3, 0.55], quirk: 0.3, mouth: 'wavy' }, body: { wobble: 0.1, tempo: 0.9, stars: true },
  },
  // ── when things go right ──
  relieved: {
    word: 'Relieved', says: 'Phew!', emoji: ['😮‍💨', '😌', '✅'], strong: true,
    face: { happy: true, brow: -0.15, lift: 0.05, mouth: 'smile' }, body: { sway: 0.03, exhale: true },
  },
  triumphant: {
    word: 'Triumphant', says: 'YES! Finally!', emoji: ['🎉', '🙌', '🥳'], strong: true,
    face: { happy: true, glint: true, mouth: 'grin', blush: true }, body: { bounce: 0.06, tempo: 1.2, cheer: true, sparkle: true },
  },
  proud: {
    word: 'Proud', says: 'Look what we made!', emoji: ['😎', '✨', '💯'], strong: true, every: 28,
    face: { happy: true, lift: 0.12, mouth: 'smile', blush: true }, body: { puff: 0.035, sway: 0.03, sparkle: true },
  },
  content: {
    word: 'Content', says: 'Nice and quiet.', emoji: ['😊', '☕', '😌'], every: 45,
    face: { happy: true, mouth: 'smile' }, body: { sway: 0.03, tempo: 0.9 },
  },
  loved: {
    word: 'Loved', says: 'Hehe, that tickles!', emoji: ['🥰', '💖'], strong: true,
    face: { happy: true, mouth: 'smile', blush: true }, body: { bounce: 0.03 },
  },
  sleepy: {
    word: 'Sleepy', says: 'Zzz…', emoji: ['😴', '💤'], every: 50,
    face: { eyes: 0.12, mouth: 'o' }, body: { slump: 0.5, tempo: 0.7 },
  },
};

// What doing each kind of step feels like (activities.js ids): reading is
// curiosity, tests and deploys are nerves, deleting things is careful work.
const WORK = {
  code: 'focused', notes: 'thoughtful', 'write-tests': 'determined', style: 'inspired', captions: 'focused',
  config: 'focused', read: 'curious', git: 'curious', research: 'curious', 'look-image': 'curious',
  search: 'curious', files: 'focused', delete: 'cautious', tidy: 'content',
  run: 'focused', test: 'nervous', build: 'determined', install: 'patient', serve: 'excited', db: 'focused',
  commit: 'proud', push: 'excited', deploy: 'nervous', http: 'curious', download: 'patient', wait: 'patient',
  monitor: 'curious', stop: 'cautious',
  'web-search': 'curious', 'web-read': 'curious', browse: 'curious', screenshot: 'curious', inspect: 'curious',
  render: 'patient', composite: 'joyful', cut: 'focused', 'video-edit': 'focused', frames: 'curious',
  voice: 'joyful', listen: 'content', grade: 'focused', review: 'curious', print: 'patient', image: 'inspired',
  'design-look': 'curious',
  plan: 'determined', 'check-off': 'proud', helper: 'excited', message: 'focused', ask: 'hopeful',
  deliver: 'proud', ring: 'excited', skill: 'curious', schedule: 'focused', connector: 'focused',
};
// Work you sit and wait for: patience wears thin, then it gets boring.
const WAITING = new Set(['run', 'build', 'install', 'download', 'wait', 'render', 'print', 'serve', 'monitor', 'helper', 'test', 'deploy']);
// Thinking moods (thinking.js) and how they feel.
const THINKING = {
  read: 'eager', update: 'curious', debug: 'determined', weigh: 'puzzled', math: 'focused', plan: 'determined',
  video: 'inspired', design: 'inspired', words: 'thoughtful', research: 'curious', recall: 'puzzled', unsure: 'puzzled',
};
// Easygoing feelings that how-it's-going (stuck, tired, in the flow) can change.
const CALM = new Set(['focused', 'curious', 'thoughtful', 'patient', 'inspired', 'content']);
const SHELL = new Set(['Bash', 'PowerShell']);

/** The user said no to a step (a refused permission), as opposed to the step failing. */
const refused = (e) => /doesn't want to proceed|was rejected|user denied|permission (was )?denied/i.test(e.error || '');
/** Steps of the "same kind", for counting retries: a shell step by what it does, others by tool and target. */
const kindOf = (e) => (SHELL.has(e.tool) ? `${e.tool}|${e.activity}` : `${e.tool}|${e.detail || e.text}`);
const finished = (steps) => steps.filter((e) => (e.status === 'done' || e.status === 'error') && !refused(e));

/** Failed tries of the same kind of step, in a row, right before `steps[i]`. */
function failsBefore(list, i) {
  const key = kindOf(list[i]);
  let n = 0;
  for (let k = i - 1; k >= 0; k--) {
    if (kindOf(list[k]) !== key) continue;
    if (list[k].status === 'done') break;
    n++;
  }
  return n;
}

/**
 * How stuck Clawd is: failed tries at the same kind of step since it last
 * worked. Forgotten once Clawd has clearly moved on.
 */
export function stuckness(steps, now) {
  const list = finished(steps);
  let i = list.length - 1;
  while (i >= 0 && list[i].status !== 'error') i--;
  if (i < 0) return 0;
  const last = list[i];
  if (now - (last.at + (last.duration || 0)) > 4 * 60000 || list.length - 1 - i > 10) return 0;
  const key = kindOf(last);
  if (list.slice(i + 1).some((e) => kindOf(e) === key)) return 0; // it worked since
  return failsBefore(list, i) + 1;
}

/** What doing this step feels like, and how that changes the longer it takes. */
export function workFeeling(act, now) {
  const id = activityFor(act);
  let f = WORK[id] || 'focused';
  if (id === 'code' && act.delta?.whole) f = 'inspired'; // a brand-new file
  else if (id === 'code' && (act.delta?.add || 0) + (act.delta?.del || 0) >= 80) f = 'determined'; // a big change
  if (WAITING.has(id) && !act.background) {
    const took = now - act.startedAt;
    const nerves = f === 'nervous' ? 45000 : 0; // nerves hold out a little longer
    if (took > 150000 + nerves) f = 'bored';
    else if (took > 45000 + nerves) f = 'impatient';
  }
  return f;
}

/** Several quick steps in a row, all working: Clawd is in the flow. */
function inFlow(steps, now) {
  const list = finished(steps);
  if (list.length < 6) return false;
  const last6 = list.slice(-6);
  return last6.every((e) => e.status === 'done') && now - last6[0].at < 90000 && !list.slice(-12).some((e) => e.status === 'error');
}

/** How Clawd feels right now, from what it's doing and how the request has gone so far. */
export function feelingFor(s, now) {
  if (!s || s.status === 'stale' || (!s.live && s.status !== 'idle')) return 'sleepy';
  const turn = s.turn;
  const start = turn?.startedAt || 0;
  const steps = (s.log || []).filter((e) => e.kind === 'tool' && e.at >= start);
  if (s.status === 'idle') {
    const since = turn?.endedAt ? now - turn.endedAt : Infinity;
    const resting = now - (s.statusSince || now);
    if (turn?.interrupted && since < 20000) return 'sheepish';
    if (since < 9000) return steps.some((e) => e.status === 'error' && !refused(e)) ? 'relieved' : 'proud';
    return resting > 90000 ? 'sleepy' : 'content';
  }
  const act = s.pending?.length ? s.pending[s.pending.length - 1] : null;
  if (act && (act.asksUser || probablyNeedsApproval(act, s, now))) return 'hopeful';
  const stuck = stuckness(steps, now);
  if (stuck >= 3) return 'exhausted';
  if (stuck === 2) return 'frustrated';
  const base = s.status === 'working' && act ? workFeeling(act, now) : THINKING[moodFor(s, now)] || 'thoughtful';
  if (!CALM.has(base)) return base;
  if (stuck === 1) return 'determined';
  if (turn && (now - turn.startedAt > 25 * 60000 || turn.toolCalls > 90)) return 'tired';
  if (base === 'focused' && inFlow(steps, now)) return 'joyful';
  return base;
}

/** A helper's feeling: same idea, from what it's doing and its own failed tries. */
export function helperFeeling(a, now, fails = 0) {
  if (a.status === 'starting' || !a.toolCalls) return 'eager';
  if (fails >= 2) return 'frustrated';
  const act = a.pending?.length ? a.pending[a.pending.length - 1] : null;
  const base = act ? workFeeling(act, now) : THINKING[moodOfText(a.thought?.text)] || 'thoughtful';
  return fails === 1 && CALM.has(base) ? 'determined' : base;
}

/**
 * A short burst of feeling when a step finishes: [feeling, seconds], or null.
 * `steps` are this request's steps (log entries), in order.
 */
export function reactionFor(e, steps) {
  if (e.status === 'error' && refused(e)) return ['sheepish', 3.5];
  const list = finished(steps);
  const i = list.findIndex((x) => x.id === e.id);
  if (i < 0) return null;
  const before = failsBefore(list, i);
  if (e.status === 'error') {
    if (before >= 2) return ['exhausted', 3];
    if (before === 1) return ['frustrated', 3];
    return activityFor(e) === 'test' ? ['deflated', 3] : ['startled', 1.4];
  }
  if (before >= 2) return ['triumphant', 3.2]; // finally!
  if (before === 1) return ['relieved', 2.6];
  const id = activityFor(e);
  if (id === 'test') return ['relieved', 2.4];
  if (id === 'deploy') return ['triumphant', 3];
  if (id === 'push' || id === 'commit') return ['proud', 2.2];
  return null;
}
