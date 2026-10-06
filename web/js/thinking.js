// How Clawd thinks. What just happened (a new message, a failed step) and the
// latest thought summary pick a mood; each mood has its own words on the
// label, its own animation, and sometimes its own place to think.
//
// pose: clawd.js pose; item: held while thinking; at: where to go
// ('@whiteboard' = a station, 'failure' = where the last step broke,
// 'pace' = back and forth in the middle of the room). No `at`: think in place.

export const MOODS = {
  read: { tag: 'Reading your message…', pose: 'letter', item: 'letter' },
  update: { tag: 'Reading the update…', pose: 'letter', item: 'letter' },
  debug: { tag: 'Hunting the bug…', pose: 'sleuth', item: 'magnifier', at: 'failure' },
  weigh: { tag: 'Weighing the options…', pose: 'weigh' },
  math: { tag: 'Crunching the numbers…', pose: 'count', item: 'calculator' },
  plan: { tag: 'Sketching a plan…', pose: 'draw', at: '@whiteboard' },
  video: { tag: 'Storyboarding…', pose: 'frame' },
  design: { tag: 'Picturing the design…', pose: 'sketch' },
  words: { tag: 'Finding the right words…', pose: 'wordsmith' },
  research: { tag: 'Mulling over what it read…', pose: 'read', at: '@armchair' },
  recall: { tag: 'Trying to remember…', pose: 'recall' },
  unsure: { tag: 'Hmm, not sure yet…', pose: 'pace', at: 'pace' },
  default: { tag: 'Thinking…', pose: 'ponder' },
};

// What the thought is about. Each mood counts its keyword hits and the most
// hits wins; on a tie, the earlier mood (so a bug beats a "maybe").
const RULES = [
  ['debug', /\b(bugs?|errors?|fail(s|ed|ing|ure)?|broken|crash(es|ed)?|exception|stack ?trace|doesn'?t (work|update|change|fire)|not working|never (updates?|fires?|runs?|works?|changes?)|wrong|regression|undefined|is null|expects?|why (is|does|did|doesn'?t))\b/],
  ['weigh', /\b(options?|versus|vs\.?|either|choose|choice|decide|decision|trade-?offs?|alternatives?|compare|which (one|is better|approach))\b/],
  ['math', /(\d+(\.\d+)?\s?%|\$\s?\d|\b(calculate|compute|total|sum|average|percent(age)?|ratio|budget|cost|price|revenue|estimate|math)\b)/],
  ['plan', /\b(plan|step by step|the steps|approach|strategy|outline|break (it|this) down|roadmap|in order|start (with|by))\b/],
  ['video', /\b(scenes?|shots?|footage|timeline|b-?roll|teaser|storyboard|the (cut|edit)|clips?)\b/],
  ['design', /\b(design|layout|colou?rs?|fonts?|typography|spacing|visual(ly)?|hero|banner|ui|ux|contrast|palette|aesthetic|looks? (good|better|off))\b/],
  ['words', /\b(word(ing|s)?|phrase|sentences?|tone|copy|title|headline|naming|name it|message|email|reply)\b/],
  ['research', /\b(docs?|documentation|paper|articles?|sources?|according to|learn|understand|explain|definition|concepts?|read (up|about))\b/],
  ['recall', /\b(remember|earlier|previously|last time|before that|already (did|have|saw)|recall)\b/],
  ['unsure', /\b(not sure|unclear|maybe|might be|perhaps|confus\w*|strange|odd|weird|hmm|wonder|unsure)\b/],
];

/** The mood a piece of thinking text suggests ('default' if nothing stands out). */
export function moodOfText(text) {
  const t = String(text || '').toLowerCase();
  let best = 'default';
  let most = 0;
  for (const [mood, re] of RULES) {
    const hits = t.match(new RegExp(re.source, 'g'))?.length || 0;
    if (hits > most) { best = mood; most = hits; }
  }
  return best;
}

/** Why is Claude thinking right now? Context first, then the thought, then the kind of session. */
export function moodFor(s, now) {
  const start = s?.turn?.startedAt || 0;
  const steps = (s?.log || []).filter((e) => e.kind === 'tool' && e.at >= start);
  const last = steps[steps.length - 1];
  const thought = s?.thought && s.thought.at >= start ? s.thought : null;
  // Nothing done yet this turn: it's reading what you asked (or the update that woke it).
  if (!steps.length && !thought && now - start < 15000) return s?.turn?.auto ? 'update' : 'read';
  // Something just broke: go find out why.
  if (last?.status === 'error' && now - (last.at + (last.duration || 0)) < 90000) return 'debug';
  const mood = moodOfText(thought?.text);
  if (mood !== 'default') return mood;
  // No clue from the thought: think the way this kind of session usually does.
  return { video: 'video', design: 'design', study: 'research' }[s?.theme?.kind] || 'default';
}
