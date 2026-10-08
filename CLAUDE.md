# Clawd's Room: notes for Claude

A live 3D room where Clawd, Claude Code's mascot, acts out what a Claude Code
session is doing, step by step. This file says how it works and how to extend
it so every session gets its own specific, believable actions. Read it before
changing anything; keep it current when you change how things fit together.

## Run and check

```bash
npm start                 # http://localhost:4747 (server binds 127.0.0.1 only)
npm run check             # replays recent sessions in the terminal: quick sanity check
node --check web/js/room.js   # syntax-check any module you touched
```

Restart the server after changing anything in `server/`; files in `web/` only
need a page reload.

The Mac widget: `npm run widget` builds `build/Clawd Widget.app` (Swift, no
Xcode project: `widget/build.sh` runs `swiftc`) and opens it. Rebuild after
changing `widget/ClawdWidget.swift`; page changes show up when the widget
reloads (quit and reopen it from its menu bar icon).

## What Twan wants (keep to this)

- **Every step looks like what it is.** A render happens at the render tower, a
  cut at the editing desk with scissors, a `git push` throws a paper plane. Two
  different kinds of work should never look the same in the same room: change
  the place, the animation, or what Clawd holds.
- **Thinking looks like what it's about.** Hunting a bug, weighing options,
  storyboarding, crunching numbers: each has its own words, pose and place.
- **Clawd has feelings.** What a step feels like (tests are nerve-racking, a
  stubborn bug is maddening, a fix after three tries is the best) shows on
  its face (brows and a mouth only appear when there's something to show), in
  how it moves, and in an emoji that pops up now and then. Keep the emoji
  occasional: one at a time, strong feelings always, calm ones only sometimes.
- **Plain words first, details one click away.** Labels, bubbles and chat say
  short, plain sentences ("Running the unit tests"). Commands, file paths and
  full thinking live under "Technical details".
- **Say each thing once, and keep the default view lean.** Each fact has one
  home: the status card (what's happening now), the request bar (time, steps,
  time left; collapsed to one line), the chat (what happened), "Technical
  details" (commands, full thinking, lists). Don't add stat cards, clocks or
  pop-ups that repeat them; pop-ups are only for "Claude needs you" and other
  sessions finishing.
- **Look:** crisp, blocky toon shading with outlines (not smooth, not
  pixelated: drawn at the screen's full resolution, Retina included, with
  outlines about one CSS pixel thick), all in the Claude palette (ivory/cream,
  clay orange, kraft, olive, dusty blue, slate). New items and furniture are
  built from boxes in those colours (see `items.js`, `rooms/pieces.js`).
- **Cute and alive, never noisy.** One pull-out per burst of the same tool,
  floats rate-limited, effects small.
- **Read-only and private.** Only read `~/.claude/projects`; never write there,
  never install hooks or change Claude Code settings, keep the server on
  127.0.0.1 (transcripts contain prompts and commands).

## Other agents (Codex, and how to add more)

Codex sessions live in `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`.
`server/codex.js` reads the first line (`session_meta`) to tell main threads,
helper threads (`thread_source: "subagent"`) and safety reviews
(`guardian_review`, skipped) apart, then **translates** each record into the
Claude-Code-shaped records `SessionModel` already understands (prompts,
thinking, text, tool_use/tool_result, turn end). Codex's `exec` scripts call
`tools.exec_command`, `tools.apply_patch`, MCP tools…; the first call becomes
the running step and the matching `item_completed` finishes it. The session is
marked `agent: 'codex'`; the page then uses the Codex mascot skin
(`new Clawd({ skin: 'codex' })`) and its name (`mascotName()` in `util.js`).

To add another agent: write a translator like `codex.js` against its real logs
(read some first), teach `Watcher` where its files live, add a skin in the
`Clawd` constructor (same rig, so every animation still works) and a name in
`mascotName()`. Don't reproduce other companies' logos; give each agent an
original mascot.

## Sharing

`npm run package` builds `dist/Clawd-Widget-macOS.zip`: a universal app with
the server inside (`Resources/app`, three.js trimmed by
`widget/collect-three.mjs`) that finds Node on the friend's Mac. It's ad-hoc
signed only; publishing (GitHub, npm) and Apple signing are Twan's call, so
ask before doing any of it.

## How a step becomes an animation

```
transcript line ──► server/watcher.js (tail) ──► server/session.js (live state, log)
                                                   │ describeTool(name, input)  server/describe.js
                                                   │   station   rough place (desk, terminal…)
                                                   │   activity  exact kind of work (render, cut, commit…)
                                                   │   text, brand (MCP app), delta (+/− lines)
                                                   ▼
                     SSE snapshot ──► web/js/room.js decideMain()
                                        working:  planFor(act) ── activities.js ──► spot + pose + item + throws
                                        thinking: thinkIntent() ── thinking.js ──► mood: words + pose + place
                                        idle:     bed / celebrate / visits after you poke furniture
                                        feeling:  feelingFor(s) + reactionFor(step) ── feelings.js ──► face + body + emoji
                                      web/js/clawd.js  poses, held items, beats (effects), pull-outs
                                      web/js/hud.js    panel, chat, progress (plain words via plain.js)
```

The **room type** (code lab, video studio, art room, classroom, cozy) comes from
`server/theme.js`, which scores folder names, titles, prompts, tools, commands
and file types. Each room has its own furniture and floor plan
(`web/js/rooms/layouts.js`).

## Tailoring to a new kind of session

When someone's sessions are about something the room doesn't act out well yet
(data analysis, writing a book, devops, music…), do this:

1. **Look at real steps first.** `npm run check` lists recent sessions; read a
   transcript in `~/.claude/projects/<project>/<session>.jsonl` (read only) and
   note the commands, file types, MCP tools and the words in thinking summaries.
2. **Name the work.** For each distinct kind of step, pick an activity: reuse
   one from `web/js/activities.js` if it truly looks the same, otherwise add one.
3. **Classify it** in `server/describe.js`: `commandActivity` (shell commands;
   most specific first; a specific tool in the command beats the description,
   but plumbing like `mkdir`, `cd` or `| grep`/`| tail` doesn't count, and then
   the description's first verb (`VERB_ACTIVITY`) or the script's name
   (`scriptActivity`) decides), `descriptionActivity`,
   `fileActivity` (by extension), `mcpActivity` (by connector brand and tool).
   Test right away:
   ```bash
   node -e "import('./server/describe.js').then(({ bashActivity, activityOf }) => console.log(bashActivity('dvc repro', 'Rerun the pipeline')))"
   ```
4. **Stage it** in `web/js/activities.js`: `at` (piece kinds in order of
   preference, `@station` as fallback), `pose`, `item`/`pull`, `sit`, `face`,
   `long` (switch pose after N ms), `throw`, `bare`. Every room must resolve to
   something sensible, so always end `at` with an `@station`.
5. **Animate it** if no pose fits: add a case in `Clawd.applyPose`
   (`web/js/clawd.js`), a `BEATS` entry for its moment (sparks, flashes,
   floats), and, for things that fly across the room, a branch in
   `Room.clawdAction` (`web/js/room.js`, uses `fly()`).
6. **Give it a prop** if needed: build it in `web/js/items.js` (`BUILD`, boxes
   in `U` units, front faces +z) and say how it's held in `GRIP`
   (`R`/`L` hand or `F` both hands in front).
7. **Add furniture** if the room needs a new place: a builder in
   `web/js/rooms/pieces.js`, placed in the right rooms in `layouts.js` (check
   it doesn't block walking), and an entry in `PROPS` (`web/js/interact.js`)
   so it can be hovered and clicked.
8. **A whole new room type** only if the work is common and visually its own:
   keywords in `server/theme.js` (`KINDS`, `WORDS`, `EXT`, `CMD`, `MCP`),
   look in `web/js/themes.js`, floor plan in `layouts.js`, plus an accessory
   for Clawd in `Clawd.wear`.
9. **Thinking:** add or tune a mood in `web/js/thinking.js` (keywords score
   hits; most hits wins) and its pose in `clawd.js`. Moods can go somewhere
   (`at: '@whiteboard'`, `'failure'`, `'pace'`) or happen in place.
10. **Feelings:** say what the new activity feels like in `WORK`
    (`web/js/feelings.js`), and if finishing it is a moment (a deploy landing),
    add it to `reactionFor`. Add a feeling only if none fits: a `face` (eyes,
    brows, mouth, extras), a `body` (bounce, tremble, slump, tempo…), the
    emoji and a short first-person `says` line for the hover tip.
11. **Show it in the demo** (`server/demo.js`) so the looping demo exercises it,
    and add a line to the tables in `README.md`.

### Make sure actions don't overlap

Dump where every activity lands in every room, then check that no two
different activities share both the same spot and the same pose:

```js
// In the page console (or the browser pane's JS tool):
for (const theme of ['cozy', 'lab', 'studio', 'art', 'class']) {
  window.clawdRoom.hud.onStyle(theme);
  const r = window.clawdRoom.room;
  const { ACTIVITIES } = await import('/js/activities.js');
  console.table(Object.keys(ACTIVITIES).map((a) => {
    const p = r.planFor({ activity: a, station: 'terminal' });
    return { a, spot: p.key, piece: p.prop?.kind, pose: p.A.pose, item: p.A.item };
  }));
}
window.clawdRoom.hud.onStyle('auto');
```

Helpers call `planFor(act, true, taken)` and prefer pieces nobody uses; spare
furniture (no station role) beats someone's busy station.

## The zoo (every session at once)

`web/js/zoo.js`: each shown session (live ones first, then recent quiet ones,
six at most) is a full `Room` built with `at: [x, z]`, so it's measured at the
middle and then moved: anything comparing the camera to a room must subtract
`room.group.position` (see `updateWalls`, `updateHolo`). Enclosures sit on a
lawn in a grid `GAP` apart, each with a plaque; `world.setFrameShape()` frames
all their outlines, and the sun's shadow covers the whole zoo while it's open.
In the zoo, Clawds' labels and thoughts are hidden (the plaque says it).
`main.js` switches `view` between 'room' and 'zoo' (Zoo button, Escape, click
an enclosure). The corner widget has the zoo too (its own button on the
caption, `Widget.setZoo`, caption from `zooGlance`, smaller plaques); only
the pill leaves it. `npm run demo` / `npm run widget:demo` run six pretend
agents (`--demo-zoo`, one Codex) and open straight into the zoo (`?zoo`). Ideas for later: helpers walking between enclosures, a beacon
over one that needs you, Codex enclosures in their own corner, the zoo in the
corner widget.

## Helpers and background tasks

Subagents are mini Clawds in caps (`syncHelpers`); background commands
(`s.jobs`, kind `shell`) are smaller ones in hard hats (`syncWorkers`). Both pick
their spot with `planFor(act, true, taken)` so nobody piles onto the same
piece, and both get feelings (`helperFeeling`, `workFeeling`). Workers hop out
of the terminal, and when their job is done bring the result to Clawd
(`finishWorker`) before leaving by the door. The server records each job's
`activity` so a background render goes to the render tower.

## Walking and moving things

- The floor grid (`NavGrid`, `web/js/nav.js`) blocks each solid piece's real
  footprint (its own box, turned with it: `footprint()` in `room.js`) plus a
  margin. Spots pressed against furniture (a desk seat, the armchair, a
  whiteboard) get an `approach` from the open side (`wayOut`), and Clawd leaves
  a spot the way it came in (`route`). Never let a path go through a piece.
- Light pieces (`PUSHABLE` kinds) block like anything else, but when one is
  the only way through, or going around is at least `SHOVE_SAVES` longer,
  Clawd pushes it aside, or pulls it while stepping backwards if there's no
  room behind it (`planShove` → `goShove` → `updateShove`). Spots drawn with
  `k.at()` follow their piece (`rel`). After `TIDY_AFTER` of nothing to do it
  puts things back (`tidyIntent`), unless that would wall it off from bed.
- Nothing can be moved? It squeezes past light things (`navSqueeze`, bodies
  only); walking straight is the very last resort.
- New furniture: if it's light, add its kind to `PUSHABLE`; place stations
  with `k.at()`; then check every trip in every room (`room.route()` between
  all pairs of `room.st` spots, sampled every 5 cm against `room.bodies`) goes
  through nothing.

## The widget

Framing: `World.setAutoFrame()` keeps the room's real outline (floor slab +
the two walls) centred and filling the free part of the screen, re-framing on
every resize; zooming in (`ratio` < 1) slides the aim toward Clawd. Don't put
the camera on a fixed target, and keep `ROOM_POINTS` in `world.js` in sync if
the room's size changes.

Three sizes, all from the same page: **pill** (no 3D at all: `world.paused`),
**mini** (room only, camera follows Clawd, 30 fps, caption bar replaces
Clawd's label, no info cards), **full** (the normal app). Anything new that
appears around the room must be hidden in the small sizes (see the
`body.widget:not([data-mode="full"])` rules in `style.css`), and anything
important must also make it into `glance()` in `widget.js`, because the caption
and the pill are all you see in the corner. The Mac app and the page talk
through `window.webkit.messageHandlers.clawd` (page → app: "change size") and
`window.clawdWidget.setMode()` (app → page).

## Checking it in the browser pane

The pane is often hidden, which pauses animation frames. So:

- Drive time yourself: `window.clawdRoom.world.step(seconds)`.
- Act out any step without waiting for it: select a quiet session
  (`window.clawdRoom.select(id)`, one that isn't live), then override
  `room.decideMain` to return `planFor(fakeAct)` (working) or
  `thinkIntent(fakeState, now, ms)` (thinking), step, and inspect
  `room.intent`, `room.clawd.pose`, `room.clawd.handKey`, `room.flyers`.
- Screenshots lag a frame behind: wait a second before taking one, and trust
  the state you read back over a single frame.
- The pane is small; to see the room, hide `.side, #progress, .kpis, .mapctl`
  with a style tag and override `hud.insets()`.
- CSS animations don't run while hidden: pause them at a frame
  (`animation-play-state: paused; animation-delay: -0.5s`) to see them.
- Feelings: give the intent a `feel` (`room.decideMain = () => ({ …, feel:
  'nervous' })`) or call `room.clawd.react('triumphant', 3)`. To compare faces,
  put a row of `new Clawd()`s in front of the camera, each with
  `setFeeling(name)`, and pause `.emopop` at a frame (CSS doesn't run while
  hidden).
- Clean up afterwards: remove `clawd.session` and `clawd.style.*` from
  `localStorage` and reload, so the page goes back to auto-picking.

## Where things live

| File | What it does |
| --- | --- |
| `server/watcher.js` | finds and tails transcripts (main + `subagents/`) |
| `server/session.js` | replays a transcript into live state, log, turn stats, tool tallies |
| `server/describe.js` | tool call → station, **activity**, sentence, MCP brand, edit line counts |
| `server/theme.js` | which room a session gets |
| `server/demo.js` | the looping demo (one story per room type; `--demo-zoo` plays them all at once, the last one as Codex) |
| `web/js/activities.js` | **the playbook**: where and how each activity is acted out |
| `web/js/thinking.js` | thinking moods: words, pose, place |
| `web/js/feelings.js` | how Clawd feels: what each step feels like, reactions, faces, body language, emoji |
| `web/js/room.js` | decisions, spots, helpers, throws, furniture pokes, faded walls |
| `web/js/clawd.js` | the mascot: poses, faces, held items, beats, pull-outs, floats |
| `web/js/items.js` | props Clawd holds or throws (and how it holds them) |
| `web/js/brands.js` | MCP connector badges (shared with the server) |
| `web/js/interact.js` | furniture names, reactions and info cards |
| `web/js/plain.js` | long text → short plain sentences; chat bubbles |
| `web/js/hud.js` | panels: info card, technical details, chat, progress |
| `web/js/widget.js` | widget mode (`?widget&mode=pill|mini|full`): pill, caption bar, size buttons |
| `widget/ClawdWidget.swift` | the Mac app: floating panel, corner snapping, menu bar, starts the server |
| `web/js/rooms/pieces.js`, `layouts.js` | furniture kit and the five floor plans |
| `web/js/themes.js`, `props.js` | room looks, screens, shared 3D bits |

## Style of the code

Match what's there: small modules, plain JS (no build step), short comments
that say why, names that read like English. User-facing text is short, plain
and friendly; no jargon in the default view. Keep each change small enough to
verify in the pane.
