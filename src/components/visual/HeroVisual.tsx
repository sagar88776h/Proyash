import { useEffect, useMemo, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/cn';
import { ConstellationSvg } from './ConstellationSvg';

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function prefersLightweight(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(connection?.saveData) || window.matchMedia('(max-width: 767px)').matches;
}

/**
 * Decorative hero background. Uses the animated WebGL constellation only when
 * motion is welcome, WebGL works and the device is not data-constrained;
 * otherwise renders the static SVG version. Never blocks content.
 */
export function HeroVisual({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canAnimate = useMemo(() => !reduced && !prefersLightweight() && supportsWebGL(), [reduced]);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const mode = canAnimate && !failed ? 'webgl' : 'svg';

  useEffect(() => {
    if (mode !== 'webgl' || !canvasRef.current) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    import('./constellationScene')
      .then(({ mountConstellation }) => {
        if (cancelled || !canvasRef.current) return;
        try {
          dispose = mountConstellation(canvasRef.current);
          setReady(true);
        } catch {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [mode]);

  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0', className)}>
      {mode === 'svg' ? (
        <ConstellationSvg className="h-full w-full" />
      ) : (
        <canvas
          ref={canvasRef}
          className={cn('h-full w-full transition-opacity duration-[1600ms]', ready ? 'opacity-100' : 'opacity-0')}
        />
      )}
    </div>
  );
}
