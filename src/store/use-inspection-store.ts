import { create } from 'zustand';
import { persist, createJSONStorage, type PersistOptions } from 'zustand/middleware';
import type { MergedInspectionResult, AIInsight, Plate, MergedCell } from '@/lib/types';
import { processData, reprocessMergedData } from '@/lib/data-processor';

export type ColorMode = 'mm' | '%';

interface InspectionState {
  inspectionResult: MergedInspectionResult | null;
  setInspectionResult: (result: MergedInspectionResult | null) => void;
  addPlate: (plate: Plate, mergeDirection: 'left' | 'right' | 'top' | 'bottom') => void;
  isLoading: boolean;
  setIsLoading: (isLoading: boolean) => void;
  selectedPoint: { x: number; y: number } | null;
  setSelectedPoint: (point: { x: number; y: number } | null) => void;
  updateAIInsight: (insight: AIInsight | null) => void;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
}

export const useInspectionStore = create<InspectionState>()(
    (set, get) => ({
      inspectionResult: null,
      isLoading: false,
      selectedPoint: null,
      colorMode: 'mm',
      
      setInspectionResult: (result) => {
        // When clearing data, also clear other related states
        if (result === null) {
          set({ inspectionResult: null, selectedPoint: null, isLoading: false });
        } else {
          set({ inspectionResult: result });
        }
      },
      
      setIsLoading: (isLoading) => set({ isLoading }),
      
      setSelectedPoint: (point) => set({ selectedPoint: point }),
      
      setColorMode: (mode) => set({ colorMode: mode }),
      
      updateAIInsight: (aiInsight) => {
        const currentResult = get().inspectionResult;
        if (currentResult) {
          set({
            inspectionResult: {
              ...currentResult,
              aiInsight,
            },
          });
        }
      },

      addPlate: (newPlate, mergeDirection) => {
        const currentResult = get().inspectionResult;
        
        // If nominal thickness has changed, reprocess all existing plates
        const platesToProcess = (currentResult?.plates || []).map(p => {
            if (p.nominalThickness !== newPlate.nominalThickness) {
                const { processedData, stats } = processData(p.processedData, newPlate.nominalThickness);
                return { ...p, nominalThickness: newPlate.nominalThickness, processedData, stats };
            }
            return p;
        });

        const initialResult = platesToProcess.length === 0 ? null : {
            ...currentResult,
            plates: platesToProcess,
            nominalThickness: newPlate.nominalThickness,
        };


        if (!initialResult) {
          // This is the first plate
          const { processedData, stats, condition } = processData(newPlate.processedData, newPlate.nominalThickness);
          const grid: MergedInspectionResult['mergedGrid'] = [];
          const dataMap = new Map(processedData.map(p => [`${p.x},${p.y}`, p]));

          for (let y = 0; y < stats.gridSize.height; y++) {
            grid[y] = [];
            for (let x = 0; x < stats.gridSize.width; x++) {
              const point = dataMap.get(`${x},${y}`);
              grid[y][x] = {
                plateId: point ? newPlate.id : null,
                rawThickness: point?.rawThickness ?? null,
                effectiveThickness: point?.effectiveThickness ?? null,
                percentage: point?.percentage ?? null,
              };
            }
          }

          const newInspectionResult: MergedInspectionResult = {
            plates: [newPlate],
            mergedGrid: grid,
            nominalThickness: newPlate.nominalThickness,
            assetType: newPlate.assetType,
            stats,
            condition,
            aiInsight: null,
          };
          set({ inspectionResult: newInspectionResult });
          return;
        }

        // Merging with existing grid
        const oldGrid = initialResult.mergedGrid;
        const oldHeight = oldGrid.length;
        const oldWidth = oldGrid[0]?.length || 0;
        
        const newPlateGrid: (MergedCell & {x:number, y:number})[][] = [];
        const newPlateMap = new Map(newPlate.processedData.map(p => [`${p.x},${p.y}`, {...p, plateId: newPlate.id}]));
        for (let y = 0; y < newPlate.stats.gridSize.height; y++) {
            newPlateGrid[y] = [];
            for (let x = 0; x < newPlate.stats.gridSize.width; x++) {
                const point = newPlateMap.get(`${x},${y}`);
                newPlateGrid[y][x] = {
                  plateId: point ? newPlate.id : null,
                  rawThickness: point?.rawThickness ?? null,
                  effectiveThickness: point?.effectiveThickness ?? null,
                  percentage: point?.percentage ?? null,
                  x,
                  y
                };
            }
        }

        let newMergedGrid: MergedInspectionResult['mergedGrid'] = [];

        if (mergeDirection === 'bottom') {
            newMergedGrid = [...oldGrid];
            for (let y = 0; y < newPlate.stats.gridSize.height; y++) {
                const newRow: MergedInspectionResult['mergedGrid'][0] = [];
                for (let x = 0; x < Math.max(oldWidth, newPlate.stats.gridSize.width); x++) {
                    const point = newPlateGrid[y]?.[x];
                    newRow[x] = point || { plateId: null, rawThickness: null, effectiveThickness: null, percentage: null };
                }
                newMergedGrid.push(newRow);
            }
        } else if (mergeDirection === 'top') {
             for (let y = 0; y < newPlate.stats.gridSize.height; y++) {
                const newRow: MergedInspectionResult['mergedGrid'][0] = [];
                for (let x = 0; x < Math.max(oldWidth, newPlate.stats.gridSize.width); x++) {
                    const point = newPlateGrid[y]?.[x];
                    newRow[x] = point || { plateId: null, rawThickness: null, effectiveThickness: null, percentage: null };
                }
                newMergedGrid.push(newRow);
            }
            newMergedGrid.push(...oldGrid);
        } else if (mergeDirection === 'right') {
            const newHeight = Math.max(oldHeight, newPlate.stats.gridSize.height);
            for (let y = 0; y < newHeight; y++) {
                const oldRow = oldGrid[y] || [];
                const newPlateRow = newPlateGrid[y] || [];
                const mergedRow: MergedInspectionResult['mergedGrid'][0] = [...oldRow];
                 while (mergedRow.length < oldWidth) {
                  mergedRow.push({ plateId: null, rawThickness: null, effectiveThickness: null, percentage: null });
                }
                for(let x=0; x < newPlate.stats.gridSize.width; x++) {
                    const point = newPlateRow[x];
                    mergedRow[oldWidth + x] = point || { plateId: null, rawThickness: null, effectiveThickness: null, percentage: null };
                }
                newMergedGrid.push(mergedRow);
            }
        } else if (mergeDirection === 'left') {
            const newHeight = Math.max(oldHeight, newPlate.stats.gridSize.height);
             for (let y = 0; y < newHeight; y++) {
                const oldRow = oldGrid[y] || [];
                const newPlateRow = newPlateGrid[y] || [];
                const mergedRow: MergedInspectionResult['mergedGrid'][0] = [];
                 for(let x=0; x < newPlate.stats.gridSize.width; x++) {
                    const point = newPlateRow[x];
                    mergedRow[x] = point || { plateId: null, rawThickness: null, effectiveThickness: null, percentage: null };
                }
                // Pad with empty cells if new plate is narrower
                while (mergedRow.length < newPlate.stats.gridSize.width) {
                  mergedRow.push({ plateId: null, rawThickness: null, effectiveThickness: null, percentage: null });
                }
                mergedRow.push(...oldRow);
                newMergedGrid.push(mergedRow);
            }
        }
        
        // Ensure all rows have the same length
        const maxWidth = Math.max(...newMergedGrid.map(row => row.length));
        newMergedGrid.forEach(row => {
            while (row.length < maxWidth) {
                row.push({ plateId: null, rawThickness: null, effectiveThickness: null, percentage: null });
            }
        });


        const { stats, condition } = reprocessMergedData(newMergedGrid, newPlate.nominalThickness);
        
        const newInspectionResult: MergedInspectionResult = {
          ...initialResult,
          plates: [...initialResult.plates, newPlate],
          mergedGrid: newMergedGrid,
          nominalThickness: newPlate.nominalThickness,
          assetType: newPlate.assetType,
          stats,
          condition,
          aiInsight: null, // Reset AI insight after merge
        };

        set({ inspectionResult: newInspectionResult });
      },
    }),
);
