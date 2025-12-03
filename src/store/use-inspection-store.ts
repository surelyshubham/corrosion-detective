import { create } from 'zustand';
import { persist, createJSONStorage, type PersistOptions } from 'zustand/middleware';
import type { MergedInspectionResult, AIInsight, Plate, MergedCell } from '@/lib/types';
import { processData, reprocessMergedData } from '@/lib/data-processor';

export type ColorMode = 'mm' | '%';

interface InspectionState {
  inspectionResult: MergedInspectionResult | null;
  setInspectionResult: (result: MergedInspectionResult | null) => void;
  addPlate: (plate: Plate, options: {
    direction: 'left' | 'right' | 'top' | 'bottom';
    start: number;
  }) => void;
  isLoading: boolean;
  setIsLoading: (isLoading: boolean) => void;
  selectedPoint: { x: number; y: number } | null;
  setSelectedPoint: (point: { x: number; y: number } | null) => void;
  updateAIInsight: (insight: AIInsight | null) => void;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
}

const emptyCell: MergedCell = { plateId: null, rawThickness: null, effectiveThickness: null, percentage: null };
const ndGapCell: MergedCell = { plateId: 'ND', rawThickness: null, effectiveThickness: null, percentage: null };


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

      addPlate: (newPlate, options) => {
        const { direction, start } = options;
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
            pipeOuterDiameter: newPlate.pipeOuterDiameter,
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
        
        const newPlateGrid: MergedCell[][] = [];
        const newPlateMap = new Map(newPlate.processedData.map(p => [`${p.x},${p.y}`, {...p, plateId: newPlate.id}]));
        for (let y = 0; y < newPlate.stats.gridSize.height; y++) {
            newPlateGrid[y] = [];
            for (let x = 0; x < newPlate.stats.gridSize.width; x++) {
                const point = newPlateMap.get(`${x},${y}`);
                newPlateGrid[y][x] = point ? {
                  plateId: newPlate.id,
                  rawThickness: point.rawThickness,
                  effectiveThickness: point.effectiveThickness,
                  percentage: point.percentage
                } : emptyCell;
            }
        }
        
        let newMergedGrid: MergedGrid = [];

        if (direction === 'bottom') {
            const gap = start - oldHeight;
            newMergedGrid = [...oldGrid.map(row => [...row])]; // Deep copy
            // Add gap rows
            for (let i = 0; i < gap; i++) {
                newMergedGrid.push(Array(oldWidth).fill(ndGapCell));
            }
            // Add new plate rows
            newMergedGrid.push(...newPlateGrid);
        } else if (direction === 'top') {
            const gap = start; // For 'top', start is the gap
            // Add gap rows
            for (let i = 0; i < gap; i++) {
                newMergedGrid.push(Array(oldWidth).fill(ndGapCell));
            }
             // Add new plate rows
            newMergedGrid.push(...newPlateGrid);
            // Add old grid rows
            newMergedGrid.push(...oldGrid.map(row => [...row]));
        } else if (direction === 'right') {
            const gap = start - oldWidth;
            newMergedGrid = oldGrid.map(row => [...row]); // Deep copy
            newMergedGrid.forEach(row => {
                for (let i = 0; i < gap; i++) {
                    row.push(ndGapCell);
                }
            });
            // Merge in new plate
            for (let y = 0; y < newPlateGrid.length; y++) {
                if (!newMergedGrid[y]) newMergedGrid[y] = [];
                newMergedGrid[y].push(...newPlateGrid[y]);
            }
        } else if (direction === 'left') {
            const gap = start; // For 'left', start is the gap
            newMergedGrid = oldGrid.map(row => [...row]); // Deep copy
            
            // Prepend gap and new plate
            for (let y = 0; y < Math.max(newPlateGrid.length, newMergedGrid.length); y++) {
                const newRow = newPlateGrid[y] || [];
                const gapCols = Array(gap).fill(ndGapCell);
                const oldRow = newMergedGrid[y] || [];
                
                newMergedGrid[y] = [...newRow, ...gapCols, ...oldRow];
            }
        }

        // Ensure all rows have the same length (ragged array normalization)
        const maxWidth = Math.max(0, ...newMergedGrid.map(row => row.length));
        newMergedGrid.forEach(row => {
            while (row.length < maxWidth) {
                row.push(emptyCell);
            }
        });


        const { stats, condition } = reprocessMergedData(newMergedGrid, newPlate.nominalThickness);
        
        const newInspectionResult: MergedInspectionResult = {
          ...initialResult,
          plates: [...initialResult.plates, newPlate],
          mergedGrid: newMergedGrid,
          nominalThickness: newPlate.nominalThickness,
          assetType: newPlate.assetType,
          pipeOuterDiameter: newPlate.pipeOuterDiameter,
          aiInsight: null, // Reset AI insight after merge
          stats,
          condition,
        };

        set({ inspectionResult: newInspectionResult });
      },
    }),
);
