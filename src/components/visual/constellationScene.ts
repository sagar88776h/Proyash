/**
 * Lightweight Three.js rendering of the hero constellation. Loaded lazily and
 * only on capable devices; pauses when off-screen or when the tab is hidden.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineSegments,
  OrthographicCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three';
import { buildConstellation, VIEW } from './constellationData';

const DRIFT = /* glsl */ `
  uniform float uTime;
  attribute float aPhase;
  vec3 drift(vec3 p) {
    p.x += cos(uTime * 0.18 + aPhase) * 0.006;
    p.y += sin(uTime * 0.23 + aPhase) * 0.008;
    return p;
  }
`;

export function mountConstellation(canvas: HTMLCanvasElement): () => void {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, -10, 10);
  const group = new Group();
  scene.add(group);

  const { nodes, links, bridges } = buildConstellation();
  const gold = new Color('#E3C68E');

  const pointGeometry = new BufferGeometry();
  pointGeometry.setAttribute('position', new Float32BufferAttribute(nodes.flatMap((n) => [n.x, n.y, 0]), 3));
  pointGeometry.setAttribute('aSize', new Float32BufferAttribute(nodes.map((n) => n.size), 1));
  pointGeometry.setAttribute('aPhase', new Float32BufferAttribute(nodes.map((n) => n.phase), 1));
  pointGeometry.setAttribute('aBright', new Float32BufferAttribute(nodes.map((n) => n.bright), 1));
  const pointMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: gold }, uScale: { value: 18 * pixelRatio } },
    vertexShader: /* glsl */ `
      ${DRIFT}
      uniform float uScale;
      attribute float aSize;
      attribute float aBright;
      varying float vAlpha;
      void main() {
        vec3 p = drift(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        float pulse = 0.78 + 0.22 * sin(uTime * 0.7 + aPhase * 3.0);
        gl_PointSize = aSize * uScale * pulse;
        vAlpha = aBright * pulse;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float core = smoothstep(0.16, 0.0, d);
        float halo = smoothstep(0.5, 0.0, d);
        float a = (core * 0.9 + halo * halo * 0.55) * vAlpha;
        gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.97, 0.9), core * 0.6), a);
      }`,
  });
  group.add(new Points(pointGeometry, pointMaterial));

  const makeLines = (pairs: Array<[number, number]>, opacity: number) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute(pairs.flatMap(([a, b]) => [nodes[a]!.x, nodes[a]!.y, 0, nodes[b]!.x, nodes[b]!.y, 0]), 3),
    );
    geometry.setAttribute('aPhase', new Float32BufferAttribute(pairs.flatMap(([a, b]) => [nodes[a]!.phase, nodes[b]!.phase]), 1));
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uTime: pointMaterial.uniforms.uTime!, uColor: { value: gold }, uOpacity: { value: opacity } },
      vertexShader: /* glsl */ `
        ${DRIFT}
        void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(drift(position), 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() { gl_FragColor = vec4(uColor, uOpacity); }`,
    });
    const lines = new LineSegments(geometry, material);
    group.add(lines);
    return { geometry, material };
  };
  const linkLines = makeLines(links, 0.17);
  const bridgeLines = makeLines(bridges, 0.07);

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.left = -aspect;
    camera.right = aspect;
    camera.top = 1;
    camera.bottom = -1;
    camera.updateProjectionMatrix();
    // Cover the canvas with the constellation.
    const scale = Math.max((2 * aspect) / VIEW.width, 2 / VIEW.height) * 1.04;
    group.scale.set(scale, scale, 1);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  const pointer = { x: 0, y: 0 };
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    pointer.x = e.clientX / window.innerWidth - 0.5;
    pointer.y = e.clientY / window.innerHeight - 0.5;
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  let frame = 0;
  let visible = true;
  let running = false;
  const start = performance.now();
  const tick = () => {
    const t = (performance.now() - start) / 1000;
    pointMaterial.uniforms.uTime!.value = t;
    group.rotation.z = Math.sin(t * 0.03) * 0.025;
    group.position.x += (pointer.x * 0.06 - group.position.x) * 0.04;
    group.position.y += (-pointer.y * 0.04 - group.position.y) * 0.04;
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  };
  const update = () => {
    const shouldRun = visible && document.visibilityState === 'visible';
    if (shouldRun && !running) {
      running = true;
      frame = requestAnimationFrame(tick);
    } else if (!shouldRun && running) {
      running = false;
      cancelAnimationFrame(frame);
    }
  };
  const intersection = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    update();
  });
  intersection.observe(canvas);
  document.addEventListener('visibilitychange', update);
  update();

  return () => {
    cancelAnimationFrame(frame);
    intersection.disconnect();
    resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', update);
    window.removeEventListener('pointermove', onPointer);
    pointGeometry.dispose();
    pointMaterial.dispose();
    linkLines.geometry.dispose();
    linkLines.material.dispose();
    bridgeLines.geometry.dispose();
    bridgeLines.material.dispose();
    renderer.dispose();
  };
}
