// Little badges for MCP connectors, so you can tell at a glance which app
// Claude is driving. Shared by the server (to recognise connectors, even the
// ones with random ids) and the page (to draw the badges). No DOM in here.
//
// Each badge is a pixel monogram in roughly the app's colours, not its logo.

export const BRANDS = [
  { id: 'figma', name: 'Figma', mono: 'Fi', bg: '#1e1e1e', fg: '#ffffff', stripe: ['#f24e1e', '#a259ff', '#1abcfe', '#0acf83'], match: /figma|figjam/ },
  { id: 'notion', name: 'Notion', mono: 'N', bg: '#ffffff', fg: '#191919', match: /notion/ },
  { id: 'premiere', name: 'Premiere Pro', mono: 'Pr', bg: '#00005b', fg: '#9999ff', match: /premiere/ },
  { id: 'aftereffects', name: 'After Effects', mono: 'Ae', bg: '#00005b', fg: '#d291ff', match: /after.?effects/ },
  { id: 'photoshop', name: 'Photoshop', mono: 'Ps', bg: '#001e36', fg: '#31a8ff', match: /photoshop/ },
  { id: 'illustrator', name: 'Illustrator', mono: 'Ai', bg: '#330000', fg: '#ff9a00', match: /illustrator/ },
  { id: 'davinci', name: 'DaVinci Resolve', mono: 'Dv', bg: '#2b2b2b', fg: '#ff9a3c', match: /davinci|resolve/ },
  { id: 'canva', name: 'Canva', mono: 'Cv', bg: '#00c4cc', fg: '#ffffff', match: /canva\b/ },
  { id: 'chrome', name: 'Chrome', mono: 'Ch', bg: '#ffffff', fg: '#1a73e8', stripe: ['#ea4335', '#fbbc04', '#34a853', '#4285f4'], match: /chrome/ },
  { id: 'browser', name: 'Browser', mono: 'Br', bg: '#6a9bcc', fg: '#ffffff', match: /claude_browser|claude_preview|browser|playwright|puppeteer/ },
  { id: 'computer', name: 'Computer', mono: 'PC', bg: '#3d3929', fg: '#faf9f5', match: /computer.?use/ },
  { id: 'simulator', name: 'iOS Simulator', mono: 'iOS', bg: '#111111', fg: '#ffffff', match: /simulator/ },
  { id: 'posthog', name: 'PostHog', mono: 'PH', bg: '#1d4aff', fg: '#ffffff', stripe: ['#1d4aff', '#f9bd2b', '#f54e00'], match: /posthog/ },
  { id: 'attio', name: 'Attio', mono: 'At', bg: '#111112', fg: '#ffffff', match: /attio/ },
  { id: 'gdrive', name: 'Google Drive', mono: 'Dr', bg: '#ffffff', fg: '#1a73e8', stripe: ['#0f9d58', '#f4b400', '#4285f4'], match: /google.?drive|drive.?api|gdrive/ },
  { id: 'gmail', name: 'Gmail', mono: 'Gm', bg: '#ffffff', fg: '#ea4335', stripe: ['#4285f4', '#ea4335', '#fbbc04', '#34a853'], match: /gmail/ },
  { id: 'gcal', name: 'Google Calendar', mono: 'Ca', bg: '#ffffff', fg: '#4285f4', match: /google.?calendar|gcal/ },
  { id: 'slack', name: 'Slack', mono: 'Sl', bg: '#4a154b', fg: '#ffffff', stripe: ['#36c5f0', '#2eb67d', '#ecb22e', '#e01e5a'], match: /slack/ },
  { id: 'github', name: 'GitHub', mono: 'GH', bg: '#24292f', fg: '#ffffff', match: /github/ },
  { id: 'gitlab', name: 'GitLab', mono: 'GL', bg: '#fc6d26', fg: '#ffffff', match: /gitlab/ },
  { id: 'linear', name: 'Linear', mono: 'Li', bg: '#5e6ad2', fg: '#ffffff', match: /linear/ },
  { id: 'jira', name: 'Jira', mono: 'Ji', bg: '#0052cc', fg: '#ffffff', match: /jira|atlassian|confluence/ },
  { id: 'asana', name: 'Asana', mono: 'As', bg: '#f06a6a', fg: '#ffffff', match: /asana/ },
  { id: 'trello', name: 'Trello', mono: 'Tr', bg: '#0079bf', fg: '#ffffff', match: /trello/ },
  { id: 'miro', name: 'Miro', mono: 'Mi', bg: '#ffd02f', fg: '#050038', match: /miro\b/ },
  { id: 'airtable', name: 'Airtable', mono: 'Ar', bg: '#fcb400', fg: '#1f1e1d', match: /airtable/ },
  { id: 'hubspot', name: 'HubSpot', mono: 'Hs', bg: '#ff7a59', fg: '#ffffff', match: /hubspot/ },
  { id: 'salesforce', name: 'Salesforce', mono: 'Sf', bg: '#00a1e0', fg: '#ffffff', match: /salesforce/ },
  { id: 'intercom', name: 'Intercom', mono: 'Ic', bg: '#1f8ded', fg: '#ffffff', match: /intercom/ },
  { id: 'zendesk', name: 'Zendesk', mono: 'Zd', bg: '#03363d', fg: '#ffffff', match: /zendesk/ },
  { id: 'stripe', name: 'Stripe', mono: 'St', bg: '#635bff', fg: '#ffffff', match: /stripe/ },
  { id: 'shopify', name: 'Shopify', mono: 'Sh', bg: '#95bf47', fg: '#ffffff', match: /shopify/ },
  { id: 'sentry', name: 'Sentry', mono: 'Se', bg: '#362d59', fg: '#ffffff', match: /sentry/ },
  { id: 'supabase', name: 'Supabase', mono: 'Sb', bg: '#1c1c1c', fg: '#3ecf8e', match: /supabase/ },
  { id: 'vercel', name: 'Vercel', mono: 'Ve', bg: '#000000', fg: '#ffffff', match: /vercel/ },
  { id: 'netlify', name: 'Netlify', mono: 'Nf', bg: '#014847', fg: '#32e6e2', match: /netlify/ },
  { id: 'cloudflare', name: 'Cloudflare', mono: 'CF', bg: '#f38020', fg: '#ffffff', match: /cloudflare/ },
  { id: 'aws', name: 'AWS', mono: 'AWS', bg: '#232f3e', fg: '#ff9900', match: /\baws\b|amazon/ },
  { id: 'docker', name: 'Docker', mono: 'Dk', bg: '#2496ed', fg: '#ffffff', match: /docker/ },
  { id: 'datadog', name: 'Datadog', mono: 'Dd', bg: '#632ca6', fg: '#ffffff', match: /datadog/ },
  { id: 'grafana', name: 'Grafana', mono: 'Gf', bg: '#f46800', fg: '#ffffff', match: /grafana/ },
  { id: 'mixpanel', name: 'Mixpanel', mono: 'Mx', bg: '#7856ff', fg: '#ffffff', match: /mixpanel/ },
  { id: 'amplitude', name: 'Amplitude', mono: 'Am', bg: '#1e61f0', fg: '#ffffff', match: /amplitude/ },
  { id: 'mongodb', name: 'MongoDB', mono: 'Mo', bg: '#001e2b', fg: '#00ed64', match: /mongo/ },
  { id: 'database', name: 'Database', mono: 'DB', bg: '#336791', fg: '#ffffff', match: /postgres|sqlite|mysql|bigquery|snowflake|database/ },
  { id: 'dropbox', name: 'Dropbox', mono: 'Db', bg: '#0061ff', fg: '#ffffff', match: /dropbox/ },
  { id: 'youtube', name: 'YouTube', mono: 'YT', bg: '#ff0000', fg: '#ffffff', match: /youtube/ },
  { id: 'spotify', name: 'Spotify', mono: 'Sp', bg: '#1db954', fg: '#000000', match: /spotify/ },
  { id: 'discord', name: 'Discord', mono: 'Dc', bg: '#5865f2', fg: '#ffffff', match: /discord/ },
  { id: 'telegram', name: 'Telegram', mono: 'Tg', bg: '#26a5e4', fg: '#ffffff', match: /telegram/ },
  { id: 'obsidian', name: 'Obsidian', mono: 'Ob', bg: '#7c3aed', fg: '#ffffff', match: /obsidian/ },
  { id: 'todoist', name: 'Todoist', mono: 'Td', bg: '#e44332', fg: '#ffffff', match: /todoist/ },
  { id: 'context7', name: 'Context7', mono: 'C7', bg: '#111111', fg: '#ffffff', match: /context7/ },
  { id: 'firecrawl', name: 'Firecrawl', mono: 'Fc', bg: '#ff6b00', fg: '#ffffff', match: /firecrawl/ },
  { id: 'exa', name: 'Exa', mono: 'Ex', bg: '#1f40ed', fg: '#ffffff', match: /\bexa\b/ },
  { id: 'perplexity', name: 'Perplexity', mono: 'Px', bg: '#20808d', fg: '#ffffff', match: /perplexity/ },
  { id: 'claudedocs', name: 'Claude Docs', mono: 'Do', bg: '#d97757', fg: '#ffffff', match: /claude docs/ },
  { id: 'claudeapp', name: 'Claude app', mono: 'Cl', bg: '#d97757', fg: '#ffffff', match: /^ccd_|claude desktop/ },
  { id: 'visualize', name: 'Visualizer', mono: 'Vz', bg: '#788c5d', fg: '#ffffff', match: /visuali[sz]e|show_widget/ },
  { id: 'scheduler', name: 'Scheduler', mono: 'Sc', bg: '#d4a27f', fg: '#1f1e1d', match: /scheduled.?tasks/ },
  { id: 'terminal', name: 'Terminal', mono: '>_', bg: '#1f1e1d', fg: '#a3e635', match: /^terminal$/ },
  { id: 'registry', name: 'MCP registry', mono: 'MCP', bg: '#3d3929', fg: '#faf9f5', match: /mcp.?registry/ },
];

const BY_ID = new Map(BRANDS.map((b) => [b.id, b]));
export const brandById = (id) => (id ? BY_ID.get(id) || null : null);

/** A fallback badge for connectors we don't recognise: initials on slate. */
export function genericBrand(name = 'Connector') {
  const words = String(name).replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const mono = words.length > 1 ? (words[0][0] + words[1][0]) : (words[0] || 'MCP').slice(0, 2);
  return { id: null, name, mono: mono.charAt(0).toUpperCase() + mono.slice(1).toLowerCase(), bg: '#3d3929', fg: '#faf9f5' };
}

/**
 * Which app is this connector? The server name counts most, then its tool
 * names, then whatever its descriptions and instructions mention.
 */
export function pickBrand({ server = '', tools = [], text = '' }) {
  const srv = server.toLowerCase();
  const names = tools.map((t) => t.toLowerCase());
  const body = text.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const b of BRANDS) {
    let score = b.match.test(srv) ? 10 : 0;
    let n = 0;
    for (const t of names) if (b.match.test(t) && ++n >= 3) break;
    score += n * 3;
    if (body && b.match.test(body)) score += 1;
    if (score > bestScore) { best = b; bestScore = score; }
  }
  return best ? best.id : null;
}

/** HTML for a badge (works on the server too — it's only a string). */
export function badgeHtml(brand, cls = '') {
  const b = typeof brand === 'string' ? brandById(brand) : brand;
  if (!b) return '';
  const stripe = b.stripe ? `<i class="st">${b.stripe.map((c) => `<b style="background:${c}"></b>`).join('')}</i>` : '';
  const size = b.mono.length > 2 ? ' tiny' : '';
  return `<span class="badge${size} ${cls}" style="--bb:${b.bg};--bf:${b.fg}" title="${b.name}">${b.mono}${stripe}</span>`;
}
