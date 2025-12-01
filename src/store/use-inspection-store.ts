import { create } from 'zustand';
import { persist, createJSONStorage, type PersistOptions } from 'zustand/middleware';
import type { InspectionResult, AIInsight, InspectionDataPoint } from '@/lib/types';

interface InspectionState {
  inspectionResult: InspectionResult | null;
  setInspectionResult: (result: InspectionResult | null) => void;
  isLoading: boolean;
  setIsLoading: (isLoading: boolean) => void;
  selectedPoint: { x: number; y: number } | null;
  setSelectedPoint: (point: { x: number; y: number } | null) => void;
  updateAIInsight: (insight: InspectionResult['aiInsight']) => void;
}

type PersistedState = Omit<InspectionState, 'setInspectionResult' | 'setIsLoading' | 'setSelectedPoint' | 'updateAIInsight'> & {
  // We only persist the summary, not the full data
  inspectionResult: Omit<InspectionResult, 'processedData'> | null;
};

const persistOptions: PersistOptions<InspectionState, PersistedState> = {
  name: 'sigma-corrosion-detective-storage',
  storage: createJSONStorage(() => localStorage),
  // We only want to persist a subset of the state
  partialize: (state): PersistedState => {
    // Don't persist the large processedData array
    const { processedData, ...restOfResult } = state.inspectionResult || {};
    
    return {
      inspectionResult: state.inspectionResult ? restOfResult as Omit<InspectionResult, 'processedData'> : null,
      isLoading: false, // Don't persist loading state
      selectedPoint: state.selectedPoint,
    };
  },
  // On rehydration, we need to merge the persisted state with the non-persisted initial state
  merge: (persistedState, currentState) => {
    const pState = persistedState as PersistedState;
    return {
      ...currentState,
      ...pState,
      // Re-hydrate with an empty processedData array, it will be populated on file load.
      inspectionResult: pState.inspectionResult
        ? { ...pState.inspectionResult, processedData: [] } as InspectionResult
        : null,
    };
  },
};


export const useInspectionStore = create<InspectionState>()(
  persist(
    (set, get) => ({
      inspectionResult: null,
      isLoading: false,
      selectedPoint: null,
      setInspectionResult: (result) => set({ inspectionResult: result }),
      setIsLoading: (isLoading) => set({ isLoading }),
      setSelectedPoint: (point) => set({ selectedPoint: point }),
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
    }),
    persistOptions
  )
);
