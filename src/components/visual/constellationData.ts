/**
 * Deterministic "constellation" used by the hero visual: clusters of points
 * (villages) linked to near neighbours, with a few long links between
 * clusters (friends and well-wishers connecting communities).
 */
export type ConstellationNode = { x: number; y: number; size: number; phase: number; bright: number };
export type Constellation = { nodes: ConstellationNode[]; links: Array<[number, number]>; bridges: Array<[number, number]> };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const VIEW = { width: 2.2, height: 1.4 };

export function buildConstellation(seed = 11): Constellation {
  const rand = mulberry32(seed);
  const gauss = () => {
    const u = Math.max(rand(), 1e-6);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const centers = [
    [-0.78, 0.28], [-0.42, -0.3], [-0.05, 0.38], [0.22, -0.12], [0.55, 0.32], [0.82, -0.36], [-0.88, -0.48],
  ] as const;
  const nodes: ConstellationNode[] = [];
  const clusterOf: number[] = [];
  centers.forEach(([cx, cy], ci) => {
    const count = 12 + Math.floor(rand() * 8);
    for (let i = 0; i < count; i += 1) {
      nodes.push({
        x: cx + gauss() * 0.075,
        y: cy + gauss() * 0.06,
        size: i === 0 ? 1.9 : 0.55 + rand() * 0.9,
        phase: rand() * Math.PI * 2,
        bright: i === 0 ? 1 : 0.35 + rand() * 0.55,
      });
      clusterOf.push(ci);
    }
  });
  for (let i = 0; i < 26; i += 1) {
    nodes.push({
      x: (rand() - 0.5) * VIEW.width,
      y: (rand() - 0.5) * VIEW.height,
      size: 0.35 + rand() * 0.45,
      phase: rand() * Math.PI * 2,
      bright: 0.2 + rand() * 0.3,
    });
    clusterOf.push(-1);
  }

  const links: Array<[number, number]> = [];
  const seen = new Set<string>();
  nodes.forEach((n, i) => {
    if (clusterOf[i] === -1) return;
    const nearest = nodes
      .map((m, j) => ({ j, d: Math.hypot(m.x - n.x, m.y - n.y) }))
      .filter(({ j }) => j !== i && clusterOf[j] === clusterOf[i])
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const { j, d } of nearest) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (d < 0.2 && !seen.has(key)) {
        seen.add(key);
        links.push([i, j]);
      }
    }
  });

  // Bridges between the brightest node (index 0 of each cluster) of neighbouring clusters.
  const heads: number[] = [];
  let offset = 0;
  centers.forEach((_, ci) => {
    heads.push(offset);
    offset += clusterOf.filter((c) => c === ci).length;
  });
  const bridges: Array<[number, number]> = [[0, 2], [2, 4], [1, 3], [3, 5], [0, 1], [3, 4], [1, 6]].map(([a, b]) => [
    heads[a!]!,
    heads[b!]!,
  ]);
  return { nodes, links, bridges };
}
