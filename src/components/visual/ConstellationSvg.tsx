import { useMemo } from 'react';
import { buildConstellation, VIEW } from './constellationData';

/** Static, decorative fallback for the hero visual (no WebGL, reduced motion, small screens). */
export function ConstellationSvg({ className }: { className?: string }) {
  const { nodes, links, bridges } = useMemo(() => buildConstellation(), []);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      viewBox={`${-VIEW.width / 2} ${-VIEW.height / 2} ${VIEW.width} ${VIEW.height}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id="cs-glow">
          <stop offset="0" stopColor="#E3C68E" stopOpacity="0.9" />
          <stop offset="1" stopColor="#D5AE69" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g stroke="#D5AE69" strokeLinecap="round" fill="none">
        {bridges.map(([a, b], i) => (
          <line key={`b${i}`} x1={nodes[a]!.x} y1={-nodes[a]!.y} x2={nodes[b]!.x} y2={-nodes[b]!.y} strokeOpacity="0.1" strokeWidth="0.0022" strokeDasharray="0.006 0.012" />
        ))}
        {links.map(([a, b], i) => (
          <line key={`l${i}`} x1={nodes[a]!.x} y1={-nodes[a]!.y} x2={nodes[b]!.x} y2={-nodes[b]!.y} strokeOpacity="0.2" strokeWidth="0.0024" />
        ))}
      </g>
      {nodes.map((n, i) => (
        <g key={i} opacity={n.bright}>
          <circle cx={n.x} cy={-n.y} r={n.size * 0.014} fill="url(#cs-glow)" />
          <circle cx={n.x} cy={-n.y} r={n.size * 0.0042} fill="#F6ECD8" />
        </g>
      ))}
    </svg>
  );
}
