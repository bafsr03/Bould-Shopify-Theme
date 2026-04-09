/**
 * BOULD 3D Scene — Three.js hero
 * Loads the brand logo as a GLB/GLTF or OBJ (auto-detected by extension),
 * or generates a "B" via TextGeometry as a final fallback.
 *
 * - Particles + canvas are visible immediately on page load.
 * - The 3D logo springs in when the user first scrolls, OR after 1.5 s (whichever is first).
 * - Scroll progress drives a vertical parallax while the hero is in view.
 */
/*
 * esm.sh is used instead of cdn.jsdelivr.net because Three.js addon modules
 * (GLTFLoader, OBJLoader, FontLoader, etc.) use bare import specifiers
 * ("import { ... } from 'three'") which browsers reject without an import map.
 * esm.sh rewrites all bare imports to full URLs automatically.
 */
import * as THREE from 'https://esm.sh/three@0.161.0';
import { FontLoader } from 'https://esm.sh/three@0.161.0/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'https://esm.sh/three@0.161.0/examples/jsm/geometries/TextGeometry.js';
import { OBJLoader } from 'https://esm.sh/three@0.161.0/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'https://esm.sh/three@0.161.0/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'https://esm.sh/three@0.161.0/examples/jsm/environments/RoomEnvironment.js';

class BouldScene {
  constructor(canvasEl, objUrl) {
    this.canvas   = canvasEl;
    this.objUrl   = objUrl || null;
    this.mouse    = { x: 0, y: 0 };
    this.target   = { x: 0, y: 0 };
    this.bMesh    = null;
    this.raf      = null;
    this.alive    = true;

    /* Entrance + scroll state */
    this.revealed         = false; // true once entrance animation starts
    this.entranceProgress = 0;     // 0 → 1 drives spring-in
    this.scrollProgress   = 0;     // 0 → 1 through hero (parallax)
    this._revealTimer     = null;

    /* Set after OBJ/font is loaded */
    this._baseScale = 1;

    this._resize       = this._onResize.bind(this);
    this._mouseMove    = this._onMouseMove.bind(this);
    this._scrollReveal = this._onScrollReveal.bind(this);

    this._init();
  }

  /* ─── Init ─────────────────────────────────────────────────────────── */
  _init() {
    /* Use a rAF to read canvas dimensions after layout (avoids 0×0 on load) */
    requestAnimationFrame(() => {
      const w = this.canvas.clientWidth  || Math.round(window.innerWidth  * 0.52);
      const h = this.canvas.clientHeight || window.innerHeight;

      /* Renderer */
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true,
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(w, h, false);
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.4;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;

      /* Scene & camera */
      this.scene  = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
      this.camera.position.set(0, 0, 6);

      /* Room environment for metal reflections */
      const pmrem  = new THREE.PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader();
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environment = envTex;
      pmrem.dispose();

      this._setupLights();
      this._createParticles();

      /* Load logo — auto-detect GLB/GLTF vs OBJ by extension */
      if (this.objUrl) {
        this._loadModel();
      } else {
        this._loadFont();
      }

      /* Events */
      window.addEventListener('mousemove', this._mouseMove,    { passive: true });
      window.addEventListener('resize',    this._resize,       { passive: true });
      window.addEventListener('scroll',    this._scrollReveal, { passive: true });

      /* Auto-reveal: if user hasn't scrolled after 1.5 s, start the entrance anyway */
      this._revealTimer = setTimeout(() => this._triggerReveal(), 1500);

      /* Start loop */
      this._loop();
    });
  }

  /* Shared reveal trigger — called on first scroll OR by the timer */
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

    const fill = new THREE.PointLight(0x4C1D95, 100, 25);
    fill.position.set(-5, 1, 2);
    this.scene.add(fill);

    const rim = new THREE.PointLight(0x6366F1, 80, 20);
    rim.position.set(0, -4, -3);
    this.scene.add(rim);

    const accent = new THREE.PointLight(0xEC4899, 40, 15);
    accent.position.set(2, -2, 4);
    this.scene.add(accent);

    this.keyLight = key;
  }

  /* ─── Model Loader (auto-detects GLB/GLTF vs OBJ) ──────────────────── */
  _loadModel() {
    const url = this.objUrl;
    const ext = url.split('?')[0].toLowerCase();
    if (ext.endsWith('.glb') || ext.endsWith('.gltf')) {
      this._loadGLTF(url);
    } else {
      this._loadOBJ(url);
    }
  }

  /* ─── Shared mesh finaliser ─────────────────────────────────────────── */
  _finaliseModel(root) {
    if (!this.alive) return;

    const mat = new THREE.MeshStandardMaterial({
      color: 0xCCCCCC,
      metalness: 0.96,
      roughness: 0.08,
      envMapIntensity: 2.2,
    });

    root.traverse((child) => {
      if (child.isMesh) {
        child.material = mat;
        child.castShadow    = false;
        child.receiveShadow = false;
      }
    });

    const box    = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    if (!maxDim || !isFinite(maxDim)) {
      console.warn('[BouldScene] Model has no renderable geometry — falling back to font');
      this._loadFont();
      return;
    }

    root.position.copy(center).negate();
    root.scale.setScalar(1);

    this._baseScale = 2 / maxDim;
    this._baseScale = Math.min(Math.max(this._baseScale, 0.01), 20);

    this.bMesh = new THREE.Group();
    this.bMesh.add(root);
    this.bMesh.scale.setScalar(0); // entrance animation will scale up
    this.scene.add(this.bMesh);
    console.log('[BouldScene] Model added to scene, baseScale:', this._baseScale);
  }

  /* ─── GLB / GLTF Loader ─────────────────────────────────────────────── */
  _loadGLTF(url) {
    console.log('[BouldScene] Loading GLB/GLTF from:', url);
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        if (!this.alive) return;
        console.log('[BouldScene] GLTF loaded ✓');
        this._finaliseModel(gltf.scene);
      },
      (xhr) => {
        if (xhr.total) {
          console.log('[BouldScene] GLTF', Math.round(xhr.loaded / xhr.total * 100) + '% loaded');
        }
      },
      (err) => {
        console.warn('[BouldScene] GLTF load failed, falling back to font "B":', err);
        this._loadFont();
      }
    );
  }

  /* ─── OBJ Loader ────────────────────────────────────────────────────── */
  _loadOBJ(url) {
    console.log('[BouldScene] Loading OBJ from:', url);
    const loader = new OBJLoader();
    loader.load(
      url,
      (obj) => {
        if (!this.alive) return;
        console.log('[BouldScene] OBJ loaded ✓');
        this._finaliseModel(obj);
      },
      (xhr) => {
        if (xhr.total) {
          console.log('[BouldScene] OBJ', Math.round(xhr.loaded / xhr.total * 100) + '% loaded');
        }
      },
      (err) => {
        console.warn('[BouldScene] OBJ load failed, falling back to font "B":', err);
        this._loadFont();
      }
    );
  }

  /* ─── Font Fallback ─────────────────────────────────────────────────── */
  _loadFont() {
    console.log('[BouldScene] Loading font fallback…');
    const loader = new FontLoader();
    loader.load(
      'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/fonts/helvetiker_bold.typeface.json',
      (font) => {
        if (!this.alive) return;

        const geo = new TextGeometry('B', {
          font,
          size: 2,
          depth: 0.45,
          curveSegments: 48,
          bevelEnabled: true,
          bevelThickness: 0.055,
          bevelSize: 0.04,
          bevelSegments: 12,
        });
        geo.computeBoundingBox();
        geo.center();

        const mat = new THREE.MeshStandardMaterial({
          color: 0xCCCCCC,
          metalness: 0.96,
          roughness: 0.08,
          envMapIntensity: 2.2,
        });

        this.bMesh       = new THREE.Mesh(geo, mat);
        this._baseScale  = 1;
        this.bMesh.scale.setScalar(0); // entrance animation scales up
        this.scene.add(this.bMesh);
        console.log('[BouldScene] Font "B" added to scene');
      },
      undefined,
      (err) => console.warn('[BouldScene] Font load failed:', err)
    );
  }

  /* ─── Particles ─────────────────────────────────────────────────────── */
  _createParticles() {
    const count = window.innerWidth < 768 ? 600 : 1800;
    const pos   = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const r     = 3.5 + Math.random() * 5;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
      pos[i * 3 + 2] = r * Math.cos(phi) * 0.5;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    this.particles = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.018, color: 0x8B5CF6,
      transparent: true, opacity: 0.65, sizeAttenuation: true,
    }));
    this.scene.add(this.particles);

    const geo2 = geo.clone();
    this.particles2 = new THREE.Points(geo2, new THREE.PointsMaterial({
      size: 0.008, color: 0xC4B5FD,
      transparent: true, opacity: 0.3, sizeAttenuation: true,
    }));
    this.particles2.rotation.y = Math.PI / 3;
    this.scene.add(this.particles2);
  }

  /* ─── Easing ────────────────────────────────────────────────────────── */
  _easeOutElastic(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  }

  _easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  /* ─── Scroll ────────────────────────────────────────────────────────── */
  _onScrollReveal() {
    /* Trigger entrance on first scroll */
    if (!this.revealed && window.scrollY > 0) {
      this._triggerReveal();
    }

    /* Track scroll progress through the hero for parallax */
    const hero = document.querySelector('.bould-hero');
    if (hero) {
      this.scrollProgress = Math.max(0, Math.min(window.scrollY / hero.offsetHeight, 1));
    }
  }

  /* ─── Events ────────────────────────────────────────────────────────── */
  _onMouseMove(e) {
    this.mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
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

  /* ─── Render loop ───────────────────────────────────────────────────── */
  _loop() {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(() => this._loop());

    /* Skip until renderer is ready */
    if (!this.renderer) return;

    const t = Date.now() * 0.001;

    /* Smooth mouse lag */
    this.target.x += (this.mouse.x - this.target.x) * 0.04;
    this.target.y += (this.mouse.y - this.target.y) * 0.04;

    /* Advance entrance (60 fps → ~1.4 s to complete) */
    if (this.revealed && this.entranceProgress < 1) {
      this.entranceProgress = Math.min(this.entranceProgress + 0.012, 1);
    }

    /* Logo mesh */
    if (this.bMesh) {
      const ep      = this._easeOutElastic(this.entranceProgress); // elastic scale
      const epSlide = this._easeOutQuart(this.entranceProgress);   // smooth slide

      /* Entrance: slide in from right + decaying spin */
      const slideX    = (1 - epSlide) * 5.5;
      const spinBonus = (1 - epSlide) * Math.PI * 1.4;

      this.bMesh.rotation.y = t * 0.28 + this.target.x * 0.35 + spinBonus;
      this.bMesh.rotation.x = this.target.y * 0.2;
      this.bMesh.position.x = slideX;
      this.bMesh.position.y = Math.sin(t * 0.6) * 0.12 - this.scrollProgress * 0.7;

      /* Scale springs up with elastic overshoot */
      this.bMesh.scale.setScalar(this._baseScale * Math.max(0, ep));
    }

    /* Key light slow orbit */
    if (this.keyLight) {
      this.keyLight.position.x = Math.sin(t * 0.4) * 5;
      this.keyLight.position.z = Math.cos(t * 0.4) * 4;
    }

    /* Particle counter-rotation */
    if (this.particles)  { this.particles.rotation.y  = t * 0.04;  this.particles.rotation.x  = t * 0.015; }
    if (this.particles2) { this.particles2.rotation.y = -t * 0.03; this.particles2.rotation.z = t * 0.01; }

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
    if (this.renderer) this.renderer.dispose();
  }
}

/* Boot */
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('bould-hero-canvas');
  if (!canvas) return;

  const objUrl = canvas.dataset.objUrl || null;
  console.log('[BouldScene] canvas found, objUrl:', objUrl || '(none — using font fallback)');
  window.__bouldScene = new BouldScene(canvas, objUrl);
});
