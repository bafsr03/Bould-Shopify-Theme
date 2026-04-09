/**
 * BOULD 3D Scene — Three.js hero
 * - Three-layer starfield background (subtle space aesthetic)
 * - 3D logo loaded from GLB/OBJ, fades in
 * - Click the logo → vertex-noise distortion morph, snaps back
 * - Fully responsive: centred on mobile, offset right on desktop
 */
/*
 * esm.sh is used because Three.js addon modules use bare import specifiers
 * ("import { ... } from 'three'") that browsers reject without an import map.
 */
import * as THREE from 'https://esm.sh/three@0.161.0';
import { FontLoader }      from 'https://esm.sh/three@0.161.0/examples/jsm/loaders/FontLoader.js';
import { TextGeometry }    from 'https://esm.sh/three@0.161.0/examples/jsm/geometries/TextGeometry.js';
import { OBJLoader }       from 'https://esm.sh/three@0.161.0/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader }      from 'https://esm.sh/three@0.161.0/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'https://esm.sh/three@0.161.0/examples/jsm/environments/RoomEnvironment.js';

class BouldScene {
  constructor(canvasEl, objUrl) {
    this.canvas  = canvasEl;
    this.objUrl  = objUrl || null;
    this.mouse   = { x: 0, y: 0 };
    this.target  = { x: 0, y: 0 };
    this.bMesh   = null;
    this.raf     = null;
    this.alive   = true;

    /* Entrance + scroll */
    this.revealed         = false;
    this.entranceProgress = 0;
    this.scrollProgress   = 0;
    this._revealTimer     = null;

    /* Model */
    this._baseScale   = 1;
    this._entranceMat = null;

    /* Distortion */
    this._distortPhase    = 0;
    this._distortProgress = 0;
    this._distortSeed     = 0;
    this._distortOrigPos  = [];
    this._distortMeshes   = [];

    /* Raycaster */
    this._raycaster = new THREE.Raycaster();

    this._resize       = this._onResize.bind(this);
    this._mouseMove    = this._onMouseMove.bind(this);
    this._scrollReveal = this._onScrollReveal.bind(this);
    this._onClick      = this._onCanvasClick.bind(this);

    this._init();
  }

  /* ─── Init ─────────────────────────────────────────────────────────── */
  _init() {
    requestAnimationFrame(() => {
      const w = this.canvas.clientWidth  || window.innerWidth;
      const h = this.canvas.clientHeight || window.innerHeight;

      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(w, h, false);
      this.renderer.toneMapping         = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.4;
      this.renderer.outputColorSpace    = THREE.SRGBColorSpace;

      this.scene  = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
      this.camera.position.set(0, 0, 6);

      const pmrem = new THREE.PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader();
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();

      this._setupLights();
      this._createStarfield();

      if (this.objUrl) { this._loadModel(); } else { this._loadFont(); }

      window.addEventListener('mousemove', this._mouseMove,    { passive: true });
      window.addEventListener('resize',    this._resize,       { passive: true });
      window.addEventListener('scroll',    this._scrollReveal, { passive: true });
      this.canvas.addEventListener('click', this._onClick);

      this._revealTimer = setTimeout(() => this._triggerReveal(), 1500);
      this._loop();
    });
  }

  _triggerReveal() {
    if (this.revealed) return;
    this.revealed = true;
    if (this._revealTimer) { clearTimeout(this._revealTimer); this._revealTimer = null; }
  }

  /* ─── Lights ────────────────────────────────────────────────────────── */
  _setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const key = new THREE.PointLight(0xA78BFA, 150, 30);
    key.position.set(4, 4, 4);
    this.scene.add(key);
    this.keyLight = key;

    const fill = new THREE.PointLight(0x4C1D95, 100, 25);
    fill.position.set(-5, 1, 2);
    this.scene.add(fill);

    const rim = new THREE.PointLight(0x6366F1, 80, 20);
    rim.position.set(0, -4, -3);
    this.scene.add(rim);

    const accent = new THREE.PointLight(0xEC4899, 40, 15);
    accent.position.set(2, -2, 4);
    this.scene.add(accent);
  }

  /* ─── Starfield ─────────────────────────────────────────────────────── */
  _createStarfield() {
    const mob = window.innerWidth < 768;

    const makeGeo = (n, xW, yW, zMin, zMax) => {
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos[i * 3]     = (Math.random() - 0.5) * xW;
        pos[i * 3 + 1] = (Math.random() - 0.5) * yW;
        pos[i * 3 + 2] = zMin + Math.random() * (zMax - zMin);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      return g;
    };

    /* Layer 1 — tiny white stars across full canvas */
    this.stars1 = new THREE.Points(
      makeGeo(mob ? 900 : 2800, 28, 16, -6, -1),
      new THREE.PointsMaterial({ size: 0.011, color: 0xffffff, transparent: true, opacity: 0.45, sizeAttenuation: true })
    );
    this.scene.add(this.stars1);

    /* Layer 2 — medium purple stars */
    this.stars2 = new THREE.Points(
      makeGeo(mob ? 280 : 850, 26, 14, -5, -0.5),
      new THREE.PointsMaterial({ size: 0.022, color: 0x8B5CF6, transparent: true, opacity: 0.30, sizeAttenuation: true })
    );
    this.scene.add(this.stars2);

    /* Layer 3 — sparse large glowing dots */
    this.stars3 = new THREE.Points(
      makeGeo(mob ? 55 : 160, 24, 12, -5, -1),
      new THREE.PointsMaterial({ size: 0.055, color: 0xC4B5FD, transparent: true, opacity: 0.14, sizeAttenuation: true })
    );
    this.scene.add(this.stars3);
  }

  /* ─── Model loaders ─────────────────────────────────────────────────── */
  _loadModel() {
    const url = this.objUrl;
    const ext = url.split('?')[0].toLowerCase();
    if (ext.endsWith('.glb') || ext.endsWith('.gltf')) { this._loadGLTF(url); }
    else { this._loadOBJ(url); }
  }

  _finaliseModel(root) {
    if (!this.alive) return;

    const mat = new THREE.MeshStandardMaterial({
      color: 0xCCCCCC, metalness: 0.96, roughness: 0.08,
      envMapIntensity: 2.2, transparent: true, opacity: 0,
    });
    this._entranceMat  = mat;
    this._distortMeshes = [];

    root.traverse((child) => {
      if (child.isMesh) {
        child.material      = mat;
        child.castShadow    = false;
        child.receiveShadow = false;
        this._distortMeshes.push(child);
      }
    });

    const box    = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    if (!maxDim || !isFinite(maxDim)) {
      console.warn('[BouldScene] No renderable geometry — falling back to font');
      this._loadFont();
      return;
    }

    root.position.copy(center).negate();
    root.scale.setScalar(1);
    this._baseScale = Math.min(Math.max(2 / maxDim, 0.01), 20);

    this.bMesh = new THREE.Group();
    this.bMesh.add(root);
    this.scene.add(this.bMesh);
    this._storeOrigPositions();
    console.log('[BouldScene] Model ready, baseScale:', this._baseScale);
  }

  _loadGLTF(url) {
    console.log('[BouldScene] Loading GLB:', url);
    new GLTFLoader().load(
      url,
      (g) => { if (!this.alive) return; console.log('[BouldScene] GLTF ✓'); this._finaliseModel(g.scene); },
      (x) => { if (x.total) console.log('[BouldScene] GLTF', Math.round(x.loaded / x.total * 100) + '%'); },
      (e) => { console.warn('[BouldScene] GLTF failed:', e); this._loadFont(); }
    );
  }

  _loadOBJ(url) {
    console.log('[BouldScene] Loading OBJ:', url);
    new OBJLoader().load(
      url,
      (o) => { if (!this.alive) return; console.log('[BouldScene] OBJ ✓'); this._finaliseModel(o); },
      (x) => { if (x.total) console.log('[BouldScene] OBJ', Math.round(x.loaded / x.total * 100) + '%'); },
      (e) => { console.warn('[BouldScene] OBJ failed:', e); this._loadFont(); }
    );
  }

  _loadFont() {
    console.log('[BouldScene] Font fallback…');
    new FontLoader().load(
      'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/fonts/helvetiker_bold.typeface.json',
      (font) => {
        if (!this.alive) return;
        const geo = new TextGeometry('B', {
          font, size: 2, depth: 0.45, curveSegments: 48,
          bevelEnabled: true, bevelThickness: 0.055, bevelSize: 0.04, bevelSegments: 12,
        });
        geo.computeBoundingBox();
        geo.center();
        const mat = new THREE.MeshStandardMaterial({
          color: 0xCCCCCC, metalness: 0.96, roughness: 0.08,
          envMapIntensity: 2.2, transparent: true, opacity: 0,
        });
        this._entranceMat   = mat;
        this.bMesh          = new THREE.Mesh(geo, mat);
        this._baseScale     = 1;
        this._distortMeshes = [this.bMesh];
        this.scene.add(this.bMesh);
        this._storeOrigPositions();
        console.log('[BouldScene] Font "B" ready');
      },
      undefined,
      (e) => console.warn('[BouldScene] Font failed:', e)
    );
  }

  /* ─── Vertex distortion ─────────────────────────────────────────────── */
  _storeOrigPositions() {
    this._distortOrigPos = [];
    for (const mesh of this._distortMeshes) {
      const attr = mesh.geometry.attributes.position;
      if (attr) this._distortOrigPos.push({ geo: mesh.geometry, orig: attr.array.slice() });
    }
  }

  _startDistortion() {
    if (this._distortPhase !== 0) return;
    this._distortPhase    = 1;
    this._distortProgress = 0;
    this._distortSeed     = Math.random() * 100;
  }

  /* Layered deterministic noise */
  _noise(x, y, z) {
    return (
      Math.sin(x * 2.8 + 1.3) * Math.cos(y * 3.1 + 0.7) * Math.sin(z * 2.0 + 2.1) * 0.50 +
      Math.sin(x * 5.1 + 0.4) * Math.cos(y * 4.7 + 1.5) * Math.cos(z * 5.3 + 0.9) * 0.30 +
      Math.sin(x * 8.3 + 2.2) * Math.sin(y * 7.9 + 0.3) * Math.cos(z * 9.1 + 1.7) * 0.20
    );
  }

  _updateDistortion() {
    if (this._distortPhase === 0 || !this._distortOrigPos.length) return;

    const GROW   = 0.033; // ~0.7s to peak
    const SHRINK = 0.021; // ~1.1s to return
    const MAX_D  = 0.26;

    if (this._distortPhase === 1) {
      this._distortProgress += GROW;
      if (this._distortProgress >= 1) { this._distortProgress = 1; this._distortPhase = 2; }
    } else {
      this._distortProgress -= SHRINK;
      if (this._distortProgress <= 0) { this._distortProgress = 0; this._distortPhase = 0; }
    }

    const p      = this._distortProgress;
    const eased  = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    const strength = MAX_D * eased;
    const s      = this._distortSeed;

    for (const { geo, orig } of this._distortOrigPos) {
      const attr  = geo.attributes.position;
      const arr   = attr.array;
      const count = orig.length / 3;
      for (let i = 0; i < count; i++) {
        const ox = orig[i * 3], oy = orig[i * 3 + 1], oz = orig[i * 3 + 2];
        arr[i * 3]     = ox + this._noise(ox + s,       oy + 1.0 + s, oz + 2.0    ) * strength;
        arr[i * 3 + 1] = oy + this._noise(ox + 3.0 + s, oy + 0.5,     oz + 1.5 + s) * strength;
        arr[i * 3 + 2] = oz + this._noise(ox + 1.5,     oy + 2.0 + s, oz + s      ) * strength;
      }
      attr.needsUpdate = true;
      geo.computeBoundingSphere();
    }
  }

  /* ─── Click ─────────────────────────────────────────────────────────── */
  _onCanvasClick(e) {
    if (!this.bMesh || !this.renderer) return;
    const r = this.canvas.getBoundingClientRect();
    const x =  ((e.clientX - r.left) / r.width)  * 2 - 1;
    const y = -((e.clientY - r.top)  / r.height) * 2 + 1;
    this._raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    if (this._raycaster.intersectObject(this.bMesh, true).length > 0) {
      this._startDistortion();
    }
  }

  /* ─── Events ────────────────────────────────────────────────────────── */
  _onMouseMove(e) {
    this.mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    /* Pointer cursor when hovering the model */
    if (this.bMesh && this.camera) {
      this._raycaster.setFromCamera(new THREE.Vector2(this.mouse.x, this.mouse.y), this.camera);
      this.canvas.style.cursor =
        this._raycaster.intersectObject(this.bMesh, true).length > 0 ? 'pointer' : 'default';
    }
  }

  _onResize() {
    if (!this.renderer) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  _onScrollReveal() {
    if (!this.revealed && window.scrollY > 0) this._triggerReveal();
    const hero = document.querySelector('.bould-hero');
    if (hero) this.scrollProgress = Math.max(0, Math.min(window.scrollY / hero.offsetHeight, 1));
  }

  /* ─── Helpers ───────────────────────────────────────────────────────── */
  _easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

  /* ─── Render loop ───────────────────────────────────────────────────── */
  _loop() {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(() => this._loop());
    if (!this.renderer) return;

    const t   = Date.now() * 0.001;
    const mob = window.innerWidth < 768;

    this.target.x += (this.mouse.x - this.target.x) * 0.04;
    this.target.y += (this.mouse.y - this.target.y) * 0.04;

    if (this.revealed && this.entranceProgress < 1) {
      this.entranceProgress = Math.min(this.entranceProgress + 0.012, 1);
    }

    /* Logo */
    if (this.bMesh) {
      const ep = this._easeOutQuart(this.entranceProgress);

      /* On mobile: centred + slightly smaller; desktop: offset right */
      const targetX  = mob ? 0    : 2.2;
      const scaleMul = mob ? 0.72 : 1.0;

      this.bMesh.rotation.y = t * 0.28 + this.target.x * 0.35;
      this.bMesh.rotation.x = this.target.y * 0.2;
      this.bMesh.position.x = targetX;
      this.bMesh.position.y = Math.sin(t * 0.6) * 0.12 - this.scrollProgress * 0.7;
      this.bMesh.scale.setScalar(this._baseScale * scaleMul);

      if (this._entranceMat) this._entranceMat.opacity = Math.min(1, ep);
    }

    this._updateDistortion();

    if (this.keyLight) {
      this.keyLight.position.x = Math.sin(t * 0.4) * 5;
      this.keyLight.position.z = Math.cos(t * 0.4) * 4;
    }

    /* Stars — slow drift + subtle opacity twinkle */
    if (this.stars1) {
      this.stars1.rotation.y = t * 0.0025;
      this.stars1.rotation.x = t * 0.0010;
      this.stars1.material.opacity = 0.45 + Math.sin(t * 0.5) * 0.04;
    }
    if (this.stars2) {
      this.stars2.rotation.y = -t * 0.0032;
      this.stars2.rotation.z =  t * 0.0015;
      this.stars2.material.opacity = 0.30 + Math.sin(t * 0.9 + 1.2) * 0.05;
    }
    if (this.stars3) {
      this.stars3.rotation.y = t * 0.0040;
      this.stars3.material.opacity = 0.14 + Math.sin(t * 0.4 + 2.5) * 0.06;
    }

    this.renderer.render(this.scene, this.camera);
  }

  /* ─── Cleanup ───────────────────────────────────────────────────────── */
  destroy() {
    this.alive = false;
    if (this._revealTimer) clearTimeout(this._revealTimer);
    cancelAnimationFrame(this.raf);
    window.removeEventListener('mousemove', this._mouseMove);
    window.removeEventListener('resize',    this._resize);
    window.removeEventListener('scroll',    this._scrollReveal);
    this.canvas.removeEventListener('click', this._onClick);
    if (this.renderer) this.renderer.dispose();
  }
}

/* Boot */
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('bould-hero-canvas');
  if (!canvas) return;
  const objUrl = canvas.dataset.objUrl || null;
  console.log('[BouldScene] canvas found, objUrl:', objUrl || '(none — font fallback)');
  window.__bouldScene = new BouldScene(canvas, objUrl);
});
