// Floor plans. Each room type places its own furniture and says where Clawd
// stands for every kind of work (the "stations"). Room logic is the same everywhere.
//
// Floor: x and z run from about −4 to +4. Walls stand along the back (−z) and
// left (−x); the camera looks in from the front-right. A piece's front faces +z
// before rotation: ry = 0 faces into the room from the back wall, ry = π/2
// faces into the room from the left wall.

import * as Pieces from './pieces.js';
import { C } from '../props.js';
import * as D from '../themes.js';

const QUARTER = Math.PI / 4;

// Same furniture kit, but each piece remembers what it is (for hover and clicks).
const K = Object.fromEntries(Object.entries(Pieces).map(([kind, make]) => [kind, typeof make !== 'function' ? make : (...args) => {
  const piece = make(...args);
  if (piece?.group) piece.group.userData.kind = kind;
  return piece;
}]));

function kit(room) {
  const solids = [];
  const tickers = [];
  const put = (piece, x, z, ry = 0, { y = 0, solid = true } = {}) => {
    piece.group.position.set(x, y, z);
    piece.group.rotation.y = ry;
    room.group.add(piece.group);
    if (solid) solids.push(piece.group);
    return piece;
  };
  /** A station relative to a placed piece: local offset, heading relative to the piece. */
  const at = (piece, lx, lz, face = Math.PI, { seat = 0, approach = null } = {}) => {
    const g = piece.group;
    const c = Math.cos(g.rotation.y);
    const s = Math.sin(g.rotation.y);
    const tx = (x, z) => [g.position.x + x * c + z * s, g.position.z - x * s + z * c];
    const out = { spot: tx(lx, lz), face: g.rotation.y + face };
    if (seat) out.seat = seat;
    if (approach) out.approach = tx(approach[0], approach[1]);
    return out;
  };
  const toward = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]);
  return { solids, tickers, put, at, toward };
}

/** Left-wall door at z; helpers appear just inside it. */
function leftDoor(k, pal, z) {
  const d = k.put(K.door(pal), -4.03, z, Math.PI / 2, { solid: false });
  return { piece: d, hinge: d.hinge, glowMat: d.glowMat, inside: [-3.95, z + 0.3], front: [-3.25, z + 0.3] };
}

// ── cozy (the original room) ─────────────────────────────────

function cozy(room, pal) {
  const k = kit(room);
  const win = k.put(K.wallWindow(1.9, 1.15), 2.1, -4.03, 0, { y: 2.33, solid: false });
  const clock = k.put(K.wallClock(), -0.3, -4.01, 0, { y: 2.3, solid: false });
  k.put(K.artPoster(pal), -4.0, -0.35, Math.PI / 2, { y: 2.01, solid: false });
  const desk = k.put(K.cozyDesk(pal), 2.1, -3.58);
  const shelf = k.put(K.bookshelf(pal), -2.3, -3.75);
  const board = k.put(K.wallBoard({ style: 'white' }), -0.3, -4.02);
  const term = k.put(K.terminalTable(), -3.62, -2.0, Math.PI / 2);
  const rack = k.put(K.serverRack(), -3.65, -3.62, Math.PI / 2);
  const cab = k.put(K.fileCabinet(), -3.68, -0.35, Math.PI / 2);
  const door = leftDoor(k, pal, 1.45);
  const globe = k.put(K.globe(), 3.4, -1.55);
  const bench = k.put(K.workbench(pal), 2.75, 3.45);
  k.put(K.rug(3.4, 2.4, pal.rugEdge, pal.rug), -0.55, 0.85, 0, { solid: false });
  const chair = k.put(K.armchair(pal), -1.0, 0.35, QUARTER);
  const bed = k.put(K.petBed(pal), -1.75, 3.35);
  k.put(K.plant('big'), -3.45, 3.45);
  k.put(K.plant('small'), 3.62, -3.72);
  k.put(K.trashCan(), 0.85, -3.62);
  return finish(k, {
    stations: {
      desk: k.at(desk, desk.seat[0], desk.seat[1], Math.PI, { seat: desk.seatH, approach: [desk.seat[0], 1.63] }),
      bookshelf: k.at(shelf, 0, 0.9),
      whiteboard: k.at(board, 0, 0.74),
      terminal: k.at(term, 0, 0.87),
      cabinet: k.at(cab, 0, 0.9),
      portal: { spot: [-2.7, 1.2], face: Math.atan2(-1.3, 0.25) },
      globe: { spot: [2.6, -0.85], face: Math.atan2(0.8, -0.7) },
      workbench: k.at(bench, 0, -1.0, 0),
      armchair: k.at(chair, 0, 0.08, 0, { seat: chair.seatH, approach: [0, 1.2] }),
      bed: { spot: [-1.75, 3.35], approach: [-0.85, 2.42], face: QUARTER, seat: bed.seatH },
      stage: { spot: [0.75, 2.85], face: QUARTER },
      center: { spot: [0.2, 1.1], face: QUARTER },
    },
    roles: { desk, bookshelf: shelf, whiteboard: board, terminal: term, cabinet: cab, portal: door.piece, globe, workbench: bench },
    door,
    screens: { desk: desk.screen, terminal: term.screen, board: board.screen },
    leds: rack.leds,
    drawers: cab,
    spinner: globe.sphere,
    tick: (dt, t, ctx) => { win.tick(dt); clock.tick(); bench.tick(dt, t, ctx.busy.has('workbench')); },
  });
}

// ── code lab ─────────────────────────────────────────────────

function lab(room, pal) {
  const k = kit(room);
  const ws = k.put(K.workstation(pal), 0.9, -3.58);
  const status = k.put(K.statusScreen((c, w, h, ctx, t) => D.drawBuildStatus(c, w, h, ctx.term, t)), 0.9, -4.0, 0, { y: 2.25, solid: false });
  const shelf = k.put(K.bookshelf(pal, { w: 1.4, h: 2.2, fill: 'tech', frame: C.graphite, top: 'none' }), -2.55, -3.75);
  k.put(K.coffeeCounter(), 3.5, -3.75);
  const rackA = k.put(K.serverRack({ console: true }), -3.62, -2.05, Math.PI / 2);
  const rackB = k.put(K.serverRack(), -3.62, -1.18, Math.PI / 2);
  k.put(K.poster(1.5, 0.55, D.drawNetwork, { frame: C.charcoal }), -4.0, -1.6, Math.PI / 2, { y: 2.6, solid: false });
  const drawers = k.put(K.partsDrawers(), -3.8, 0.3, Math.PI / 2);
  k.put(K.pegboard('tools'), -4.02, 0.3, Math.PI / 2, { y: 2.05, solid: false });
  const door = leftDoor(k, pal, 1.95);
  const board = k.put(K.rollingBoard({ style: 'white' }), -1.15, -0.95, 0.45);
  const holo = k.put(K.holoGlobe(), 3.25, -1.25);
  const bench = k.put(K.electronicsBench(), 2.75, 3.45);
  k.put(K.rug(2.2, 1.8, '#b0aea5', '#e8e6dc', { round: 0.9 }), 0.25, 1.15, 0, { solid: false });
  const bag = k.put(K.beanbag(pal), 0.25, 1.05);
  const futon = k.put(K.futon(pal), -3.25, 3.2, Math.PI / 2);
  k.put(K.plant('tall'), 3.7, 0.9);
  k.put(K.trashCan(), -0.35, -3.6);
  k.put(K.cableTray(6.2), -1.1, -4.05, 0, { y: 2.86, solid: false });
  k.put(K.ledStrip(8.1), 0.1, -4.0, 0, { y: 0.16, solid: false });
  k.put(K.ledStrip(8.1), -4.0, 0.1, Math.PI / 2, { y: 0.16, solid: false });
  return finish(k, {
    stations: {
      desk: k.at(ws, 0, 0.95, Math.PI, { seat: ws.seatH, approach: [0, 1.62] }),
      bookshelf: k.at(shelf, 0, 0.9),
      whiteboard: k.at(board, 0, 0.8),
      terminal: k.at(rackA, 0, 0.95),
      cabinet: k.at(drawers, 0, 0.78),
      portal: { spot: [-2.75, 1.5], face: Math.atan2(-1.25, 0.45) },
      globe: { spot: [2.45, -0.65], face: Math.atan2(0.8, -0.6) },
      workbench: k.at(bench, 0, -1.0, 0),
      armchair: { spot: [0.25, 1.05], approach: [0.95, 1.85], face: QUARTER, seat: bag.seatH },
      bed: k.at(futon, futon.seat[0], futon.seat[1], 0, { seat: futon.seatH, approach: [futon.seat[0], 1.05] }),
      stage: { spot: [0.9, 2.95], face: QUARTER },
      center: { spot: [1.2, 0.0], face: QUARTER },
    },
    roles: { desk: ws, bookshelf: shelf, whiteboard: board, terminal: rackA, cabinet: drawers, portal: door.piece, globe: holo, workbench: bench },
    door,
    screens: { desk: ws.screen, terminal: rackA.screen, board: board.screen },
    leds: [...rackA.leds, ...rackB.leds],
    drawers,
    spinner: holo.sphere,
    tick: (dt, t, ctx) => {
      status.tick(dt, t, ctx);
      ws.side[0].tick(dt, (c, w, h) => D.drawTests(c, w, h, ctx.term, t));
      ws.side[1].tick(dt, (c, w, h) => D.drawLogs(c, w, h, ctx, t));
      bench.tick(dt, t, ctx.busy.has('workbench'));
      holo.sphere.rotation.x = Math.sin(t * 0.4) * 0.2;
    },
  });
}

// ── video studio ─────────────────────────────────────────────

function studio(room, pal) {
  const k = kit(room);
  const render = k.put(K.renderTower(), -3.1, -3.6);
  const shelf = k.put(K.bookshelf(pal, { w: 1.5, h: 2.2, fill: 'film', frame: '#3d3929', top: 'clapper' }), -1.5, -3.75);
  const onair = k.put(K.onAirSign(), -1.5, -4.0, 0, { y: 2.72, solid: false });
  const board = k.put(K.wallBoard({ style: 'cork', w: 1.4, h: 1.05, bottom: 0.55 }), 0.1, -4.02, 0);
  const set = k.put(K.backdrop('#8a9e6b'), 2.45, -3.55, 0, { solid: false });
  const boxL = k.put(K.softbox(), 1.15, -1.75, Math.atan2(2.45 - 1.15, -3.0 + 1.75));
  const boxR = k.put(K.softbox(), 3.8, -1.55, Math.atan2(2.45 - 3.8, -3.0 + 1.55));
  const ring = k.put(K.ringLight(), 1.55, -2.35, Math.atan2(2.45 - 1.55, -3.0 + 2.35));
  const cam = k.put(K.cameraRig(), 2.45, -0.95, Math.PI);
  const desk = k.put(K.editingDesk(pal), -3.58, -0.6, Math.PI / 2);
  k.put(K.foamPanels(3, 6), -4.02, -0.6, Math.PI / 2, { y: 2.05, solid: false });
  const cases = k.put(K.roadCases(), -3.62, 1.2, Math.PI / 2);
  k.put(K.poster(0.75, 1.0, D.drawFilmPoster, { frame: C.charcoal }), -4.0, 1.2, Math.PI / 2, { y: 2.15, solid: false });
  const door = leftDoor(k, pal, 2.75);
  const mon = k.put(K.fieldMonitor(), -0.75, -1.85, QUARTER);
  const chair = k.put(K.directorsChair(pal), 0.35, 1.0, QUARTER);
  k.put(K.rug(2.6, 1.7, '#3d3929', '#5e5a4c', { round: 0.3 }), -1.55, 2.75, 0, { solid: false });
  const couch = k.put(K.couch(pal), -1.55, 2.55, 0);
  k.put(K.plant('tall'), 3.6, 3.5);
  k.put(K.micStand(), 2.85, 1.85, -3 * QUARTER);
  k.put(K.trashCan(), 3.6, 0.45);
  return finish(k, {
    stations: {
      desk: k.at(desk, desk.seat[0], desk.seat[1], Math.PI, { seat: desk.seatH, approach: [desk.seat[0], 1.62] }),
      bookshelf: k.at(shelf, 0, 0.9),
      whiteboard: k.at(board, 0, 0.75),
      terminal: k.at(render, 0.1, 0.92),
      cabinet: k.at(cases, 0, 0.85),
      portal: { spot: [-2.75, 2.15], face: Math.atan2(-1.25, 0.6) },
      globe: k.at(mon, 0, 0.78),
      workbench: k.at(cam, 0, -0.68, 0),
      armchair: k.at(chair, 0, 0, 0, { seat: chair.seatH, approach: [0, 0.9] }),
      bed: k.at(couch, couch.seat[0], couch.seat[1], 0, { seat: couch.seatH, approach: [couch.seat[0], 1.0] }),
      stage: k.at(set, set.seat[0], set.seat[1], 0, { seat: set.seatH, approach: [set.seat[0], 1.3] }),
      center: { spot: [0.9, -0.1], face: QUARTER },
    },
    roles: { desk, bookshelf: shelf, whiteboard: board, terminal: render, cabinet: cases, portal: door.piece, globe: mon, workbench: cam },
    door,
    screens: { desk: desk.screen, terminal: render.screen, board: board.screen },
    leds: render.leds,
    lid: cases.lid,
    tick: (dt, t, ctx) => {
      const live = ctx.working ? 1 : 0.32;
      onair.mat.color.setScalar(live + (ctx.working ? Math.sin(t * 3) * 0.06 : 0));
      const lit = ctx.onStage ? '#fff8ec' : '#9a958a';
      ring.light.color.set(lit);
      boxL.light.color.set(ctx.onStage ? '#fff4e2' : '#d6cdbd');
      boxR.light.color.set(ctx.onStage ? '#fff4e2' : '#d6cdbd');
      cam.tick(dt, t, false, ctx);
      desk.preview.tick(dt, (c, w, h) => D.drawPreview(c, w, h, ctx.editing, t));
      mon.screen.tick(dt, (c, w, h) => D.drawBrowser(c, w, h, ctx.web, t));
    },
  });
}

// ── art room ─────────────────────────────────────────────────

function art(room, pal) {
  const k = kit(room);
  const win = k.put(K.wallWindow(2.6, 1.5), 1.0, -4.03, 0, { y: 2.12, solid: false });
  const table = k.put(K.draftingTable(pal), 1.0, -3.45);
  const printer = k.put(K.plotter(), 3.35, -3.65);
  const shelf = k.put(K.bookshelf(pal, { w: 1.5, h: 2.2, fill: 'paint', frame: C.oak, top: 'plant' }), -3.73, -2.7, Math.PI / 2);
  k.put(K.bust(), -2.55, -3.6);
  const files = k.put(K.flatFiles(), -3.6, -0.75, Math.PI / 2);
  k.put(K.pegboard('brushes'), -4.02, -0.75, Math.PI / 2, { y: 1.95, solid: false });
  const board = k.put(K.wallBoard({ style: 'cork', w: 1.5, h: 1.0, bottom: 0.5 }), -4.0, 0.85, Math.PI / 2);
  k.put(K.poster(0.55, 0.7, (c, w, h) => D.drawPrint(c, w, h, 0)), -4.0, 0.55, Math.PI / 2, { y: 2.2, solid: false });
  k.put(K.poster(0.5, 0.4, (c, w, h) => D.drawPrint(c, w, h, 2), { frame: C.charcoal }), -4.0, 1.2, Math.PI / 2, { y: 2.3, solid: false });
  const door = leftDoor(k, pal, 2.6);
  k.put(K.bigWorkTable(), -0.1, 0.35);
  const laptop = k.put(K.laptopTable(), 2.65, 0.4, Math.PI);
  const easel = k.put(K.easel(pal, 7, D.drawPainting), 2.95, 3.0, 0.35);
  k.put(K.paintTable(), 3.6, 2.25);
  k.put(K.rug(2.1, 1.6, pal.rugEdge, pal.rug, { round: 0.8 }), -1.45, 2.5, 0, { solid: false });
  const chair = k.put(K.armchair(pal), -1.45, 2.4, QUARTER);
  const poufs = k.put(K.poufs(pal), 0.6, 3.45);
  k.put(K.plant('big'), -3.5, 3.7);
  k.put(K.plant('small'), -0.5, -3.75);
  k.put(K.polaroids(4), -2.4, -4.0, 0, { y: 2.85, solid: false });
  k.put(K.trashCan(), -1.4, -3.65);
  return finish(k, {
    stations: {
      desk: k.at(table, table.seat[0], table.seat[1], Math.PI, { seat: table.seatH, approach: [table.seat[0], 1.62] }),
      bookshelf: k.at(shelf, 0, 0.9),
      whiteboard: k.at(board, 0, 0.75),
      terminal: k.at(printer, 0, 0.85),
      cabinet: k.at(files, 0, 0.88),
      portal: { spot: [-2.75, 2.1], face: Math.atan2(-1.25, 0.5) },
      globe: k.at(laptop, 0, 0.7),
      workbench: { spot: [2.15, 2.6], face: Math.atan2(0.8, 0.4) },
      armchair: k.at(chair, 0, 0.08, 0, { seat: chair.seatH, approach: [0, 1.2] }),
      bed: { spot: [0.6, 3.45], approach: [0.6, 2.6], face: QUARTER, seat: poufs.seatH },
      stage: { spot: [1.35, 2.35], face: QUARTER },
      center: { spot: [0.0, 1.55], face: QUARTER },
    },
    roles: { desk: table, bookshelf: shelf, whiteboard: board, terminal: printer, cabinet: files, portal: door.piece, globe: laptop, workbench: easel },
    door,
    screens: { desk: table.screen, terminal: printer.screen, board: board.screen },
    drawers: files,
    tick: (dt, t, ctx) => {
      win.tick(dt);
      easel.tick(dt, t, ctx.busy.has('workbench'));
      laptop.screen.tick(dt, (c, w, h) => D.drawBrowser(c, w, h, ctx.web, t));
      const printing = ctx.term?.status === 'running';
      printer.paper.position.z = 0.3 + (printing ? ((t * 0.15) % 0.4) : 0);
    },
  });
}

// ── classroom ────────────────────────────────────────────────

function classroom(room, pal) {
  const k = kit(room);
  const board = k.put(K.wallBoard({ style: 'chalk', w: 3.0, h: 1.4, bottom: 0.55 }), -0.75, -4.02, 0);
  const clock = k.put(K.wallClock(), -0.75, -4.01, 0, { y: 2.48, solid: false });
  k.put(K.pennants(15), -0.2, -4.0, 0, { y: 2.98, solid: false });
  const teach = k.put(K.teacherDesk(pal), 2.25, -2.65, 0);
  k.put(K.plant('small'), 3.65, -3.7);
  const comp = k.put(K.computerDesk(pal), -3.3, -3.5, 0);
  const shelf = k.put(K.bookshelf(pal, { w: 1.7, h: 2.15, fill: 'library', frame: C.oak, top: 'fishbowl' }), -3.73, -1.45, Math.PI / 2);
  k.put(K.poster(1.1, 0.62, D.drawPeriodic, { frame: C.charcoal }), -4.0, -1.45, Math.PI / 2, { y: 2.68, solid: false });
  const cat = k.put(K.cardCatalog(), -3.78, 0.35, Math.PI / 2);
  k.put(K.poster(1.25, 0.78, D.drawWorldMap, { frame: C.charcoal }), -4.0, 0.35, Math.PI / 2, { y: 2.2, solid: false });
  const door = leftDoor(k, pal, 1.75);
  // Two rows of student desks facing the chalkboard.
  [[-1.6, 0.15], [0.0, 0.15], [1.6, 0.15], [-0.8, 1.75], [0.8, 1.75]].forEach(([x, z], i) => k.put(K.studentDesk(i + 1), x, z, 0));
  const globe = k.put(K.globe(), 3.35, -0.85);
  const sci = k.put(K.scienceTable(), 2.75, 3.45);
  const nook = k.put(K.readingNook(pal), -2.85, 3.3, 0, { solid: false });
  const chair = k.put(K.armchair(pal), -1.35, 3.45, QUARTER);
  k.put(K.trashCan(), 3.6, -2.25);
  return finish(k, {
    stations: {
      desk: k.at(teach, teach.seat[0], teach.seat[1], 0, { seat: teach.seatH, approach: [-1.15, -0.7] }),
      bookshelf: k.at(shelf, 0, 0.9),
      whiteboard: k.at(board, 0, 0.78),
      terminal: k.at(comp, 0, 0.7, Math.PI, { seat: 0.45, approach: [0, 1.4] }),
      cabinet: k.at(cat, 0, 0.8),
      portal: { spot: [-2.75, 2.35], face: Math.atan2(-1.25, -0.3) },
      globe: { spot: [2.6, -0.25], face: Math.atan2(0.75, -0.6) },
      workbench: k.at(sci, 0, -1.0, 0),
      armchair: k.at(chair, 0, 0.08, 0, { seat: chair.seatH, approach: [0, 1.15] }),
      bed: k.at(nook, nook.seat[0], nook.seat[1], QUARTER, { seat: nook.seatH, approach: [0.7, -0.6] }),
      stage: { spot: [0.85, 3.35], face: QUARTER },
      center: { spot: [-0.6, -1.25], face: 0 },
    },
    roles: { desk: teach, bookshelf: shelf, whiteboard: board, terminal: comp, cabinet: cat, portal: door.piece, globe, workbench: sci },
    door,
    screens: { desk: teach.screen, terminal: comp.screen, board: board.screen },
    drawers: cat,
    spinner: globe.sphere,
    tick: (dt, t, ctx) => { clock.tick(); sci.tick(dt, t, ctx.busy.has('workbench')); },
  });
}

// ── assembly ─────────────────────────────────────────────────

function finish(k, layout) {
  layout.solids = k.solids;
  return layout;
}

const BUILDERS = { cozy, lab, studio, art, class: classroom };

export function buildLayout(themeId, room, pal) {
  return (BUILDERS[themeId] || cozy)(room, pal);
}
