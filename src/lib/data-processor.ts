import type { InspectionDataPoint, InspectionStats, Condition, MergedGrid } from './types';

interface ProcessDataResult {
  processedData: InspectionDataPoint[];
  stats: InspectionStats;
  condition: Condition;
}

export const processData = (
  data: Omit<InspectionDataPoint, 'effectiveThickness' | 'deviation' | 'percentage' | 'wallLoss'>[],
  nominalThickness: number
): ProcessDataResult => {
  if (data.length === 0) {
    const emptyStats: InspectionStats = {
      minThickness: 0,
      maxThickness: 0,
      avgThickness: 0,
      minPercentage: 0,
      areaBelow80: 0,
      areaBelow70: 0,
      areaBelow60: 0,
      countND: 0,
      totalPoints: 0,
      worstLocation: { x: 0, y: 0 },
      gridSize: { width: 0, height: 0 },
      scannedArea: 0,
    };
    return { processedData: [], stats: emptyStats, condition: 'N/A' };
  }

  let minThickness = Infinity;
  let maxThickness = -Infinity;
  let sumThickness = 0;
  let validPointsCount = 0;
  let countND = 0;
  let areaBelow80 = 0;
  let areaBelow70 = 0;
  let areaBelow60 = 0;
  let worstLocation = { x: 0, y: 0 };
  let maxX = 0;
  let maxY = 0;

  const processedData: InspectionDataPoint[] = data.map(point => {
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);

    if (point.rawThickness === null) {
      countND++;
      return { 
        ...point,
        effectiveThickness: null,
        deviation: null,
        percentage: null,
        wallLoss: null,
       };
    }

    const raw = point.rawThickness;
    const effectiveThickness = Math.min(raw, nominalThickness);
    
    validPointsCount++;
    sumThickness += effectiveThickness;

    if (effectiveThickness < minThickness) {
      minThickness = effectiveThickness;
      worstLocation = { x: point.x, y: point.y };
    }
    if (effectiveThickness > maxThickness) {
      maxThickness = effectiveThickness;
    }

    const percentage = (effectiveThickness / nominalThickness) * 100;

    if (percentage < 80) areaBelow80++;
    if (percentage < 70) areaBelow70++;
    if (percentage < 60) areaBelow60++;

    return {
      ...point,
      effectiveThickness,
      deviation: effectiveThickness - nominalThickness,
      percentage: percentage,
      wallLoss: nominalThickness - effectiveThickness,
    };
  });
  
  if (validPointsCount === 0) {
      minThickness = 0;
      maxThickness = 0;
  }

  const avgThickness = validPointsCount > 0 ? sumThickness / validPointsCount : 0;
  const minPercentage = (minThickness / nominalThickness) * 100;
  const totalPoints = data.length;
  const gridSize = { width: maxX + 1, height: maxY + 1 };
  // Assuming 1 point = 1mm^2
  const scannedArea = validPointsCount / 1000000; 

  const stats: InspectionStats = {
    minThickness: minThickness === Infinity ? 0 : minThickness,
    maxThickness: maxThickness === -Infinity ? 0 : maxThickness,
    avgThickness,
    minPercentage: isFinite(minPercentage) ? minPercentage : 0,
    areaBelow80: totalPoints > 0 ? (areaBelow80 / totalPoints) * 100 : 0,
    areaBelow70: totalPoints > 0 ? (areaBelow70 / totalPoints) * 100 : 0,
    areaBelow60: totalPoints > 0 ? (areaBelow60 / totalPoints) * 100 : 0,
    countND,
    totalPoints,
    worstLocation,
    gridSize,
    scannedArea,
  };

  let condition: Condition;
  const finalPercentage = stats.minPercentage;
  if (finalPercentage >= 95) {
    condition = 'Healthy';
  } else if (finalPercentage >= 80) {
    condition = 'Moderate';
  } else if (finalPercentage >= 60) {
    condition = 'Severe';
  } else {
    condition = 'Critical';
  }
  
  if (validPointsCount === 0) {
    condition = 'N/A'
  }

  return { processedData, stats, condition };
};


export const reprocessMergedData = (
  grid: MergedGrid,
  nominalThickness: number
): { stats: InspectionStats; condition: Condition } => {
  const height = grid.length;
  if (height === 0) {
    const emptyStats: InspectionStats = {
      minThickness: 0, maxThickness: 0, avgThickness: 0, minPercentage: 0,
      areaBelow80: 0, areaBelow70: 0, areaBelow60: 0, countND: 0, totalPoints: 0,
      worstLocation: { x: 0, y: 0 }, gridSize: { width: 0, height: 0 }, scannedArea: 0,
    };
    return { stats: emptyStats, condition: 'N/A' };
  }
  const width = grid[0].length;
  
  let minThickness = Infinity;
  let maxThickness = -Infinity;
  let sumThickness = 0;
  let validPointsCount = 0;
  let countND = 0;
  let areaBelow80 = 0;
  let areaBelow70 = 0;
  let areaBelow60 = 0;
  let worstLocation = { x: 0, y: 0 };
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = grid[y][x];
      if (!cell || cell.effectiveThickness === null) {
        if (cell && cell.plateId) countND++;
        continue;
      }
      
      const effectiveThickness = cell.effectiveThickness;
      validPointsCount++;
      sumThickness += effectiveThickness;
      
      if (effectiveThickness < minThickness) {
        minThickness = effectiveThickness;
        worstLocation = { x, y };
      }
      if (effectiveThickness > maxThickness) {
        maxThickness = effectiveThickness;
      }
      
      const percentage = (effectiveThickness / nominalThickness) * 100;
      if (percentage < 80) areaBelow80++;
      if (percentage < 70) areaBelow70++;
      if (percentage < 60) areaBelow60++;
    }
  }
  
  const totalScannedPoints = validPointsCount + countND;

  const avgThickness = validPointsCount > 0 ? sumThickness / validPointsCount : 0;
  const minPercentage = (minThickness / nominalThickness) * 100;
  
  const finalMinThickness = minThickness === Infinity ? 0 : minThickness;

  const stats: InspectionStats = {
    minThickness: finalMinThickness,
    maxThickness: maxThickness === -Infinity ? 0 : maxThickness,
    avgThickness,
    minPercentage: isFinite(minPercentage) ? minPercentage : 0,
    areaBelow80: totalScannedPoints > 0 ? (areaBelow80 / totalScannedPoints) * 100 : 0,
    areaBelow70: totalScannedPoints > 0 ? (areaBelow70 / totalScannedPoints) * 100 : 0,
    areaBelow60: totalScannedPoints > 0 ? (areaBelow60 / totalScannedPoints) * 100 : 0,
    countND,
    totalPoints: height * width,
    worstLocation: finalMinThickness === 0 ? { x: 0, y: 0 } : worstLocation,
    gridSize: { width, height },
    scannedArea: totalScannedPoints / 1000000,
  };
  
  let condition: Condition;
  const finalPercentage = stats.minPercentage;
  if (finalPercentage >= 95) {
    condition = 'Healthy';
  } else if (finalPercentage >= 80) {
    condition = 'Moderate';
  } else if (finalPercentage >= 60) {
    condition = 'Severe';
  } else {
    condition = 'Critical';
  }
  
  if (validPointsCount === 0) {
    condition = 'N/A'
  }
  
  return { stats, condition };
};
