import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/cn';

/** Clouds: vertical position (% of the panel), width (px), duration (s) and start offset (s). */
const CLOUDS = [
  { top: 14, width: 120, duration: 70, delay: -10 },
  { top: 24, width: 80, duration: 95, delay: -55 },
  { top: 8, width: 64, duration: 110, delay: -80 },
  { top: 32, width: 96, duration: 85, delay: -35 },
];

/**
 * “Village Dawn” hero backdrop: a sunrise sky, drifting clouds and layered
 * hills with village homes. Purely decorative (aria-hidden). With a mouse,
 * the hill layers shift slightly for depth. All motion is off when the
 * visitor prefers reduced motion, and work pauses while it is off-screen.
 */
export function VillageDawn({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (reduced || !root) return;
    const layers = Array.from(root.querySelectorAll<HTMLElement>('[data-depth]'));
    let frame = 0;
    let visible = true;
    let px = 0;
    let py = 0;
    const apply = () => {
      frame = 0;
      for (const layer of layers) {
        const depth = Number(layer.dataset.depth);
        layer.style.transform = `translate3d(${(px * depth).toFixed(2)}px, ${(py * depth * 0.35).toFixed(2)}px, 0)`;
      }
    };
    const schedule = () => {
      if (!frame && visible) frame = requestAnimationFrame(apply);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const r = root.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) return;
      px = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5));
      py = Math.max(-0.5, Math.min(0.5, (e.clientY - r.top) / r.height - 0.5));
      schedule();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
    });
    observer.observe(root);
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reduced]);

  return (
    <div ref={ref} aria-hidden="true" className={cn('dawn pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div className="dawn-sky absolute inset-0" />
      <div className="dawn-sun absolute" />
      {CLOUDS.map((c, i) => (
        <div
          key={i}
          className="dawn-cloud-track absolute inset-x-0"
          style={{ top: `${c.top}%`, animationDuration: `${c.duration}s`, animationDelay: `${c.delay}s` }}
        >
          <span className="dawn-cloud" style={{ width: c.width }} />
        </div>
      ))}

      <div data-depth="8" className="dawn-layer absolute -inset-x-[4%] bottom-0">
        <svg viewBox="0 0 1440 320" preserveAspectRatio="xMaxYMax slice" className="block h-[min(42vw,320px)] w-full">
          <path d="M0 282 C200 274 400 264 620 244 C820 222 1000 176 1180 154 C1300 140 1380 142 1440 138 L1440 320 L0 320Z" fill="var(--color-mint-200)" />
        </svg>
      </div>
      <div data-depth="16" className="dawn-layer absolute -inset-x-[4%] bottom-0">
        <svg viewBox="0 0 1440 320" preserveAspectRatio="xMaxYMax slice" className="block h-[min(42vw,320px)] w-full">
          <path d="M0 302 C240 294 460 286 680 270 C880 254 1040 214 1220 198 C1330 190 1400 192 1440 190 L1440 320 L0 320Z" fill="#8cc7a6" />
          <g fill="#4f9a74">
            <circle cx="1040" cy="206" r="18" />
            <rect x="1037" y="214" width="6" height="22" />
            <circle cx="1084" cy="198" r="24" />
            <rect x="1081" y="212" width="7" height="24" />
            <circle cx="320" cy="282" r="11" />
            <rect x="318" y="288" width="4" height="10" />
          </g>
        </svg>
      </div>
      <div data-depth="28" className="dawn-layer absolute -inset-x-[4%] bottom-0">
        <svg viewBox="0 0 1440 320" preserveAspectRatio="xMaxYMax slice" className="block h-[min(42vw,320px)] w-full">
          <path d="M0 312 C260 306 520 300 760 290 C960 282 1120 258 1300 248 C1380 244 1420 245 1440 244 L1440 320 L0 320Z" fill="var(--color-forest-600)" />
          {/* Village homes with warm lit windows */}
          <g fill="var(--color-forest-800)">
            <rect x="1160" y="218" width="56" height="38" />
            <path d="M1152 222 L1188 194 L1224 222Z" />
            <rect x="1232" y="224" width="42" height="28" />
            <path d="M1226 226 L1253 204 L1280 226Z" />
            <rect x="1296" y="216" width="48" height="34" />
            <path d="M1289 219 L1320 194 L1351 219Z" />
            <circle cx="1378" cy="224" r="18" />
            <rect x="1375" y="230" width="6" height="18" />
          </g>
          <g className="dawn-windows" fill="#f6c56b">
            <rect x="1172" y="230" width="10" height="10" rx="1" />
            <rect x="1194" y="230" width="10" height="10" rx="1" />
            <rect x="1246" y="234" width="9" height="9" rx="1" />
            <rect x="1310" y="228" width="10" height="10" rx="1" />
          </g>
          {/* Footpath leading to the village */}
          <path d="M960 320 C1030 302 1100 274 1172 258" stroke="#e8d3a6" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.75" />
        </svg>
      </div>
    </div>
  );
}

/** Static hills strip for the bottom of inner-page heroes (no motion). */
export function HillsStrip({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 1440 120" preserveAspectRatio="none" className={cn('pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full sm:h-20', className)}>
      <path d="M0 70 C200 40 380 60 560 48 C760 34 930 70 1130 52 C1280 40 1370 48 1440 44 L1440 120 L0 120Z" fill="var(--color-mint-200)" opacity="0.7" />
      <path d="M0 96 C220 76 420 92 640 84 C860 76 1030 94 1240 86 C1340 82 1400 85 1440 84 L1440 120 L0 120Z" fill="#8cc7a6" opacity="0.55" />
    </svg>
  );
}
