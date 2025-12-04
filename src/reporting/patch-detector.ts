import type { MergedGrid, MergedCell } from '@/lib/types';

export interface IdentifiedPatch {
  id: number;
  pointCount: number;
  minThickness: number;
  avgThickness: number;
  severity: 'Critical';
  coordinates: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  };
  center: {
    x: number;
    y: number;
  };
  boundingBox: number; // area in mm^2, assuming 1 point = 1mm^2
  points: {x: number, y: number}[];
}

export function identifyPatches(grid: MergedGrid, thresholdPercentage: number): IdentifiedPatch[] {
  if (!grid || grid.length === 0) {
    return [];
  }

  const height = grid.length;
  const width = grid[0].length;
  const visited: boolean[][] = Array(height).fill(null).map(() => Array(width).fill(false));
  const patches: IdentifiedPatch[] = [];
  let patchIdCounter = 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = grid[y][x];
      if (cell && cell.percentage !== null && cell.percentage < thresholdPercentage && !visited[y][x]) {
        const patchPoints: {x: number, y: number, cell: MergedCell}[] = [];
        const queue: [number, number][] = [[x, y]];
        visited[y][x] = true;

        let minThickness = Infinity;
        let maxThickness = -Infinity;
        let sumThickness = 0;
        let xMin = x, xMax = x, yMin = y, yMax = y;

        while (queue.length > 0) {
          const [curX, curY] = queue.shift()!;
          const currentCell = grid[curY][curX];

          if (currentCell && currentCell.effectiveThickness !== null) {
            patchPoints.push({ x: curX, y: curY, cell: currentCell });
            
            minThickness = Math.min(minThickness, currentCell.effectiveThickness);
            maxThickness = Math.max(maxThickness, currentCell.effectiveThickness);
            sumThickness += currentCell.effectiveThickness;
            xMin = Math.min(xMin, curX);
            xMax = Math.max(xMax, curX);
            yMin = Math.min(yMin, curY);
            yMax = Math.max(yMax, curY);
          }
          
          // 4-way adjacency check
          const neighbors: [number, number][] = [
            [curX, curY - 1], // up
            [curX, curY + 1], // down
            [curX - 1, curY], // left
            [curX + 1, curY], // right
          ];

          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited[ny][nx]) {
              const neighborCell = grid[ny][nx];
              if (neighborCell && neighborCell.percentage !== null && neighborCell.percentage < thresholdPercentage) {
                visited[ny][nx] = true;
                queue.push([nx, ny]);
              }
            }
          }
        }
        
        if (patchPoints.length > 0) {
          patches.push({
            id: patchIdCounter++,
            pointCount: patchPoints.length,
            minThickness: minThickness,
            avgThickness: sumThickness / patchPoints.length,
            severity: 'Critical',
            coordinates: { xMin, xMax, yMin, yMax },
            center: {
              x: Math.round(xMin + (xMax - xMin) / 2),
              y: Math.round(yMin + (yMax - yMin) / 2)
            },
            boundingBox: (xMax - xMin + 1) * (yMax - yMin + 1),
            points: patchPoints.map(p => ({x: p.x, y: p.y}))
          });
        }
      }
    }
  }
  
  // Sort patches by severity (min thickness)
  return patches.sort((a, b) => a.minThickness - b.minThickness);
}
