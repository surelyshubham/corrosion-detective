import { create } from 'zustand';
import { persist, createJSONStorage, type PersistOptions } from 'zustand/middleware';
import type { MergedInspectionResult, AIInsight, Plate } from '@/lib/types';
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
      
      setInspectionResult: (result) => set({ inspectionResult: result }),
      
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
        if (!currentResult) {
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
        const oldGrid = currentResult.mergedGrid;
        const oldHeight = oldGrid.length;
        const oldWidth = oldGrid[0]?.length || 0;
        
        const newPlateGrid: (typeof newPlate.processedData[0] | undefined)[][] = [];
        const newPlateMap = new Map(newPlate.processedData.map(p => [`${p.x},${p.y}`, p]));
        for (let y = 0; y < newPlate.stats.gridSize.height; y++) {
            newPlateGrid[y] = [];
            for (let x = 0; x < newPlate.stats.gridSize.width; x++) {
                newPlateGrid[y][x] = newPlateMap.get(`${x},${y}`);
            }
        }

        let newMergedGrid: MergedInspectionResult['mergedGrid'] = [];

        if (mergeDirection === 'bottom') {
            newMergedGrid = [...oldGrid];
            // In a real scenario, you might add a gap here based on coordinates.
            // For this implementation, we'll just stitch directly.
            for (let y = 0; y < newPlate.stats.gridSize.height; y++) {
                const newRow: MergedInspectionResult['mergedGrid'][0] = [];
                for (let x = 0; x < Math.max(oldWidth, newPlate.stats.gridSize.width); x++) {
                    const point = newPlateGrid[y]?.[x];
                    newRow[x] = {
                        plateId: point ? newPlate.id : null,
                        rawThickness: point?.rawThickness ?? null,
                        effectiveThickness: point?.effectiveThickness ?? null,
                        percentage: point?.percentage ?? null,
                    };
                }
                newMergedGrid.push(newRow);
            }
        } else if (mergeDirection === 'top') {
             for (let y = 0; y < newPlate.stats.gridSize.height; y++) {
                const newRow: MergedInspectionResult['mergedGrid'][0] = [];
                for (let x = 0; x < Math.max(oldWidth, newPlate.stats.gridSize.width); x++) {
                    const point = newPlateGrid[y]?.[x];
                    newRow[x] = {
                        plateId: point ? newPlate.id : null,
                        rawThickness: point?.rawThickness ?? null,
                        effectiveThickness: point?.effectiveThickness ?? null,
                        percentage: point?.percentage ?? null,
                    };
                }
                newMergedGrid.push(newRow);
            }
            newMergedGrid.push(...oldGrid);
        } else if (mergeDirection === 'right') {
            const newHeight = Math.max(oldHeight, newPlate.stats.gridSize.height);
            for (let y = 0; y < newHeight; y++) {
                const oldRow = oldGrid[y] || [];
                const newPlateRow = newPlateGrid[y] || [];
                const mergedRow: MergedInspectionResult['mergedGrid'][0] = [];
                for(let x=0; x < oldWidth; x++) {
                    mergedRow[x] = oldRow[x] || { plateId: null, rawThickness: null, effectiveThickness: null, percentage: null };
                }
                for(let x=0; x < newPlate.stats.gridSize.width; x++) {
                    const point = newPlateRow[x];
                    mergedRow[oldWidth + x] = {
                        plateId: point ? newPlate.id : null,
                        rawThickness: point?.rawThickness ?? null,
                        effectiveThickness: point?.effectiveThickness ?? null,
                        percentage: point?.percentage ?? null,
                    };
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
                    mergedRow[x] = {
                        plateId: point ? newPlate.id : null,
                        rawThickness: point?.rawThickness ?? null,
                        effectiveThickness: point?.effectiveThickness ?? null,
                        percentage: point?.percentage ?? null,
                    };
                }
                for(let x=0; x < oldWidth; x++) {
                    mergedRow[newPlate.stats.gridSize.width + x] = oldRow[x] || { plateId: null, rawThickness: null, effectiveThickness: null, percentage: null };
                }
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


        const { stats, condition } = reprocessMergedData(newMergedGrid, currentResult.nominalThickness);
        
        const newInspectionResult: MergedInspectionResult = {
          ...currentResult,
          plates: [...currentResult.plates, newPlate],
          mergedGrid: newMergedGrid,
          stats,
          condition,
          aiInsight: null, // Reset AI insight after merge
        };

        set({ inspectionResult: newInspectionResult });
      },
    }),
);