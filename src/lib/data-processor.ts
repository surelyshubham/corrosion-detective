
import type { InspectionDataPoint, InspectionStats, Condition, MergedGrid, Plate } from './types';

// This file is now a placeholder. All logic has been moved to the Web Worker.
// The functions are kept for type reference and potential future use if a non-worker
// version is ever needed, but they are not actively used in the main data flow.

interface ProcessDataResult {
  processedData: InspectionDataPoint[];
  stats: InspectionStats;
  condition: Condition;
}

export const processData = (
  data: Omit<InspectionDataPoint, 'effectiveThickness' | 'deviation' | 'percentage' | 'wallLoss'>[],
  nominalThickness: number
): ProcessDataResult => {
  // This logic is now duplicated in the worker.
  // It's not called in the main application flow anymore.
  return {
      processedData: [],
      stats: {} as InspectionStats,
      condition: 'N/A'
  };
};

export const reprocessMergedData = (
  grid: MergedGrid,
  nominalThickness: number
): { stats: InspectionStats; condition: Condition } => {
    // This logic is now handled by the worker.
   return {
      stats: {} as InspectionStats,
      condition: 'N/A'
  };
};
