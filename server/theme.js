// Guesses what kind of work a session is doing, so the room can dress for it:
// video → studio, design → art room, code → lab, study → classroom, else → cozy room.
//
// Signals: folder name and title, the request text, tools (Premiere, Figma, …),
// shell commands (ffmpeg vs npm), file types and skills. Recent activity counts
// more than old activity, and the room only switches when another kind clearly wins.

const KINDS = ['video', 'design', 'code', 'study'];

const WORDS = {
  video: /\b(videos?|film(?:ing)?|footage|clips?|premiere|render(?:s|ing)?|timeline|youtube|reels?|shorts|tiktok|captions?|subtitles?|voice-?over|voice|audio|podcast|studio|episodes?|b-?roll|grad(?:e|ing)|lut|teaser|trailer|montage|camera|stills?|frames|cut|trim|zoom|scenes?|shots?|4k|fps|transcode|narration|music|sfx|blur|facecam)\b/gi,
  design: /\b(design(?:s|er|ing)?|figma|ui|ux|mock-?ups?|wireframes?|logos?|branding|illustrations?|icons?|posters?|layouts?|typography|palettes?|mood-?board|prototypes?|landing page|banners?|thumbnails?|visuals?|artboards?)\b/gi,
  code: /\b(code|coding|bugs?|fix(?:es|ing)?|refactor|tests?|deploy|api|server|frontend|backend|functions?|components?|repo|build|compile|lint|typescript|javascript|python|react|next\.?js|database|endpoints?|features?|pull request|commit|merge)\b/gi,
  study: /\b(learn(?:ing)?|study(?:ing)?|explain(?:ed|s)?|explanation|understand(?:ing)?|teach(?: me)?|tutorial|lectures?|quiz|flash ?cards?|homework|exams?|revision|summari[sz]e|research|papers?|concepts?|theory|textbook|chapters?|what is|how does|why does|course ?work)\b/gi,
};

const EXT = {
  video: /\.(mp4|mov|mkv|webm|avi|m4v|mxf|prproj|aep|drp|fcpxml|edl|srt|vtt|ass|wav|mp3|m4a|aac|flac|aiff|cube)$/i,
  design: /\.(fig|sketch|xd|psd|ai|svg|afdesign|afphoto|procreate|ase|aco|png|jpe?g|webp|gif|heic)$/i,
  code: /\.(js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|scala|sh|zsh|sql|vue|svelte|astro|json|ya?ml|toml|lock|gradle|tf|html|css|scss)$/i,
  study: /\.(pdf|epub|ipynb|tex|bib)$/i,
};

const CMD = {
  video: /\b(ffmpeg|ffprobe|ffplay|yt-dlp|youtube-dl|hyperframes|remotion|whisperx?|sox|melt|handbrake|mediainfo|mkvmerge)\b/gi,
  design: /\b(magick|imagemagick|svgo|figma|pngquant|optipng|inkscape)\b/gi,
  // Strong signs of software work. Plain `python3` / `node` are used for everything, so they're weak.
  code: /\b(npm|npx|pnpm|yarn|bun|git|gh|pytest|cargo|rustc|go (?:build|test|run)|make|cmake|gradle|mvn|docker|kubectl|tsc|eslint|prettier|jest|vitest|vite|webpack|xcodebuild|rails|composer|pip3? install|uv (?:add|sync|run))\b/gi,
  study: /\b(jupyter|pandoc|pdflatex|latex|pdftotext)\b/gi,
};
const WEAK_CODE = /\b(python3?|node|deno|ruby|bash)\b/gi;

const MCP = {
  video: /premiere|davinci|resolve|final.?cut|after.?effects|hyperframes|remotion|descript|capcut|elevenlabs|heygen/i,
  design: /figma|figjam|canva|sketch|penpot|framer|illustrator|photoshop|spline|design_context|design_system/i,
  code: /github|gitlab|linear|sentry|vercel|supabase|postgres|ccd_pr|lsp/i,
  study: /notion|docs|wikipedia|arxiv|scholar|readwise|kindle|zotero/i,
};

const SKILL = {
  video: /video|hyperframes|media|voice|watch|academy|course|caption|platform|premiere/i,
  design: /design|figma|animat|brand|artifact|dataviz|slides?|pptx/i,
  code: /code-review|simplify|security|claude-api|init|run|test|debug|plugin/i,
  study: /pdf|research|learn|study|explain|tutor/i,
};

const LABEL = { video: 'video', design: 'design', code: 'code', study: 'study' };

function count(re, text, cap) {
  if (!text) return 0;
  re.lastIndex = 0;
  const m = String(text).match(re);
  return Math.min(cap, m ? m.length : 0);
}

export class ThemeDetector {
  constructor() {
    this.scores = { video: 0, design: 0, code: 0, study: 0 };
    this.why = { video: new Map(), design: new Map(), code: new Map(), study: new Map() };
    this.kind = null;
  }

  add(kind, points, reason) {
    if (!points) return;
    this.scores[kind] += points;
    const m = this.why[kind];
    m.set(reason, (m.get(reason) || 0) + points);
  }

  /** Every tool call nudges the scores; older activity slowly fades. */
  tool(name, input = {}) {
    for (const k of KINDS) this.scores[k] *= 0.97;
    const i = input && typeof input === 'object' ? input : {};
    const file = i.file_path || i.notebook_path || i.path || '';
    const writes = /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(name);
    for (const k of KINDS) {
      if (file && EXT[k].test(file)) {
        const ext = (/\.([a-z0-9]+)$/i.exec(file) || [])[1]?.toLowerCase();
        // Images show up in every kind of work (screenshots, frames), so they count for little.
        const pts = k === 'design' && /png|jpe?g|webp|gif|heic/.test(ext || '') ? (writes ? 1 : 0.3) : writes ? 2.5 : 1.2;
        this.add(k, pts, `.${ext} files`);
      }
    }
    if (name === 'Bash' || name === 'Monitor') {
      for (const k of KINDS) {
        const n = count(CMD[k], i.command, 3);
        if (n) this.add(k, n * (k === 'code' ? 1.2 : 3), (String(i.command).match(CMD[k]) || [])[0]?.toLowerCase());
        const d = count(WORDS[k], i.description, 2);
        if (d) this.add(k, d * 0.8, 'what the commands do');
      }
      const weak = count(WEAK_CODE, i.command, 1);
      if (weak) this.add('code', 0.25, 'scripts');
    }
    // Reading up on things (web, PDFs, notes) is what studying looks like.
    if (name === 'WebSearch' || name === 'WebFetch') this.add('study', 0.7, 'web research');
    if (name.startsWith('mcp__')) {
      const [, server = '', ...rest] = name.split('__');
      const tool = rest.join('__');
      for (const k of KINDS) {
        if (MCP[k].test(server) || MCP[k].test(tool)) this.add(k, 4, prettyTool(server, tool));
      }
    }
    if (name === 'Skill' && i.skill) {
      for (const k of KINDS) if (SKILL[k].test(i.skill)) this.add(k, 5, `the ${i.skill} skill`);
    }
    if (name === 'LSP') this.add('code', 2, 'code navigation');
    if (name === 'Agent' || name === 'Task') {
      for (const k of KINDS) {
        const n = count(WORDS[k], `${i.description || ''} ${i.prompt || ''}`, 3);
        if (n) this.add(k, n * 0.8, 'what the helpers work on');
      }
    }
  }

  /** What you asked for. */
  prompt(text) {
    for (const k of KINDS) {
      const n = count(WORDS[k], text, 4);
      if (n) this.add(k, n * 1.5, 'what you asked for');
    }
  }

  /** Folder name and session title are a strong hint but never the only one. */
  prior(...texts) {
    const p = { video: 0, design: 0, code: 0, study: 0 };
    const why = {};
    for (const t of texts) {
      for (const k of KINDS) {
        const n = count(WORDS[k], String(t || '').replace(/[-_]/g, ' '), 3);
        if (n) { p[k] += n * 4; why[k] = 'the folder and title'; }
      }
    }
    return { p, why };
  }

  decide(project, title) {
    const { p, why } = this.prior(project, title);
    const total = {};
    for (const k of KINDS) total[k] = this.scores[k] + p[k];
    const ranked = KINDS.slice().sort((a, b) => total[b] - total[a]);
    const top = ranked[0];
    if (!this.kind || this.kind === 'cozy') {
      this.kind = total[top] >= 4 ? top : 'cozy';
    } else if (top !== this.kind && total[top] > total[this.kind] * 1.4 + 3) {
      this.kind = top; // clearly a different kind of work now
    }
    const kind = this.kind;
    let reasons = [];
    if (kind !== 'cozy') {
      const m = new Map(this.why[kind]);
      if (why[kind]) m.set(why[kind], (m.get(why[kind]) || 0) + p[kind]);
      reasons = [...m.entries()].filter(([r]) => r).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r]) => r);
    }
    return {
      kind,
      label: LABEL[kind] || 'general',
      reasons,
      scores: Object.fromEntries(KINDS.map((k) => [k, Math.round(total[k] * 10) / 10])),
    };
  }
}

function prettyTool(server, tool) {
  const s = `${server} ${tool}`.toLowerCase();
  for (const [re, name] of [[/premiere/, 'Premiere'], [/figma/, 'Figma'], [/canva/, 'Canva'], [/davinci|resolve/, 'DaVinci'], [/github/, 'GitHub'], [/elevenlabs/, 'ElevenLabs'], [/hyperframes/, 'HyperFrames']]) {
    if (re.test(s)) return name;
  }
  return server.replace(/[_-]+/g, ' ');
}
