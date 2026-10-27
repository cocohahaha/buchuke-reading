import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ------------------------------------------------------------------ setup */
const $ = (s) => document.querySelector(s);
const MOBILE = matchMedia('(max-width: 760px)').matches || matchMedia('(pointer: coarse)').matches;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const Q = MOBILE ? 0.55 : 1;
const SERIF = '"Songti SC","STSong","Noto Serif SC","Source Han Serif SC",serif';
const SANS = '"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",sans-serif';
const V3 = THREE.Vector3;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

let seed = 20260928;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };

const sections = [...document.querySelectorAll('section.chapter')];
setupChrome();

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: false, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('no gl');
} catch (e) {
  document.body.classList.add('nogl', 'ready');
  throw e;
}
const DPR = Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 1.75);
renderer.setPixelRatio(DPR);
renderer.setClearColor(0x000000, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
const GU = { uTime: { value: 0 }, uScale: { value: 400 } };

/* --------------------------------------------------------------- shaders */
const PHEAD = /* glsl */`
uniform float uTime; uniform float uScale; uniform float uP; uniform float uFade;
varying vec3 vColor; varying float vAlpha;
float hash(float n){ return fract(sin(n) * 43758.5453123); }
vec3 pal(float i){
  if (i < 0.5) return vec3(1.0, 0.55, 0.38);
  if (i < 1.5) return vec3(0.50, 0.70, 0.95);
  if (i < 2.5) return vec3(0.62, 0.82, 0.48);
  if (i < 3.5) return vec3(0.95, 0.78, 0.45);
  return vec3(0.92, 0.55, 0.75);
}
`;
const PTAIL = /* glsl */`
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(size * uScale / -mv.z, 1.0, 64.0);
`;
const PFRAG = /* glsl */`
uniform float uFade; varying vec3 vColor; varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a + smoothstep(0.14, 0.0, d) * 0.55;
  gl_FragColor = vec4(vColor, a * vAlpha * uFade);
}`;

function pointsMat(body, uniforms = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: GU.uTime, uScale: GU.uScale, uP: { value: 0 }, uFade: { value: 0 }, ...uniforms },
    vertexShader: PHEAD + body,
    fragmentShader: PFRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}
function geo(attrs) {
  const g = new THREE.BufferGeometry();
  for (const [k, [arr, n]] of Object.entries(attrs)) g.setAttribute(k, new THREE.BufferAttribute(arr, n));
  return g;
}
function points(s, attrs, body, uniforms) {
  const m = pointsMat(body, uniforms);
  const p = new THREE.Points(geo(attrs), m);
  p.frustumCulled = false;
  s.group.add(p); s.mats.push(m);
  return p;
}

/* labels: canvas text sprites */
function label(s, text, pos, { size = 0.5, color = '#F0EEE6', sub = null, subColor = 'rgba(236,232,222,.62)', align = 'center', alpha = 1 } = {}) {
  const fs = 64, sfs = 40, pad = 24;
  const c = document.createElement('canvas'), x = c.getContext('2d');
  x.font = `700 ${fs}px ${SERIF}`; const w1 = x.measureText(text).width;
  let w2 = 0; if (sub) { x.font = `400 ${sfs}px ${SANS}`; w2 = x.measureText(sub).width; }
  c.width = Math.ceil(Math.max(w1, w2) + pad * 2);
  c.height = Math.ceil(fs * 1.35 + (sub ? sfs * 1.5 : 0) + pad);
  x.textBaseline = 'top'; x.textAlign = align;
  const tx = align === 'left' ? pad : align === 'right' ? c.width - pad : c.width / 2;
  x.shadowColor = 'rgba(0,0,0,.9)'; x.shadowBlur = 14;
  x.font = `700 ${fs}px ${SERIF}`; x.fillStyle = color; x.fillText(text, tx, pad * 0.6);
  if (sub) { x.font = `400 ${sfs}px ${SANS}`; x.fillStyle = subColor; x.fillText(sub, tx, pad * 0.6 + fs * 1.35); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 });
  const sp = new THREE.Sprite(m);
  const h = size * (MOBILE ? 1.55 : 1) * c.height / fs; sp.scale.set(h * c.width / c.height, h, 1);
  if (align === 'left') sp.center.set(0, 0.5); else if (align === 'right') sp.center.set(1, 0.5);
  sp.position.copy(pos); sp.renderOrder = 10; sp.userData.a = alpha;
  s.group.add(sp); s.labels.push(sp);
  return sp;
}
function lines(s, positions, color, opacity = 0.4, extra = {}) {
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const l = new THREE.LineSegments(geo({ position: [new Float32Array(positions), 3] }), m);
  l.userData.a = opacity; Object.assign(l.userData, extra);
  s.group.add(l); s.basics.push(l);
  return l;
}

/* ---------------------------------------------------------------- scenes */
const S = [];
function mk(width = 14) {
  const s = { group: new THREE.Group(), mats: [], labels: [], basics: [], width, w: 0, wt: 0, p: 0, pt: 0,
    update() {}, cam: () => ({ pos: new V3(0, 0, 18), look: new V3() }) };
  s.group.visible = false; scene.add(s.group); S.push(s);
  return s;
}
const ORANGE = new THREE.Color('#F08A60'), IVORY = new THREE.Color('#F0EEE6'), BLUE = new THREE.Color('#7FB0E0'), GREEN = new THREE.Color('#9BBF77');

/* ---- background dust, always on */
{
  const n = Math.floor(2200 * Q), pos = new Float32Array(n * 3), sd = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = 30 + rnd() * 50, th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
    pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.6, r * Math.sin(ph) * Math.sin(th)], i * 3); sd[i] = rnd();
  }
  const m = pointsMat(`attribute float aS; void main(){ vec3 pos = position; float size = 0.12 + aS*0.18;
    vColor = mix(vec3(0.55,0.65,0.85), vec3(1.0,0.8,0.65), step(0.8, aS));
    vAlpha = 0.35 + 0.35*sin(uTime*(0.6+aS) + aS*80.0); ${PTAIL} }`);
  m.uniforms.uFade.value = 1;
  const dust = new THREE.Points(geo({ position: [pos, 3], aS: [sd, 1] }), m);
  dust.frustumCulled = false; scene.add(dust);
  S.dust = dust;
}

/* ---- 0 · prologue: chaos condenses into a ring */
{
  const s = mk(18), n = Math.floor(9000 * Q);
  const pos = new Float32Array(n * 3), ring = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const r0 = 9 + rnd() * 16, th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
    pos.set([r0 * Math.sin(ph) * Math.cos(th), r0 * Math.cos(ph) * 0.7, r0 * Math.sin(ph) * Math.sin(th)], i * 3);
    const spread = rnd() < 0.18 ? 3.2 : 1;
    const r = 5.4 + Math.abs(gauss()) * 0.9 * spread;
    const a = rnd() * Math.PI * 2 + (r - 5.4) * 0.55;
    ring.set([r, a, gauss() * 0.16 * (1 + (r - 5.4) * 0.8), rnd()], i * 4);
  }
  const uForm = { value: 0 };
  points(s, { position: [pos, 3], aRing: [ring, 4] }, `
    attribute vec4 aRing; uniform float uForm;
    void main(){
      float r = aRing.x;
      float ang = aRing.y + uTime * 0.35 / r;
      vec3 rp = vec3(cos(ang)*r, aRing.z, sin(ang)*r);
      float k = smoothstep(0.0, 1.0, clamp(uForm*1.35 - aRing.w*0.35, 0.0, 1.0));
      vec3 ch = position + vec3(sin(uTime*0.21 + aRing.w*20.0), cos(uTime*0.17 + aRing.w*13.0), sin(uTime*0.13 + aRing.w*7.0)) * 0.7;
      vec3 pos = mix(ch, rp, k);
      float size = mix(0.05, 0.11, hash(aRing.w*100.0));
      vColor = mix(vec3(1.0,0.55,0.36), vec3(0.5,0.7,0.95), smoothstep(0.35, 0.95, aRing.w));
      vColor = mix(vColor, vec3(1.0,0.96,0.9), step(0.975, aRing.w));
      vAlpha = (0.55 + 0.45*sin(uTime*2.0 + aRing.w*60.0)) * mix(0.5, 1.0, k);
      ${PTAIL}
    }`, { uForm });
  // core
  const cn = Math.floor(700 * Q), cp = new Float32Array(cn * 3), cs = new Float32Array(cn);
  for (let i = 0; i < cn; i++) { cp.set([gauss() * 0.5, gauss() * 0.5, gauss() * 0.5], i * 3); cs[i] = rnd(); }
  points(s, { position: [cp, 3], aS: [cs, 1] }, `attribute float aS; uniform float uForm;
    void main(){ vec3 pos = position * (1.0 + 0.15*sin(uTime*1.3 + aS*6.0)); float size = 0.09;
      vColor = mix(vec3(1.0,0.7,0.5), vec3(1.0), aS); vAlpha = 0.7 * uForm; ${PTAIL} }`, { uForm });
  s.t0 = null;
  s.update = (t, p) => {
    if (s.t0 === null) s.t0 = t;
    uForm.value = REDUCED ? 1 : smooth(0, 1, (t - s.t0) / 4.2);
    s.group.rotation.x = 0.42 + p * 0.7;
    s.group.rotation.z = -0.12;
  };
  s.cam = (p) => ({ pos: new V3(0, 1.5 + p * 3, 17 - p * 4), look: new V3(0, 0, 0) });
}

/* ---- 1 · information: signal emerges from noise */
{
  const s = mk(26), cols = Math.floor(230 * Q), rows = 22, n = cols * rows;
  const pos = new Float32Array(n * 3), d = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    d.set([(c / (cols - 1)) * 2 - 1, rnd(), rnd(), r / (rows - 1)], i * 4);
  }
  points(s, { position: [pos, 3], aD: [d, 4] }, `
    attribute vec4 aD;
    void main(){
      float x = aD.x * 13.0;
      float sig = sin(aD.x*7.0 - uTime*1.3)*1.5 + sin(aD.x*2.3 + uTime*0.45)*0.45;
      float sd = aD.z * 91.7;
      vec3 noise = vec3(x + sin(uTime*1.3 + sd)*0.35,
                        sin(uTime*(0.9 + aD.z) + sd) * 3.4 * cos(sd*1.7 + uTime*0.6),
                        cos(uTime*(0.8 + aD.z*0.7) + sd*2.3) * 3.0);
      float c = smoothstep(0.06, 0.82, uP);
      float lock = smoothstep(aD.y, aD.y + 0.12, c * 1.12);
      vec3 sp = vec3(x, sig + (aD.w - 0.5)*0.16, (aD.w - 0.5)*0.22);
      vec3 pos = mix(noise, sp, lock);
      float size = mix(0.075, 0.095, lock);
      vColor = mix(vec3(0.42,0.46,0.56), vec3(1.0,0.56,0.36), lock);
      vColor = mix(vColor, vec3(1.0,0.9,0.8), lock * step(0.5, abs(aD.w-0.5)*2.0) * 0.0);
      vAlpha = mix(0.3, 0.9, lock);
      ${PTAIL}
    }`);
  const lNoise = label(s, '不确定', new V3(-8, 4.2, 0), { size: 0.55, color: '#9aa3b5', sub: '熵高：什么都可能' });
  const lSig = label(s, '信号', new V3(8.5, 3.3, 0), { size: 0.6, color: '#F08A60', sub: '每 1 bit，可能性砍掉一半' });
  s.update = (t, p) => { lNoise.userData.a = 1 - smooth(0.25, 0.55, p); lSig.userData.a = smooth(0.55, 0.85, p); };
  s.cam = (p) => ({ pos: new V3(mix(-3, 3, p), mix(1.6, 0.6, p), mix(19, 14, p)), look: new V3(mix(-1, 1, p), 0, 0) });
}

/* ---- 2 · tokens: text made of particles splits into chunks */
{
  const s = mk(17);
  const W = 1400, H = 520, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.textBaseline = 'middle';
  const en = 'unbelievable', zh = '难以置信';
  x.font = `700 170px ${SANS}`; const enW = x.measureText(en).width; const enX = (W - enW) / 2;
  const cut1 = enX + x.measureText('un').width, cut2 = enX + x.measureText('unbeliev').width;
  x.fillText(en, enX, 140);
  x.font = `900 190px ${SERIF}`; const zhW = x.measureText(zh).width; const zhX = (W - zhW) / 2;
  const zcuts = []; { let acc = zhX; for (const ch of zh) { const w = x.measureText(ch).width; zcuts.push([acc, acc + w]); acc += w; } }
  x.fillText(zh, zhX, 380);
  const img = x.getImageData(0, 0, W, H).data, step = MOBILE ? 4 : 3, sc = 17 / W;
  const P = [], chunkOf = [];
  const chunkId = (px, py) => {
    if (py < 260) return px < cut1 ? 0 : px < cut2 ? 1 : 2;
    for (let k = 0; k < 4; k++) {
      const [a, b] = zcuts[k];
      if (px < b || k === 3) return k === 2 ? (px < (a + b) / 2 ? 5 : 6) : 3 + (k > 2 ? k + 1 : k);
    }
  };
  for (let py = 0; py < H; py += step) for (let px = 0; px < W; px += step) {
    if (img[(py * W + px) * 4 + 3] > 128) { P.push([(px - W / 2) * sc, -(py - H / 2) * sc, (rnd() - 0.5) * 0.25]); chunkOf.push(chunkId(px + (rnd() - .5) * step, py)); }
  }
  // chunk centres + directions
  const NC = 8, cen = Array.from({ length: NC }, () => [0, 0, 0, 0]);
  P.forEach((p, i) => { const c = cen[chunkOf[i]]; c[0] += p[0]; c[1] += p[1]; c[3]++; });
  cen.forEach(c => { if (c[3]) { c[0] /= c[3]; c[1] /= c[3]; } });
  const dirs = cen.map(() => [(rnd() - 0.5) * 2, (rnd() - 0.5) * 1.2, (rnd() - 0.2) * 2]);
  const colorIdx = [0, 1, 2, 0, 1, 2, 3, 4];
  const n = P.length, pos = new Float32Array(n * 3), aC = new Float32Array(n * 3), aK = new Float32Array(n * 4), aS = new Float32Array(n);
  P.forEach((p, i) => {
    const k = chunkOf[i]; pos.set(p, i * 3); aC.set([cen[k][0], cen[k][1], 0], i * 3);
    aK.set([...dirs[k], colorIdx[k]], i * 4); aS[i] = rnd();
  });
  points(s, { position: [pos, 3], aC: [aC, 3], aK: [aK, 4], aS: [aS, 1] }, `
    attribute vec3 aC; attribute vec4 aK; attribute float aS;
    void main(){
      float sp = smoothstep(0.1, 0.4, uP) * (1.0 - 0.72*smoothstep(0.62, 0.92, uP));
      vec3 rel = position - aC;
      float ang = aK.x * 0.5 * sp;
      rel.xy = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * rel.xy;
      vec3 off = vec3(aC.x * 0.28, 0.0, 0.0) * sp + aK.xyz * vec3(0.5, 0.9, 2.2) * sp;
      float jit = (1.0 - smoothstep(0.0, 0.12, uP));
      vec3 pos = aC + rel + off + vec3(sin(uTime*1.7 + aS*40.0), cos(uTime*1.3 + aS*30.0), 0.0) * (0.04 + 0.06*sp + 0.5*jit*aS);
      float size = 0.085;
      float tint = smoothstep(0.08, 0.3, uP);
      vColor = mix(vec3(0.95,0.93,0.88), pal(aK.w), tint);
      vAlpha = 0.6 + 0.25*sin(uTime*3.0 + aS*50.0);
      ${PTAIL}
    }`);
  const l1 = label(s, '英文：3 块', new V3(0, 5.3, 0.5), { size: 0.5, color: '#F08A60', sub: 'un · believ · able' });
  const l2 = label(s, '中文：5 块', new V3(0, -4.7, 0.5), { size: 0.5, color: '#9BBF77', sub: '一个字也可能被劈成两块' });
  const l3 = label(s, '示意切分 · 不是真实词表', new V3(0, -6.6, 0), { size: 0.32, color: '#8d8a83' });
  s.update = (t, p) => { const a = smooth(0.2, 0.4, p); l1.userData.a = a; l2.userData.a = a; l3.userData.a = smooth(0.1, 0.3, p); };
  s.cam = (p) => ({ pos: new V3(mix(-1, 2, p), mix(0.6, -0.4, p), mix(15.5, 13, p)), look: new V3(mix(0, 1.2, p), 0, 0) });
}

/* ---- 3 · attention: beam sweeps back over the window, middle dims */
const ATTN = /* glsl */`
float attn(float u, float p){
  float uc = smoothstep(0.15, 0.65, p);
  float U = max(exp(-u*6.0), exp(-(1.0-u)*6.0));
  return mix(0.7, U, uc);
}`;
{
  const s = mk(25), N = 48;
  const tokPos = [];
  for (let i = 0; i < N; i++) { const u = i / (N - 1); tokPos.push(new V3(mix(-10.5, 7.5, u), 0, -Math.sin(u * Math.PI) * 4)); }
  const head = new V3(9.6, 1.4, 0.6);
  // boxes
  const box = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const ig = new THREE.InstancedBufferGeometry(); ig.index = box.index;
  ig.setAttribute('position', box.attributes.position); ig.setAttribute('normal', box.attributes.normal);
  const aI = new Float32Array(N), aP = new Float32Array(N * 3);
  tokPos.forEach((p, i) => { aI[i] = i / (N - 1); aP.set([p.x, p.y, p.z], i * 3); });
  ig.setAttribute('aI', new THREE.InstancedBufferAttribute(aI, 1)); ig.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 3));
  ig.instanceCount = N;
  const uBeam = { value: 0.5 };
  const bm = new THREE.ShaderMaterial({
    uniforms: { uTime: GU.uTime, uP: { value: 0 }, uFade: { value: 0 }, uBeam },
    vertexShader: `uniform float uTime, uP, uBeam; attribute float aI; attribute vec3 aP; varying vec3 vN; varying float vW; ${ATTN}
      void main(){ float w = attn(aI, uP); float b = exp(-pow((aI-uBeam)*14.0, 2.0));
        vW = w * (0.35 + 0.65*b);
        vec3 p = position * (0.7 + 0.55*vW) + aP + vec3(0.0, b*0.35*w, 0.0);
        vN = normalMatrix * normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform float uFade; varying vec3 vN; varying float vW;
      void main(){ float l = 0.35 + 0.65*max(dot(normalize(vN), normalize(vec3(0.3,0.8,0.5))), 0.0);
        vec3 col = mix(vec3(0.018,0.022,0.032), vec3(1.0,0.42,0.22)*1.3, pow(clamp(vW, 0.0, 1.0), 1.4));
        gl_FragColor = vec4(col*l, uFade); }`,
    transparent: true,
  });
  const boxes = new THREE.Mesh(ig, bm); boxes.frustumCulled = false; s.group.add(boxes); s.mats.push(bm);
  // head token
  const hm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 1.35), transparent: true, opacity: 0 });
  const hmesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), hm); hmesh.position.copy(head); s.group.add(hmesh);
  hmesh.userData.a = 1; s.basics.push(hmesh);
  // attention lines
  const lp = new Float32Array(N * 6), lu = new Float32Array(N * 2), le = new Float32Array(N * 2);
  tokPos.forEach((p, i) => { lp.set([head.x, head.y, head.z, p.x, p.y, p.z], i * 6); lu[i * 2] = lu[i * 2 + 1] = i / (N - 1); le[i * 2 + 1] = 1; });
  const lm = new THREE.ShaderMaterial({
    uniforms: { uP: { value: 0 }, uFade: { value: 0 }, uBeam },
    vertexShader: `uniform float uP, uBeam; attribute float aU; attribute float aE; varying float vA; varying float vE; ${ATTN}
      void main(){ float b = exp(-pow((aU-uBeam)*10.0, 2.0)); vA = attn(aU, uP) * (0.25 + 0.75*b); vE = aE;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uFade; varying float vA; varying float vE;
      void main(){ gl_FragColor = vec4(mix(vec3(1.0,0.95,0.85), vec3(1.0,0.55,0.35), vE), vA*0.55*uFade); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const al = new THREE.LineSegments(geo({ position: [lp, 3], aU: [lu, 1], aE: [le, 1] }), lm); al.frustumCulled = false;
  s.group.add(al); s.mats.push(lm);
  // beam cone
  const cg = new THREE.ConeGeometry(1, 1, 40, 1, true); cg.rotateX(-Math.PI / 2); cg.translate(0, 0, 0.5);
  const cm = new THREE.ShaderMaterial({
    uniforms: { uFade: { value: 0 } },
    vertexShader: `varying float vZ; void main(){ vZ = position.z; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uFade; varying float vZ; void main(){ gl_FragColor = vec4(1.0,0.72,0.5, smoothstep(0.0,1.0,vZ)*(1.0-vZ*0.6)*0.07*uFade); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const cone = new THREE.Mesh(cg, cm); cone.position.copy(head); s.group.add(cone); s.mats.push(cm);
  label(s, '开头', tokPos[0].clone().add(new V3(0, 1.3, 0)), { size: 0.45 });
  const lm2 = label(s, '中间', tokPos[24].clone().add(new V3(0, 1.4, 0)), { size: 0.45, color: '#9aa3b5', sub: '最容易被忽略' });
  label(s, '结尾', tokPos[44].clone().add(new V3(0, 1.3, 0)), { size: 0.45 });
  label(s, '正在生成的新 token', head.clone().add(new V3(0, 1.2, 0)), { size: 0.4, color: '#F08A60' });
  const tmp = new V3();
  s.update = (t, p) => {
    const b = REDUCED ? 0.5 : 0.97 - ((t * 0.1) % 1);
    uBeam.value = b;
    const u = clamp(b, 0, 1), idx = u * (N - 1), i0 = Math.floor(idx), i1 = Math.min(N - 1, i0 + 1);
    tmp.lerpVectors(tokPos[i0], tokPos[i1], idx - i0);
    cone.lookAt(tmp); const d = head.distanceTo(tmp); cone.scale.set(0.5, 0.5, d);
    lm2.userData.a = smooth(0.3, 0.6, p);
  };
  s.cam = (p) => ({ pos: new V3(mix(-2, 2.5, p), mix(10, 7.5, p), mix(15, 13, p)), look: new V3(mix(-0.5, 0.5, p), -0.5, -1.5) });
}

/* ---- 4 · sampling: a Galton board, n driven by scroll */
const galton = {};
{
  const s = mk(10.5), R = 12, sp = 0.62, rowH = 0.55, top = 5.2, base = -7.4, N = 400, bs = 0.17;
  const pegs = [];
  for (let r = 0; r < R; r++) for (let k = 0; k <= r; k++) pegs.push((k - r / 2) * sp, top - (r + 0.5) * rowH, 0);
  points(s, { position: [new Float32Array(pegs), 3] }, `void main(){ vec3 pos = position; float size = 0.13;
    vColor = vec3(0.55,0.68,0.9); vAlpha = 0.75; ${PTAIL} }`);
  // bin walls
  const walls = [];
  for (let b = 0; b <= R + 1; b++) { const x = (b - 0.5 - R / 2) * sp; walls.push(x, base - 0.1, 0, x, top - R * rowH - 0.4, 0); }
  walls.push((-0.5 - R / 2) * sp, base - 0.1, 0, (R + 0.5 - R / 2) * sp, base - 0.1, 0);
  lines(s, walls, 0x5a6578, 0.6);
  // balls
  const bits = [], bins = [], stack = [], cnt = new Array(R + 1).fill(0);
  for (let i = 0; i < N; i++) {
    const path = [0]; let k = 0; for (let r = 0; r < R; r++) { k += rnd() < 0.5 ? 1 : 0; path.push(k); }
    bits.push(path); bins.push(k); stack.push(cnt[k]++);
  }
  const bpos = new Float32Array(N * 3), bsd = new Float32Array(N); for (let i = 0; i < N; i++) bsd[i] = rnd();
  const balls = points(s, { position: [bpos, 3], aS: [bsd, 1] }, `attribute float aS; void main(){ vec3 pos = position; float size = 0.2;
    vColor = mix(vec3(1.0,0.55,0.36), vec3(1.0,0.78,0.55), aS); vAlpha = 0.95; ${PTAIL} }`);
  balls.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  // theory curve
  const CN = 90, cpos = new Float32Array(CN * 2 * 3);
  const curve = lines(s, cpos, 0xF0EEE6, 0.55); curve.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const lt = label(s, '曲线：理论上的钟形', new V3(0, -8.2, 0), { size: 0.36, color: '#cfcac0' });
  let released = 0, acc = 0, lastN = -1; const birth = new Float32Array(N);
  const rowDur = 0.085;
  s.update = (t, p, dt) => {
    const target = Math.max(1, Math.round(clamp((p - 0.03) / 0.85, 0, 1) * N));
    if (released < target) {
      acc += dt * (25 + (target - released) * 3);
      while (acc >= 1 && released < target) { birth[released] = t; released++; acc -= 1; }
    } else if (released > target) { released = target; acc = 0; }
    galton.n = released;
    const arr = balls.geometry.attributes.position.array;
    for (let i = 0; i < released; i++) {
      const f = REDUCED ? 99 : (t - birth[i]) / rowDur; const path = bits[i];
      let x, y;
      if (f < R) {
        const r = Math.floor(f), fr = f - r, e = fr * fr * (3 - 2 * fr);
        const x0 = (path[r] - r / 2) * sp, x1 = (path[r + 1] - (r + 1) / 2) * sp;
        x = mix(x0, x1, e); y = top - (r + fr) * rowH + Math.sin(fr * Math.PI) * 0.14;
      } else {
        const g = (f - R) * rowDur, st = stack[i], col = st % 3, lev = Math.floor(st / 3);
        const bx = (bins[i] - R / 2) * sp + (col - 1) * bs, fy = base + 0.09 + lev * bs, sy = top - R * rowH;
        y = Math.max(fy, sy - g * g * 26 - g * 2); x = mix((bins[i] - R / 2) * sp, bx, clamp(g * 6, 0, 1));
      }
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = 0;
    }
    balls.geometry.setDrawRange(0, released);
    balls.geometry.attributes.position.needsUpdate = true;
    if (released !== lastN) {
      lastN = released;
      const sd = Math.sqrt(R / 4), mu = R / 2, ca = curve.geometry.attributes.position.array;
      let prev = null, j = 0;
      for (let i = 0; i < CN; i++) {
        const bx = mix(-0.6, R + 0.6, i / (CN - 1));
        const pdf = Math.exp(-((bx - mu) ** 2) / (2 * sd * sd)) / (sd * Math.sqrt(2 * Math.PI));
        const pt = [(bx - R / 2) * sp, base + (released * pdf / 3) * bs + 0.1, 0.05];
        if (prev) { ca.set(prev, j); ca.set(pt, j + 3); j += 6; }
        prev = pt;
      }
      curve.geometry.attributes.position.needsUpdate = true;
    }
    lt.userData.a = smooth(80, 160, released);
  };
  s.cam = (p) => ({ pos: new V3(0, mix(-0.4, -1.4, p), 17), look: new V3(0, mix(-0.9, -1.8, p), 0) });
}

/* ---- 5 · the state moves house three times */
{
  const s = mk(13), ys = [5.4, 1.8, -1.8, -5.4], R = 3.6;
  // platforms
  const pp = [], pd = [];
  ys.forEach((y, k) => {
    const nr = Math.floor(420 * Q), nd = Math.floor(520 * Q);
    for (let i = 0; i < nr; i++) { const a = (i / nr) * Math.PI * 2; pp.push(Math.cos(a) * R, y, Math.sin(a) * R); pd.push(k, 0, a, rnd()); }
    for (let i = 0; i < nd; i++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R; pp.push(Math.cos(a) * r, y, Math.sin(a) * r); pd.push(k, 1, a, rnd()); }
  });
  const uStage = { value: 0 };
  points(s, { position: [new Float32Array(pp), 3], aD: [new Float32Array(pd), 4] }, `
    attribute vec4 aD; uniform float uStage;
    void main(){
      vec3 pos = position; float k = aD.x;
      float act = exp(-pow((uStage - k)*1.5, 2.0));
      float size = aD.y < 0.5 ? 0.11 : 0.07;
      vColor = pal(k < 0.5 ? 3.0 : k < 1.5 ? 1.0 : k < 2.5 ? 0.0 : 2.0);
      vAlpha = (aD.y < 0.5 ? 0.6 : 0.12) * (0.3 + 0.7*act);
      if (k > 2.5) { vAlpha *= step(0.45, fract(aD.z*14.0/6.2831)) * (0.55 + 0.45*sin(uTime*2.6)); }
      pos.y += sin(uTime*0.8 + aD.w*30.0) * 0.03;
      ${PTAIL}
    }`, { uStage });
  // CoT: written dots on platform 0
  { const W = [], D = []; const rowsN = 4, colsN = 22;
    for (let r = 0; r < rowsN; r++) for (let c = 0; c < colsN; c++) { W.push(-2.6 + c * 0.25, ys[0] + 0.05, -1.1 + r * 0.55); D.push((r * colsN + c) / (rowsN * colsN), r === 1 && c === 7 ? 1 : 0); }
    points(s, { position: [new Float32Array(W), 3], aW: [new Float32Array(D), 2] }, `attribute vec2 aW; uniform float uStage;
      void main(){ vec3 pos = position; float wr = fract(uTime*0.09);
        float shown = step(aW.x, wr*1.25);
        float size = 0.13;
        vColor = aW.y > 0.5 ? vec3(1.0,0.45,0.3) : vec3(0.98,0.92,0.82);
        vAlpha = shown * (0.35 + 0.65*exp(-pow((uStage-0.0)*1.5,2.0))) * (aW.y > 0.5 ? 1.0 : 0.8);
        ${PTAIL} }`, { uStage }); }
  // ReAct: world cubes + pulses on platform 1
  { const W = [], D = []; const NW = 6;
    for (let w = 0; w < NW; w++) { const a = (w / NW) * Math.PI * 2 + 0.3; const cx = Math.cos(a) * 5.3, cz = Math.sin(a) * 5.3;
      for (let i = 0; i < 70 * Q; i++) { W.push(cx + (rnd() - 0.5) * 0.7, ys[1] + 0.35 + (rnd() - 0.5) * 0.7, cz + (rnd() - 0.5) * 0.7); D.push(a, 0, rnd(), 0); }
      for (let i = 0; i < 26; i++) { W.push(0, ys[1], 0); D.push(a, 1, i / 26, w / NW); } }
    points(s, { position: [new Float32Array(W), 3], aD: [new Float32Array(D), 4] }, `attribute vec4 aD; uniform float uStage;
      void main(){ vec3 pos = position; float act = exp(-pow((uStage-1.0)*1.5,2.0)); float size = 0.09;
        vColor = vec3(0.5,0.72,0.98); vAlpha = 0.5*(0.3+0.7*act);
        if (aD.y > 0.5) { float ph = fract(uTime*0.35 + aD.w); float tri = 1.0 - abs(ph*2.0-1.0);
          float d = clamp(tri*1.05 - aD.z*0.12, 0.0, 1.0);
          pos = vec3(cos(aD.x), 0.0, sin(aD.x)) * 5.3 * d + vec3(0.0, 1.8 + 0.35*d, 0.0);
          vColor = ph < 0.5 ? vec3(1.0,0.75,0.5) : vec3(0.6,0.95,0.6); vAlpha = act * (1.0 - aD.z) * 0.9; size = 0.12; }
        ${PTAIL} }`, { uStage }); }
  // Recurrent depth: rings spinning inside platform 2
  { const W = [], D = []; const loops = 6, per = Math.floor(160 * Q);
    for (let l = 0; l < loops; l++) for (let i = 0; i < per; i++) { W.push(0, ys[2], 0); D.push(l, i / per, rnd(), 0); }
    points(s, { position: [new Float32Array(W), 3], aD: [new Float32Array(D), 4] }, `attribute vec4 aD; uniform float uStage;
      void main(){ float act = exp(-pow((uStage-2.0)*1.5,2.0));
        float a = aD.y*6.2831 + uTime*(0.9 + aD.x*0.12);
        float rot = aD.x * 3.14159 / 6.0 + uTime*0.15;
        vec3 c = vec3(cos(a)*1.5, sin(a)*1.5, 0.0);
        vec3 pos = vec3(c.x*cos(rot), c.y, c.x*sin(rot)) + vec3(0.0, -1.8 + 1.7, 0.0);
        float size = 0.09; vColor = mix(vec3(1.0,0.55,0.36), vec3(1.0,0.85,0.7), aD.z);
        vAlpha = (0.15 + 0.85*act) * (0.4 + 0.6*fract(aD.y - uTime*0.15));
        ${PTAIL} }`, { uStage }); }
  // the orb (state)
  const on = Math.floor(500 * Q), op = new Float32Array(on * 3), os = new Float32Array(on);
  for (let i = 0; i < on; i++) { op.set([gauss() * 0.28, gauss() * 0.28, gauss() * 0.28], i * 3); os[i] = rnd(); }
  const uOrb = { value: new V3() }, uGhost = { value: 0 };
  points(s, { position: [op, 3], aS: [os, 1] }, `attribute float aS; uniform vec3 uOrb; uniform float uGhost;
    void main(){ vec3 pos = uOrb + position*(1.0 + 0.25*sin(uTime*3.0 + aS*9.0)); float size = 0.12 + aS*0.08;
      vColor = mix(vec3(1.0,0.95,0.85), vec3(1.0,0.6,0.4), aS); vAlpha = mix(1.0, 0.45 + 0.4*sin(uTime*4.0), uGhost); ${PTAIL} }`, { uOrb, uGhost });
  const txt = [['① 纸面上', 'CoT · 写下就改不了'], ['② 纸面 ＋ 外部世界', 'ReAct · 想一步，做一步'], ['③ 模型体内', '深度循环 · 第一次有了回头路'], ['④ 一台一直开着的机器？', '还没发生 · 一个赌注']];
  const cols = ['#F0EEE6', '#7FB0E0', '#F08A60', '#9BBF77'];
  const labs = ys.map((y, k) => label(s, txt[k][0], new V3(-R - 0.5, y + 0.7, 0), { size: 0.42, color: cols[k], sub: txt[k][1], align: 'right' }));
  s.orbY = ys[0];
  s.update = (t, p) => {
    const st = clamp(p * 3.7 - 0.25, 0, 3); uStage.value = st;
    const k = Math.floor(st), f = st - k, e = smooth(0.35, 0.85, f);
    const y = k >= 3 ? ys[3] : mix(ys[k], ys[k + 1], e);
    s.orbY = y;
    uOrb.value.set(Math.sin(t * 0.7) * 0.35, y + 1.6 + Math.sin(t * 1.4) * 0.12, Math.cos(t * 0.6) * 0.3);
    uGhost.value = smooth(2.5, 3, st);
    labs.forEach((l, i) => { l.userData.a = 0.35 + 0.65 * Math.exp(-(((st - i) * 1.3) ** 2)); });
  };
  s.cam = () => ({ pos: new V3(8.5, s.orbY + 4.2, 12.5), look: new V3(0.8, s.orbY + 0.6, 0) });
}

/* ---- 6 · loops jammed at the human */
const loopHud = {};
{
  const s = mk(15), H = new V3(0, 2.4, 0), MAXR = 8;
  const phis = [180, -55, 55, -105, 105, -150, 150, 0].map(d => d * Math.PI / 180);
  const C = [], D = [], E = [], Rr = [];
  phis.forEach((ph, k) => {
    const r = k === 0 ? 4.6 : 2.5;
    const d = new V3(Math.sin(ph), Math.cos(ph), k === 0 ? 0 : (k % 2 ? 0.45 : -0.45)).normalize();
    // d points from H towards the ring centre
    const e = new V3().crossVectors(d, new V3(0, 0, 1)).normalize();
    C.push(H.clone().addScaledVector(d, r)); D.push(d); E.push(e); Rr.push(r);
  });
  const uN = { value: 1 };
  const W = [], A = [];
  for (let k = 0; k < MAXR; k++) { const n = Math.floor((k === 0 ? 1800 : 650) * Q);
    for (let i = 0; i < n; i++) { W.push(0, 0, 0); A.push(k, rnd(), gauss() * 0.5, rnd()); } }
  points(s, { position: [new Float32Array(W), 3], aR: [new Float32Array(A), 4] }, `
    attribute vec4 aR; uniform vec3 uC[8]; uniform vec3 uD[8]; uniform vec3 uE[8]; uniform float uR[8]; uniform float uN;
    void main(){
      int k = int(aR.x + 0.5);
      float sp = k == 0 ? 0.055 : 0.08;
      float s = fract(aR.y + uTime*sp);
      float t = 6.2831 * (s - 0.88*sin(6.2831*s)/6.2831);
      vec3 dir = -uD[k]*cos(t) + uE[k]*sin(t);
      vec3 nrm = cross(uD[k], uE[k]);
      vec3 pos = uC[k] + dir*(uR[k] + aR.z*0.22) + nrm*(aR.w - 0.5)*0.35;
      float near = exp(-pow(min(s, 1.0 - s)*7.0, 2.0));
      float size = 0.085 + near*0.03;
      vColor = mix(vec3(0.5,0.7,0.95), vec3(1.0,0.55,0.35), near);
      float on = k == 0 ? 1.0 : clamp(uN - float(k), 0.0, 1.0);
      vAlpha = on * (0.55 + 0.3*near);
      ${PTAIL}
    }`, { uN, uC: { value: C }, uD: { value: D }, uE: { value: E }, uR: { value: Rr } });
  // the human node
  const hn = Math.floor(600 * Q), hp = new Float32Array(hn * 3), hs = new Float32Array(hn);
  for (let i = 0; i < hn; i++) { hp.set([gauss() * 0.2, gauss() * 0.2, gauss() * 0.2], i * 3); hs[i] = rnd(); }
  points(s, { position: [hp, 3], aS: [hs, 1] }, `attribute float aS; uniform float uN; uniform vec3 uH;
    void main(){ vec3 pos = uH + position*(1.0 + uN*0.14)*(1.0 + 0.2*sin(uTime*5.0 + aS*10.0)); float size = 0.12;
      vColor = mix(vec3(1.0,0.6,0.4), vec3(1.0,0.95,0.85), aS); vAlpha = 0.45; ${PTAIL} }`, { uN, uH: { value: H } });
  const at = (t) => C[0].clone().addScaledVector(D[0], -Math.cos(t) * 5.6).addScaledVector(E[0], Math.sin(t) * 5.6);
  label(s, '感知', at(Math.PI / 2), { size: 0.5, color: '#7FB0E0' });
  label(s, '决策', at(Math.PI), { size: 0.5, color: '#7FB0E0' });
  label(s, '行动', at(Math.PI * 1.5), { size: 0.5, color: '#7FB0E0' });
  label(s, '人：看结果、拍板', H.clone().add(new V3(3.0, 1.9, 0.6)), { size: 0.48, color: '#F08A60', sub: '这一环加速不了', align: 'left' });
  s.update = (t, p) => {
    uN.value = 1 + smooth(0.12, 0.85, p) * 7;
    loopHud.n = Math.floor(uN.value + 0.001);
  };
  s.cam = (p, t) => ({ pos: new V3(Math.sin(t * 0.12) * 2.2, mix(0.5, 2.6, p), mix(17.5, 24, p)), look: new V3(0, mix(-1, 0.6, p), 0) });
}

/* ---- 7 · meaning from relative position: a network forms */
{
  const s = mk(17), M = Math.floor(120 * (MOBILE ? 0.7 : 1)), K = 6;
  const centers = Array.from({ length: K }, (_, k) => { const a = k / K * Math.PI * 2; return new V3(Math.cos(a) * 5.6, (rnd() - 0.5) * 4, Math.sin(a) * 5.6); });
  const tgt = [], sc = [], cl = [], dl = [];
  for (let i = 0; i < M; i++) {
    const k = i % K; cl.push(k); dl.push(rnd() * 0.5);
    tgt.push(centers[k].clone().add(new V3(gauss() * 1.3, gauss() * 1.3, gauss() * 1.3)));
    sc.push(new V3((rnd() - 0.5) * 26, (rnd() - 0.5) * 16, (rnd() - 0.5) * 18));
  }
  const edges = [];
  for (let i = 0; i < M; i++) {
    const d = tgt.map((p, j) => [p.distanceTo(tgt[i]), j]).filter(x => x[1] !== i).sort((a, b) => a[0] - b[0]);
    for (let q = 0; q < 2; q++) { const j = d[q][1]; if (!edges.some(e => (e[0] === j && e[1] === i))) edges.push([i, j]); }
  }
  for (let q = 0; q < 10; q++) edges.push([Math.floor(rnd() * M), Math.floor(rnd() * M)]);
  const flat = (vs) => new Float32Array(vs.flatMap(v => [v.x, v.y, v.z]));
  const uDim = { value: 1 };
  const NODE = `float kk(float d){ return smoothstep(d, d + 0.35, uP*1.6); }`;
  points(s, { position: [flat(tgt), 3], aS: [flat(sc), 3], aD: [new Float32Array(cl.flatMap((c, i) => [c, dl[i]])), 2] }, `
    attribute vec3 aS; attribute vec2 aD; uniform float uDim; ${NODE}
    void main(){ float k = kk(aD.y);
      vec3 drift = vec3(sin(uTime*0.3 + aD.y*30.0), cos(uTime*0.27 + aD.y*20.0), sin(uTime*0.23 + aD.y*12.0)) * 0.6 * (1.0 - k);
      vec3 pos = mix(aS + drift, position, k) + vec3(0.0, sin(uTime*0.8 + aD.y*9.0)*0.06, 0.0);
      float size = mix(0.22, 0.32, k);
      vColor = mix(vec3(0.6,0.62,0.68), pal(mod(aD.x, 5.0)), k);
      vAlpha = mix(0.5, 1.0, k) * uDim; ${PTAIL} }`, { uDim });
  // edges (shader-positioned)
  const ea = [], eb = [], ed = [];
  edges.forEach(([i, j]) => { ea.push(tgt[i], tgt[j]); eb.push(sc[i], sc[j]); ed.push(dl[i], dl[j]); });
  const em = new THREE.ShaderMaterial({
    uniforms: { uP: { value: 0 }, uFade: { value: 0 }, uDim, uTime: GU.uTime },
    vertexShader: `uniform float uP; uniform float uTime; attribute vec3 aS; attribute float aD; varying float vA; ${NODE}
      void main(){ float k = kk(aD); vec3 drift = vec3(sin(uTime*0.3 + aD*30.0), cos(uTime*0.27 + aD*20.0), sin(uTime*0.23 + aD*12.0)) * 0.6 * (1.0 - k);
        vec3 pos = mix(aS + drift, position, k) + vec3(0.0, sin(uTime*0.8 + aD*9.0)*0.06, 0.0); vA = k*k;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0); }`,
    fragmentShader: `uniform float uFade; uniform float uDim; varying float vA; void main(){ gl_FragColor = vec4(0.85,0.82,0.75, vA*0.32*uFade*uDim); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const el = new THREE.LineSegments(geo({ position: [flat(ea), 3], aS: [flat(eb), 3], aD: [new Float32Array(ed), 1] }), em);
  el.frustumCulled = false; s.group.add(el); s.mats.push(em);
  // pulses along edges
  const pa = [], pb = [], pd = [];
  edges.forEach(([i, j]) => { pa.push(tgt[i]); pb.push(tgt[j]); pd.push(rnd(), Math.max(dl[i], dl[j])); });
  points(s, { position: [flat(pa), 3], aB: [flat(pb), 3], aD: [new Float32Array(pd), 2] }, `
    attribute vec3 aB; attribute vec2 aD; uniform float uDim; ${NODE}
    void main(){ float k = kk(aD.y); float f = fract(uTime*0.35 + aD.x);
      vec3 pos = mix(position, aB, f); float size = 0.16;
      vColor = vec3(1.0,0.8,0.6); vAlpha = k*k*sin(f*3.14159)*uDim; ${PTAIL} }`, { uDim });
  // the analogy parallelogram
  const Mn = new V3(-3.2, -3.0, 5), v = new V3(0.9, 3.1, 0), g = new V3(4.2, 0.7, 0);
  const Kq = Mn.clone().add(v), Wn = Mn.clone().add(g), Qn = Wn.clone().add(v);
  const ap = flat([Mn, Kq, Wn, Qn]);
  const uAn = { value: 0 };
  points(s, { position: [ap, 3] }, `uniform float uAn; void main(){ vec3 pos = position; float size = 0.5; vColor = vec3(1.0,0.92,0.82); vAlpha = uAn; ${PTAIL} }`, { uAn });
  const roy = lines(s, flat([Mn, Kq, Wn, Qn]), 0xF08A60, 0.9);
  const gen = lines(s, flat([Mn, Wn, Kq, Qn]), 0x7FB0E0, 0.6);
  const la = [label(s, '男人', Mn.clone().add(new V3(-0.2, -0.75, 0)), { size: 0.5 }),
    label(s, '国王', Kq.clone().add(new V3(-0.4, 0.75, 0)), { size: 0.5, color: '#F08A60' }),
    label(s, '女人', Wn.clone().add(new V3(0.2, -0.75, 0)), { size: 0.5 }),
    label(s, '女王', Qn.clone().add(new V3(0.3, 0.75, 0)), { size: 0.5, color: '#F08A60' }),
    label(s, '国王 − 男人 ＋ 女人 ≈ 女王', new V3(0.3, -4.9, 5), { size: 0.4, color: '#cfcac0' })];
  s.update = (t, p) => {
    const a = smooth(0.62, 0.8, p);
    uAn.value = a; uDim.value = 1 - 0.7 * a;
    roy.userData.a = 0.9 * a; gen.userData.a = 0.6 * a; la.forEach(l => (l.userData.a = a));
  };
  s.cam = (p, t) => {
    const ang = t * 0.05 + p * 1.1, R = mix(23, 18, p);
    const a = { pos: new V3(Math.sin(ang) * R, 3.5, Math.cos(ang) * R), look: new V3(0, 0, 0) };
    const b = { pos: new V3(0.3, -0.6, 17), look: new V3(-0.2, -1.2, 4.5) };
    const k = smooth(0.58, 0.82, p);
    return { pos: a.pos.lerp(b.pos, k), look: a.look.lerp(b.look, k) };
  };
}

/* ---- 8 · the workbench: bricks build a cathedral around the model */
{
  const s = mk(16), slots = [];
  const add = (x, y, rot = 0, w = 1) => slots.push([x, y, rot, w]);
  for (let y = -7; y <= 0.01; y += 0.25) for (const x of [-4.25, -3.8, 3.8, 4.25]) add(x, y);
  for (let y = -7; y <= 1.5; y += 0.25) for (const x of [-6.6, 6.6]) add(x, y);
  for (let i = 0; i < 6; i++) { const y = 1.75 + i * 0.25, dx = 0.3 * (1 - i / 6); add(-6.6 - dx * 0 , y, 0, 1 - i / 7); add(6.6, y, 0, 1 - i / 7); }
  for (let x = -7; x <= 7.01; x += 0.45) add(x, -7.3);
  for (const rr of [8, 7.6]) for (let i = 0; i <= 18; i++) {
    const a = Math.PI - (i / 18) * (Math.PI / 3);
    add(4 + Math.cos(a) * rr, Math.sin(a) * rr, a - Math.PI / 2);
    add(-4 - Math.cos(a) * rr, Math.sin(a) * rr, -(a - Math.PI / 2));
  }
  const rc = new V3(0, 2.6, 0);
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; add(rc.x + Math.cos(a) * 1.7, rc.y + Math.sin(a) * 1.7, a + Math.PI / 2); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; add(rc.x + Math.cos(a) * 0.9, rc.y + Math.sin(a) * 0.9, a + Math.PI / 2, 0.8); }
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; for (const r of [1.2, 1.45]) add(rc.x + Math.cos(a) * r, rc.y + Math.sin(a) * r, a, 0.6); }
  const n = slots.length;
  const aT = new Float32Array(n * 3), aS = new Float32Array(n * 3), aR = new Float32Array(n * 4);
  slots.forEach(([x, y, rot, w], i) => {
    aT.set([x, y, 0], i * 3);
    const dir = new V3(gauss(), gauss(), gauss()).normalize().multiplyScalar(9 + rnd() * 9); dir.z += 6;
    aS.set([dir.x, dir.y, dir.z], i * 3);
    aR.set([rot, clamp((y + 7.5) / 15, 0, 1) * 0.85 + rnd() * 0.06, rnd(), w], i * 4);
  });
  const bg = new THREE.BoxGeometry(0.42, 0.21, 0.32);
  const ig = new THREE.InstancedBufferGeometry(); ig.index = bg.index;
  ig.setAttribute('position', bg.attributes.position); ig.setAttribute('normal', bg.attributes.normal);
  ig.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 3)); ig.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 3));
  ig.setAttribute('aR', new THREE.InstancedBufferAttribute(aR, 4)); ig.instanceCount = n;
  const bm = new THREE.ShaderMaterial({
    uniforms: { uTime: GU.uTime, uP: { value: 0 }, uFade: { value: 0 } },
    vertexShader: `uniform float uTime, uP; attribute vec3 aT; attribute vec3 aS; attribute vec4 aR; varying vec3 vN; varying float vK; varying float vF;
      mat3 rz(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
      mat3 rx(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
      void main(){
        float pr = uP * 1.3;
        float k = smoothstep(aR.y, aR.y + 0.16, pr);
        mat3 R = rz(mix(aR.z*6.28 + uTime*(0.3 + aR.z), aR.x, k)) * rx((1.0 - k)*(aR.z*9.0 + uTime*0.5));
        vec3 p = R * (position * vec3(aR.w, 1.0, 1.0));
        vec3 w = mix(aS + vec3(0.0, sin(uTime*0.4 + aR.z*20.0)*0.4, 0.0), aT, k) + p;
        vN = normalMatrix * (R * normal); vK = k;
        vF = exp(-pow((pr - aR.y - 0.16)*16.0, 2.0)) * step(0.01, k);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: `uniform float uFade; varying vec3 vN; varying float vK; varying float vF;
      void main(){ vec3 n = normalize(vN);
        float l = 0.3 + 0.7*max(dot(n, normalize(vec3(-0.3, 0.6, 0.75))), 0.0);
        float rim = pow(1.0 - abs(n.z), 2.0);
        vec3 col = mix(vec3(0.07,0.075,0.09), vec3(0.2,0.17,0.15), vK) * l + rim*vec3(1.0,0.55,0.35)*0.22*vK + vF*vec3(1.4,0.75,0.4);
        gl_FragColor = vec4(col, uFade); }`,
    transparent: true,
  });
  const bricks = new THREE.Mesh(ig, bm); bricks.frustumCulled = false; s.group.add(bricks); s.mats.push(bm);
  // model core + token stream
  const cn = Math.floor(900 * Q), cp = new Float32Array(cn * 3), cs = new Float32Array(cn);
  for (let i = 0; i < cn; i++) { cp.set([gauss() * 0.45, gauss() * 0.45, gauss() * 0.45], i * 3); cs[i] = rnd(); }
  points(s, { position: [cp, 3], aS: [cs, 1] }, `attribute float aS;
    void main(){ vec3 pos = position*(1.0 + 0.2*sin(uTime*2.0 + aS*7.0)) + vec3(0.0, -3.0, 0.0); float size = 0.12;
      vColor = mix(vec3(1.0,0.55,0.36), vec3(1.0,0.95,0.85), aS); vAlpha = 0.8; ${PTAIL} }`);
  const tn = Math.floor(500 * Q), tp = new Float32Array(tn * 3), ts = new Float32Array(tn * 2);
  for (let i = 0; i < tn; i++) { ts.set([rnd(), rnd()], i * 2); }
  points(s, { position: [tp, 3], aS: [ts, 2] }, `attribute vec2 aS;
    void main(){ float f = fract(aS.x + uTime*0.12); float order = smoothstep(0.3, 0.9, uP);
      float spread = mix(3.0, 0.35, order) * f;
      vec3 pos = vec3(sin(aS.y*40.0 + uTime*0.5)*spread, -3.0 + f*9.5, cos(aS.y*30.0)*spread*0.5);
      float size = 0.09; vColor = vec3(1.0,0.8,0.6); vAlpha = sin(f*3.14159)*0.8; ${PTAIL} }`);
  const l1 = label(s, '模型', new V3(1.5, -3.0, 0.5), { size: 0.5, color: '#F08A60', sub: '只会吐 token', align: 'left' });
  const l2 = label(s, 'harness · 工作台', new V3(0, 8.0, 0), { size: 0.55, sub: '工具 · 上下文 · 循环 · 权限 · 验收' });
  s.update = (t, p) => { l1.userData.a = smooth(0.0, 0.15, p); l2.userData.a = smooth(0.7, 0.85, p); };
  s.cam = (p) => ({ pos: new V3(mix(10, 0, smooth(0, 0.9, p)), mix(-3.5, 0.8, p), mix(19, 19.5, p)), look: new V3(0, mix(-2, 0.8, p), 0) });
}

/* ---- 9 · diffusion of innovations and the chasm */
{
  const s = mk(21), n = Math.floor(7500 * Q), sig = 3, hmax = 5.2;
  const pos = [], d = [];
  const h = (x) => hmax * Math.exp(-(x * x) / (2 * sig * sig));
  while (pos.length < n * 3) {
    const x = (rnd() - 0.5) * 20, y = rnd() * hmax;
    if (y > h(x) || Math.abs(x + 3) < 0.3) continue;
    const seg = x < -6 ? 0 : x < -3 ? 1 : x < 0 ? 2 : x < 3 ? 3 : 4;
    pos.push(x, y, gauss() * 0.45); d.push(seg, rnd());
  }
  points(s, { position: [new Float32Array(pos), 3], aD: [new Float32Array(d), 2] }, `
    attribute vec2 aD;
    float front(float p){ return p < 0.42 ? mix(-10.5, -3.25, p/0.42) : p < 0.6 ? -3.25 : mix(-3.25, 10.5, (p-0.6)/0.4); }
    void main(){
      vec3 pos = position;
      float gap = smoothstep(0.1, 0.4, uP);
      pos.x += (position.x < -3.0 ? -0.45 : 0.25) * gap;
      float lit = smoothstep(front(uP) + 0.4, front(uP) - 0.4, position.x);
      float seg = aD.x;
      vec3 c = seg < 0.5 ? pal(4.0) : seg < 1.5 ? pal(0.0) : seg < 2.5 ? pal(3.0) : seg < 3.5 ? pal(1.0) : pal(2.0);
      vColor = mix(vec3(0.3,0.32,0.38), c, lit);
      vAlpha = mix(0.25, 0.85, lit) * (0.8 + 0.2*sin(uTime*2.0 + aD.y*40.0));
      float size = mix(0.07, 0.09, lit);
      ${PTAIL}
    }`);
  // bridge over the chasm
  const bn = 260, bp = new Float32Array(bn * 3), bd = new Float32Array(bn * 2);
  for (let i = 0; i < bn; i++) bd.set([rnd(), rnd()], i * 2);
  points(s, { position: [bp, 3], aD: [bd, 2] }, `attribute vec2 aD;
    void main(){ float f = fract(aD.x + uTime*0.25); float x = mix(-4.2, -2.5, f);
      vec3 pos = vec3(x, 3.4 + sin(f*3.14159)*1.2 + (aD.y-0.5)*0.25, (aD.y-0.5)*0.6); float size = 0.1;
      vColor = vec3(1.0,0.85,0.6); vAlpha = smoothstep(0.48, 0.6, uP) * sin(f*3.14159); ${PTAIL} }`);
  lines(s, [-10.5, -0.05, 0, 10.5, -0.05, 0], 0x6a6f7c, 0.6);
  const segs = [[-8.2, '创新者', '2.5%'], [-4.6, '早期采用者', '13.5%'], [-1.5, '早期大众', '34%'], [1.5, '晚期大众', '34%'], [6.3, '落后者', '16%']];
  const segColors = ['#E88CBF', '#F08A60', '#F2C773', '#7FB0E0', '#9BBF77'];
  segs.forEach(([x, a, b], i) => label(s, a, new V3(x, i % 2 ? -1.0 : -2.1, 0.5), { size: 0.42, color: segColors[i], sub: b }));
  const lc = label(s, '鸿沟', new V3(-3.4, 6.0, 0.5), { size: 0.6, color: '#F0EEE6', sub: '大多数技术死在这里' });
  const lb = label(s, '成功案例搭的桥', new V3(-3.4, 5.9, 0.5), { size: 0.42, color: '#F2C773' });
  s.update = (t, p) => { lc.userData.a = smooth(0.25, 0.4, p) * (1 - smooth(0.55, 0.65, p)); lb.userData.a = smooth(0.62, 0.72, p); };
  s.cam = (p) => ({ pos: new V3(mix(-3, 1, p), mix(3.2, 3.8, p), mix(18, 17, p)), look: new V3(mix(-2.5, 0.5, p), 2, 0) });
}

/* ---- 10 · two constellations */
{
  const s = mk(23);
  const L = [['图灵', -9.2, 2.4], ['冯·诺依曼', -7.0, 4.6], ['香农', -4.9, 2.7], ['维纳', -8.3, -0.6], ['司马贺', -5.7, -1.4], ['恩格尔巴特', -3.1, 0.4], ['艾伦·凯', -3.7, -3.3]];
  const Rt = [['Jason Wei', 3.3, 3.7], ['Geoffrey Litt', 3.0, 0.3], ['Linus Lee', 5.6, 2.1], ['Steph Ango', 7.9, 4.1], ['Paul Graham', 9.3, 1.3], ['Michael Nielsen', 7.3, -1.5], ['Nabeel Qureshi', 4.8, -3.0]];
  const all = [...L, ...Rt];
  const sp = new Float32Array(all.length * 3), sd = new Float32Array(all.length * 2);
  all.forEach(([, x, y], i) => { sp.set([x, y, (rnd() - 0.5) * 1.5], i * 3); sd.set([i < 7 ? i / 7 * 0.4 : 0.42 + (i - 7) / 7 * 0.4, rnd()], i * 2); });
  points(s, { position: [sp, 3], aD: [sd, 2] }, `attribute vec2 aD;
    void main(){ vec3 pos = position; float on = smoothstep(aD.x, aD.x + 0.08, uP*1.15);
      float size = (0.55 + 0.12*sin(uTime*2.0 + aD.y*30.0)) * on;
      vColor = aD.x < 0.41 ? vec3(1.0,0.7,0.5) : vec3(0.65,0.82,1.0); vAlpha = on; ${PTAIL} }`);
  // starfield
  const fn = Math.floor(2600 * Q), fp = new Float32Array(fn * 3), fs = new Float32Array(fn);
  for (let i = 0; i < fn; i++) { fp.set([(rnd() - 0.5) * 60, (rnd() - 0.5) * 36, -6 - rnd() * 22], i * 3); fs[i] = rnd(); }
  points(s, { position: [fp, 3], aS: [fs, 1] }, `attribute float aS; void main(){ vec3 pos = position; float size = 0.08 + aS*0.12;
    vColor = mix(vec3(0.75,0.8,1.0), vec3(1.0,0.85,0.7), step(0.85, aS)); vAlpha = 0.4 + 0.4*sin(uTime*(1.0+aS*2.0) + aS*90.0); ${PTAIL} }`);
  const P = (i) => [sp[i * 3], sp[i * 3 + 1], sp[i * 3 + 2]];
  const seg = (pairs) => pairs.flatMap(([a, b]) => [...P(a), ...P(b)]);
  const ll = lines(s, seg([[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 6], [3, 0]]), 0xF08A60, 0.5);
  const lr = lines(s, seg([[7, 9], [9, 10], [10, 11], [11, 13], [13, 8], [8, 7], [9, 12], [12, 11]]), 0x7FB0E0, 0.5);
  const br = lines(s, seg([[5, 8]]), 0xF2C773, 0.8);
  const names = all.map(([nm, x, y], i) => label(s, nm, new V3(x, y - 0.75, sp[i * 3 + 2]), { size: i < 7 ? 0.42 : 0.36, color: i < 7 ? '#F3D9C9' : '#D6E5F5' }));
  const t1 = label(s, '信息时代七人组', new V3(-6.3, 6.6, 0), { size: 0.5, color: '#F08A60', sub: '定义机器 · 研究人机怎么配合' });
  const t2 = label(s, '今天的七位写作者', new V3(6.3, 6.6, 0), { size: 0.5, color: '#7FB0E0', sub: 'AI 之后，人还要做什么' });
  const tb = label(s, '增强人，而不是替代人', new V3(0, 1.1, 0.3), { size: 0.36, color: '#F2C773' });
  s.update = (t, p) => {
    const q = p * 1.15;
    names.forEach((l, i) => { const d = i < 7 ? i / 7 * 0.4 : 0.42 + (i - 7) / 7 * 0.4; l.userData.a = smooth(d + 0.04, d + 0.12, q); });
    t1.userData.a = smooth(0.0, 0.1, q); t2.userData.a = smooth(0.42, 0.52, q);
    ll.userData.a = 0.5 * smooth(0.35, 0.45, q); lr.userData.a = 0.5 * smooth(0.8, 0.9, q);
    br.userData.a = 0.8 * smooth(0.88, 0.98, q); tb.userData.a = smooth(0.9, 1.0, q);
  };
  s.cam = (p, t) => ({ pos: new V3(Math.sin(t * 0.06) * 1.5, 0.9, mix(23, 18.5, p)), look: new V3(0, 0.8, 0) });
}

/* --------------------------------------------------------- post-process */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 1.05, 0.55, 0.5);
composer.addPass(bloom);
const film = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5; float r2 = dot(c, c);
      vec2 off = c * r2 * 0.008;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= mix(1.0, 0.22, smoothstep(0.08, 0.62, r2));
      float g = fract(sin(dot(floor(vUv*uRes) + fract(uTime*7.3)*100.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * 0.035;
      col += vec3(0.012, 0.014, 0.024);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(new OutputPass());
composer.addPass(film);

/* -------------------------------------------------------------- layout */
let W = 1, Hh = 1;
function resize() {
  W = innerWidth; Hh = innerHeight;
  renderer.setSize(W, Hh, false);
  composer.setSize(W, Hh);
  composer.setPixelRatio(DPR);
  bloom.resolution.set(W * DPR * 0.5, Hh * DPR * 0.5);
  camera.aspect = W / Hh;
  // shift the projection centre to the right on wide screens so the scene sits beside the text column
  if (W > 760) camera.setViewOffset(W, Hh, -W * 0.17, 0, W, Hh); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  GU.uScale.value = (Hh * DPR * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  film.uniforms.uRes.value.set(W * DPR, Hh * DPR);
}
addEventListener('resize', resize); resize();

/* ------------------------------------------------------------- scroll */
function measure() {
  const vh = innerHeight; let sum = 0;
  sections.forEach((el, i) => {
    const r = el.getBoundingClientRect(), s = S[i];
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
const camPos = new V3(0, 2, 18), camLook = new V3(), tp = new V3(), tl = new V3();
let first = true, active = -1;
const hfov = () => 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  GU.uTime.value = REDUCED ? t * 0.35 : t;
  film.uniforms.uTime.value = t;
  measure();
  const k = first ? 1 : 1 - Math.exp(-dt * 4.5);
  tp.set(0, 0, 0); tl.set(0, 0, 0); let wsum = 0, best = 0;
  // on narrow viewports, pull back so the content's width fits
  const effW = W > 760 ? 0.66 : 1;
  S.forEach((s, i) => {
    s.w += (s.wt - s.w) * k; s.p += (s.pt - s.p) * k;
    if (s.w < 0.002) { s.group.visible = false; return; }
    s.group.visible = true;
    s.mats.forEach(m => { m.uniforms.uFade.value = s.w; if (m.uniforms.uP) m.uniforms.uP.value = s.p; });
    s.labels.forEach(l => (l.material.opacity = s.w * l.userData.a));
    s.basics.forEach(b => (b.material.opacity = s.w * b.userData.a));
    s.update(t, s.p, dt);
    const c = s.cam(s.p, t);
    const d = c.pos.distanceTo(c.look), vis = 2 * d * Math.tan(hfov() * effW / 2);
    const f = Math.max(1, (s.width * 1.08) / vis);
    c.pos.sub(c.look).multiplyScalar(f).add(c.look);
    tp.addScaledVector(c.pos, s.w); tl.addScaledVector(c.look, s.w); wsum += s.w;
    if (s.w > best) { best = s.w; if (active !== i) { active = i; onChapter(i); } }
  });
  if (wsum > 0) { tp.divideScalar(wsum); tl.divideScalar(wsum); }
  const ck = first ? 1 : 1 - Math.exp(-dt * 3);
  camPos.lerp(tp, ck); camLook.lerp(tl, ck);
  camera.position.copy(camPos); camera.lookAt(camLook);
  S.dust.rotation.y = t * 0.008; S.dust.position.copy(camPos).multiplyScalar(0.6);
  updateHud();
  composer.render();
  if (first) { first = false; requestAnimationFrame(() => document.body.classList.add('ready')); }
  requestAnimationFrame(frame);
}
// let the loader breathe a moment so the ink animation lands
setTimeout(() => requestAnimationFrame(frame), REDUCED ? 0 : 900);

/* ------------------------------------------------------------- chrome */
function setupChrome() {
  const nav = $('#nav');
  sections.forEach((el, i) => {
    const a = document.createElement('a'); a.href = '#'; a.innerHTML = `<span>${el.dataset.title}</span><i></i>`;
    a.addEventListener('click', (e) => { e.preventDefault(); el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' }); });
    nav.appendChild(a);
  });
  const io = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px' });
  document.querySelectorAll('.card').forEach(c => io.observe(c));
}
function onChapter(i) {
  const el = sections[i];
  document.querySelectorAll('#nav a').forEach((a, j) => a.classList.toggle('on', j === i));
  $('#caption').innerHTML = el.dataset.caption || '';
  $('#where').textContent = `${String(i).padStart(2, '0')} · ${el.dataset.title}`;
}
const hud = $('#hud'), ha = $('#hud-a'), hb = $('#hud-b'), hc = $('#hud-c');
let hudKey = '';
function updateHud() {
  const g = S[4], l = S[6];
  let key = '', show = false;
  if (g.w > 0.5 && galton.n) {
    show = true; const n = galton.n, m = 1.96 * Math.sqrt(0.25 / n) * 100;
    key = `g${n}`;
    if (key !== hudKey) { ha.textContent = '提问次数 n'; hb.textContent = `${n}`; hc.textContent = `误差约 ±${m.toFixed(1)} 个百分点（95%）`; }
  } else if (l.w > 0.5 && loopHud.n) {
    show = true; key = `l${loopHud.n}`;
    if (key !== hudKey) { ha.textContent = '同时在跑的 agent'; hb.textContent = `n = ${loopHud.n}`; hc.textContent = loopHud.n > 1 ? `${loopHud.n} 条环路，都要经过你` : '一条环路，一个你'; }
  }
  hudKey = key; hud.classList.toggle('on', show);
}
