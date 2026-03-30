/**
 * BOULD 3D Scene — Three.js hero
 * Loads the brand B as an OBJ (if provided) or generates it via TextGeometry.
 * Uses ES module syntax — load from <script type="module">.
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';
import { FontLoader } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/geometries/TextGeometry.js';
import { OBJLoader } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/loaders/OBJLoader.js';
import { RoomEnvironment } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/environments/RoomEnvironment.js';

class BouldScene {
  constructor(canvasEl, objUrl) {
    this.canvas   = canvasEl;
    this.objUrl   = objUrl || null;
    this.mouse    = { x: 0, y: 0 };
    this.target   = { x: 0, y: 0 };
    this.bMesh    = null;
    this.raf      = null;
    this.alive    = true;

    this._resize  = this._onResize.bind(this);
    this._mouseMove = this._onMouseMove.bind(this);

    this._init();
  }

  _init() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

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

    /* Scene */
    this.scene = new THREE.Scene();

    /* Camera */
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    this.camera.position.set(0, 0, 6);

    /* Environment (room PMREM — makes metal look real) */
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    pmrem.dispose();

    /* Lights */
    this._setupLights();

    /* Particles */
    this._createParticles();

    /* B geometry */
    if (this.objUrl) {
      this._loadOBJ();
    } else {
      this._loadFont();
    }

    /* Events */
    window.addEventListener('mousemove', this._mouseMove, { passive: true });
    window.addEventListener('resize', this._resize, { passive: true });

    /* Loop */
    this._loop();
  }

  _setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    /* Key — bright violet from top-right */
    const key = new THREE.PointLight(0xA78BFA, 150, 30);
    key.position.set(4, 4, 4);
    this.scene.add(key);

    /* Fill — deep indigo from left */
    const fill = new THREE.PointLight(0x4C1D95, 100, 25);
    fill.position.set(-5, 1, 2);
    this.scene.add(fill);

    /* Rim — electric blue from behind-below */
    const rim = new THREE.PointLight(0x6366F1, 80, 20);
    rim.position.set(0, -4, -3);
    this.scene.add(rim);

    /* Accent — soft pink/magenta highlight */
    const accent = new THREE.PointLight(0xEC4899, 40, 15);
    accent.position.set(2, -2, 4);
    this.scene.add(accent);

    this.keyLight = key;
  }

  _loadFont() {
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

        this.bMesh = new THREE.Mesh(geo, mat);
        this.bMesh.castShadow = false;
        this.scene.add(this.bMesh);

        /* Fade in */
        this.bMesh.scale.setScalar(0);
        this._tweenScale(this.bMesh, 1, 1.2);
      },
      undefined,
      (err) => console.warn('[BouldScene] Font load error:', err)
    );
  }

  _loadOBJ() {
    const loader = new OBJLoader();
    loader.load(
      this.objUrl,
      (obj) => {
        if (!this.alive) return;

        const mat = new THREE.MeshStandardMaterial({
          color: 0xCCCCCC,
          metalness: 0.96,
          roughness: 0.08,
          envMapIntensity: 2.2,
        });

        obj.traverse((child) => {
          if (child.isMesh) child.material = mat;
        });

        /* Auto-center + scale to fit ~2 units */
        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDim;

        obj.position.sub(center.multiplyScalar(scale));
        obj.scale.setScalar(scale);

        this.bMesh = obj;
        this.scene.add(this.bMesh);
        this._tweenScale(this.bMesh, scale, 1.2);
      },
      undefined,
      () => {
        /* OBJ failed — fall back to font */
        this.objUrl = null;
        this._loadFont();
      }
    );
  }

  _createParticles() {
    const count = window.innerWidth < 768 ? 600 : 1800;
    const pos   = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const r     = 3.5 + Math.random() * 5;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
      pos[i * 3 + 2] = r * Math.cos(phi) * 0.5;
      sizes[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.018,
      color: 0x8B5CF6,
      transparent: true,
      opacity: 0.65,
      sizeAttenuation: true,
    });

    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);

    /* Second cloud — white */
    const geo2 = geo.clone();
    const mat2 = new THREE.PointsMaterial({
      size: 0.008,
      color: 0xC4B5FD,
      transparent: true,
      opacity: 0.3,
      sizeAttenuation: true,
    });
    const p2 = new THREE.Points(geo2, mat2);
    p2.rotation.y = Math.PI / 3;
    this.scene.add(p2);
    this.particles2 = p2;
  }

  /* Simple tween for scale-in using rAF */
  _tweenScale(obj, targetScale, duration) {
    const start = performance.now();
    const tick = (now) => {
      if (!this.alive) return;
      const t = Math.min((now - start) / (duration * 1000), 1);
      const ease = 1 - Math.pow(1 - t, 4);
      obj.scale.setScalar(targetScale * ease);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  _onMouseMove(e) {
    this.mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  _onResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  _loop() {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(() => this._loop());

    const t = Date.now() * 0.001;

    /* Smooth mouse tracking */
    this.target.x += (this.mouse.x - this.target.x) * 0.04;
    this.target.y += (this.mouse.y - this.target.y) * 0.04;

    /* B animation */
    if (this.bMesh) {
      this.bMesh.rotation.y = t * 0.28 + this.target.x * 0.35;
      this.bMesh.rotation.x = this.target.y * 0.2;
      this.bMesh.position.y = Math.sin(t * 0.6) * 0.12;
    }

    /* Key light orbit */
    if (this.keyLight) {
      this.keyLight.position.x = Math.sin(t * 0.4) * 5;
      this.keyLight.position.z = Math.cos(t * 0.4) * 4;
    }

    /* Particle drift */
    if (this.particles) {
      this.particles.rotation.y  = t * 0.04;
      this.particles.rotation.x  = t * 0.015;
    }
    if (this.particles2) {
      this.particles2.rotation.y = -t * 0.03;
      this.particles2.rotation.z =  t * 0.01;
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('mousemove', this._mouseMove);
    window.removeEventListener('resize', this._resize);
    this.renderer.dispose();
  }
}

/* Boot — reads config from the canvas element's data attributes */
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('bould-hero-canvas');
  if (!canvas) return;
  const objUrl = canvas.dataset.objUrl || null;
  window.__bouldScene = new BouldScene(canvas, objUrl);
});
