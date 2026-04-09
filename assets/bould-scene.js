/**
 * BOULD Particle Scene — Shape Morpher Edition
 *
 * Loads up to 3 GLB/OBJ files. 10 000 particles morph between them on click.
 *
 * Interaction loop
 * ─────────────────
 *  Click / tap  → morph to next shape:  Shape 0 → 1 → 2 → 0 → … (infinite cycle)
 *  Hold & drag  → rotate logo ±86° on Y axis (no full 360, no auto-spin)
 *  Hover        → cursor repulsion field pushes nearby particles (morph preview)
 *
 * Visual
 * ──────
 *  • Each shape has its own colour palette that blends as particles morph
 *  • AdditiveBlending on all layers → natural glow in dense areas
 *  • Wide semi-transparent halo layer for bloom without post-processing
 *  • Three-layer parallax starfield
 *  • Orbit-convergence entrance animation
 *
 * Configuration
 * ─────────────
 *  Pass URLs via data attributes on the canvas element:
 *    data-model-1="..."   ← first shape  (required, falls back to "B" text)
 *    data-model-2="..."   ← second shape (optional, falls back to font)
 *    data-model-3="..."   ← third shape  (optional, falls back to font)
 */

import * as THREE         from 'https://esm.sh/three@0.161.0';
import { OBJLoader }      from 'https://esm.sh/three@0.161.0/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader }     from 'https://esm.sh/three@0.161.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader }    from 'https://esm.sh/three@0.161.0/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment }from 'https://esm.sh/three@0.161.0/examples/jsm/environments/RoomEnvironment.js';

/* ─── Easing ──────────────────────────────────────────────────────────────── */
const easeOutQuart = t => 1 - Math.pow(1 - t, 4);

/* ─── Per-shape colour palettes ───────────────────────────────────────────── */
// Additive blending: dense clusters auto-brighten toward white.
// Main = small particles, Accent = medium purple, Glow = wide halo.
const PALETTES = [
  {
    main:   new THREE.Color(0xd8e0ff),  // cool white-blue
    accent: new THREE.Color(0x8B5CF6),  // purple
    glow:   new THREE.Color(0x3311bb),  // deep indigo
  },
  {
    main:   new THREE.Color(0xffe8f8),  // warm pink-white
    accent: new THREE.Color(0xdd55ff),  // violet-pink
    glow:   new THREE.Color(0xaa1188),  // deep magenta
  },
  {
    main:   new THREE.Color(0xd8fff8),  // cool cyan-white
    accent: new THREE.Color(0x33ddcc),  // teal
    glow:   new THREE.Color(0x1188aa),  // deep teal
  },
];

/* ─── Physics / animation tuning ─────────────────────────────────────────── */
const N_DESKTOP     = 20000;
const N_MOBILE      = 8000;
const MAX_ROT_Y     = Math.PI * 0.15;   // ±27° — keep it centered, no extreme left/right swing
const MAX_ROT_X     = Math.PI * 0.065;  // ±12° X tilt
const DRAG_PX       = 5;               // pixels to distinguish drag from tap
const HOME_K_INTRO  = 0.90;            // spring stiffness during intro convergence
const HOME_K_MORPH  = 0.5;            // deeply gentle stiffness for a slow, smooth linear morph
const VEL_DRAG_IDLE = 0.85;           // heavy damping at idle removes all jelly-like bouncing
const REPULSE_R2    = 0.35;           // subtle hover deform radius
const REPULSE_MAG   = 0.4;            // extremely subtle deform force
const SNAP_DIST     = 0.035;          // max distance to call shape "complete"
const MORPH_SPEED   = 0.30;          // how fast colour blends (lower = smoother)

/* ════════════════════════════════════════════════════════════════════════════
   MAIN CLASS
════════════════════════════════════════════════════════════════════════════ */
class BouldScene {
  constructor(canvasEl, urls) {
    this.canvas = canvasEl;
    this.urls   = urls;            // string[3] — source URLs (may be null)

    /* NDC mouse + smoothed */
    this.mouse  = { x: 0, y: 0 };
    this.target = { x: 0, y: 0 };

    /* Clamped rotation — no auto-spin */
    this._rotY       = 0;
    this._rotYTarget = 0;
    this._rotX       = 0;
    this._rotXTarget = 0;

    /* Drag state */
    this._ptrDown   = false;
    this._ptrDownX  = 0;
    this._dragRotY0 = 0;
    this._dragging  = false;
    this._dragDist  = 0;

    this.raf   = null;
    this.alive = true;
    this.clock = new THREE.Clock();

    /* Entrance */
    this.revealed         = false;
    this.entranceProgress = 0;
    this.scrollProgress   = 0;
    this._revealTimer     = null;

    /* Shape data — one entry per GLB */
    this._N      = 0;          // particle count (set after first model loads)
    this._homes  = [null, null, null];  // Float32Array[N×3] — positions per shape
    this._loaded = [false, false, false];

    /* Live particle buffers */
    this._cur       = null;   // Float32Array [N×3] — current live positions (main + glow)
    this._vel       = null;   // Float32Array [N×3] — velocities
    this._accentIdx = null;   // Int32Array [N/4]
    this._accentN   = 0;
    this._curB      = null;   // Float32Array [accentN×3]

    /* Shape cycling */
    this._curShape    = 0;    // shape currently displayed
    this._targetShape = 0;    // shape being morphed toward
    this._colT        = 0;    // colour blend 0…1 between cur and target palette

    /* State machine:
     *   pre       → loading / not yet revealed
     *   intro     → particles orbit → converge to shape 0
     *   idle      → at rest in current shape
     *   morphing  → spring-interpolating to _targetShape
     */
    this._state    = 'pre';
    this._stateAge = 0;

    this._opacity      = 0;
    this._introReady   = false;
    this._allLoaded    = false;

    /* Three.js objects */
    this._group        = null;
    this._points       = null;
    this._pointsAccent = null;
    this._pointsGlow   = null;

    /* Bound event handlers */
    this._onResize    = this._handleResize.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onScroll    = this._handleScroll.bind(this);
    this._onPtrDown   = this._handlePtrDown.bind(this);
    this._onPtrMove   = this._handlePtrMove.bind(this);
    this._onPtrUp     = this._handlePtrUp.bind(this);

    this._init();
  }

  /* ════════════════════════════════════════════════════════════
     INIT
  ════════════════════════════════════════════════════════════ */
  _init() {
    requestAnimationFrame(() => {
      const w = this.canvas.clientWidth  || window.innerWidth;
      const h = this.canvas.clientHeight || window.innerHeight;

      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(w, h, false);
      this.renderer.toneMapping         = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.6;
      this.renderer.outputColorSpace    = THREE.SRGBColorSpace;

      this.scene  = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
      this.camera.position.set(0, 0, 6);

      const pmrem = new THREE.PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader();
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();

      this._buildStarfield();

      /* Determine N now so all three shapes share the same count */
      this._N = window.innerWidth < 768 ? N_MOBILE : N_DESKTOP;

      /* Load all three models (or primitive fallback if URL missing) */
      for (let i = 0; i < 3; i++) {
        if (this.urls[i]) this._loadModelForSlot(i, this.urls[i]);
        else               this._loadFallbackShapeForSlot(i);
      }

      /* Events */
      window.addEventListener('mousemove', this._onMouseMove, { passive: true });
      window.addEventListener('resize',    this._onResize,    { passive: true });
      window.addEventListener('scroll',    this._onScroll,    { passive: true });
      window.addEventListener('mouseup',   this._onPtrUp);

      this.canvas.addEventListener('mousedown',  this._onPtrDown);
      this.canvas.addEventListener('mousemove',  this._onPtrMove);
      this.canvas.addEventListener('touchstart', this._onPtrDown,  { passive: true });
      this.canvas.addEventListener('touchmove',  this._onPtrMove,  { passive: false });
      this.canvas.addEventListener('touchend',   this._onPtrUp,    { passive: true });

      this._revealTimer = setTimeout(() => this._triggerReveal(), 900);
      this._loop();
    });
  }

  _triggerReveal() {
    if (this.revealed) return;
    this.revealed = true;
    if (this._revealTimer) { clearTimeout(this._revealTimer); this._revealTimer = null; }
    if (this._allLoaded) this._beginIntro();
  }

  /* ════════════════════════════════════════════════════════════
     LOADERS
  ════════════════════════════════════════════════════════════ */
  _loadModelForSlot(slot, url) {
    const ext = url.split('?')[0].toLowerCase();
    const onLoad = root => { if (this.alive) this._extractShape(slot, root); };
    const onFail = e  => { console.warn(`[BouldScene] slot ${slot} fail:`, e); this._loadFallbackShapeForSlot(slot); };

    if (ext.endsWith('.glb') || ext.endsWith('.gltf')) {
      console.log(`[BouldScene] GLB slot ${slot}:`, url);
      const draco = new DRACOLoader();
      draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
      const loader = new GLTFLoader();
      loader.setDRACOLoader(draco);
      loader.load(url, g => onLoad(g.scene), null, onFail);
    } else {
      console.log(`[BouldScene] OBJ slot ${slot}:`, url);
      new OBJLoader().load(url, onLoad, null, onFail);
    }
  }

  _loadFallbackShapeForSlot(slot) {
    console.log(`[BouldScene] Primitive fallback slot ${slot}`);
    /* Use distinct primitives so fallbacks look different */
    let geo;
    if (slot === 0)      geo = new THREE.SphereGeometry(1.6, 64, 64);
    else if (slot === 1) geo = new THREE.TorusGeometry(1.3, 0.4, 32, 64);
    else                 geo = new THREE.IcosahedronGeometry(1.8, 8);
    
    geo.computeBoundingBox(); geo.center();
    this._extractShape(slot, new THREE.Mesh(geo, new THREE.MeshBasicMaterial()));
  }

  /* ════════════════════════════════════════════════════════════
     SHAPE EXTRACTION  (run independently per slot)
  ════════════════════════════════════════════════════════════ */
  _extractShape(slot, root) {
    const N = this._N;

    /* 1. Collect world-space vertices */
    const rxA = [], ryA = [], rzA = [];
    const vt  = new THREE.Vector3();
    const dum = new THREE.Object3D();
    dum.add(root); dum.updateWorldMatrix(false, true);
    root.traverse(child => {
      const isGeom = child.isMesh || child.isPoints || child.isLine || child.isLineSegments;
      if (!isGeom) return;
      const attr = child.geometry.attributes.position;
      if (!attr) return;
      for (let i = 0; i < attr.count; i++) {
        vt.fromBufferAttribute(attr, i).applyMatrix4(child.matrixWorld);
        rxA.push(vt.x); ryA.push(vt.y); rzA.push(vt.z);
      }
    });
    dum.remove(root);

    const total = rxA.length;
    if (total < 3) {
      console.warn(`[BouldScene] No vertices in slot ${slot}`);
      /* Instead of copying homes0, fallback to a procedural cloud to avoid morphing to yourself forever */
      const pos = new Float32Array(N * 3);
      for (let i = 0; i < N * 3; i++) pos[i] = (Math.random() - 0.5) * 4.0;
      this._homes[slot] = pos;
      this._markSlotLoaded(slot);
      return;
    }
    console.log(`[BouldScene] Slot ${slot} vertices:`, total);

    /* 2. Centre + scale each shape independently to same visual size */
    let mnX = Infinity, mnY = Infinity, mnZ = Infinity;
    let mxX = -Infinity, mxY = -Infinity, mxZ = -Infinity;
    for (let i = 0; i < total; i++) {
      if (rxA[i] < mnX) mnX = rxA[i]; if (rxA[i] > mxX) mxX = rxA[i];
      if (ryA[i] < mnY) mnY = ryA[i]; if (ryA[i] > mxY) mxY = ryA[i];
      if (rzA[i] < mnZ) mnZ = rzA[i]; if (rzA[i] > mxZ) mxZ = rzA[i];
    }
    const cx   = (mnX + mxX) / 2, cy = (mnY + mxY) / 2, cz = (mnZ + mxZ) / 2;
    const span = Math.max(mxX - mnX, mxY - mnY, mxZ - mnZ) || 1;
    const mob  = window.innerWidth < 768;
    const sc   = (mob ? 1.65 : 2.5) / span;

    /* 3. Jittered sampling → exactly N positions */
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const s = Math.floor(Math.random() * total);
      pos[i * 3]     = (rxA[s] - cx) * sc + (Math.random() - 0.5) * 0.009;
      pos[i * 3 + 1] = (ryA[s] - cy) * sc + (Math.random() - 0.5) * 0.009;
      pos[i * 3 + 2] = (rzA[s] - cz) * sc + (Math.random() - 0.5) * 0.009;
    }
    this._homes[slot] = pos;

    this._markSlotLoaded(slot);
  }

  _markSlotLoaded(slot) {
    this._loaded[slot] = true;
    console.log(`[BouldScene] Slot ${slot} ready`);

    /* If all three ready, build the Three.js objects */
    if (this._loaded[0] && this._loaded[1] && this._loaded[2]) {
      this._allLoaded = true;
      this._buildThreeObjects();
      if (this.revealed) this._beginIntro();
    }
  }

  /* ════════════════════════════════════════════════════════════
     BUILD THREE.JS OBJECTS  (called once, after all shapes ready)
  ════════════════════════════════════════════════════════════ */
  _buildThreeObjects() {
    const N   = this._N;
    const mob = window.innerWidth < 768;

    /* Live buffers start as a copy of shape 0 */
    this._cur = this._homes[0].slice();
    this._vel = new Float32Array(N * 3);

    /* Accent layer — every 4th particle */
    const aN = Math.floor(N / 4);
    this._accentN   = aN;
    this._accentIdx = new Int32Array(aN);
    this._curB      = new Float32Array(aN * 3);
    for (let i = 0; i < aN; i++) {
      const s = i * 4;
      this._accentIdx[i]  = s;
      this._curB[i * 3]   = this._cur[s * 3];
      this._curB[i * 3+1] = this._cur[s * 3+1];
      this._curB[i * 3+2] = this._cur[s * 3+2];
    }

    /* ── Main layer — small dots, cool white-blue ─── */
    const gM = new THREE.BufferGeometry();
    gM.setAttribute('position', new THREE.BufferAttribute(this._cur, 3));
    this._points = new THREE.Points(gM, new THREE.PointsMaterial({
      size: mob ? 0.030 : 0.020,
      color: PALETTES[0].main.clone(),
      transparent: true, opacity: 0,
      sizeAttenuation: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));

    /* ── Accent layer — larger, purple ─── */
    const gA = new THREE.BufferGeometry();
    gA.setAttribute('position', new THREE.BufferAttribute(this._curB, 3));
    this._pointsAccent = new THREE.Points(gA, new THREE.PointsMaterial({
      size: mob ? 0.048 : 0.034,
      color: PALETTES[0].accent.clone(),
      transparent: true, opacity: 0,
      sizeAttenuation: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));

    /* ── Glow / halo — wide, very transparent, same buffer as main ─── */
    const gG = new THREE.BufferGeometry();
    gG.setAttribute('position', new THREE.BufferAttribute(this._cur, 3));
    this._pointsGlow = new THREE.Points(gG, new THREE.PointsMaterial({
      size: mob ? 0.12 : 0.085,
      color: PALETTES[0].glow.clone(),
      transparent: true, opacity: 0,
      sizeAttenuation: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));

    /* ── Group for position + rotation ─── */
    this._group = new THREE.Group();
    this._group.add(this._points, this._pointsAccent, this._pointsGlow);
    const ox = mob ? 0 : 2.2;
    this._group.position.x = ox;
    this.scene.add(this._group);

    console.log('[BouldScene] Three objects built, N =', N);
  }

  /* ════════════════════════════════════════════════════════════
     INTRO ANIMATION
  ════════════════════════════════════════════════════════════ */
  _beginIntro() {
    if (this._introReady || !this._cur) return;
    this._introReady = true;
    this._state    = 'intro';
    this._stateAge = 0;
    this._curShape    = 0;
    this._targetShape = 0;

    const N = this._N, cur = this._cur, vel = this._vel, home = this._homes[0];
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      /* All particles begin at the centre with microscopic jitter so they
         appear to materialise from a single point and fly outward to form
         the first shape.  An initial impulse directed toward each particle's
         home position gives the burst its natural spread. */
      cur[i3]     = (Math.random() - 0.5) * 0.06;
      cur[i3 + 1] = (Math.random() - 0.5) * 0.06;
      cur[i3 + 2] = (Math.random() - 0.5) * 0.06;
      const sp    = 0.11 + Math.random() * 0.07;
      vel[i3]     = home[i3]     * sp;
      vel[i3 + 1] = home[i3 + 1] * sp;
      vel[i3 + 2] = home[i3 + 2] * sp;
    }
  }

  /* ════════════════════════════════════════════════════════════
     CLICKING — cycle shapes
  ════════════════════════════════════════════════════════════ */
  _doMorphToNext() {
    if (!this._allLoaded || !this._points) return;
    /* Cooldown prevents double-fire on mobile touchend / fast taps */
    const now = performance.now();
    if (now - (this._lastMorphTime || 0) < 500) return;
    this._lastMorphTime = now;

    if (this._state === 'morphing') {
      /* Snap to current target immediately so next morph starts clean */
      const cur  = this._cur;
      const home = this._homes[this._targetShape];
      for (let i = 0; i < this._N * 3; i++) { cur[i] = home[i]; }
      this._vel.fill(0);
      this._curShape = this._targetShape;
    }

    /* Advance to next shape in cycle */
    this._targetShape = (this._curShape + 1) % 3;
    this._state       = 'morphing';
    this._stateAge    = 0;

    /* Zero out all velocity so particles don't burst/scatter. They will just smoothly glide to the next shape. */
    const N = this._N, vel = this._vel;
    for (let i = 0; i < N * 3; i++) {
      vel[i] = 0;
    }

    console.log(`[BouldScene] Morphing ${this._curShape} → ${this._targetShape}`);
  }

  /* ════════════════════════════════════════════════════════════
     POINTER HANDLING — drag vs click discrimination
  ════════════════════════════════════════════════════════════ */
  _clientXY(e) {
    if (e.touches && e.touches.length)
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches && e.changedTouches.length)
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  _handlePtrDown(e) {
    if (!this._points) return;
    const { x } = this._clientXY(e);
    const mob   = window.innerWidth < 768;
    if (!mob && x / window.innerWidth < 0.28) return;
    this._ptrDown   = true;
    this._ptrDownX  = x;
    this._dragRotY0 = this._rotY;
    this._dragging  = false;
    this._dragDist  = 0;
  }

  _handlePtrMove(e) {
    if (!this._ptrDown) return;
    const { x } = this._clientXY(e);
    const deltaX = x - this._ptrDownX;
    this._dragDist = Math.abs(deltaX);
    if (this._dragDist > DRAG_PX) {
      this._dragging = true;
      if (e.cancelable) e.preventDefault();
      const rotDelta   = (deltaX / window.innerWidth) * Math.PI * 1.5;
      this._rotYTarget = Math.max(-MAX_ROT_Y, Math.min(MAX_ROT_Y, this._dragRotY0 + rotDelta));
    }
  }

  _handlePtrUp(e) {
    if (!this._ptrDown) return;
    this._ptrDown = false;
    if (!this._dragging) {
      const { x } = this._clientXY(e);
      const mob   = window.innerWidth < 768;
      if (mob || x / window.innerWidth > 0.28) {
        /* Only trigger morph when idle or already morphing — not during intro */
        if (this._state === 'idle' || this._state === 'morphing') {
          this._doMorphToNext();
        }
      }
    }
    this._dragging = false;
  }

  /* ════════════════════════════════════════════════════════════
     PHYSICS UPDATE
  ════════════════════════════════════════════════════════════ */
  _physics(dt) {
    if (!this._points || !this._group) return;

    const N     = this._N;
    const cur   = this._cur;
    const vel   = this._vel;
    const state = this._state;
    this._stateAge += dt;

    /* ── State transitions ────────────────────────────────── */
    if (state === 'intro' && this.entranceProgress >= 1 && this._stateAge > 1.3) {
      /* Check if particles have settled at shape 0 */
      let maxD = 0;
      const home0 = this._homes[0];
      const probe = Math.min(150, N);
      for (let i = 0; i < probe; i++) {
        const i3 = i * 3;
        const d  = Math.abs(cur[i3] - home0[i3]) + Math.abs(cur[i3+1] - home0[i3+1]);
        if (d > maxD) maxD = d;
      }
      if (maxD < SNAP_DIST * 2) {
        this._state    = 'idle';
        this._stateAge = 0;
        this._curShape = 0;
      }
    }

    if (state === 'morphing') {
      const forceSnap = this._stateAge > 4.5; /* guarantee we never get stuck — extended for mobile */
      if (this._stateAge > 0.35) {
        /* Check convergence toward target shape */
        const homeT = this._homes[this._targetShape];
        let maxD    = 0;
        const probe = Math.min(150, N);
        for (let i = 0; i < probe; i++) {
          const i3 = i * 3;
          const d  = Math.abs(cur[i3] - homeT[i3]) + Math.abs(cur[i3+1] - homeT[i3+1]);
          if (d > maxD) maxD = d;
        }
        if (maxD < 0.12 || forceSnap) {
          /* Seamless handoff to idle state instead of aggressively snapping */
          this._curShape    = this._targetShape;
          this._state       = 'idle';
          this._stateAge    = 0;
        }
      }
    }

    /* Colour blend removed per user request: everything remains PALETTES[0] */

    /* Skip per-particle work if truly idle (no forces active) */
    if (state === 'idle') {
      /* Still apply repulsion while idle */
      const gx  = this._group.position.x;
      const gy  = this._group.position.y;
      const mwx = this.target.x * 4.2 - gx;
      const mwy = this.target.y * 2.5 - gy;
      const home = this._homes[this._curShape];
      for (let i = 0; i < N; i++) {
        const i3 = i * 3;
        const rdx = cur[i3] - mwx, rdy = cur[i3+1] - mwy;
        const rd2 = rdx*rdx + rdy*rdy;
        if (rd2 < REPULSE_R2 && rd2 > 0.0001) {
          const f = (REPULSE_R2 - rd2) * REPULSE_MAG;
          vel[i3]     += rdx * f * dt;
          vel[i3 + 1] += rdy * f * dt;
        }
        /* Continuous soft restore spring so particles return after hover leaves */
        vel[i3]     += (home[i3]     - cur[i3])     * 4.0 * dt;
        vel[i3 + 1] += (home[i3 + 1] - cur[i3 + 1]) * 4.0 * dt;
        vel[i3 + 2] += (home[i3 + 2] - cur[i3 + 2]) * 4.0 * dt;
        vel[i3]     *= VEL_DRAG_IDLE;
        vel[i3 + 1] *= VEL_DRAG_IDLE;
        vel[i3 + 2] *= VEL_DRAG_IDLE;
        cur[i3]     += vel[i3]     * dt * 60;
        cur[i3 + 1] += vel[i3 + 1] * dt * 60;
        cur[i3 + 2] += vel[i3 + 2] * dt * 60;
      }
      this._points.geometry.attributes.position.needsUpdate     = true;
      this._pointsGlow.geometry.attributes.position.needsUpdate = true;
      this._syncAccent();
      return;
    }

    const doHome = state === 'intro' || state === 'morphing';
    const homeK  = state === 'intro'
      ? HOME_K_INTRO * Math.min(this._stateAge * 2.5, 1.0)
      : HOME_K_MORPH * Math.min(this._stateAge * 1.5, 1.0);

    const mob    = window.innerWidth < 768;
    /* Constant, extremely heavy drag guarantees zero bouncing. Particles just slide perfectly to their target.
       Mobile uses heavier morph drag to prevent overshoot at lower framerates. */
    const drag   = state === 'morphing'
      ? (mob ? 0.84 : 0.78)
      : (state === 'intro' ? 0.90 : VEL_DRAG_IDLE);
      
    const home   = state === 'morphing' ? this._homes[this._targetShape] : this._homes[0];

    /* Cursor repulsion also active during intro for nice effect */
    const gx  = this._group.position.x;
    const gy  = this._group.position.y;
    const mwx = this.target.x * 4.2 - gx;
    const mwy = this.target.y * 2.5 - gy;

    for (let i = 0; i < N; i++) {
      const i3 = i * 3;

      /* ① Home spring */
      if (doHome && homeK > 0) {
        vel[i3]     += (home[i3]     - cur[i3])     * homeK * dt;
        vel[i3 + 1] += (home[i3 + 1] - cur[i3 + 1]) * homeK * dt;
        vel[i3 + 2] += (home[i3 + 2] - cur[i3 + 2]) * homeK * dt;
      }

      /* ② Cursor repulsion (intro only — during morph, skip for cleaner motion) */
      if (state === 'intro') {
        const rdx = cur[i3] - mwx, rdy = cur[i3+1] - mwy;
        const rd2 = rdx*rdx + rdy*rdy;
        if (rd2 < REPULSE_R2 && rd2 > 0.0001) {
          const f = (REPULSE_R2 - rd2) * REPULSE_MAG;
          vel[i3]     += rdx * f * dt;
          vel[i3 + 1] += rdy * f * dt;
        }
      }

      /* ③ Drag */
      vel[i3]     *= drag;
      vel[i3 + 1] *= drag;
      vel[i3 + 2] *= drag;

      /* ④ Integrate */
      cur[i3]     += vel[i3]     * dt * 60;
      cur[i3 + 1] += vel[i3 + 1] * dt * 60;
      cur[i3 + 2] += vel[i3 + 2] * dt * 60;
    }

    this._points.geometry.attributes.position.needsUpdate     = true;
    this._pointsGlow.geometry.attributes.position.needsUpdate = true;
    this._syncAccent();
  }

  /* Sync the accent (purple) layer to current positions */
  _syncAccent() {
    const cur  = this._cur, curB = this._curB, aIdx = this._accentIdx;
    for (let i = 0; i < this._accentN; i++) {
      const s = aIdx[i];
      curB[i*3]   = cur[s*3];
      curB[i*3+1] = cur[s*3+1];
      curB[i*3+2] = cur[s*3+2];
    }
    this._pointsAccent.geometry.attributes.position.needsUpdate = true;
  }

  /* ════════════════════════════════════════════════════════════
     STARFIELD
  ════════════════════════════════════════════════════════════ */
  _buildStarfield() {
    const mob = window.innerWidth < 768;
    const mkL = (n, xW, yW, zN, zF, sz, col, op) => {
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos[i*3]   = (Math.random()-0.5)*xW;
        pos[i*3+1] = (Math.random()-0.5)*yW;
        pos[i*3+2] = zN + Math.random()*(zF-zN);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      return new THREE.Points(g, new THREE.PointsMaterial({
        size: sz, color: col, transparent: true, opacity: op, sizeAttenuation: true,
      }));
    };
    this.stars1 = mkL(mob?900:2800,  30,18, -9,-2,   0.009, 0xffffff, 0.28);
    this.stars2 = mkL(mob?280:800,   28,16, -8,-1.5, 0.018, 0x8B5CF6, 0.18);
    this.stars3 = mkL(mob?60:160,    26,14, -8,-2,   0.044, 0xC4B5FD, 0.09);
    this.scene.add(this.stars1, this.stars2, this.stars3);
  }

  /* ════════════════════════════════════════════════════════════
     STANDARD EVENTS
  ════════════════════════════════════════════════════════════ */
  _handleMouseMove(e) {
    this.mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    const mob  = window.innerWidth < 768;
    const relX = e.clientX / window.innerWidth;
    this.canvas.style.cursor = ((mob || relX > 0.28) && this._points) ? 'pointer' : 'default';
  }

  _handleResize() {
    if (!this.renderer) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  _handleScroll() {
    if (!this.revealed && window.scrollY > 0) this._triggerReveal();
    const hero = document.querySelector('.bould-hero');
    if (hero) this.scrollProgress = Math.max(0, Math.min(window.scrollY / hero.offsetHeight, 1));
  }

  /* ════════════════════════════════════════════════════════════
     RENDER LOOP
  ════════════════════════════════════════════════════════════ */
  _loop() {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(() => this._loop());
    if (!this.renderer) return;

    const dt = Math.min(this.clock.getDelta(), 0.033);
    const t  = this.clock.elapsedTime;

    /* Smooth mouse */
    this.target.x += (this.mouse.x - this.target.x) * 0.05;
    this.target.y += (this.mouse.y - this.target.y) * 0.05;

    /* Entrance fade-in */
    if (this.revealed && this.entranceProgress < 1) {
      this.entranceProgress = Math.min(this.entranceProgress + dt * 0.50, 1);
    }

    /* Opacity (waits for models to load) */
    if (this._points) {
      const op = easeOutQuart(this.entranceProgress);
      this._opacity                      = op;
      this._points.material.opacity      = op;
      this._pointsAccent.material.opacity = op * 0.62;
      this._pointsGlow.material.opacity   = op * 0.18;
    }

    /* ── Clamped rotation — no auto-spin ─── */
    if (!this._dragging) {
      this._rotYTarget = this.target.x * MAX_ROT_Y * 0.78;
    }
    this._rotYTarget = Math.max(-MAX_ROT_Y, Math.min(MAX_ROT_Y, this._rotYTarget));
    this._rotY  += (this._rotYTarget - this._rotY)  * (this._dragging ? 0.28 : 0.07);
    this._rotXTarget = this.target.y * MAX_ROT_X;
    this._rotX  += (this._rotXTarget - this._rotX)  * 0.06;

    if (this._group && this._points) {
      const mob    = window.innerWidth < 768;
      const ox     = mob ? 0 : 2.2;
      const floatY = Math.sin(t * 0.40) * 0.065 - this.scrollProgress * 0.5;
      this._group.position.x = ox;
      this._group.position.y = floatY;
      this._group.rotation.y = this._rotY;
      this._group.rotation.x = this._rotX;
    }

    this._physics(dt);

    /* Starfield */
    if (this.stars1) {
      this.stars1.rotation.y = t * 0.0016;
      this.stars1.rotation.x = t * 0.0008;
      this.stars1.material.opacity = 0.28 + Math.sin(t * 0.36) * 0.04;
    }
    if (this.stars2) {
      this.stars2.rotation.y = -t * 0.0022;
      this.stars2.rotation.z =  t * 0.0009;
      this.stars2.material.opacity = 0.18 + Math.sin(t * 0.62 + 1.1) * 0.03;
    }
    if (this.stars3) {
      this.stars3.rotation.y = t * 0.0034;
      this.stars3.material.opacity = 0.09 + Math.sin(t * 0.30 + 2.2) * 0.04;
    }

    this.renderer.render(this.scene, this.camera);
  }

  /* ════════════════════════════════════════════════════════════
     DESTROY
  ════════════════════════════════════════════════════════════ */
  destroy() {
    this.alive = false;
    if (this._revealTimer) clearTimeout(this._revealTimer);
    cancelAnimationFrame(this.raf);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('resize',    this._onResize);
    window.removeEventListener('scroll',    this._onScroll);
    window.removeEventListener('mouseup',   this._onPtrUp);
    this.canvas.removeEventListener('mousedown',  this._onPtrDown);
    this.canvas.removeEventListener('mousemove',  this._onPtrMove);
    this.canvas.removeEventListener('touchstart', this._onPtrDown);
    this.canvas.removeEventListener('touchmove',  this._onPtrMove);
    this.canvas.removeEventListener('touchend',   this._onPtrUp);
    if (this.renderer) this.renderer.dispose();
  }
}

/* ── Boot ──────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('bould-hero-canvas');
  if (!canvas) return;

  /* Read three model URLs from data attributes */
  const urls = [
    canvas.getAttribute('data-model-1') || null,
    canvas.getAttribute('data-model-2') || null,
    canvas.getAttribute('data-model-3') || null,
  ];
  console.log('[BouldScene] boot — models:', urls);
  window.__bouldScene = new BouldScene(canvas, urls);
});
