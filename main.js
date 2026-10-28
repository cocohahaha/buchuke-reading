import * as THREE from 'three';

/* ------------------------------------------------------------------ setup */
const $ = (s) => document.querySelector(s);
const MOBILE = matchMedia('(max-width: 760px)').matches || matchMedia('(pointer: coarse)').matches;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SERIF = '"Songti SC","STSong","Noto Serif SC","Source Han Serif SC",serif';
const SANS = '"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",sans-serif';
const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const back = (t) => { const c = 1.6; t = clamp(t, 0, 1); return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

let seed = 20261028;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const sections = [...document.querySelectorAll('section.chapter')];
setupChrome();

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: true, alpha: true, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('no gl');
} catch (e) {
  document.body.classList.add('nogl', 'ready');
  throw e;
}
const DPR = Math.min(devicePixelRatio || 1, MOBILE ? 1.75 : 2);
renderer.setPixelRatio(DPR);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);

/* the palette of a printed science reader: cream paper, navy ink, brick, and a few poster colours */
const C = {
  paper: 0xfbf6ea, page: 0xf4ecda, edge: 0xe3d6bb, ink: 0x1c2433, brick: 0x9a3b2a, red: 0xcf553a,
  mustard: 0xe2a83a, sage: 0x7fa878, sky: 0x6c9cc9, rose: 0xe0939b, wood: 0xc79a6a, cork: 0xc8a477,
  skin: 0xf0cfae, grey: 0xc9bfae, navy: 0x2f4466, cream: 0xfff4d8,
};

/* ------------------------------------------------------------- lighting */
scene.add(new THREE.HemisphereLight(0xfff7ea, 0xb99c74, 1.55));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.1);
sun.position.set(-6, 14, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4;
scene.add(sun);

/* ------------------------------------------------------------- builders */
const mats = {};
const M = (c, o = {}) => mats[c + JSON.stringify(o)] ||= new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, metalness: 0, flatShading: true, ...o });
function put(mesh, parent, x = 0, y = 0, z = 0) {
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
const box = (p, w, h, d, c, x, y, z) => put(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)), p, x, y + h / 2, z);
const cyl = (p, rt, rb, h, c, x, y, z, seg = 18) => put(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), M(c)), p, x, y + h / 2, z);
const ball = (p, r, c, x, y, z, o) => put(new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), M(c, o)), p, x, y, z);

/* a little paper person: cone body + round head, the kind you find in a textbook diagram */
function person(p, c, x, z, s = 1, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); g.rotation.y = ry; p.add(g);
  cyl(g, 0.16, 0.34, 0.85, c, 0, 0, 0, 14);
  ball(g, 0.21, C.skin, 0, 1.08, 0);
  return g;
}

/* text printed on a little paper tag; faces the camera */
function tag(s, text, pos, { size = 0.42, color = '#1c2433', bg = 'rgba(251,246,234,.94)', sub = null, font = SERIF, parent = null } = {}) {
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d'), fs = 64;
  const draw = (t, st) => {
    ctx.font = `700 ${fs}px ${font}`;
    const w1 = ctx.measureText(t).width; ctx.font = `400 ${fs * 0.6}px ${SANS}`;
    const w2 = st ? ctx.measureText(st).width : 0;
    const W = Math.ceil(Math.max(w1, w2) + fs * 0.9), H = Math.ceil(fs * (st ? 2.15 : 1.5));
    cv.width = W; cv.height = H;
    if (bg) { ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(2, 2, W - 4, H - 4, fs * 0.18); ctx.fill(); ctx.strokeStyle = 'rgba(28,36,51,.14)'; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
    ctx.font = `700 ${fs}px ${font}`; ctx.fillText(t, W / 2, st ? fs * 0.78 : H / 2 + 2);
    if (st) { ctx.font = `400 ${fs * 0.6}px ${SANS}`; ctx.fillStyle = 'rgba(28,36,51,.66)'; ctx.fillText(st, W / 2, fs * 1.62); }
    return [W, H];
  };
  const [W, H] = draw(text, sub);
  const mkTex = () => { const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx; };
  const tex = mkTex();
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  const k = size * (MOBILE ? 1.35 : 1) / (fs * 1.5);
  sp.scale.set(W * k, H * k, 1); sp.position.copy(pos); sp.renderOrder = 10;
  sp.userData = { a: 1, k };
  sp.set = (t, st) => { const key = t + '|' + st; if (key === sp.userData.key) return; sp.userData.key = key; const [w, h] = draw(t, st); const nt = mkTex(); sp.material.map.dispose(); sp.material.map = nt; sp.material.needsUpdate = true; sp.scale.set(w * k, h * k, 1); };
  (parent || s.root).add(sp); s.tags.push(sp);
  return sp;
}

/* ------------------------------------------------------------- the book */
{
  const book = new THREE.Group(); scene.add(book);
  const W = 7.4, D = 10.2;
  [-1, 1].forEach((side) => {
    const cover = box(book, W + 0.25, 0.12, D + 0.4, C.brick, side * (W / 2 + 0.06), -0.42, 0);
    cover.rotation.z = side * 0.035;
    const block = box(book, W, 0.36, D, C.edge, side * (W / 2 + 0.02), -0.34, 0);
    block.rotation.z = side * 0.035;
    const top = box(book, W - 0.04, 0.02, D - 0.04, C.page, side * (W / 2 + 0.02), 0.02 - 0.34 + 0.34, 0);
    top.rotation.z = side * 0.035;
  });
  box(book, 0.5, 0.1, D + 0.4, 0x7e2f22, 0, -0.46, 0);
  // a ribbon bookmark hanging over the bottom edge
  const rib = box(book, 0.18, 0.012, 1.0, C.red, 3.2, 0.04, D / 2 - 0.1); rib.castShadow = false;
  const rib2 = box(book, 0.18, 0.5, 0.012, C.red, 3.2, -0.45, D / 2 + 0.4); rib2.castShadow = false;
  // shadow catcher: the desk itself is the CSS background
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.22, color: 0x5a3c1e }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.48; floor.receiveShadow = true; scene.add(floor);
}

/* ---------------------------------------------------------------- scenes */
const S = [];
function mk(width = 12, cam = { pos: [0, 9.5, 13.5], look: [0, 1.4, 0] }) {
  const pop = new THREE.Group(), root = new THREE.Group();
  pop.add(root); scene.add(pop); pop.visible = false; root.position.y = 0.05;
  const s = { pop, root, tags: [], width, w: 0, wt: 0, p: 0, pt: 0,
    update() {}, cam: () => ({ pos: new V3(...cam.pos), look: new V3(...cam.look) }) };
  S.push(s); return s;
}


/* ---- 0 · cards pile up into a little stack */
{
  const s = mk(11);
  const NOTES = 34, stack = [];
  for (let i = 0; i < NOTES; i++) {
    const m = box(s.root, 2.6, 0.06, 1.8, i % 5 === 0 ? C.cream : C.paper, 0, i * 0.07, 0.4);
    m.rotation.y = (rnd() - 0.5) * 0.35; stack.push(m);
  }
  const cover = box(s.root, 2.8, 0.1, 1.95, C.brick, 0, 0, 0.4);
  const fly = [0, 1, 2].map(() => box(s.root, 1.1, 0.04, 0.8, C.paper, 0, 0, 0));
  const count = tag(s, '0 张', new V3(0, 3.6, 0.4), { size: 0.5, sub: '卡片' });
  let shown = '';
  s.update = (t, p) => {
    const n = Math.round(4 + smooth(0, 0.7, p) * (NOTES - 4));
    stack.forEach((m, i) => (m.visible = i < n));
    const h = n * 0.07;
    const shut = smooth(0.72, 0.9, p);
    cover.visible = shut > 0.01; cover.position.y = h + 0.02 + (1 - shut) * 1.5; cover.rotation.z = (1 - shut) * 1.2;
    fly.forEach((m, k) => {
      const ph = (t * 0.45 + k / 3) % 1, fromLeft = Math.floor(t * 0.45 + k / 3) % 2 === 0;
      const x0 = fromLeft ? -4 : 4;
      m.position.set(mix(x0, 0, ph), 1.8 + Math.sin(ph * Math.PI) * 1.6 - ph * (1.8 - h), mix(0.6, 0.4, ph));
      m.rotation.set(Math.sin(t * 3 + k) * 0.3, t * 2 + k, Math.sin(ph * Math.PI) * 0.4);
      m.visible = shut < 0.5;
    });
    const label = shut > 0.6 ? '十五个主题' : `${Math.round(smooth(0, 0.7, p) * 60)} 张`;
    if (label !== shown) { count.set(label, shut > 0.6 ? '往下读' : '卡片'); shown = label; }
    count.position.y = h + 1.6;
  };
}


/* ---- 1 · information: 8 cups, 1 ball, each yes/no question lifts half the cups */
{
  const s = mk(10, { pos: [0, 10, 11], look: [0, 0.6, 0.3] });
  const cols = [C.mustard, C.sky, C.sage, C.rose];
  const cups = [], HIDE = 6;
  for (let i = 0; i < 8; i++) {
    const x = -3.3 + (i % 4) * 2.2, z = i < 4 ? -1.1 : 1.3;
    const g = new THREE.Group(); g.position.set(x, 0, z); s.root.add(g);
    cyl(g, 0.48, 0.66, 1.1, cols[i % 4], 0, 0, 0, 20);
    cyl(g, 0.5, 0.5, 0.06, 0xffffff, 0, 1.1, 0, 20).material = M(cols[i % 4], { roughness: 0.6 });
    tag(s, String(i + 1), new V3(0, 1.7, 0), { size: 0.34, parent: g, font: SANS });
    cups.push(g);
  }
  ball(s.root, 0.32, C.red, cups[HIDE].position.x, 0.32, cups[HIDE].position.z);
  // which cups go at each question: left half? → front row? → which of two?
  const out = [[0, 1, 4, 5], [2, 3], [7]];
  const qs = ['问 1：在右边两列吗？是', '问 2：在前排吗？是', '问 3：是左边那个吗？是'];
  const head = tag(s, '8 个杯子，1 颗球', new V3(0, 3.7, 0), { size: 0.5, sub: '还要猜多久？' });
  let shown = '';
  s.update = (t, p) => {
    let step = 0;
    out.forEach((grp, q) => {
      const k = smooth(0.12 + q * 0.2, 0.26 + q * 0.2, p); if (k > 0.5) step = q + 1;
      grp.forEach((i) => { const c = cups[i]; c.position.y = k * 2.6; c.rotation.z = k * (c.position.x > 0 ? -0.5 : 0.5); c.scale.setScalar(1 - k * 0.98); c.visible = k < 0.99; });
    });
    const reveal = smooth(0.78, 0.9, p), c = cups[HIDE];
    c.position.y = reveal * 1.8 + Math.sin(t * 2) * 0.03 * reveal; c.rotation.x = reveal * 0.35;
    const left = 8 >> step;
    const key = reveal > 0.5 ? 'done' : `${step}`;
    if (key !== shown) {
      shown = key;
      if (reveal > 0.5) head.set('找到了：问 3 次 = 3 bit', '8 = 2 × 2 × 2');
      else if (step === 0) head.set('8 个杯子，1 颗球', '只许问「是不是」');
      else head.set(qs[step - 1], `还剩 ${left} 个 · 已拿到 ${step} bit`);
    }
  };
}

/* ---- 2 · blank page: it fills, gets wiped; the card box beside it is all that stays */
{
  const s = mk(11.5, { pos: [0.6, 9.5, 11.5], look: [0.6, 0.8, 0] });
  const sheet = box(s.root, 4.2, 0.06, 5.4, 0xffffff, -1.4, 0, 0);
  const LINES = 14, lines = [];
  for (let i = 0; i < LINES; i++) {
    const w = 3.2 - (i % 4 === 3 ? 1.2 : rnd() * 0.5);
    const m = box(s.root, w, 0.02, 0.09, C.ink, -1.4 - (3.2 - w) / 2, 0.07, -2.2 + i * 0.32);
    m.castShadow = false; m.geometry.translate(w / 2, 0, 0); m.position.x -= w / 2; lines.push(m);
  }
  const wiper = box(s.root, 0.8, 0.45, 0.6, C.rose, -1.4, 0.06, -3.2);
  // the card box: CLAUDE.md, memory, skills
  const bx = new THREE.Group(); bx.position.set(3.1, 0, 0.2); s.root.add(bx);
  box(bx, 1.9, 0.9, 2.6, C.brick, 0, 0, 0);
  box(bx, 1.7, 0.92, 2.4, 0x7e2f22, 0, 0.02, 0);
  const cards = [C.cream, C.paper, C.mustard, C.paper, C.sky].map((c, i) => {
    const m = box(bx, 1.5, 1.05, 0.04, c, 0, 0.2, -0.9 + i * 0.42); m.rotation.x = -0.2; return m;
  });
  const hop = box(s.root, 1.0, 0.04, 0.7, C.mustard, 0, 0, 0);
  // the canary that calls him 哥
  const bird = new THREE.Group(); bird.position.set(3.7, 1.0, 1.2); s.root.add(bird);
  ball(bird, 0.26, 0xf3c83c, 0, 0.26, 0); ball(bird, 0.17, 0xf3c83c, 0.16, 0.56, 0);
  const beak = put(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), M(C.red)), bird, 0.34, 0.56, 0); beak.rotation.z = -Math.PI / 2;
  const chirp = tag(s, '金丝雀', new V3(3.6, 2.3, 1.2), { size: 0.36 });
  tag(s, '这一次的上下文', new V3(-1.4, 0.4, 3.4), { size: 0.38 });
  tag(s, '纸外的记忆', new V3(3.1, 2.2, -1.6), { size: 0.38, sub: 'CLAUDE.md · skills' });
  const note = tag(s, '每次都从白纸开始', new V3(-1.4, 3.2, -1), { size: 0.44 });
  s.update = (t, p) => {
    const T = 9, ph = (t % T) / T;
    const fill = smooth(0.12, 0.78, ph), wipe = smooth(0.82, 0.96, ph);
    lines.forEach((m, i) => { const k = clamp(fill * LINES - i, 0, 1); m.scale.x = Math.max(0.001, k); m.visible = k > 0 && wipe < (i + 1) / LINES * 1.02 ? true : false; });
    wiper.visible = wipe > 0 && wipe < 1; wiper.position.z = mix(-3.2, 2.6, wipe);
    const h = smooth(0, 0.1, ph);
    hop.position.set(mix(3.1, -2.6, h), 0.08 + Math.sin(h * Math.PI) * 2.2, mix(0.2, -2.2, h)); hop.rotation.y = h * 0.4;
    hop.visible = ph < 0.8; cards[2].visible = ph > 0.8;
    const full = fill > 0.85 && wipe < 0.05;
    chirp.material.opacity = full ? 0 : (Math.sin(t * 5) > 0 ? 1 : 0.15) * s.pop.scale.y;
    bird.rotation.z = full ? 0.5 : Math.sin(t * 5) * 0.08;
    note.material.opacity = (wipe > 0 || ph < 0.12 ? 1 : 0.25) * s.pop.scale.y;
  };
  s.fade = [chirp, note];
}

/* ---- 3 · four moves of "the half-finished thought": a four-shelf bookcase */
{
  const s = mk(12, { pos: [1.4, 7.5, 15.5], look: [1.4, 3.6, 0] });
  const Y = [6.0, 4.2, 2.4, 0.6], Wd = 6.2;
  box(s.root, 0.22, 7.6, 2.2, C.wood, -Wd / 2, 0, -0.4); box(s.root, 0.22, 7.6, 2.2, C.wood, Wd / 2, 0, -0.4);
  box(s.root, Wd + 0.2, 0.12, 0.1, C.wood, 0, 7.5, -1.45).scale.y = 1;
  box(s.root, Wd, 7.6, 0.1, 0xe7d3b2, 0, 0, -1.45);
  Y.forEach((y) => box(s.root, Wd, 0.14, 2.2, C.wood, 0, y - 0.14, -0.4));
  const names = [['① 写在草稿纸上', '思维链 CoT'], ['② 出门查资料', 'agent · ReAct'], ['③ 收回脑子里绕圈', '他说的第三次搬家'], ['④ 一台一直开着的机器', '他的赌注']];
  names.forEach(([a, b], i) => tag(s, a, new V3(Wd / 2 + 0.3, Y[i] + 0.8, 0.8), { size: 0.34, sub: b }).center.set(0, 0.5));
  // shelf 1: scratch paper
  const pap = box(s.root, 1.6, 0.03, 1.1, 0xffffff, 1.2, Y[0], -0.4); pap.rotation.y = 0.2;
  for (let i = 0; i < 4; i++) box(s.root, 1.1 - i * 0.15, 0.01, 0.06, C.ink, 1.1, Y[0] + 0.03, -0.75 + i * 0.22).castShadow = false;
  // shelf 2: a door out and a magnifier
  box(s.root, 0.9, 1.3, 0.08, C.sky, 1.9, Y[1], -1.3);
  const lens = put(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 24), M(C.ink)), s.root, 0.6, Y[1] + 0.5, 0.2);
  box(s.root, 0.08, 0.5, 0.08, C.ink, 0.6, Y[1], 0.2);
  // shelf 3: a loop the thought goes round
  const ring = put(new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.07, 8, 40), M(C.sage)), s.root, 0.8, Y[2] + 0.12, -0.3);
  ring.rotation.x = -Math.PI / 2;
  // shelf 4: the always-on machine
  box(s.root, 1.6, 1.1, 1.2, C.navy, 0.8, Y[3], -0.4);
  const lamp = ball(s.root, 0.16, C.mustard, 0.8, Y[3] + 1.35, 0.2, { emissive: C.mustard, emissiveIntensity: 0.6 });
  box(s.root, 0.04, 0.25, 0.04, C.ink, 0.8, Y[3] + 1.1, 0.2);
  const orb = ball(s.root, 0.22, C.red, 0, 0, 0);
  const bad = tag(s, '「有可能」→「就是」', new V3(2.2, Y[0] + 1.2, 0), { size: 0.3, color: '#9a3b2a' });
  const tmp = new V3();
  s.update = (t, p) => {
    const st = clamp(p * 4.4 - 0.2, 0, 3), i = Math.floor(st), f = st - i;
    const at = (k) => {
      if (k === 0) return tmp.set(1.1 + Math.sin(t * 1.4) * 0.5, Y[0] + 0.25, -0.4 + Math.cos(t * 1.4) * 0.3);
      if (k === 1) { const a = (t * 0.6) % 1; return tmp.set(mix(0.6, 1.9, a), Y[1] + 0.22 + Math.sin(a * Math.PI) * 0.4, mix(0.2, -1.0, a)); }
      if (k === 2) return tmp.set(0.8 + Math.cos(t * 2.4) * 0.75, Y[2] + 0.3, -0.3 + Math.sin(t * 2.4) * 0.75);
      return tmp.set(0.8, Y[3] + 1.35, 0.2);
    };
    const a = at(i).clone(), b = at(Math.min(3, i + 1)).clone(), drop = smooth(0.55, 1, f);
    orb.position.lerpVectors(a, b, drop); orb.position.y += Math.sin(drop * Math.PI) * 0.6;
    orb.visible = !(i >= 3 || (i === 2 && drop > 0.95));
    lamp.material.emissiveIntensity = 0.5 + 0.4 * Math.sin(t * 2) + (st > 2.9 ? 0.6 : 0);
    lens.rotation.z = Math.sin(t) * 0.3;
    bad.material.opacity = (i === 0 ? 1 : 0.3) * s.pop.scale.y;
  };
  s.fade = [bad];
}

/* ---- 6 · walls: a paper plane carries your data; each app is a wall with a door */
{
  const s = mk(11, { pos: [7.5, 6.5, 10.5], look: [0, 1.2, -0.5] });
  const Z = [3.0, 1.4, -0.2, -1.8, -3.4], names = ['聊天记录', '网页', '会议', '笔记', '记忆库'];
  const doors = [];
  Z.forEach((z, i) => {
    const c = [C.sky, C.sage, C.mustard, C.rose, C.navy][i];
    box(s.root, 2.0, 2.4, 0.12, c, -2.0, 0, z); box(s.root, 2.0, 2.4, 0.12, c, 2.0, 0, z);
    box(s.root, 2.0, 0.9, 0.12, c, 0, 1.5, z);
    const d = new THREE.Group(); d.position.set(-1.0, 0, z); s.root.add(d);
    box(d, 2.0, 1.5, 0.08, c, 1.0, 0, 0).material = M(c, { roughness: 0.7 });
    doors.push(d);
    tag(s, names[i], new V3(-3.3, 2.75, z), { size: 0.3 });
  });
  const plane = new THREE.Group(); s.root.add(plane);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.55, -0.42, 0.04, 0.4, 0, -0.05, 0.4, 0, 0, -0.55, 0, -0.05, 0.4, 0.42, 0.04, 0.4], 3));
  pg.computeVertexNormals();
  put(new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, flatShading: true, roughness: 0.8 })), plane);
  const head = tag(s, '能打穿几层？', new V3(0, 3.9, 0), { size: 0.44, sub: '多数工具只穿得过一两层' });
  s.update = (t, p) => {
    const open = 1 + Math.floor(smooth(0.1, 0.85, p) * 4.99);
    doors.forEach((d, i) => { const k = i < open ? 1 : 0; d.rotation.y += ((k ? -1.35 : 0) - d.rotation.y) * 0.08; });
    const T = 4.2, ph = (t % T) / T, stopZ = (open < 5 ? Z[open] : -5.2) + 0.45;
    const startZ = 5.2, zz = mix(startZ, stopZ, smooth(0, 0.7, ph));
    const bounce = smooth(0.7, 1, ph) * (open < 5 ? 1 : 0);
    plane.position.set(Math.sin(ph * 9) * 0.15, 0.75 + Math.sin(ph * TAU) * 0.15 - bounce * 0.6, zz + bounce * 0.9);
    plane.rotation.set(-0.1 + bounce * 0.9, 0, Math.sin(ph * 9) * 0.25 + bounce * 1.4);
    head.set(`穿过 ${open} 层`, open < 5 ? `第 ${open + 1} 道门关着：「${names[open]}」` : '全打穿了：这样的工具很少');
  };
}

/* ---- 5 · the loop: AI stations speed up, marbles queue at the human (a hotpot cashier) */
{
  const s = mk(10.5, { pos: [0, 10.5, 9.5], look: [0, 0.4, 0.3] });
  const R = 3.0;
  const track = put(new THREE.Mesh(new THREE.TorusGeometry(R, 0.14, 8, 90), M(C.cream)), s.root, 0, 0.12, 0);
  track.rotation.x = -Math.PI / 2;
  const ST = [[0.0, '看', C.sky], [0.25, '想', C.sage], [0.5, '做', C.mustard], [0.75, '人审', C.rose]];
  const pt = (u, r = R) => new V3(Math.cos(u * TAU) * r, 0, -Math.sin(u * TAU) * r);
  ST.forEach(([u, name, c], i) => {
    const q = pt(u, R);
    if (i === 3) { person(s.root, C.rose, q.x, q.z + 1.0, 1.25); box(s.root, 1.1, 0.5, 0.5, C.wood, q.x, 0, q.z + 0.45); }
    else { const g = box(s.root, 0.9, 0.7, 0.9, c, q.x * 1.18, 0, q.z * 1.18); g.rotation.y = -u * TAU; }
    tag(s, name, q.clone().multiplyScalar(1.45).setY(1.3), { size: 0.42 });
  });
  const hs = ST[3][0];
  const MAX = 11, mar = [];
  for (let i = 0; i < MAX; i++) mar.push({ m: ball(s.root, 0.2, [C.red, C.sky, C.mustard, C.sage][i % 4], 0, 0.3, 0), u: (i / MAX + 0.8) % 1, q: false, on: false });
  let queue = [], last = 0;
  const qtag = tag(s, '排队 0', new V3(0, 1.2, 0), { size: 0.42, sub: 'AI 再快，也快不过你审稿' });
  s.update = (t, p, dt) => {
    const active = 3 + Math.round(smooth(0.05, 0.6, p) * (MAX - 3));
    const v = 0.12 * (1 + smooth(0.05, 0.7, p) * 5);
    mar.forEach((o, i) => {
      if (i >= active) { o.m.visible = false; o.on = false; return; }
      if (!o.on) { o.on = true; o.u = (hs + 0.05 + i * 0.03) % 1; o.q = false; }
      o.m.visible = true;
      if (!o.q) {
        const nu = o.u + v * dt;
        const tail = hs - queue.length * 0.035;
        const d0 = ((tail - o.u) % 1 + 1) % 1, d1 = ((tail - nu) % 1 + 1) % 1;
        if (d1 > d0 && d0 < 0.2) { o.q = true; queue.push(o); } else o.u = nu % 1;
      }
    });
    queue = queue.filter((o) => o.on);
    if (queue.length && t - last > 1.5) { const o = queue.shift(); o.q = false; o.u = hs + 0.02; last = t; }
    queue.forEach((o, k) => (o.u = hs - k * 0.035));
    mar.forEach((o) => { if (o.on) { const q = pt(o.u); o.m.position.set(q.x, 0.36, q.z); } });
    qtag.set(`排队 ${queue.length}`, queue.length > 3 ? '收银台只有一个' : 'AI 再快，也快不过你审稿');
  };
}

/* ---- 6 · many agents: robots multiply; three coin towers = token use (chat 1, agent 4, multi-agent 15) */
const agentHud = { n: 0 };
{
  const s = mk(13, { pos: [0, 9.5, 12.5], look: [0, 0.8, 0] });
  const N = MOBILE ? 600 : 1200, cols = 40;
  const rob = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.16, 0.1), M(0xffffff), N);
  rob.castShadow = true; rob.receiveShadow = true;
  const mtx = new THREE.Matrix4(), col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const x = -5.6 + (i % cols) * 0.085, z = -3.4 + Math.floor(i / cols) * 0.21;
    mtx.makeTranslation(x + (Math.floor(i / cols) % 2) * 0.04, 0.08, z); rob.setMatrixAt(i, mtx);
    rob.setColorAt(i, col.set([C.sky, C.mustard, C.sage, C.navy][i % 4]));
  }
  rob.count = 0; s.root.add(rob);
  box(s.root, 3.8, 0.06, 6.9, C.cream, -3.9, 0, 0).castShadow = false;
  const towers = [[1, 0.2, '聊天', '1×'], [4, 1.8, '单个 agent', '约 4×'], [15, 3.4, '多个 agent', '约 15×']];
  const stacks = towers.map(([n, x, name, sub]) => {
    const coins = [];
    for (let i = 0; i < n; i++) coins.push(cyl(s.root, 0.5, 0.5, 0.16, C.mustard, x + 1.2, i * 0.17, 0, 20));
    tag(s, name, new V3(x + 1.2, 0.5 + n * 0.17 + 0.9, 0), { size: 0.3, sub });
    return coins;
  });
  tag(s, '同时在跑的 agent', new V3(-3.9, 1.5, -3.9), { size: 0.4, sub: 'OpenAI 自述，未独立验证' });
  tag(s, 'token 用量', new V3(3.4, 5.6, -1.4), { size: 0.4, sub: 'Anthropic 自己的数据' });
  s.update = (t, p) => {
    const g = smooth(0.0, 0.42, p);
    rob.count = Math.max(1, Math.round(g * N)); agentHud.n = Math.max(1, Math.round(Math.pow(g, 1.6) * 10000));
    const up = smooth(0.35, 0.9, p);
    stacks.forEach((cs, k) => cs.forEach((c, i) => { const f = clamp(up * 1.6 - k * 0.3 - i * 0.01, 0, 1); c.visible = f > 0 || k === 0; c.scale.y = k === 0 ? 1 : Math.max(0.01, f); }));
    rob.position.y = Math.sin(t * 6) * 0.01;
  };
}


/* ---- 7 · good enough: a climbing staircase (what tech can do) vs a gentler slope (what customers need) */
{
  const s = mk(12, { pos: [0, 6.5, 12], look: [0, 1.8, 0] });
  const STEPS = 12, steps = [], slope = [];
  for (let i = 0; i < STEPS; i++) {
    const x = -4.8 + i * 0.85;
    steps.push(box(s.root, 0.8, 0.25 + i * 0.4, 1.0, C.sky, x, 0, -0.9));
    slope.push(box(s.root, 0.8, 0.12, 0.7, C.mustard, x, 1.1 + i * 0.12, 0.8));
  }
  const cross = 5;
  box(s.root, 0.04, 4.8, 0.04, C.red, -4.8 + cross * 0.85 + 0.4, 0, 0.2).castShadow = false;
  tag(s, '技术能做到的', new V3(3.4, 5.2, -0.9), { size: 0.34 });
  tag(s, '客户觉得够用的', new V3(-3.6, 2.9, 0.8), { size: 0.34 });
  const head = tag(s, '性能不够', new V3(0, 6.2, 0), { size: 0.44, sub: '整合者赢：部件紧密配合' });
  let shown = '';
  s.update = (t, p) => {
    const g = smooth(0.05, 0.75, p);
    steps.forEach((m, i) => { const k = clamp(g * STEPS * 1.1 - i, 0, 1); m.visible = k > 0; m.scale.y = Math.max(0.01, k); });
    slope.forEach((m, i) => (m.visible = true));
    const past = g * STEPS > cross + 1;
    const key = past ? 'b' : 'a';
    if (key !== shown) { shown = key; head.set(past ? '性能过剩' : '性能不够', past ? '模块化者赢：谁便宜谁赢' : '整合者赢：部件紧密配合'); }
  };
}


/* ---- 7 · fast brain, slow brain: an alarm bell vs. clockwork, with a pressure gauge */
{
  const s = mk(10, { pos: [0, 7.5, 11.5], look: [0, 1.6, 0] });
  const bell = new THREE.Group(); bell.position.set(-2.5, 0, -0.3); s.root.add(bell);
  box(bell, 0.12, 2.2, 0.12, C.ink, 0, 0, 0);
  const cup = put(new THREE.Mesh(new THREE.SphereGeometry(0.85, 20, 12, 0, TAU, 0, Math.PI / 2), M(C.red, { side: THREE.DoubleSide })), bell, 0, 2.2, 0);
  ball(bell, 0.16, C.ink, 0, 1.95, 0);
  const gears = [];
  [[2.0, 1.9, 0.9, 12], [3.25, 2.55, 0.55, 8], [3.0, 1.0, 0.45, 7]].forEach(([x, y, r, teeth], i) => {
    const g = new THREE.Group(); g.position.set(x, y, -0.4); s.root.add(g);
    put(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.25, 24), M(C.sky)), g).rotation.x = Math.PI / 2;
    for (let k = 0; k < teeth; k++) { const a = k / teeth * TAU; const tb = put(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.25), M(C.sky)), g, Math.cos(a) * r, Math.sin(a) * r, 0); tb.rotation.z = a; }
    put(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 10), M(C.ink)), g).rotation.x = Math.PI / 2;
    g.userData = { r, dir: i === 1 ? -1 : 1 };
    gears.push(g);
  });
  box(s.root, 0.12, 1.9, 0.12, C.ink, 2.0, 0, -0.4);
  // gauge
  const gauge = new THREE.Group(); gauge.position.set(0, 0, 1.4); s.root.add(gauge);
  box(gauge, 2.1, 0.12, 1.3, C.paper, 0, 0, 0);
  for (let k = 0; k <= 6; k++) { const a = Math.PI - k / 6 * Math.PI; const c = k > 4 ? C.red : C.ink; box(gauge, 0.05, 0.03, 0.18, c, Math.cos(a) * 0.8, 0.12, -Math.sin(a) * 0.8 + 0.35).rotation.y = a + Math.PI / 2; }
  const needle = new THREE.Group(); needle.position.set(0, 0.17, 0.35); gauge.add(needle);
  box(needle, 0.06, 0.04, 0.75, C.brick, 0, 0, -0.37);
  tag(s, '杏仁核', new V3(-2.5, 3.6, -0.3), { size: 0.4, sub: '烟雾报警器：快跑！' });
  tag(s, '前额叶', new V3(2.6, 3.7, -0.4), { size: 0.4, sub: '总指挥：慢慢想' });
  const pt = tag(s, '压力', new V3(0, 1.0, 2.6), { size: 0.34 });
  s.update = (t, p, dt) => {
    const pr = clamp(0.15 + smooth(0.05, 0.6, p) * 0.75 + Math.sin(t * 1.3) * 0.08, 0, 1);
    needle.rotation.y = Math.PI / 2 - pr * Math.PI;
    const ring = pr > 0.6 ? (pr - 0.6) * 2.5 : 0;
    cup.rotation.z = Math.sin(t * 28) * 0.25 * ring; bell.scale.setScalar(1 + ring * 0.35);
    const spd = (1 - pr) * 1.4;
    gears.forEach((g) => (g.rotation.z += g.userData.dir * spd * dt / g.userData.r));
    gears.forEach((g) => g.scale.setScalar(1 - pr * 0.25));
    pt.set(pr > 0.7 ? '压力大：报警器压过总指挥' : '压力', null);
  };
}

/* ---- 8 · meaning from relative position: pins and string on a cork board */
{
  const s = mk(10.5, { pos: [0, 4.6, 12.5], look: [0, 3.2, 0] });
  const board = new THREE.Group(); board.position.set(0, 0, -0.8); board.rotation.x = -0.12; s.root.add(board);
  box(board, 9.2, 6.2, 0.25, C.wood, 0, 0.1, 0);
  box(board, 8.7, 5.7, 0.28, C.cork, 0, 0.35, 0.02);
  const words = ['记忆', '重建', '加工深度', '概念图', '语义网络', '词向量', 'ontology', '最近发展区', 'i+1', '课程学习', '语块', '多口音'];
  const P = [[-3.4, 4.9], [-1.6, 5.4], [-0.2, 4.2], [-3.2, 3.2], [1.6, 2.4], [3.4, 3.4], [0.6, 5.3], [-1.6, 1.4], [3.2, 5.2], [3.3, 1.2], [-3.5, 1.3], [0.4, 0.9]];
  const E = [[0, 1], [1, 2], [1, 3], [2, 4], [2, 7], [4, 5], [6, 4], [6, 8], [6, 2], [5, 9], [4, 9], [7, 2], [10, 6], [11, 4], [11, 5], [8, 3], [6, 11], [10, 7]];
  const pins = P.map(([x, y], i) => {
    const pin = ball(board, 0.16, [C.red, C.sky, C.mustard, C.sage][i % 4], x, y, 0.4);
    tag(s, words[i], new V3(x, y - 0.45, 0.45), { size: 0.3, parent: board });
    return pin;
  });
  const pos = new Float32Array(E.length * 6);
  E.forEach(([a, b], i) => pos.set([P[a][0], P[a][1], 0.38, P[b][0], P[b][1], 0.38], i * 6));
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lns = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: C.brick })); board.add(lns);
  s.update = (t, p) => {
    const n = Math.round(smooth(0.05, 0.75, p) * E.length);
    lg.setDrawRange(0, n * 2);
    const deg = P.map(() => 0); E.slice(0, n).forEach(([a, b]) => { deg[a]++; deg[b]++; });
    const top = Math.max(1, ...deg);
    pins.forEach((m, i) => { const k = 1 + (deg[i] / top) * 1.3 * (deg[i] === top && n > 4 ? 1.3 : 1); m.scale.lerp(new V3(k, k, k), 0.1); });
  };
}

/* ---- 9 · building is cheap, explaining is dear: a bridge, plank by plank */
{
  const s = mk(12, { pos: [0, 6.5, 13], look: [0, 1.6, 0] });
  box(s.root, 4.0, 2.2, 5.0, C.sage, -3.6, 0, 0); box(s.root, 4.0, 2.2, 5.0, C.sage, 3.6, 0, 0);
  box(s.root, 4.0, 0.12, 5.0, 0x9cc293, -3.6, 2.2, 0); box(s.root, 4.0, 0.12, 5.0, 0x9cc293, 3.6, 2.2, 0);
  // the product on the far side: a little house with a lit window
  box(s.root, 1.2, 1.0, 1.0, C.paper, 4.3, 2.3, -1.2);
  put(new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.6, 4), M(C.brick)), s.root, 4.3, 3.6, -1.2).rotation.y = Math.PI / 4;
  ball(s.root, 0.14, C.mustard, 4.3, 2.8, -0.68, { emissive: C.mustard, emissiveIntensity: 0.6 });
  const PL = 12, planks = [];
  for (let i = 0; i < PL; i++) planks.push(box(s.root, 0.26, 0.1, 1.4, C.wood, -1.45 + i * 0.265, 2.2, 0.6));
  const folk = [0, 1, 2, 3, 4].map((i) => person(s.root, [C.rose, C.sky, C.mustard, C.navy, C.red][i], -2.4 - (i % 3) * 0.55, 0.2 + (i - 2) * 0.35, 0.75));
  folk.forEach((f) => (f.position.y = 2.3));
  tag(s, '做出来的东西', new V3(4.3, 4.6, -1.2), { size: 0.36 });
  const lb = tag(s, '用户走到这儿就停了', new V3(-3.4, 4.2, 0), { size: 0.36 });
  s.update = (t, p) => {
    const b = smooth(0.08, 0.6, p);
    planks.forEach((m, i) => { const k = clamp(b * PL - i, 0, 1); m.visible = k > 0; m.position.y = 2.2 + (1 - back(k)) * 2.5; m.scale.y = 1; });
    const walk = smooth(0.62, 0.95, p);
    folk.forEach((f, i) => { const w = clamp(walk * 1.4 - i * 0.1, 0, 1); f.position.x = mix(-2.4 - (i % 3) * 0.55, 2.4 + (i % 3) * 0.45, w); f.position.y = 2.3 + Math.abs(Math.sin(t * 7 + i)) * 0.08 * (w > 0 && w < 1 ? 1 : 0); f.position.z = 0.6 + (i - 2) * 0.3; });
    lb.set(walk > 0.5 ? '讲明白了，人才过得去' : b > 0.1 ? '一块块铺：价值传递' : '用户走到这儿就停了', null);
  };
}

/* ---- 11 · zip and unzip: a tight little block unfolds into pages with examples */
{
  const s = mk(10, { pos: [0, 8, 10], look: [0, 0.6, 0] });
  const zip = box(s.root, 1.2, 1.2, 1.2, C.navy, -3.6, 0, 0);
  const stripe = box(s.root, 0.12, 1.22, 1.22, C.mustard, -3.6, 0, 0);
  const PG = 7, pages = [];
  for (let i = 0; i < PG; i++) {
    const m = box(s.root, 1.5, 0.05, 2.0, i % 2 ? C.paper : C.cream, -3.6, 0, 0);
    for (let k = 0; k < 4; k++) { const ln = box(m, 1.1 - k * 0.15, 0.01, 0.06, C.ink, 0, 0.05, -0.55 + k * 0.3); ln.castShadow = false; }
    pages.push(m);
  }
  tag(s, '压缩后', new V3(-3.6, 2.4, 0), { size: 0.36, sub: '读者得自己解压' });
  const lab = tag(s, '解压后', new V3(2.2, 3.0, 0), { size: 0.36, sub: '例子 · 语气 · 背景' });
  s.update = (t, p) => {
    const k = smooth(0.15, 0.75, p);
    zip.scale.setScalar(1 - k * 0.6); stripe.scale.setScalar(1 - k * 0.6); zip.position.y = 0; stripe.position.y = 0;
    pages.forEach((m, i) => {
      const f = clamp(k * 1.5 - i * 0.12, 0, 1);
      m.visible = f > 0.01;
      m.position.set(mix(-3.6, -1.6 + i * 0.7, back(f)), 0.1 + i * 0.02, mix(0, (i % 2 ? 0.5 : -0.5), f));
      m.rotation.y = (1 - f) * 1.2 + (i % 2 ? 0.08 : -0.08);
    });
    lab.material.opacity = smooth(0.4, 0.7, p) * s.pop.scale.y;
  };
  s.fade = [lab];
}


/* ---- 12 · robot arm: the big model gives the direction, a small loop fixes the last millimetre */
{
  const s = mk(10, { pos: [0, 6, 11], look: [0, 1.8, 0] });
  box(s.root, 3.0, 0.2, 2.2, C.navy, -1.5, 0, 0);
  const base = new THREE.Group(); base.position.set(-1.5, 0.2, 0); s.root.add(base);
  const seg1 = new THREE.Group(); base.add(seg1);
  box(seg1, 0.5, 2.0, 0.5, C.sky, 0, 0, 0);
  const seg2 = new THREE.Group(); seg2.position.y = 2.0; seg1.add(seg2);
  ball(seg2, 0.3, C.ink, 0, 0, 0);
  box(seg2, 0.4, 1.8, 0.4, C.sage, 0, 0, 0);
  const seg3 = new THREE.Group(); seg3.position.y = 1.8; seg2.add(seg3);
  ball(seg3, 0.24, C.ink, 0, 0, 0);
  box(seg3, 0.3, 0.8, 0.3, C.mustard, 0, 0, 0);
  const bit = box(seg3, 0.08, 0.5, 0.08, C.red, 0, 0.8, 0);
  // the screw
  box(s.root, 1.4, 0.4, 1.4, C.wood, 2.4, 0.2, 0);
  const screw = cyl(s.root, 0.08, 0.08, 0.35, C.grey, 2.4, 0.6, 0, 8);
  const bar = box(s.root, 0.3, 0.1, 0.3, C.sky, 4.6, 0, 0);
  tag(s, '大模型：大方向', new V3(-1.5, 5.6, 0), { size: 0.34 });
  const lab = tag(s, '小网络：最后一毫米', new V3(2.4, 2.4, 0), { size: 0.34, sub: '试 0 次' });
  tag(s, '真实数据', new V3(4.6, 0.8, 0), { size: 0.3 });
  let shown = -1;
  s.update = (t, p) => {
    const k = smooth(0.1, 0.9, p);
    const wob = (1 - k) * Math.sin(t * 5) * 0.18;
    seg1.rotation.z = -0.55 + wob * 0.4; seg2.rotation.z = -0.5 - wob; seg3.rotation.z = -0.35 + wob * 1.6;
    screw.position.y = 0.6 + 0.3 * (1 - k) * Math.abs(Math.sin(t * 2)) ;
    bar.scale.set(1, 1, 1); bar.geometry.dispose(); bar.geometry = new THREE.BoxGeometry(0.3, 0.1 + k * 3.6, 0.3); bar.position.y = (0.1 + k * 3.6) / 2;
    const n = Math.round(k * 40);
    if (n !== shown) { shown = n; lab.set('小网络：最后一毫米', `试 ${n} 次`); }
  };
}


/* ---- 11 · pull yourself out: threads between you and your people; the camera climbs to n+1 */
{
  const s = mk(9, { pos: [0, 3.2, 10], look: [0, 1.2, 0] });
  const ppl = [['你', C.rose, 0, 0.4], ['同事甲', C.navy, -2.9, -1.6], ['上级', C.brick, 3.0, -1.4], ['同事乙', C.sky, 3.2, 2.0], ['家人', C.sage, -3.0, 2.2], ['客户', C.mustard, 0.2, -3.2]];
  const P = ppl.map(([n, c, x, z]) => { const f = person(s.root, c, x, z, n === '你' ? 1.4 : 1.15); f.rotation.y = Math.atan2(-x, -z); tag(s, n, new V3(x, 2.2, z), { size: 0.36 }); return new V3(x, 0.9, z); });
  const seg = []; [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [2, 3], [1, 5], [3, 4]].forEach(([a, b]) => seg.push(...P[a].toArray(), ...P[b].toArray()));
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  s.root.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: C.brick })));
  // the n+1 layer: a sheet of tracing paper above, with a small you looking down
  const layer = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.03, 7.2), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 1 }));
  layer.position.y = 4.4; s.root.add(layer);
  const ghost = person(s.root, C.rose, 2.6, 2.4, 0.8); ghost.position.y = 4.42;
  const lt = tag(s, 'n+1 层', new V3(3.5, 5.4, 2.4), { size: 0.38, sub: '能看见整个局面的那一层' });
  const q = tag(s, '谁授权？谁受益？谁受损？', new V3(0, 3.0, 0.4), { size: 0.34, color: '#9a3b2a' });
  s.cam = (p, t) => {
    const k = smooth(0.1, 0.85, p), a = 0.4 + k * 1.1 + t * 0.02;
    return { pos: new V3(Math.sin(a) * mix(9.5, 3.5, k), mix(3.0, 12.5, k), Math.cos(a) * mix(9.5, 3.5, k)), look: new V3(0, mix(1.2, 0.2, k), 0) };
  };
  s.update = (t, p) => {
    const k = smooth(0.3, 0.8, p);
    layer.material.opacity = 0.08 + k * 0.32; ghost.visible = k > 0.05; ghost.scale.setScalar(0.8 * Math.max(0.01, k));
    lt.material.opacity = k * s.pop.scale.y; q.material.opacity = (1 - k * 0.6) * s.pop.scale.y;
  };
  s.fade = [lt, q];
}

/* ---- 14 · a mixing desk: five faders come up one by one */
{
  const s = mk(10, { pos: [0, 7, 9], look: [0, 0.4, 0] });
  box(s.root, 8.6, 0.5, 3.4, C.navy, 0, 0, 0);
  box(s.root, 8.2, 0.05, 3.0, C.ink, 0, 0.5, 0);
  const names = ['对白', '环境音', '特殊音效', '拟声', '音乐'], cols = [C.rose, C.sage, C.sky, C.mustard, C.red];
  const caps = names.map((n, i) => {
    const x = -3.2 + i * 1.6;
    box(s.root, 0.12, 0.04, 2.2, C.grey, x, 0.55, 0);
    const cap = box(s.root, 0.55, 0.3, 0.4, cols[i], x, 0.55, 0.9);
    tag(s, n, new V3(x, 1.5, 0.2), { size: 0.3 });
    return cap;
  });
  const lights = names.map((n, i) => ball(s.root, 0.12, cols[i], -3.2 + i * 1.6, 0.7, -1.3, { emissive: cols[i], emissiveIntensity: 0.1 }));
  s.update = (t, p) => {
    caps.forEach((c, i) => {
      const k = smooth(0.1 + i * 0.13, 0.28 + i * 0.13, p);
      const wob = Math.sin(t * (2 + i * 0.7) + i) * 0.35 * k;
      c.position.z = mix(0.9, -0.5, k) + wob * 0.5;
      lights[i].material.emissiveIntensity = 0.1 + k * (0.6 + 0.4 * Math.sin(t * 6 + i));
    });
  };
}


/* ---- 15 · timeline: paper cards stand up along a line */
{
  const s = mk(13, { pos: [0, 5.5, 13], look: [0, 1.4, 0] });
  box(s.root, 12, 0.1, 0.3, C.brick, 0, 0, 0.6);
  const ev = [['1936', '图灵'], ['1945', '冯·诺依曼'], ['1948', '香农 · 维纳'], ['1962', '恩格尔巴特'], ['1970', '施乐 PARC'], ['1985', 'SICP'], ['2012', 'AlexNet'], ['2017', 'Transformer']];
  const cards = ev.map(([y, n], i) => {
    const x = -5.1 + i * 1.46, g = new THREE.Group(); g.position.set(x, 0.05, 0.6); s.root.add(g);
    box(g, 1.2, 1.5 + (i % 2) * 0.6, 0.08, [C.cream, C.paper][i % 2], 0, 0, 0);
    tag(s, y, new V3(0, 2.1 + (i % 2) * 0.6, 0.2), { size: 0.3, parent: g, font: SANS });
    tag(s, n, new V3(0, 1.0, 0.2), { size: 0.24, parent: g, bg: null });
    return g;
  });
  s.update = (t, p) => {
    cards.forEach((g, i) => {
      const k = back(clamp(smooth(0.08, 0.85, p) * (ev.length + 1) - i, 0, 1));
      g.rotation.x = (1 - k) * -1.45; g.visible = k > 0.01;
    });
  };
}


/* -------------------------------------------------------------- layout */
let W = 1, Hh = 1;
function resize() {
  W = innerWidth; Hh = innerHeight;
  renderer.setSize(W, Hh, false);
  camera.aspect = W / Hh;
  // wide screens: the book sits right of the text column. Phones: lift it into the upper half.
  if (W > 760) camera.setViewOffset(W, Hh, -W * 0.19, 0, W, Hh);
  else camera.setViewOffset(W, Hh, 0, Hh * 0.2, W, Hh);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

/* ------------------------------------------------------------- scroll */
function measure() {
  const vh = innerHeight; let sum = 0;
  sections.forEach((el, i) => {
    const r = el.getBoundingClientRect(), s = S[i];
    if (!s) return;
    const ov = Math.min(r.bottom, vh) - Math.max(r.top, 0);
    s.wt = smooth(0, 1, clamp(ov / vh, 0, 1)); sum += s.wt;
    s.pt = clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
  });
  if (sum > 0) S.forEach(s => (s.wt /= sum));
  const docH = document.documentElement.scrollHeight - vh;
  $('#bar').style.transform = `scaleX(${docH > 0 ? scrollY / docH : 0})`;
}

/* ------------------------------------------------------------- loop */
const clock = new THREE.Clock();
const camPos = new V3(0, 9, 14), camLook = new V3(0, 1, 0), tp = new V3(), tl = new V3();
let first = true, active = -1;
const hfov = () => 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime * (REDUCED ? 0.35 : 1);
  measure();
  const k = first ? 1 : 1 - Math.exp(-dt * 4.5);
  tp.set(0, 0, 0); tl.set(0, 0, 0); let wsum = 0, best = 0;
  const effW = W > 760 ? 0.6 : 1;
  S.forEach((s, i) => {
    s.w += (s.wt - s.w) * k; s.p += (s.pt - s.p) * k;
    // pop-up: one model folds flat into the page, then the next one springs up
    const up = back(smooth(0.5, 0.95, s.w));
    if (up < 0.01) { s.pop.visible = false; } else {
      s.pop.visible = true;
      s.pop.scale.set(1, up, 1);
      s.pop.rotation.x = (1 - Math.min(1, up)) * -0.25;
      s.tags.forEach((l) => { if (!s.fade || !s.fade.includes(l)) l.material.opacity = smooth(0.6, 1, up); });
      s.update(t, s.p, dt);
    }
    const c = s.cam(s.p, t);
    const d = c.pos.distanceTo(c.look), vis = 2 * d * Math.tan(hfov() * effW / 2);
    const f = Math.max(1, (s.width * 1.05) / vis);
    c.pos.sub(c.look).multiplyScalar(f).add(c.look);
    tp.addScaledVector(c.pos, s.w); tl.addScaledVector(c.look, s.w); wsum += s.w;
    if (s.w > best) { best = s.w; if (active !== i) { active = i; onChapter(i); } }
  });
  if (wsum > 0) { tp.divideScalar(wsum); tl.divideScalar(wsum); }
  const ck = first ? 1 : 1 - Math.exp(-dt * 2.6);
  camPos.lerp(tp, ck); camLook.lerp(tl, ck);
  camera.position.copy(camPos); camera.lookAt(camLook);
  updateHud();
  renderer.render(scene, camera);
  if (first) { first = false; requestAnimationFrame(() => document.body.classList.add('ready')); }
  requestAnimationFrame(frame);
}
setTimeout(() => requestAnimationFrame(frame), REDUCED ? 0 : 1600);


/* ------------------------------------------------------------- chrome */
function setupChrome() {
  const nav = $('#nav');
  sections.forEach((el) => {
    const a = document.createElement('a'); a.href = '#'; a.innerHTML = `<span>${el.dataset.title}</span><i></i>`;
    a.addEventListener('click', (e) => { e.preventDefault(); el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' }); });
    nav.appendChild(a);
    // phones hide the floating caption, so print it under the chapter head instead
    const plate = el.querySelector('.plate');
    if (plate && el.dataset.caption) { const p = document.createElement('p'); p.className = 'figcap'; p.innerHTML = el.dataset.caption; plate.appendChild(p); }
  });
  const io = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px' });
  document.querySelectorAll('.card').forEach(c => io.observe(c));
}
function onChapter(i) {
  const el = sections[i];
  document.querySelectorAll('#nav a').forEach((a, j) => a.classList.toggle('on', j === i));
  $('#caption').innerHTML = el.dataset.caption || '';
  $('#where').textContent = i ? `第 ${i} 章 · ${el.dataset.title}` : el.dataset.title;
}
const hud = $('#hud'), ha = $('#hud-a'), hb = $('#hud-b'), hc = $('#hud-c');
let hudKey = '';
function updateHud() {
  const el = sections[active], kind = el && el.dataset.hud, s = S[active];
  let key = '', show = false;
  if (kind === 'agents' && s.w > 0.5) {
    show = true; key = `a${agentHud.n}`;
    if (key !== hudKey) { ha.textContent = '同时在跑的 agent'; hb.textContent = agentHud.n.toLocaleString('en-US'); hc.textContent = agentHud.n >= 10000 ? 'OpenAI 自述 · 未独立验证' : '按 OpenAI 的说法'; }
  }
  hudKey = key; hud.classList.toggle('on', show);
}
