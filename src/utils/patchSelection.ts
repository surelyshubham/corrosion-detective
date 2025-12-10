// src/utils/patchSelection.ts
export type PatchMeta = {
  id: string;
  area_m2?: number;
  avgDepth_mm?: number;
  maxDepth_mm?: number;
  severity?: 'Critical'|'Severe'|'Moderate'|'Normal'|string;
  flagged?: boolean; // manual inspector flag
  detectionIndex?: number;
  // other metadata...
};

// weights can be tuned centrally
export const DEFAULT_WEIGHTS = {
  severity: 0.5,
  area: 0.25,
  depth: 0.2,
  flagged: 0.8
};

function severityScore(sev: string | undefined) {
  return (sev === 'Critical') ? 1.0 :
         (sev === 'Severe') ? 0.85 :
         (sev === 'Moderate') ? 0.5 :
         (sev === 'Normal') ? 0.2 : 0;
}

export function pickTopPatches(all: PatchMeta[], maxPick = 10, weights = DEFAULT_WEIGHTS) {
  if (!Array.isArray(all)) return [];

  const maxArea = Math.max(...all.map(p => p.area_m2 ?? 0), 1);
  const maxDepth = Math.max(...all.map(p => p.avgDepth_mm ?? 0), 1);

  const scored = all.map(p => {
    const s = (weights.severity * severityScore(p.severity))
            + (weights.area * ((p.area_m2 ?? 0) / maxArea))
            + (weights.depth * ((p.avgDepth_mm ?? 0) / maxDepth))
            + (weights.flagged * (p.flagged ? 1 : 0));
    return { ...p, score: s };
  });

  scored.sort((a,b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((b.maxDepth_mm ?? 0) !== (a.maxDepth_mm ?? 0)) return (b.maxDepth_mm ?? 0) - (a.maxDepth_mm ?? 0);
    if ((b.area_m2 ?? 0) !== (a.area_m2 ?? 0)) return (b.area_m2 ?? 0) - (a.area_m2 ?? 0);
    return (a.detectionIndex ?? 0) - (b.detectionIndex ?? 0);
  });

  let top = scored.slice(0, maxPick);

  // ensure criticals included: if a critical exists outside top, swap with last slot
  const criticals = scored.filter(p => p.severity === 'Critical');
  for (const c of criticals) {
    if (!top.find(t => t.id === c.id)) {
      top[top.length - 1] = c;
      top.sort((a,b) => b.score - a.score);
    }
  }

  return top.map(p => ({ id: p.id, score: p.score }));
}
