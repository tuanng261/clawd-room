// The playbook: for each kind of step (see server/describe.js activityOf),
// where in the room it happens, how Clawd acts it out, and what it holds.
//
// at:    where, in order of preference. Piece kinds ('renderTower') are
//        looked up in the current room; '@desk' means that work station.
//        The first one that exists wins, so every room finds its own spot.
// pose:  the animation (clawd.js); item: held while working (and pulled out
//        first); pull: pulled out but not held; sit: use the station's seat.
// face:  'out' turns Clawd toward the room instead of the piece.
// long:  [ms, pose]: after this long, switch pose (e.g. to waiting).
// throw: what the throw beat sends where ('piece' or 'door').
// bare:  pieces that already are the tool (a mic stand, a camera rig), so
//        Clawd doesn't hold its own there.

export const ACTIVITIES = {
  // Code and files
  code: { at: ['@desk'], pose: 'type', sit: true, pull: 'pencil' },
  notes: { at: ['studentDesk', 'bigWorkTable', '@desk'], pose: 'write', sit: true, pull: 'pencil' },
  'write-tests': { at: ['electronicsBench', 'scienceTable', '@desk'], pose: 'write', pull: 'clipboard' },
  style: { at: ['easel', 'draftingTable', 'paintTable', '@desk'], pose: 'paint', item: 'brush' },
  captions: { at: ['editingDesk', '@desk'], pose: 'type', sit: true, pull: 'pencil' },
  config: { at: ['serverRack', 'electronicsBench', 'computerDesk', '@workbench'], pose: 'knobs', pull: 'wrench' },
  read: { at: ['@bookshelf'], pose: 'read', pull: 'book' },
  git: { at: ['@bookshelf'], pose: 'read', pull: 'book' },
  research: { at: ['readingNook', 'beanbag', 'couch', 'armchair', '@bookshelf'], pose: 'read', sit: true, pull: 'book' },
  'look-image': { at: ['wallBoard', 'rollingBoard', '@whiteboard'], pose: 'inspect', item: 'polaroid' },
  search: { at: ['@cabinet'], pose: 'search', pull: 'magnifier' },
  files: { at: ['roadCases', 'flatFiles', 'partsDrawers', 'fileCabinet', 'cardCatalog', '@cabinet'], pose: 'carry', item: 'box' },
  delete: { at: ['trashCan', '@cabinet'], pose: 'toss', item: 'paperBall', throw: 'piece' },
  tidy: { at: ['trashCan', '@desk'], pose: 'sweep', item: 'broom' },

  // Shell work
  run: { at: ['@terminal'], pose: 'type', sit: true, pull: 'terminal', long: [7000, 'wait'] },
  test: { at: ['electronicsBench', 'scienceTable', '@workbench', '@terminal'], pose: 'checklist', item: 'clipboard' },
  build: { at: ['workbench', 'electronicsBench', 'bigWorkTable', 'scienceTable', '@workbench'], pose: 'hammer', item: 'hammer' },
  install: { at: ['@portal'], pose: 'unbox', item: 'box' },
  serve: { at: ['serverRack', 'renderTower', '@terminal'], pose: 'knobs', pull: 'terminal' },
  db: { at: ['serverRack', 'partsDrawers', 'fileCabinet', 'cardCatalog', '@cabinet'], pose: 'search', pull: 'magnifier' },
  commit: { at: ['@bookshelf'], pose: 'shelve', item: 'book', throw: 'piece' },
  push: { at: ['@globe'], pose: 'toss', item: 'paperPlane', throw: 'piece' },
  deploy: { at: ['@globe'], pose: 'launch', pull: 'rocket' },
  http: { at: ['@globe'], pose: 'antenna', item: 'antenna' },
  download: { at: ['@portal'], pose: 'catch', item: 'box', long: [9000, 'wait'] },
  wait: { at: ['beanbag', 'directorsChair', 'armchair', '@armchair'], pose: 'wait', sit: true, item: 'clock' },
  monitor: { at: ['serverRack', 'renderTower', '@terminal'], pose: 'peek', item: 'binoculars' },
  stop: { at: ['@terminal'], pose: 'present', item: 'stop' },

  // Web and browsers
  'web-search': { at: ['@globe'], pose: 'look', item: 'binoculars' },
  'web-read': { at: ['laptopTable', 'fieldMonitor', 'computerDesk', '@globe'], pose: 'read', item: 'scroll' },
  browse: { at: ['laptopTable', 'fieldMonitor', 'computerDesk', '@globe'], pose: 'tap' },
  screenshot: { at: ['cameraRig', 'laptopTable', 'fieldMonitor', '@globe'], pose: 'photo', item: 'camera', bare: ['cameraRig'] },
  inspect: { at: ['laptopTable', 'fieldMonitor', '@globe'], pose: 'search', pull: 'magnifier' },

  // Video, audio, design
  render: { at: ['renderTower', 'plotter', 'serverRack', 'computerDesk', '@terminal'], pose: 'knobs', pull: 'terminal', long: [5000, 'wait'] },
  composite: { at: ['backdrop', '@desk'], pose: 'perform', face: 'out' },
  cut: { at: ['editingDesk', '@desk'], pose: 'snip', sit: true, item: 'scissors' },
  'video-edit': { at: ['editingDesk', '@desk'], pose: 'type', sit: true, pull: 'cartridge' },
  frames: { at: ['cameraRig', '@globe'], pose: 'photo', item: 'camera', bare: ['cameraRig'] },
  voice: { at: ['micStand', '@stage'], pose: 'sing', item: 'mic', bare: ['micStand'] },
  listen: { at: ['couch', 'readingNook', 'beanbag', '@armchair'], pose: 'listen', sit: true },
  grade: { at: ['fieldMonitor', 'editingDesk', '@desk'], pose: 'knobs' },
  review: { at: ['directorsChair', 'couch', 'fieldMonitor', '@armchair'], pose: 'watch', sit: true, item: 'popcorn' },
  print: { at: ['plotter', '@terminal'], pose: 'peek' },
  image: { at: ['easel', 'plotter', 'draftingTable', '@desk'], pose: 'paint', item: 'brush' },
  'design-look': { at: ['draftingTable', 'wallBoard', '@desk'], pose: 'search', pull: 'magnifier' },

  // Planning, people, everything else
  plan: { at: ['@whiteboard'], pose: 'draw', pull: 'clipboard' },
  'check-off': { at: ['@whiteboard'], pose: 'draw', pull: 'clipboard' },
  helper: { at: ['@portal'], pose: 'summon', item: 'megaphone', long: [6000, 'wait'] },
  message: { at: ['@portal'], pose: 'toss', item: 'paperPlane', throw: 'door' },
  ask: { at: ['@stage'], pose: 'present', item: 'sign' },
  deliver: { at: ['@stage'], pose: 'present', item: 'envelope' },
  ring: { at: ['@stage'], pose: 'wave', item: 'bell' },
  skill: { at: ['@bookshelf'], pose: 'read', pull: 'scroll' },
  schedule: { at: ['wallClock', '@bed'], pose: 'knobs', item: 'clock' },
  connector: { at: ['@workbench'], pose: 'tinker', item: 'cartridge' },
};

// Logs from before activities existed: fall back on the station.
const BY_STATION = {
  desk: 'code', terminal: 'run', bookshelf: 'read', cabinet: 'search', globe: 'browse',
  whiteboard: 'plan', workbench: 'connector', portal: 'helper', stage: 'ask',
};

export function activityFor(act) {
  return ACTIVITIES[act?.activity] ? act.activity : BY_STATION[act?.station] || 'run';
}
