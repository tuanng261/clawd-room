# Clawd's Room

A tiny 3D room where your coding agent's mascot acts out what your sessions are doing right now: Clawd for Claude Code, and a little terminal buddy for Codex. You can see what it's working on, what it's thinking, which helpers it sent off, and roughly how long is left.

## Run it

```bash
npm install
npm start          # then open http://localhost:4747
```

In the Claude desktop app, open the preview called **clawd-room** (it's set up in `.claude/launch.json`) and keep it next to your chat.

Options: `--port 4747`, `--hours 6` (how far back to list sessions), `--no-demo`, `--projects <dir>` (Claude Code), `--codex <dir>` or `--no-codex` (Codex), `--open`.

### Share it with friends

**Mac app (easiest for them):**

```bash
npm run package    # makes dist/Clawd-Widget-macOS.zip (under 1 MB)
```

Send them the zip (AirDrop, Slack, Drive…). It holds the app (Apple Silicon and Intel) with the room's server inside, and a short read-me. They drag it into Applications and open it the first time with **right-click > Open** (it isn't signed with an Apple Developer ID; on newer macOS they may need System Settings > Privacy & Security > Open Anyway). They need Node.js installed; the app finds it on its own and shows a message if it's missing. It picks up their Claude Code and Codex sessions automatically.

To skip the right-click step you'd sign and notarize it with an Apple Developer ID ($99/year): `codesign --deep --options runtime --sign "Developer ID Application: …"`, then `xcrun notarytool submit … --wait` and `xcrun stapler staple`.

**Any computer, in the browser:** they need Node.js and this folder (zip it, or put it on GitHub), then `npm install && npm start`. Once it's published to npm, it's just `npx clawd-room`.

### On your desktop (Mac widget)

```bash
npm run widget     # builds "Clawd Widget.app" into build/ and opens it
```

Clawd's room in a small window that floats in a corner of your screen, above your other windows and on every Space, without stealing focus. It starts the room's server by itself if it isn't running. Three sizes:

- **Pill**: Clawd's face, one line about what it's doing, a timer. Turns blue and bounces when Claude needs you. Click it to open the corner view.
- **Corner view**: just the room with a caption bar (what it's doing, the tool, the plan's progress). The room stays centred and fills the window however you size it. Scroll or pinch to zoom (zooming in slides the view toward Clawd, and it remembers your zoom), drag to look around, double-click for a close-up of Clawd or back to the whole room.
- **Full view**: the whole app, in a normal window.

Drag the top edge (or the pill) anywhere and it snaps to the nearest corner. Resize the corner view from its edges; it remembers the size. The menu bar icon shows, hides and resizes it, picks the corner, and opens the full room in your browser. Needs the Xcode command line tools (`xcode-select --install`). Server output goes to `~/Library/Logs/ClawdWidget.log`.

In any browser, `http://localhost:4747/?widget&mode=mini` (or `pill`, `full`) shows the same compact views.

## How it works

Claude Code writes every session to `~/.claude/projects/<project>/<session>.jsonl`, with helpers (subagents) in a `subagents/` folder next to it. Codex writes each thread to `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (helpers are threads of their own; its internal safety reviews are skipped), and `server/codex.js` translates those into the same shape, so everything below works the same for Codex. The server tails those files, turns them into "what's happening now", and streams that to the page. You don't need hooks or any setup. It only reads the files, and it only listens on `127.0.0.1` because the logs contain your prompts and commands.

| Clawd goes to… | when Claude is… |
| --- | --- |
| desk (types on the stool) | editing or writing files |
| terminal | running commands (background jobs light up the server rack) |
| bookshelf | reading files, opening skills |
| filing cabinet (magnifying glass) | searching (Grep, Glob) |
| globe | on the web or driving a browser |
| whiteboard (draws the task list) | planning, or thinking for more than 10 s |
| helper door | sending off subagents (they walk out in little hats) |
| workbench | using MCP connectors and other tools |
| front of the room, waving | asking you something, or probably waiting for your approval |
| armchair | thinking for a long time |
| bed | waiting for you (naps after a while) |

**Rooms that fit the work:** each kind of work gets its own room, with its own furniture and floor plan. The room is picked from the folder name and title, what you asked for, the tools Claude uses, its commands and the file types:

| Work | Room | What's in it |
| --- | --- | --- |
| Code | **Code lab** | long 3-monitor workstation, wall of server racks with a console, rolling whiteboard, hologram globe, parts drawers, electronics bench, beanbag, futon, coffee counter. Clawd wears glasses. |
| Video | **Video studio** | a green-screen set (Clawd talks to you from the stool, on camera), softboxes and a ring light, camera on a tripod, editing bay, render cart, film shelf, road cases, director's chair, ON AIR sign. Clawd wears headphones. |
| Design | **Art room** | drafting table under a big window, large-format printer, central work table, easel with a painting that fills in, paint shelf, flat files, moodboard. Clawd wears a beret. |
| Studying | **Classroom** | chalkboard, teacher's desk facing rows of student desks, library shelf, card catalog, computer corner, science table, reading nook. Clawd wears a graduation cap. |
| Anything else | **Cozy room** | desk, bookshelf, whiteboard, armchair, pet bed. |

Clawd does the same kinds of work in every room (edit, run, read, search, browse, plan, tinker, call helpers), only the furniture it does it at changes. Drag to look around: when you swing the camera behind a wall, that wall (and whatever hangs on it) fades to glass so you can still see inside. The room switches only when another kind of work clearly takes over. Use the **Room** button at the top to pick a style yourself (remembered per session).

**Thinking:** what Claude is thinking about decides how Clawd thinks. Right after you send a message it reads your letter; after a failed step it goes back to where it broke and hunts the bug with a magnifier; when the thought weighs options its arms tip like a scale; numbers get a calculator, plans the whiteboard, video a director's frame, design a sketchpad, wording a pencil-to-chin routine, memories a hand to the temple, and "not sure" sends it pacing. With no thought summary to go on, it thinks the way that kind of session usually does. The label says which ("Hunting the bug…", "Weighing the options…"), the short thought pops up in a bubble, and long thoughts end up in the armchair.

**Feelings:** Clawd feels its way through the work. Running the tests is nerve-racking (worried brows, a wobbly mouth, a sweat drop, a little trembling); a failed run lets it down (a frown, a tear); a second failure makes it cross (angry brows, a 💢, steam, stomping); and when the fix finally lands it cheers with its arms up. Its face shows it (brows and a mouth appear only when there's something to show), so does how it moves (bouncy when excited, slow when tired), and now and then an emoji pops up beside it. Hover Clawd to see how it feels and what it would say. Helpers and the Codex mascot have feelings too, and in the pill the little face shows them.

| When Clawd is… | it feels… |
| --- | --- |
| starting on your message | eager 👀 |
| reading, searching, browsing | curious 🧐 |
| editing code | focused 🎯, and happy 🎶 when everything keeps working |
| writing a new file, styling, designing | inspired ✨ |
| running the tests, deploying | nervous 😬 |
| deleting things, stopping processes | careful 😅 |
| waiting on a long command | patient, then impatient ⏳, then bored 🥱 |
| failing once / twice / three times | startled 😳 (let down 😞 if it's the tests) / frustrated 😤 / worn out 😩 |
| getting it to work after that | relieved 😮‍💨 / triumphant 🎉 |
| committing, pushing, finishing | proud 😎, excited 🚀 |
| asking you something, waiting for your OK | hopeful 🥺 |
| stopped by you, or told no | sheepish 😅 |
| right after its memory is tidied up | dazed 😵‍💫 |
| being petted | loved 🥰 |

**Every step looks different:** each step is sorted into one of about 50 activities from what it actually does (the shell command, the file type, the app a connector drives), and each activity has its own spot in the room, its own animation and the thing Clawd holds. A few of them:

| Claude is… | Clawd… |
| --- | --- |
| compositing video (ffmpeg overlay, picture-in-picture) | strikes poses on the green screen, facing the camera |
| cutting clips (ffmpeg trims, Premiere razor) | snips with scissors at the editing desk |
| rendering (ffmpeg encodes, Remotion, Premiere export) | works the render tower, then waits with arms folded |
| recording a voiceover / transcribing | sings into the mic stand / listens on the couch, hand on the headphones |
| grading color, watching back a cut | twiddles knobs at the field monitor / eats popcorn in the director's chair |
| extracting frames, taking screenshots | shoots with the camera rig |
| running tests / building | ticks a clipboard at the test bench / hammers at the workbench |
| `npm install`, `git clone`, downloads | unboxes a parcel at the door / catches one dropping in |
| `git commit` / `git push` / deploying | shelves a new book / throws a paper plane at the globe / launches a rocket |
| `rm` / linting / moving files | tosses paper balls into the trash / sweeps / carries boxes |
| calling an API, querying a database | waves a walkie-talkie / digs through the server rack |
| writing notes, styling, reading a screenshot | writes by hand at a desk / paints at the easel / holds up a photo |

Every room finds its own place for each activity (no green screen in the classroom, so compositing happens at the desk), spare furniture is used before someone's busy station, and helpers pick spots nobody is using.

**Tools, up close:** every time Claude starts a different tool, Clawd pulls the matching item out from behind and holds it up with its name: a book for reading, a pencil for edits, a little terminal for commands, a magnifier for searches, a globe for the web, a clipboard for the plan, a megaphone for helpers, a "?" sign for questions, a scroll for skills, and a game cartridge with the app's badge for MCP connectors. A burst of the same tool only gets one pull. Then:

- edits float up their line counts (`+12 −3`), long steps their time (`✓ 40s`), and failures a red `✗` with a puff of smoke
- long commands: arms folded, foot tapping, the odd look at the watch (instead of typing for minutes)
- reading: the eyes sweep along each line; typing: little bits of code fly into the screen
- while a connector is in use, its cartridge hovers over the station

**Poke things:** hover any piece of furniture to see what it is; click it and it reacts (chairs spin, plants and posters wiggle, beds and beanbags squish, the globe spins up, drawers and the helper door open, the coffee machine steams). Work stations also show a card with what Claude did there: the files edited at the desk (with line counts), the commands at the terminal, the files read at the bookshelf, the searches at the cabinet, the plan on the whiteboard, the helpers at the door. When Claude isn't working, Clawd walks over and plays with whatever you clicked (the coffee counter keeps count of the cups); while it's busy, it just looks over. Click Clawd to pet it; five quick pets get you confetti. Esc or a click on empty floor closes the card.

**MCP badges:** connectors get a small badge in roughly the app's colours (Figma, Notion, Google Drive, PostHog, Slack, GitHub, Linear and about 50 more). Connectors added through claude.ai show up in the logs with random ids, so the server works out which app each one is from the tool lists and instructions Claude Code saves in the log. Ones it doesn't know get their initials.

**The side panel:** the card on top says in plain words what Clawd is doing, with which tool and for how long, plus its latest thought in one short line. **Technical details** opens the rest: the exact command or file path, the full thought, the model, the helpers / background jobs / files lists, and the recent steps with their tools. Below it, a chat feed pops in short bubbles as Claude works ("Reading 4 files", "Running the unit tests"), each with the tool it used underneath.

**This request:** one line at the bottom with the essentials: how long it's been going, steps done out of steps taken, failures, helpers, and the time left (when Claude wrote a plan). Click it to open the plan's steps (or a bar per step, coloured by where it happened) and the tools used.

**Time left:** if Claude made a task list, the estimate comes from how long the finished tasks took. Without a task list there's no honest estimate, so the panel shows each step instead.

## Limits

- Thinking summaries only appear when Claude Code saved one (about half the time), and only once that thought is finished.
- "Waiting for your approval" is a guess: a normally instant tool that's been running for 20 s or more.
- The log format is internal to Claude Code and may change between versions.

## Files

- `server/watcher.js`: finds and tails the logs (Claude Code and Codex)
- `server/codex.js`: reads Codex sessions and translates them
- `server/session.js`: replays a log into live state
- `server/describe.js`: maps each tool to a station, an activity and a sentence, works out which app each MCP connector is, counts edited lines
- `server/theme.js`: works out which kind of work a session is doing
- `server/demo.js`: the looping demo (one story per room)
- `web/js/room.js`: the room and what Clawd decides to do
- `web/js/clawd.js`: the mascot, its poses and faces, pulling out tools, sparkles and floating numbers
- `web/js/activities.js`: the playbook: where and how each kind of step is acted out
- `web/js/thinking.js`: thinking moods: what each looks like and where it happens
- `web/js/feelings.js`: how Clawd feels: what each kind of step feels like, the faces, body language and emoji
- `web/js/items.js`: the items Clawd pulls out and holds (hammer, scissors, mic, camera…)
- `web/js/brands.js`: the connector badges (used by the server too)
- `web/js/plain.js`: turns long technical text into short sentences, and builds the chat bubbles
- `web/js/interact.js`: what each piece of furniture is, how it reacts, and its info card
- `web/js/props.js`: floor, walls, screens and effects
- `web/js/themes.js`: room names, colours, floors and what their screens and posters show
- `web/js/rooms/pieces.js`: the furniture kit (every piece built facing forward)
- `web/js/rooms/layouts.js`: one floor plan per room type, and where Clawd stands for each kind of work
- `web/js/hud.js`: the panels
- `web/js/pixelpass.js`: outlines

`npm run check` replays your recent sessions in the terminal.

- `web/js/widget.js`, `widget/ClawdWidget.swift`: the compact widget views and the Mac app around them
- `widget/package.sh`, `widget/collect-three.mjs`: the shareable app (server inside, only the bits of three.js it uses)

`CLAUDE.md` has notes for Claude on how all this fits together and how to tailor Clawd to new kinds of sessions.
