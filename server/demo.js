// A scripted, looping fake session. It feeds transcript-shaped records into a
// SessionModel, so the demo exercises exactly the same code path as real logs.

import { EventEmitter } from 'node:events';
import { SessionModel } from './session.js';

const ROOT = '/Users/you/code/acme-shop';
const f = (p) => `${ROOT}/${p}`;
const VID = '/Users/you/Videos/podcast-teaser';
const v = (p) => `${VID}/${p}`;
const DES = '/Users/you/Design/summer-sale';
const d = (p) => `${DES}/${p}`;
const STU = '/Users/you/Study/interview-prep';
const s2 = (p) => `${STU}/${p}`;
// Fake edit contents, so the room can show "+added −removed" lines.
const lines = (n, tag = 'line') => Array.from({ length: n }, (_, i) => `${tag} ${i + 1}`).join('\n');
const change = (add, del) => ({ old_string: lines(del, 'old'), new_string: lines(add, 'new') });
const todos = (...states) => ({ todos: states.map(([content, status]) => ({ content, status, activeForm: content })) });

// Each step: prompt | think (s) | say | tool. Tools take `dur` seconds.
// `fail` makes the tool error, `bg` starts a background job, `agent` launches a helper.
const SCENARIOS = [
  {
    title: 'Demo: dark mode for the settings page',
    steps: [
      { prompt: 'Add a dark mode toggle to the settings page and make sure the tests still pass' },
      { think: 2.5, thought: 'They want a dark mode toggle. First I need to know how colors are defined: CSS variables, a theme object, or hard-coded values.' },
      { say: "I'll start by looking at how theming works in this app." },
      { tool: 'Glob', input: { pattern: 'src/**/*.{ts,tsx}' }, dur: 0.8 },
      { tool: 'Read', input: { file_path: f('src/theme/tokens.ts') }, dur: 1.2 },
      { tool: 'Read', input: { file_path: f('src/pages/Settings.tsx') }, dur: 1.4 },
      { tool: 'Grep', input: { pattern: 'useTheme', path: 'src' }, dur: 1.6 },
      { think: 3, thought: 'All colors come from tokens.ts through useTheme, so a second palette plus a toggle covers most of it. Some components might hard-code colors, so a helper can check that in parallel.' },
      { say: 'Colors live in one tokens file, so dark mode is mostly a second palette plus a toggle. Making a plan.' },
      { tool: 'TaskCreate', input: { subject: 'Add dark color tokens' }, dur: 0.5 },
      { tool: 'TaskCreate', input: { subject: 'Build the ThemeToggle component' }, dur: 0.5 },
      { tool: 'TaskCreate', input: { subject: 'Remember the choice across reloads' }, dur: 0.5 },
      { tool: 'TaskCreate', input: { subject: 'Run the tests and fix failures' }, dur: 0.5 },
      { tool: 'Bash', input: { command: 'npm install @radix-ui/react-switch', description: 'Install an accessible switch component' }, dur: 4.5 },
      {
        tool: 'Agent', dur: 0.8,
        input: { description: 'Find hard-coded colors', subagent_type: 'Explore', prompt: 'List every component that hard-codes a hex color instead of using theme tokens.' },
        agent: {
          id: 'demo-helper-1', type: 'Explore', description: 'Find hard-coded colors',
          steps: [
            { think: 1.5 },
            { tool: 'Grep', input: { pattern: '#[0-9a-fA-F]{6}', path: 'src/components' }, dur: 2.5 },
            { tool: 'Read', input: { file_path: f('src/components/Header.tsx') }, dur: 2 },
            { tool: 'Read', input: { file_path: f('src/components/PriceTag.tsx') }, dur: 2 },
            { tool: 'Grep', input: { pattern: 'rgba\\(', path: 'src' }, dur: 2.5 },
            { tool: 'Read', input: { file_path: f('src/components/Modal.tsx') }, dur: 2 },
            { think: 2 },
            { say: 'Found 6 hard-coded colors in 3 components.', end: true },
          ],
        },
      },
      { tool: 'TaskUpdate', input: { taskId: '1', status: 'in_progress' }, dur: 0.4 },
      { tool: 'Edit', input: { file_path: f('src/theme/tokens.ts'), ...change(12, 3) }, dur: 3 },
      { tool: 'Edit', input: { file_path: f('src/theme/tokens.ts'), ...change(4, 1) }, dur: 2 },
      { tool: 'Write', input: { file_path: f('src/theme/dark.css'), content: lines(28) }, dur: 3 },
      { tool: 'TaskUpdate', input: { taskId: '1', status: 'completed' }, dur: 0.4 },
      { think: 2, thought: 'Tokens are done. The toggle needs to be an accessible switch, so I will check the ARIA pattern before writing it.' },
      { tool: 'TaskUpdate', input: { taskId: '2', status: 'in_progress' }, dur: 0.4 },
      { tool: 'WebSearch', input: { query: 'accessible toggle switch aria pattern' }, dur: 3 },
      { tool: 'WebFetch', input: { url: 'https://www.w3.org/WAI/ARIA/apg/patterns/switch/' }, dur: 2.5 },
      { tool: 'Write', input: { file_path: f('src/components/ThemeToggle.tsx'), content: lines(42) }, dur: 3.5 },
      { tool: 'Edit', input: { file_path: f('src/pages/Settings.tsx'), ...change(9, 2) }, dur: 2.5 },
      { tool: 'TaskUpdate', input: { taskId: '2', status: 'completed' }, dur: 0.4 },
      { say: 'The helper found hard-coded colors in Header, PriceTag and Modal. Swapping them for tokens.' },
      { tool: 'Edit', input: { file_path: f('src/components/Header.tsx'), ...change(2, 2) }, dur: 2 },
      { tool: 'Edit', input: { file_path: f('src/components/PriceTag.tsx'), ...change(18, 5) }, dur: 1.8 },
      { tool: 'Edit', input: { file_path: f('src/components/Modal.tsx'), ...change(6, 0) }, dur: 1.8 },
      { tool: 'TaskUpdate', input: { taskId: '3', status: 'in_progress' }, dur: 0.4 },
      { tool: 'Read', input: { file_path: f('src/lib/storage.ts') }, dur: 1.2 },
      { tool: 'Edit', input: { file_path: f('src/lib/storage.ts'), ...change(3, 1) }, dur: 2.5 },
      { tool: 'TaskUpdate', input: { taskId: '3', status: 'completed' }, dur: 0.4 },
      { tool: 'TaskUpdate', input: { taskId: '4', status: 'in_progress' }, dur: 0.4 },
      {
        tool: 'Bash', dur: 0.6,
        input: { command: 'npx playwright test --project=chromium', description: 'Run the browser tests in the background', run_in_background: true },
        bg: { id: 'demo-e2e', runFor: 34, summary: 'Background command "Run the browser tests in the background" completed (exit code 0)' },
      },
      { tool: 'Bash', input: { command: 'npm test -- --run', description: 'Run the unit tests' }, dur: 6, fail: 'FAIL src/components/ThemeToggle.test.tsx › toggles aria-checked\n1 failed, 41 passed' },
      { think: 3, thought: 'The test expects aria-checked to flip when clicked. My component only changes the class, so the attribute never updates.' },
      { say: 'One test fails: the toggle never updates aria-checked. Fixing the component.' },
      { tool: 'Read', input: { file_path: f('src/components/ThemeToggle.test.tsx') }, dur: 1.2 },
      { tool: 'Edit', input: { file_path: f('src/components/ThemeToggle.tsx'), ...change(7, 4) }, dur: 2.2 },
      { tool: 'Bash', input: { command: 'npm test -- --run', description: 'Run the unit tests again' }, dur: 5, fail: 'FAIL src/components/ThemeToggle.test.tsx › toggles back on a second click\n1 failed, 41 passed' },
      { think: 2.5, thought: 'It flips on the first click but not back: the click handler reads a stale value. The updater form of setState fixes that.' },
      { tool: 'Edit', input: { file_path: f('src/components/ThemeToggle.tsx'), ...change(2, 2) }, dur: 1.8 },
      { tool: 'Bash', input: { command: 'npm test -- --run', description: 'Run the unit tests one more time' }, dur: 5.5 },
      { tool: 'mcp__Claude_Browser__navigate', input: { url: 'http://localhost:5173/settings' }, dur: 2.5 },
      { tool: 'mcp__Claude_Browser__computer', input: { action: 'screenshot' }, dur: 2 },
      { wait: 'demo-e2e' },
      { tool: 'TaskUpdate', input: { taskId: '4', status: 'completed' }, dur: 0.4 },
      { tool: 'Bash', input: { command: 'npx eslint src --fix', description: 'Lint and tidy the new code' }, dur: 3.5 },
      { tool: 'Bash', input: { command: 'rm -rf .cache/old-theme', description: 'Delete the old theme cache' }, dur: 2.5 },
      { tool: 'Bash', input: { command: 'git add -A && git commit -m "Add dark mode toggle to settings"', description: 'Commit the dark mode work' }, dur: 3 },
      { tool: 'Bash', input: { command: 'git push -u origin dark-mode', description: 'Push the branch' }, dur: 3.5 },
      { tool: 'Bash', input: { command: 'vercel deploy', description: 'Deploy a preview' }, dur: 6.5 },
      { think: 2 },
      { say: 'Dark mode is in: new tokens, a ThemeToggle on the settings page, the choice is saved, all tests pass, and a preview is deployed.', end: true },
    ],
  },
  {
    title: 'Demo: cut a 30-second teaser',
    cwd: VID,
    steps: [
      { prompt: 'Cut a 30-second teaser from the interview footage, with captions, for Reels and Shorts' },
      { think: 2.5, thought: 'I need the footage length and the transcript first, then I can pick the strongest 30 seconds.' },
      { say: 'Checking the footage and the transcript first.' },
      { tool: 'Bash', input: { command: 'ffprobe -v error -show_format footage/interview_raw.mp4', description: 'Check the length of the footage' }, dur: 1.5 },
      { tool: 'Read', input: { file_path: v('footage/interview.srt') }, dur: 1.4 },
      { tool: 'TodoWrite', dur: 0.5, input: todos(['Pick the best quotes', 'in_progress'], ['Cut the teaser in Premiere', 'pending'], ['Add captions', 'pending'], ['Export vertical for social', 'pending']) },
      {
        tool: 'Agent', dur: 0.7,
        input: { description: 'Find the best quotes', subagent_type: 'general-purpose', prompt: 'Read the interview transcript and pick the three strongest 10-second quotes.' },
        agent: {
          id: 'demo-helper-4', type: 'general-purpose', description: 'Find the best quotes',
          steps: [
            { think: 1.5, thought: 'Looking for short, punchy lines that make sense without context.' },
            { tool: 'Read', input: { file_path: v('footage/interview.srt') }, dur: 2.5 },
            { tool: 'Grep', input: { pattern: 'never|always|secret', path: 'footage' }, dur: 2 },
            { say: 'Three quotes picked: 00:41, 03:12 and 07:55.', end: true },
          ],
        },
      },
      {
        tool: 'Agent', dur: 0.7,
        input: { description: 'Pick b-roll shots', subagent_type: 'general-purpose', prompt: 'Find calm b-roll shots to put under the quotes.' },
        agent: {
          id: 'demo-helper-5', type: 'general-purpose', description: 'Pick b-roll shots',
          steps: [
            { tool: 'Bash', input: { command: 'ffmpeg -i broll/*.mp4 -vf fps=1/5 thumbs/%03d.jpg', description: 'Make thumbnails of the b-roll' }, dur: 4 },
            { tool: 'Read', input: { file_path: v('thumbs/012.jpg') }, dur: 1.5 },
            { tool: 'Read', input: { file_path: v('thumbs/027.jpg') }, dur: 1.5 },
            { say: 'Shots 12 and 27 work best under the quotes.', end: true },
          ],
        },
      },
      { tool: 'Bash', input: { command: 'ffmpeg -i footage/interview_raw.mp4 -vf scale=-2:540 proxy.mp4', description: 'Render a light proxy to edit with' }, dur: 4 },
      { wait: 'demo-helper-4' },
      { tool: 'Bash', input: { command: 'ffmpeg -ss 00:00:41 -to 00:00:51 -i proxy.mp4 -c copy quote1.mp4', description: 'Cut the first quote' }, dur: 3.5 },
      { tool: 'Bash', input: { command: 'ffmpeg -i quote1.mp4 -i screen.mp4 -filter_complex "[1]scale=360:-1[p];[0][p]overlay=W-w-24:24" quote1_pip.mp4', description: 'Overlay the screen recording as picture-in-picture' }, dur: 5 },
      { tool: 'TodoWrite', dur: 0.5, input: todos(['Pick the best quotes', 'completed'], ['Cut the teaser in Premiere', 'in_progress'], ['Add captions', 'pending'], ['Export vertical for social', 'pending']) },
      { tool: 'mcp__premiere-pro__invoke_tool', input: { name: 'create_sequence', arguments: { name: 'teaser_30s', aspect: '9:16' } }, dur: 2.2 },
      { tool: 'mcp__premiere-pro__invoke_tool', input: { name: 'add_clips_to_timeline', arguments: { clips: 3 } }, dur: 3.5 },
      { tool: 'mcp__premiere-pro__invoke_tool', input: { name: 'add_transition', arguments: { type: 'cross dissolve' } }, dur: 2 },
      { tool: 'mcp__premiere-pro__invoke_tool', input: { name: 'razor_clip', arguments: { at: '00:00:12' } }, dur: 2 },
      { tool: 'Bash', input: { command: 'say -v Samantha -o vo_intro.aiff "Three things nobody tells you about hiring"', description: 'Record the voiceover intro' }, dur: 4 },
      { tool: 'Bash', input: { command: 'ffmpeg -i teaser.mov -vf eq=contrast=1.08:saturation=1.12 teaser_graded.mov', description: 'Grade the footage a little warmer' }, dur: 4 },
      { think: 2.5, thought: 'The cut flows. Captions should be short lines, at most 32 characters, so they stay readable on a phone.' },
      { tool: 'TodoWrite', dur: 0.5, input: todos(['Pick the best quotes', 'completed'], ['Cut the teaser in Premiere', 'completed'], ['Add captions', 'in_progress'], ['Export vertical for social', 'pending']) },
      { tool: 'Write', input: { file_path: v('teaser/captions.srt'), content: lines(16) }, dur: 2.5 },
      { tool: 'TodoWrite', dur: 0.5, input: todos(['Pick the best quotes', 'completed'], ['Cut the teaser in Premiere', 'completed'], ['Add captions', 'completed'], ['Export vertical for social', 'in_progress']) },
      { tool: 'Bash', input: { command: 'ffmpeg -i teaser_graded.mov -vf subtitles=captions.srt -c:v libx264 teaser_9x16.mp4', description: 'Render the vertical teaser with captions' }, dur: 7 },
      { tool: 'Bash', input: { command: 'ffprobe -v error -show_streams teaser_9x16.mp4', description: 'Watch back the final teaser' }, dur: 3.5 },
      { tool: 'Bash', input: { command: 'mkdir -p deliverables && mv teaser_9x16.mp4 deliverables/', description: 'Pack the export into deliverables' }, dur: 2.5 },
      { tool: 'TodoWrite', dur: 0.5, input: todos(['Pick the best quotes', 'completed'], ['Cut the teaser in Premiere', 'completed'], ['Add captions', 'completed'], ['Export vertical for social', 'completed']) },
      { say: 'The teaser is ready: 30 seconds, three quotes over b-roll, captioned and exported vertical for Reels and Shorts.', end: true },
    ],
  },
  {
    title: 'Demo: design the summer sale hero',
    cwd: DES,
    steps: [
      { prompt: 'Design a hero banner for the summer sale landing page in Figma' },
      { think: 2.5, thought: 'Start from the brand styles already in the Figma file so the banner matches the rest of the site.' },
      { tool: 'mcp__figma__get_design_context', input: { fileKey: 'summer', nodeId: '1:2' }, dur: 2.2 },
      { tool: 'mcp__figma__get_variable_defs', input: { fileKey: 'summer' }, dur: 1.5 },
      { tool: 'Read', input: { file_path: d('refs/moodboard.png') }, dur: 2.5 },
      { tool: 'TaskCreate', input: { subject: 'Sketch three layout options' }, dur: 0.5 },
      { tool: 'TaskCreate', input: { subject: 'Build the hero in Figma' }, dur: 0.5 },
      { tool: 'TaskCreate', input: { subject: 'Export images for the website' }, dur: 0.5 },
      { tool: 'TaskUpdate', input: { taskId: '1', status: 'in_progress' }, dur: 0.4 },
      { tool: 'mcp__figma__use_figma', input: { description: 'Create three layout frames' }, dur: 3.5 },
      { tool: 'mcp__figma__get_screenshot', input: { nodeId: '4:1' }, dur: 2 },
      { think: 3, thought: 'Option B reads best: big type on the left, the product on the right, and an orange sun shape behind it.' },
      { tool: 'TaskUpdate', input: { taskId: '1', status: 'completed' }, dur: 0.4 },
      { tool: 'TaskUpdate', input: { taskId: '2', status: 'in_progress' }, dur: 0.4 },
      { tool: 'mcp__figma__use_figma', input: { description: 'Build the hero with the brand colors' }, dur: 4 },
      {
        tool: 'Agent', dur: 0.7,
        input: { description: 'Check contrast and readability', subagent_type: 'general-purpose', prompt: 'Check the hero for color contrast and small-screen readability.' },
        agent: {
          id: 'demo-helper-6', type: 'general-purpose', description: 'Check contrast and readability',
          steps: [
            { tool: 'mcp__figma__get_screenshot', input: { nodeId: '5:3' }, dur: 2.5 },
            { think: 1.5, thought: 'White on light orange fails contrast. The headline needs the dark slate color.' },
            { tool: 'WebFetch', input: { url: 'https://webaim.org/resources/contrastchecker/' }, dur: 2.5 },
            { say: 'Use the dark headline color: 4.8:1 contrast passes.', end: true },
          ],
        },
      },
      { tool: 'mcp__figma__use_figma', input: { description: 'Add the call-to-action button' }, dur: 2.5 },
      { wait: 'demo-helper-6' },
      { tool: 'mcp__figma__use_figma', input: { description: 'Darken the headline for contrast' }, dur: 2 },
      { tool: 'TaskUpdate', input: { taskId: '2', status: 'completed' }, dur: 0.4 },
      { tool: 'TaskUpdate', input: { taskId: '3', status: 'in_progress' }, dur: 0.4 },
      { tool: 'mcp__figma__download_assets', input: { nodeId: '5:3', format: 'png', scale: 2 }, dur: 3 },
      { tool: 'Bash', input: { command: 'magick hero.png -resize 1600x hero@2x.webp', description: 'Export web images' }, dur: 2.5 },
      { tool: 'Write', input: { file_path: d('public/hero.svg'), content: lines(28) }, dur: 2 },
      { tool: 'TaskUpdate', input: { taskId: '3', status: 'completed' }, dur: 0.4 },
      { say: 'The hero is done in Figma: layout B with a dark headline that passes contrast, and web images exported.', end: true },
    ],
  },
  {
    title: 'Demo: learn how vector databases work',
    cwd: STU,
    steps: [
      { prompt: 'Explain how vector databases work, I am studying for an interview next week' },
      { think: 3, thought: 'They want to understand it, not build one. Start from first principles: embeddings, then similarity search, then indexes like HNSW.' },
      { tool: 'WebSearch', input: { query: 'how vector databases work explained HNSW' }, dur: 3 },
      { tool: 'WebFetch', input: { url: 'https://www.pinecone.io/learn/vector-database/' }, dur: 3 },
      { tool: 'mcp__claude_ai_Notion__notion-search', input: { query: 'vector databases class notes' }, dur: 2.2 },
      { tool: 'TaskCreate', input: { subject: 'Explain embeddings' }, dur: 0.5 },
      { tool: 'TaskCreate', input: { subject: 'Explain similarity search' }, dur: 0.5 },
      { tool: 'TaskCreate', input: { subject: 'Explain HNSW indexes' }, dur: 0.5 },
      { tool: 'TaskCreate', input: { subject: 'Write practice questions' }, dur: 0.5 },
      {
        tool: 'Agent', dur: 0.7,
        input: { description: 'Read the HNSW paper', subagent_type: 'general-purpose', prompt: 'Read the HNSW paper and summarize the key idea in plain words.' },
        agent: {
          id: 'demo-helper-7', type: 'general-purpose', description: 'Read the HNSW paper',
          steps: [
            { tool: 'WebFetch', input: { url: 'https://arxiv.org/abs/1603.09320' }, dur: 3 },
            { tool: 'Read', input: { file_path: s2('papers/hnsw.pdf') }, dur: 3 },
            { think: 1.5, thought: 'The key idea is layers: a few long-range links on top and dense local links at the bottom.' },
            { say: 'HNSW is like zooming in on a map: big jumps first, then nearby streets.', end: true },
          ],
        },
      },
      { tool: 'TaskUpdate', input: { taskId: '1', status: 'in_progress' }, dur: 0.4 },
      { tool: 'Write', input: { file_path: s2('notes/vector-databases.md'), content: lines(64) }, dur: 3 },
      { tool: 'TaskUpdate', input: { taskId: '1', status: 'completed' }, dur: 0.4 },
      { tool: 'TaskUpdate', input: { taskId: '2', status: 'in_progress' }, dur: 0.4 },
      { tool: 'WebSearch', input: { query: 'cosine similarity vs dot product embeddings' }, dur: 2.5 },
      { tool: 'Edit', input: { file_path: s2('notes/vector-databases.md'), ...change(12, 3) }, dur: 2.5 },
      { think: 3, thought: 'A simple analogy helps here: an index is a map of neighborhoods, so you only knock on doors near the answer.' },
      { tool: 'TaskUpdate', input: { taskId: '2', status: 'completed' }, dur: 0.4 },
      { tool: 'TaskUpdate', input: { taskId: '3', status: 'in_progress' }, dur: 0.4 },
      { wait: 'demo-helper-7' },
      { tool: 'Edit', input: { file_path: s2('notes/vector-databases.md'), ...change(4, 1) }, dur: 2.5 },
      { tool: 'TaskUpdate', input: { taskId: '3', status: 'completed' }, dur: 0.4 },
      { tool: 'TaskUpdate', input: { taskId: '4', status: 'in_progress' }, dur: 0.4 },
      { tool: 'Write', input: { file_path: s2('notes/practice-questions.md'), content: lines(24) }, dur: 3 },
      { tool: 'TaskUpdate', input: { taskId: '4', status: 'completed' }, dur: 0.4 },
      { tool: 'mcp__claude_ai_Notion__notion-create-pages', input: { title: 'Vector databases, explained' }, dur: 2.5 },
      { say: 'Your study notes are ready (also saved to Notion): embeddings, similarity search and HNSW in plain words, plus 10 practice questions.', end: true },
    ],
  },
  {
    title: 'Demo: why is checkout slow?',
    steps: [
      { prompt: 'The checkout page got slow after last week’s release. Can you find out why?' },
      { think: 3, thought: 'Slow since last week, so start with what changed in the checkout code and then measure where the time goes.' },
      { say: 'Checking what changed in the checkout code last week, and measuring it.' },
      { tool: 'Bash', input: { command: 'git log --since="10 days ago" --stat -- src/checkout', description: 'See recent checkout changes' }, dur: 1.5 },
      { tool: 'mcp__github__list_pull_requests', input: { state: 'closed', path: 'src/checkout' }, dur: 2 },
      { tool: 'Bash', input: { command: 'curl -s -o /dev/null -w "%{time_total}" http://localhost:4173/api/shipping', description: 'Time the shipping API' }, dur: 3 },
      { tool: 'Bash', input: { command: 'psql -c "explain analyze select * from shipping_rates where zone = 4"', description: 'Check the slow shipping query' }, dur: 3.5 },
      { tool: 'Read', input: { file_path: f('src/checkout/CartSummary.tsx') }, dur: 1.4 },
      { tool: 'Read', input: { file_path: f('src/checkout/useShipping.ts') }, dur: 1.2 },
      { tool: 'TodoWrite', dur: 0.5, input: { todos: [
        { content: 'Measure the checkout page', status: 'in_progress', activeForm: 'Measuring the checkout page' },
        { content: 'Find the slow code path', status: 'pending', activeForm: 'Finding the slow code path' },
        { content: 'Fix it and measure again', status: 'pending', activeForm: 'Fixing it' },
      ] } },
      {
        tool: 'Agent', dur: 0.7,
        input: { description: 'Profile the checkout page', subagent_type: 'general-purpose', prompt: 'Run a performance profile of /checkout and report the slowest functions.' },
        agent: {
          id: 'demo-helper-2', type: 'general-purpose', description: 'Profile the checkout page',
          steps: [
            { think: 1.2 },
            { tool: 'Bash', input: { command: 'npm run build && npm run preview', description: 'Build a production preview' }, dur: 5 },
            { tool: 'mcp__Claude_Browser__navigate', input: { url: 'http://localhost:4173/checkout' }, dur: 2.5 },
            { tool: 'mcp__Claude_Browser__javascript_tool', input: { text: 'performance.getEntries()' }, dur: 3 },
            { tool: 'Read', input: { file_path: f('src/checkout/useShipping.ts') }, dur: 1.5 },
            { say: 'useShipping refetches rates on every keystroke: 38 requests while typing an address.', end: true },
          ],
        },
      },
      {
        tool: 'Agent', dur: 0.7,
        input: { description: 'Read the shipping API docs', subagent_type: 'general-purpose', prompt: 'Check whether the shipping rates API supports batching or caching.' },
        agent: {
          id: 'demo-helper-3', type: 'general-purpose', description: 'Read the shipping API docs',
          steps: [
            { think: 1 },
            { tool: 'WebSearch', input: { query: 'ShipFast rates API caching headers' }, dur: 3 },
            { tool: 'WebFetch', input: { url: 'https://docs.shipfast.example/rates' }, dur: 3.5 },
            { tool: 'WebFetch', input: { url: 'https://docs.shipfast.example/rates/batch' }, dur: 3 },
            { say: 'Rates are cacheable for 10 minutes per postcode.', end: true },
          ],
        },
      },
      { tool: 'Grep', input: { pattern: 'fetchRates\\(', path: 'src' }, dur: 1.5 },
      { tool: 'Read', input: { file_path: f('src/api/shipping.ts') }, dur: 1.3 },
      { think: 4, thought: 'fetchRates is called from a hook that runs on every keystroke in the address form. That alone could explain dozens of requests.' },
      { wait: 'demo-helper-2' },
      { tool: 'TodoWrite', dur: 0.5, input: { todos: [
        { content: 'Measure the checkout page', status: 'completed', activeForm: 'Measuring the checkout page' },
        { content: 'Find the slow code path', status: 'completed', activeForm: 'Finding the slow code path' },
        { content: 'Fix it and measure again', status: 'in_progress', activeForm: 'Fixing it' },
      ] } },
      { tool: 'AskUserQuestion', input: { questions: [{ question: 'Cache shipping rates for 10 minutes per postcode?' }] }, dur: 6 },
      { tool: 'Edit', input: { file_path: f('src/checkout/useShipping.ts'), ...change(9, 2) }, dur: 2.5 },
      { tool: 'Edit', input: { file_path: f('src/api/shipping.ts'), ...change(2, 2) }, dur: 2.2 },
      { tool: 'Bash', input: { command: 'npm test -- checkout', description: 'Run the checkout tests' }, dur: 4.5 },
      { tool: 'TodoWrite', dur: 0.5, input: { todos: [
        { content: 'Measure the checkout page', status: 'completed', activeForm: 'Measuring the checkout page' },
        { content: 'Find the slow code path', status: 'completed', activeForm: 'Finding the slow code path' },
        { content: 'Fix it and measure again', status: 'completed', activeForm: 'Fixing it' },
      ] } },
      { say: 'Found it: shipping rates were refetched on every keystroke. They are now debounced and cached per postcode, which cut 38 requests to 1.', end: true },
    ],
  },
];

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

export class Demo extends EventEmitter {
  constructor() {
    super();
    this.model = null;
    this.running = false;
    this.seq = 0;
    this.waiters = new Map();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
  }

  fresh(title, cwd = ROOT) {
    const m = new SessionModel({ id: 'demo', file: null, projectKey: 'demo' });
    m.demo = true;
    m.title = title;
    m.cwd = cwd;
    m.gitBranch = 'main';
    m.model = 'claude-opus-5-5';
    this.model = m;
    return m;
  }

  async loop() {
    let k = 0;
    while (this.running) {
      const sc = SCENARIOS[k++ % SCENARIOS.length];
      const m = this.fresh(sc.title, sc.cwd);
      this.waiters.clear();
      this.changed();
      await this.run(m, sc.steps, null);
      await sleep(22);
    }
  }

  changed() {
    this.emit('change', 'demo');
  }

  rec(type, extra) {
    return { type, timestamp: new Date().toISOString(), ...extra };
  }

  feed(m, agent, rec) {
    if (m !== this.model) return; // a newer scenario took over
    if (agent) m.ingestAgent(agent.id, rec, { agentType: agent.type, description: agent.description, toolUseId: agent.toolUseId, requestShape: 'background' });
    else m.ingest(rec);
    this.changed();
  }

  async run(m, steps, agent) {
    for (const st of steps) {
      if (!this.running || m !== this.model) return;
      if (st.prompt) {
        this.feed(m, agent, this.rec('user', { message: { role: 'user', content: st.prompt } }));
      } else if (st.think) {
        await sleep(st.think);
        this.feed(m, agent, this.rec('assistant', { message: { role: 'assistant', model: m.model, content: [{ type: 'thinking', thinking: st.thought || '' }], stop_reason: 'tool_use', usage: this.usage() } }));
      } else if (st.say) {
        this.feed(m, agent, this.rec('assistant', { message: { role: 'assistant', model: m.model, content: [{ type: 'text', text: st.say }], stop_reason: st.end ? 'end_turn' : 'tool_use', usage: this.usage() } }));
        if (!st.end) await sleep(1.2);
      } else if (st.wait) {
        await (this.waiters.get(st.wait) || Promise.resolve());
      } else if (st.tool) {
        await this.tool(m, st, agent);
      }
    }
    if (agent) this.waiters.get(agent.id + ':resolve')?.();
  }

  async tool(m, st, agent) {
    const id = `toolu_demo_${++this.seq}`;
    this.feed(m, agent, this.rec('assistant', { message: { role: 'assistant', model: m.model, content: [{ type: 'tool_use', id, name: st.tool, input: st.input }], stop_reason: 'tool_use', usage: this.usage() } }));
    await sleep(st.dur || 1);
    let toolUseResult = {};
    let content = 'ok';
    if (st.tool === 'TaskCreate') {
      const n = [...m.tasks.keys()].length + [...m.pendingTaskCreates.keys()].length;
      toolUseResult = { task: { id: String(n), subject: st.input.subject } };
      content = `Task #${n} created successfully: ${st.input.subject}`;
    }
    if (st.bg) {
      toolUseResult = { backgroundTaskId: st.bg.id };
      content = `Command running in background with ID: ${st.bg.id}.`;
      this.waiters.set(st.bg.id, sleep(st.bg.runFor).then(() => {
        this.feed(m, null, this.rec('queue-operation', { operation: 'enqueue', content: `<task-notification>\n<task-id>${st.bg.id}</task-id>\n<status>completed</status>\n<summary>${st.bg.summary}</summary>\n</task-notification>` }));
      }));
    }
    if (st.agent) {
      const a = { ...st.agent, toolUseId: id };
      toolUseResult = { isAsync: true, status: 'async_launched', agentId: a.id, description: a.description };
      content = 'Async agent launched successfully.';
      let resolve;
      const done = new Promise((r) => { resolve = r; });
      this.waiters.set(a.id + ':resolve', resolve);
      this.waiters.set(a.id, done.then(() => {
        this.feed(m, null, this.rec('queue-operation', { operation: 'enqueue', content: `<task-notification>\n<task-id>${a.id}</task-id>\n<tool-use-id>${id}</tool-use-id>\n<status>completed</status>\n<summary>Agent "${a.description}" finished</summary>\n</task-notification>` }));
      }));
      setTimeout(() => this.run(m, a.steps, a), 300);
    }
    const result = { type: 'tool_result', tool_use_id: id, content: st.fail || content };
    if (st.fail) result.is_error = true;
    this.feed(m, agent, this.rec('user', { message: { role: 'user', content: [result] }, toolUseResult }));
  }

  usage() {
    const base = 18000 + this.seq * 900;
    return { input_tokens: 2, cache_read_input_tokens: base, cache_creation_input_tokens: 400, output_tokens: 300 };
  }
}

export { SCENARIOS };
