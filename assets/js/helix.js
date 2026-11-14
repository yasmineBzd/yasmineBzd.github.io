/*
 * The helix: one B-DNA double helix that runs behind the whole page.
 * - Strand A carries the first 42 nt of the SARS-CoV-2 spike gene (MN908947.3), strand B its complement.
 * - All geometry is instanced and rebuilt when it moves, so the helix can open:
 *     the pointer unzips the pairs it passes over, a click bursts them,
 *     a replication wave runs down it every few seconds, and it zips itself shut on arrival.
 * - Open pairs release lines of code that drift out and fade.
 * - Each <section data-helix="..."> tells the helix where to stand while that section is on screen.
 * No WebGL, or a failure here: the SVG fallback drawn by main.js stays visible.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const root = document.documentElement;
const canvas = document.getElementById('helix');
const veil = document.getElementById('helix-veil');
const fragLayer = document.getElementById('frags');

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

if (canvas && hasWebGL()) {
  try {
    init();
  } catch (err) {
    console.error('[helix]', err);
    root.classList.add('no-webgl');
  }
} else {
  root.classList.add('no-webgl');
}

function init() {
  /* ---------- constants ---------- */
  const SEQ = 'ATGTTTGTTTTTCTTGTTTTATTGCCACTAGTCTCTAGTCAG'; // 14 codons: M F V F L V L L P L V S S Q
  const PAIR = { A: 'T', T: 'A', G: 'C', C: 'G' };
  const HEX = { A: 0x4fe3c1, T: 0x5aa9ff, G: 0xffb547, C: 0xff7a66 };
  const CSS = { A: '#4fe3c1', T: '#5aa9ff', G: '#ffb547', C: '#ff7a66' };
  const PERIOD = SEQ.length; // 42 bp = exactly 4 turns of 10.5 bp
  const N = PERIOD * 3;
  const RISE = 0.34;
  const TWIST = (Math.PI * 2) / 10.5;
  const R = 1.2;
  const GROOVE = 2.45; // angle between the strands: the major and minor grooves
  const L = PERIOD * RISE; // the helix repeats itself exactly after this length
  const Y0 = (-N * RISE) / 2;
  const SEG = 7; // backbone segments per base pair

  const FRAGMENTS = [
    '>MN908947.3 SARS-CoV-2',
    'from Bio import SeqIO',
    'seq.reverse_complement()',
    'blastp -query E6.fasta -db human',
    'for rec in SeqIO.parse(f, "fasta"):',
    '((A:0.12,B:0.08):0.05,C:0.21);',
    'gc = (s.count("G") + s.count("C")) / len(s)',
    'netMHCpan -a HLA-A02:01',
    'Phylo.draw(tree)',
    'if codon == "ATG": start()',
    'len(genome)  # 29903',
    "5'-AUG UUU GUU-3'",
    '01000001 01010100 01000111',
    'def translate(rna):',
    'ATGTTTGTTTTTCTTGTT',
    'MHQKRTAMFQDPQERPRKL',
    '{ "gene": "ORF1ab" }',
    'aln = AlignIO.read(f, "fasta")',
    'tree.ladderize()',
    'print(seq.translate())',
    'while strand: copy(strand)',
    'GATTACA',
    'haplotypes = dnasp(aln)',
    'pubmed.search("SARS-CoV-2")',
    'bepipred --threshold 0.5',
    'iedb.coverage(["MHC-I"])',
    'mega -model K2P -bootstrap 1000',
    'beast spike.xml',
    'Seq("ATG").transcribe()',
  ];

  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  let paused = reduceMQ.matches || root.classList.contains('motion-paused');

  /* ---------- renderer ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x05090b, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x05090b, 12, 26);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  camera.position.set(0, 0, 15);

  scene.add(new THREE.AmbientLight(0xbfe9ff, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(4, 6, 9);
  scene.add(key);
  const rimA = new THREE.PointLight(0x4fe3c1, 26, 30, 1.6);
  rimA.position.set(-5, 3, 4);
  scene.add(rimA);
  const rimB = new THREE.PointLight(0xffb547, 18, 30, 1.6);
  rimB.position.set(5, -4, 3);
  scene.add(rimB);

  /* rig: screen position, scale, tilt -> spin: rotation about the axis -> slide: travel along the axis */
  const rig = new THREE.Group();
  const spin = new THREE.Group();
  const slide = new THREE.Group();
  rig.add(spin);
  spin.add(slide);
  scene.add(rig);

  /* ---------- per-pair state ---------- */
  const U = new Float32Array(N); // how open each pair is, 0 closed .. 1 open
  const K = new Float32Array(N).fill(1); // rung length factor (a pair that left as code grows back)
  const hidden = new Float32Array(N).fill(-99); // time a pair left as code
  const lastSpawn = new Float32Array(N).fill(-99);
  const burstUntil = new Float32Array(N).fill(-99);
  const screenY = new Float32Array(N); // pair centre on screen, px
  const screenX = new Float32Array(N);
  const baseOf = (i) => SEQ[i % PERIOD];

  /* ---------- geometry ---------- */
  const SEGS = (N - 1) * SEG;
  const segGeo = new THREE.CylinderGeometry(0.072, 0.072, 1, 10, 1, false);
  const strandA = new THREE.InstancedMesh(
    segGeo,
    new THREE.MeshStandardMaterial({ color: 0x35d6b4, emissive: 0x0b5c4c, emissiveIntensity: 1.1, roughness: 0.32, metalness: 0.25 }),
    SEGS
  );
  const strandB = new THREE.InstancedMesh(
    segGeo,
    new THREE.MeshStandardMaterial({ color: 0x4d9cff, emissive: 0x0d3470, emissiveIntensity: 1.1, roughness: 0.32, metalness: 0.25 }),
    SEGS
  );
  strandA.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  strandB.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  strandA.frustumCulled = strandB.frustumCulled = false;
  slide.add(strandA, strandB);

  const beads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.13, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.15 }),
    N * 2
  );
  beads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  beads.frustumCulled = false;
  const colA = new THREE.Color(0x8ff5dc);
  const colB = new THREE.Color(0x8cc4ff);
  for (let i = 0; i < N; i++) {
    beads.setColorAt(i * 2, colA);
    beads.setColorAt(i * 2 + 1, colB);
  }
  slide.add(beads);

  const rungs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.058, 0.058, 1, 10, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), N * 2);
  rungs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rungs.frustumCulled = false;
  for (let i = 0; i < N; i++) {
    rungs.setColorAt(i * 2, new THREE.Color(HEX[baseOf(i)]));
    rungs.setColorAt(i * 2 + 1, new THREE.Color(HEX[PAIR[baseOf(i)]]));
  }
  slide.add(rungs);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();

  function strandPos(t, s, out) {
    const i0 = Math.min(N - 1, Math.floor(t));
    const f = t - i0;
    const u = U[i0] * (1 - f) + U[Math.min(N - 1, i0 + 1)] * f;
    const th = t * TWIST + (s ? GROOVE : 0) + (s ? 1 : -1) * u * 0.6;
    const r = R * (1 + 0.9 * u);
    return out.set(r * Math.cos(th), Y0 + t * RISE, r * Math.sin(th));
  }

  function placeCylinder(mesh, idx, a, b, radiusScale, lenScale) {
    mid.copy(a).add(b).multiplyScalar(0.5);
    dir.copy(b).sub(a);
    const len = dir.length();
    if (len < 1e-5 || radiusScale < 1e-3) {
      m4.makeScale(0.0001, 0.0001, 0.0001);
      mesh.setMatrixAt(idx, m4);
      return;
    }
    dir.divideScalar(len);
    q.setFromUnitVectors(up, dir);
    sc.set(radiusScale, len * lenScale, radiusScale);
    m4.compose(mid, q, sc);
    mesh.setMatrixAt(idx, m4);
  }

  const rdir = new THREE.Vector3();
  function rebuild() {
    for (let k = 0; k < SEGS; k++) {
      const t0 = k / SEG;
      const t1 = (k + 1) / SEG;
      placeCylinder(strandA, k, strandPos(t0, 0, p0), strandPos(t1, 0, p1), 1, 1.18);
      placeCylinder(strandB, k, strandPos(t0, 1, p0), strandPos(t1, 1, p1), 1, 1.18);
    }
    for (let i = 0; i < N; i++) {
      strandPos(i, 0, pa);
      strandPos(i, 1, pb);
      m4.makeTranslation(pa.x, pa.y, pa.z);
      beads.setMatrixAt(i * 2, m4);
      m4.makeTranslation(pb.x, pb.y, pb.z);
      beads.setMatrixAt(i * 2 + 1, m4);

      // a closed pair meets in the middle; an open one keeps short broken halves
      const half = pa.distanceTo(pb) / 2;
      const reach = Math.max(0.0001, ((half - 0.035) * (1 - 0.62 * U[i]) - 0.12) * K[i]);
      rdir.copy(pb).sub(pa).normalize();
      p0.copy(pa).addScaledVector(rdir, 0.12);
      p1.copy(p0).addScaledVector(rdir, reach);
      placeCylinder(rungs, i * 2, p0, p1, K[i], 1);
      p0.copy(pb).addScaledVector(rdir, -0.12);
      p1.copy(p0).addScaledVector(rdir, -reach);
      placeCylinder(rungs, i * 2 + 1, p0, p1, K[i], 1);
    }
    strandA.instanceMatrix.needsUpdate = true;
    strandB.instanceMatrix.needsUpdate = true;
    beads.instanceMatrix.needsUpdate = true;
    rungs.instanceMatrix.needsUpdate = true;
  }

  /* ---------- particles ---------- */
  const dotTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  const P_COUNT = coarse ? 380 : 820;
  const pPos = new Float32Array(P_COUNT * 3);
  const pCol = new Float32Array(P_COUNT * 3);
  const pSpd = new Float32Array(P_COUNT);
  const palette = [new THREE.Color(0x4fe3c1), new THREE.Color(0x5aa9ff), new THREE.Color(0xffb547), new THREE.Color(0x9fb8b2)];
  for (let i = 0; i < P_COUNT; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 22;
    pPos[i * 3 + 1] = (Math.random() - 0.5) * 14;
    pPos[i * 3 + 2] = -9 + Math.random() * 11;
    const c = palette[Math.random() < 0.7 ? (Math.random() < 0.5 ? 0 : 3) : Math.random() < 0.6 ? 1 : 2];
    const dim = 0.35 + Math.random() * 0.5;
    pCol[i * 3] = c.r * dim;
    pCol[i * 3 + 1] = c.g * dim;
    pCol[i * 3 + 2] = c.b * dim;
    pSpd[i] = 0.05 + Math.random() * 0.18;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  scene.add(
    new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({ size: 0.07, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })
    )
  );

  /* shards: small pieces that fly off with each released pair */
  const SHARDS = 64;
  const shardMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.075, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), SHARDS);
  shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shardMesh.frustumCulled = false;
  const shards = [];
  for (let i = 0; i < SHARDS; i++) {
    shards.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), t0: 0, life: 1, rot: new THREE.Euler() });
    m4.makeScale(0.0001, 0.0001, 0.0001);
    shardMesh.setMatrixAt(i, m4);
    shardMesh.setColorAt(i, new THREE.Color(0xffffff));
  }
  scene.add(shardMesh);

  /* ---------- post-processing ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.4, 0.62));
  composer.addPass(new OutputPass());

  /* quality: 2 = bloom, 1 = no bloom, 0 = no bloom and 1x pixels */
  let level = coarse || window.innerWidth < 900 ? 1 : 2;
  function maxDpr() {
    const d = window.devicePixelRatio || 1;
    if (level === 2) return Math.min(d, 1.75);
    if (level === 1) return Math.min(d, 1.5);
    return 1;
  }

  /* ---------- sizing ---------- */
  let W = 1;
  let H = 1;
  let visH = 1;
  let visW = 1;
  let dirty = true;
  let geoDirty = true;
  let clock = 0;

  /* ---------- section modes ---------- */
  const MODES = {
    hero: { x: 0.71, s: 1.0, veil: 0.0, tilt: -0.3, rate: 1.4, side: 1 },
    right: { x: 0.855, s: 0.8, veil: 0.22, tilt: -0.14, rate: 2.4, side: 1 },
    left: { x: 0.145, s: 0.8, veil: 0.22, tilt: 0.14, rate: 2.4, side: -1 },
    dim: { x: 0.5, s: 1.08, veil: 0.82, tilt: -0.08, rate: 4.5, side: 0 },
    center: { x: 0.5, s: 0.86, veil: 0.12, tilt: 0.0, rate: 1.8, side: 0 },
  };
  const MOBILE = {
    hero: { x: 0.9, s: 0.86, veil: 0.5, tilt: -0.22, rate: 3, side: 1 },
    other: { x: 0.5, s: 0.9, veil: 0.74, tilt: -0.1, rate: 5, side: 0 },
  };

  /* the hero helix stands in the space right of the hero copy, never under it */
  const heroCopy = document.querySelector('.hero__copy');
  const heroPortrait = document.querySelector('.hero__portrait');
  function fitHero() {
    if (!heroCopy || W < 900) return;
    if (heroPortrait && heroPortrait.offsetWidth) {
      const p = heroPortrait.getBoundingClientRect();
      // the helix stands in the lane between the text and the portrait, its right side passing behind her
      const c = heroCopy.getBoundingClientRect();
      const pxu = H / visH; // pixels per world unit at the helix plane
      const gap = Math.max(0, p.left - c.right);
      MODES.hero.x = Math.max((c.right + p.left) / 2, p.left - 60) / W;
      MODES.hero.s = Math.max(0.72, Math.min(1.05, (gap + 140) / (2.7 * pxu)));
      MODES.hero.tilt = 0.24; // leans so its lower end passes behind her, away from the text
      return;
    }
    const right = heroCopy.getBoundingClientRect().right;
    const pxu = H / visH;
    const full = 3.1 * pxu;
    const space = W - right;
    MODES.hero.s = Math.max(0.62, Math.min(1, (space - 48) / full));
    MODES.hero.x = Math.min(0.8, (right + space / 2) / W);
  }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    renderer.setPixelRatio(maxDpr());
    renderer.setSize(W, H, false);
    composer.setPixelRatio(maxDpr());
    composer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    visH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    visW = visH * camera.aspect;
    fitHero();
    dirty = true;
  }

  const sections = Array.from(document.querySelectorAll('[data-helix]'));
  function currentMode() {
    const midY = H * 0.5;
    let name = 'hero';
    for (const s of sections) {
      const r = s.getBoundingClientRect();
      if (r.top <= midY && r.bottom > midY) {
        name = s.dataset.helix;
        break;
      }
      if (r.top <= midY) name = s.dataset.helix;
    }
    if (W < 900) return name === 'hero' ? MOBILE.hero : MOBILE.other;
    return MODES[name] || MODES.right;
  }

  const cur = { x: MODES.hero.x, s: 1, veil: 0, tilt: MODES.hero.tilt };
  let mode = MODES.hero;

  /* ---------- input ---------- */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, px: -9999, py: -9999, last: -99 };
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.tx = (e.clientX / W) * 2 - 1;
      pointer.ty = (e.clientY / H) * 2 - 1;
      pointer.px = e.clientX;
      pointer.py = e.clientY;
      pointer.last = clock;
    },
    { passive: true }
  );
  document.documentElement.addEventListener('pointerleave', () => {
    pointer.px = pointer.py = -9999;
  });

  // a click on open ground near the helix bursts the pairs under it
  window.addEventListener('pointerdown', (e) => {
    if (paused || e.button !== 0) return;
    if (e.target.closest('a, button, input, textarea, select, label, summary, [contenteditable], .lab, .panel, .menu')) return;
    burstAt(e.clientX, e.clientY);
  });

  let scrollTarget = window.scrollY;
  let scrollCur = scrollTarget;
  let scrollVel = 0;
  window.addEventListener(
    'scroll',
    () => {
      scrollTarget = window.scrollY;
      dirty = true;
    },
    { passive: true }
  );
  window.addEventListener('resize', resize);

  window.addEventListener('motionchange', (e) => {
    paused = !!(e.detail && e.detail.paused);
    if (paused) clearFragments();
    dirty = true;
  });
  reduceMQ.addEventListener?.('change', (e) => {
    paused = e.matches || root.classList.contains('motion-paused');
    if (paused) clearFragments();
    dirty = true;
  });

  let running = true;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    root.classList.add('no-webgl');
    running = false;
  });

  /* the intro: the helix arrives open and zips shut from the top, once the loader lifts */
  let introT0 = -1; // -1 waiting, -2 skipped, else the start time
  function startIntro() {
    if (introT0 === -1) introT0 = clock;
  }
  if (paused) introT0 = -2;
  else {
    U.fill(1);
    if (root.classList.contains('is-loading')) {
      window.addEventListener('yb:loaded', startIntro, { once: true });
      setTimeout(startIntro, 6000); // never wait forever
    } else startIntro();
  }

  /* the replication wave */
  let waveT0 = -99;
  let nextWave = 7;
  const WAVE_TIME = 2.6;

  /* ---------- fragments ---------- */
  const frags = [];
  const pool = [];
  const MAX_FRAGS = coarse || window.innerWidth < 900 ? 6 : 14;
  let nextSpawn = 3;
  let globalCool = 0;
  const proj = new THREE.Vector3();
  const world = new THREE.Vector3();

  function makeEl() {
    const el = pool.pop() || document.createElement('span');
    el.className = 'frag';
    if (!el.parentNode) fragLayer.appendChild(el);
    return el;
  }

  function clearFragments() {
    for (const f of frags) {
      f.el.style.opacity = '0';
      pool.push(f.el);
    }
    frags.length = 0;
    for (let i = 0; i < N; i++) {
      hidden[i] = -99;
      K[i] = 1;
      U[i] = 0;
    }
    if (introT0 === -1) introT0 = -2;
    for (const s of shards) s.alive = false;
    geoDirty = true;
  }

  function pairWorld(i, out) {
    strandPos(i, 0, pa);
    strandPos(i, 1, pb);
    out.copy(pa).add(pb).multiplyScalar(0.5);
    return slide.localToWorld(out);
  }

  function release(i, now, opts = {}) {
    if (!fragLayer || frags.length >= MAX_FRAGS) return false;
    pairWorld(i, world);
    const base = baseOf(i);
    const pair = PAIR[base];
    let side = mode.side !== 0 ? mode.side : Math.random() < 0.5 ? -1 : 1;
    if (opts.fromX !== undefined) side = Math.random() < 0.5 ? -1 : 1;
    const v = new THREE.Vector3(side * (0.45 + Math.random() * 0.75), (Math.random() - 0.5) * 1.1, 0.25 + Math.random() * 0.75)
      .normalize()
      .multiplyScalar((opts.power || 1) * (1.05 + Math.random() * 0.7));

    const el = makeEl();
    el.textContent = '';
    const tag = document.createElement('b');
    tag.textContent = base + pair;
    el.appendChild(tag);
    el.appendChild(document.createTextNode(FRAGMENTS[(Math.random() * FRAGMENTS.length) | 0]));
    el.style.setProperty('--k', CSS[base]);
    el.style.setProperty('--k2', CSS[pair]);
    frags.push({ el, p: world.clone(), v, t0: now, life: 4.4 + Math.random() * 1.6 });
    lastSpawn[i] = now;

    let made = 0;
    for (let s = 0; s < SHARDS; s++) {
      const sh = shards[s];
      if (sh.alive) continue;
      sh.alive = true;
      sh.t0 = now;
      sh.life = 0.7 + Math.random() * 0.5;
      sh.p.copy(world);
      sh.v.copy(v).multiplyScalar(0.8 + Math.random() * 0.8);
      sh.v.x += (Math.random() - 0.5) * 1.8;
      sh.v.y += (Math.random() - 0.5) * 1.8;
      sh.v.z += (Math.random() - 0.5) * 0.8;
      sh.rot.set(Math.random() * 6, Math.random() * 6, 0);
      shardMesh.setColorAt(s, new THREE.Color(HEX[made % 2 ? pair : base]));
      if (++made >= (opts.shards || 5)) break;
    }
    if (shardMesh.instanceColor) shardMesh.instanceColor.needsUpdate = true;
    return true;
  }

  // a single pair leaves on its own: it shrinks, goes as code, and grows back
  function detach(now) {
    for (let tries = 0; tries < 24; tries++) {
      const i = (Math.random() * N) | 0;
      if (now - hidden[i] < 4.6 || U[i] > 0.2) continue;
      pairWorld(i, world);
      if (world.z < 0.15) continue;
      proj.copy(world).project(camera);
      if (proj.y > 0.62 || proj.y < -0.8 || Math.abs(proj.x) > 0.96) continue;
      if (release(i, now)) hidden[i] = now;
      return;
    }
  }

  function burstAt(x, y) {
    const hx = cur.x * W;
    if (Math.abs(x - hx) > 220 * cur.s + 40 || cur.veil > 0.6) return false;
    const order = [];
    for (let i = 0; i < N; i++) {
      const d = Math.hypot((screenX[i] - x) * 0.55, screenY[i] - y);
      if (d < 130) order.push([d, i]);
    }
    order.sort((a, b) => a[0] - b[0]);
    let n = 0;
    for (const [, i] of order) {
      burstUntil[i] = clock + 1.3;
      if (n < 6 && release(i, clock, { power: 1.6, shards: 7, fromX: x })) n++;
    }
    dirty = true;
    return order.length > 0;
  }

  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  function updateFragments(now, dt) {
    for (let j = frags.length - 1; j >= 0; j--) {
      const f = frags[j];
      const age = now - f.t0;
      if (age > f.life) {
        f.el.style.opacity = '0';
        pool.push(f.el);
        frags.splice(j, 1);
        continue;
      }
      f.v.multiplyScalar(Math.exp(-dt * 0.55));
      f.p.addScaledVector(f.v, dt);
      proj.copy(f.p).project(camera);
      const x = (proj.x * 0.5 + 0.5) * W;
      const y = (-proj.y * 0.5 + 0.5) * H;
      const dist = camera.position.distanceTo(f.p);
      const grow = 0.55 + 0.45 * smooth(0, 0.6, age);
      const s = Math.min(1.35, Math.max(0.6, 15 / dist)) * grow;
      const op = smooth(0.05, 0.5, age) * (1 - smooth(f.life - 1.3, f.life, age)) * (1 - cur.veil * 0.85) * smooth(70, 150, y);
      f.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${s.toFixed(3)})`;
      f.el.style.opacity = op.toFixed(3);
    }

    for (let i = 0; i < SHARDS; i++) {
      const s = shards[i];
      if (!s.alive) continue;
      const age = now - s.t0;
      if (age > s.life) {
        s.alive = false;
        m4.makeScale(0.0001, 0.0001, 0.0001);
        shardMesh.setMatrixAt(i, m4);
        continue;
      }
      s.p.addScaledVector(s.v, dt);
      s.v.multiplyScalar(Math.exp(-dt * 2.2));
      s.rot.x += dt * 5;
      s.rot.y += dt * 4;
      const k = 1 - smooth(0, s.life, age);
      q.setFromEuler(s.rot);
      sc.setScalar(Math.max(0.0001, k * 1.2));
      m4.compose(s.p, q, sc);
      shardMesh.setMatrixAt(i, m4);
    }
    shardMesh.instanceMatrix.needsUpdate = true;
  }

  /* where each pair sits on screen (for the pointer, the wave and clicks) */
  function measurePairs() {
    for (let i = 0; i < N; i++) {
      tmp.set(0, Y0 + i * RISE, 0);
      slide.localToWorld(tmp);
      tmp.project(camera);
      screenX[i] = (tmp.x * 0.5 + 0.5) * W;
      screenY[i] = (-tmp.y * 0.5 + 0.5) * H;
    }
  }

  /* shared with the page: where the helix stands (the cursor reads it) */
  const shared = (window.__helix = { x: -9999, width: 0, near: false, burstAt, sx: screenX, sy: screenY });

  /* ---------- loop ---------- */
  let last = performance.now();
  let spinAngle = 0;
  let lastScroll = scrollCur;
  let perfAcc = 0;
  let perfFrames = 0;
  let firstFrame = true;

  resize();
  {
    const m = currentMode();
    cur.x = m.x;
    cur.s = m.s;
    cur.veil = m.veil;
    cur.tilt = m.tilt;
  }
  rebuild();

  function frame(tNow) {
    if (!running) return;
    requestAnimationFrame(frame);
    const realDt = Math.min(0.05, (tNow - last) / 1000);
    last = tNow;
    const dt = paused ? 0 : realDt;
    clock += dt;

    mode = currentMode();
    const ease = paused ? 1 : 1 - Math.exp(-realDt * 2.6);
    const before = cur.x + cur.s + cur.veil + cur.tilt;
    cur.x += (mode.x - cur.x) * ease;
    cur.s += (mode.s - cur.s) * ease;
    cur.veil += (mode.veil - cur.veil) * ease;
    cur.tilt += (mode.tilt - cur.tilt) * ease;
    if (Math.abs(before - (cur.x + cur.s + cur.veil + cur.tilt)) > 1e-4) dirty = true;

    const prevScroll = scrollCur;
    if (paused) scrollCur = scrollTarget;
    else scrollCur += (scrollTarget - scrollCur) * (1 - Math.exp(-realDt * 7));
    if (realDt > 0) scrollVel += ((scrollCur - prevScroll) / realDt - scrollVel) * 0.15;

    if (paused && !dirty && !geoDirty) return;
    dirty = false;

    // place the rig
    rig.position.x = (cur.x - 0.5) * visW;
    rig.scale.setScalar(cur.s);
    pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-realDt * 3));
    pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-realDt * 3));
    rig.rotation.z = cur.tilt + (paused ? 0 : pointer.x * -0.04);
    rig.rotation.x = paused ? 0 : pointer.y * 0.12;
    if (veil) veil.style.opacity = cur.veil.toFixed(3);

    // spin: slow on its own, faster while the page scrolls or the pointer is close
    const helixScreenX = cur.x * W;
    const near = Math.abs(pointer.px - helixScreenX) < 170 * cur.s + 30;
    spinAngle += dt * (0.16 + (near ? 0.2 : 0) + Math.min(2.2, Math.abs(scrollVel) / 900));
    spin.rotation.y = spinAngle;
    const travel = (scrollCur / H) * visH * 0.42 - clock * 0.14;
    slide.position.y = (((travel % L) + L) % L) - L / 2;

    shared.x = helixScreenX;
    shared.width = 150 * cur.s;
    shared.near = near && cur.veil < 0.5 && !paused;

    // particles
    const scrollDelta = ((scrollCur - lastScroll) / H) * visH * 0.2;
    lastScroll = scrollCur;
    if (dt > 0 || scrollDelta !== 0) {
      const pos = pGeo.attributes.position.array;
      for (let i = 0; i < P_COUNT; i++) {
        let y = pos[i * 3 + 1] + pSpd[i] * dt + scrollDelta;
        if (y > 7) y -= 14;
        else if (y < -7) y += 14;
        pos[i * 3 + 1] = y;
      }
      pGeo.attributes.position.needsUpdate = true;
    }

    scene.updateMatrixWorld();

    if (!paused) {
      measurePairs();

      // how open each pair should be: the intro front, the replication wave, the pointer, a burst
      let introFront;
      if (introT0 === -1) introFront = -1e9; // still waiting: everything open
      else if (introT0 === -2) introFront = 1e9;
      else introFront = -140 + ((clock - introT0) / 1.9) * (H + 280);
      if (clock > nextWave && cur.veil < 0.6 && introT0 >= 0 && clock - introT0 > 3.5) {
        waveT0 = clock;
        nextWave = clock + 8 + Math.random() * 5;
      }
      const waveY = clock - waveT0 < WAVE_TIME ? -100 + ((clock - waveT0) / WAVE_TIME) * (H + 200) : -1e9;
      const pointerOn = clock - pointer.last < 2.5 && cur.veil < 0.6;
      const ready = introT0 >= 0 && clock - introT0 > 1.2;

      let changed = false;
      for (let i = 0; i < N; i++) {
        const y = screenY[i];
        let t = introFront > 1e8 ? 0 : smooth(introFront - 40, introFront + 90, y);
        if (waveY > -1e8) t = Math.max(t, 0.92 * Math.exp(-(((y - waveY) / 70) ** 2)));
        if (pointerOn) {
          const d = Math.hypot((screenX[i] - pointer.px) * 0.55, y - pointer.py);
          t = Math.max(t, 1 - smooth(55, 150, d));
        }
        if (burstUntil[i] > clock) t = 1;

        const rate = t > U[i] ? 9 : 2.6;
        const nu = U[i] + (t - U[i]) * (1 - Math.exp(-dt * rate));
        if (Math.abs(nu - U[i]) > 1e-4) {
          U[i] = nu;
          changed = true;
        }

        if (hidden[i] > -50) {
          const age = clock - hidden[i];
          let k;
          if (age < 0.35) k = 1 - smooth(0, 0.35, age);
          else if (age < 3.4) k = 0;
          else if (age < 4.4) k = smooth(3.4, 4.4, age);
          else {
            k = 1;
            hidden[i] = -99;
          }
          if (k !== K[i]) {
            K[i] = k;
            changed = true;
          }
        }

        // open pairs release code
        if (ready && U[i] > 0.7 && clock - lastSpawn[i] > 3.2 && clock > globalCool) {
          if (y > 90 && y < H - 40 && screenX[i] > -50 && screenX[i] < W + 50) {
            if (release(i, clock)) globalCool = clock + (pointerOn ? 0.16 : 0.3);
          }
        }
      }
      if (changed) geoDirty = true;

      if (ready && clock > nextSpawn) {
        detach(clock);
        nextSpawn = clock + mode.rate * (0.7 + Math.random() * 0.6);
      }
      updateFragments(clock, dt);
    }

    if (geoDirty) {
      rebuild();
      geoDirty = false;
    }

    if (level === 2) composer.render();
    else renderer.render(scene, camera);

    if (firstFrame) {
      firstFrame = false;
      root.classList.add('helix-ready');
    }

    perfAcc += realDt;
    perfFrames++;
    if (perfFrames >= 90 && !window.__capture) { // a frame-by-frame recording runs on its own clock
      const avg = perfAcc / perfFrames;
      if (avg > 1 / 42 && level > 0 && !paused) {
        level--;
        resize();
      }
      perfAcc = 0;
      perfFrames = 0;
    }
  }
  requestAnimationFrame(frame);
}
