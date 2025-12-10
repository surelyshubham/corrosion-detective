// src/report/patchHelpers.ts
import type { SegmentBox } from '@/lib/types';

export type Severity = 'low' | 'medium' | 'high' | 'critical' | string;

export type PatchMeta = {
  id: number;
  worstThickness: number;
  avgThickness: number;
  pointCount: number;
  severity: Severity;
  aiObservation?: string;
  detectionIndex: number;
};

function severityScore(sev?: Severity) {
  if (!sev) return 0;
  if (sev === 'Critical') return 1;
  if (sev === 'Severe') return 0.85;
  if (sev === 'Moderate') return 0.5;
  return 0.2;
}

// Extract up to 4 view URLs (top, side, iso, heat)
export function getPatchViewUrls(entry: SegmentBox): string[] {
  const urls: string[] = [];
  if (!entry) return urls;

  if (entry.isoViewDataUrl) urls.push(entry.isoViewDataUrl);
  if (entry.topViewDataUrl) urls.push(entry.topViewDataUrl);
  if (entry.sideViewDataUrl) urls.push(entry.sideViewDataUrl);
  if (entry.heatmapDataUrl) urls.push(entry.heatmapDataUrl);
  
  return urls.slice(0, 4);
}


// Pick top N patches by simple severity+area+depth score
export function pickTopNPatches(allSegments: SegmentBox[], n: number): PatchMeta[] {
  if (!allSegments || allSegments.length === 0) return [];

  const maxPoints = Math.max(...allSegments.map(p => p.pointCount), 1);

  const scored = allSegments.map((p, index) => {
    const score =
      0.6 * severityScore(p.tier) +
      0.4 * (p.pointCount / maxPoints);
    return { 
        ...p,
        detectionIndex: index,
        score 
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.worstThickness !== b.worstThickness) return a.worstThickness - b.worstThickness;
    if (b.pointCount !== a.pointCount) return b.pointCount - a.pointCount;
    return a.detectionIndex - b.detectionIndex;
  });

  return scored.slice(0, n).map(p => ({
      id: p.id,
      worstThickness: p.worstThickness,
      avgThickness: p.avgThickness,
      pointCount: p.pointCount,
      severity: p.tier,
      aiObservation: p.aiObservation,
      detectionIndex: p.detectionIndex,
  }));
}
