
import { create } from 'zustand';
import type { IdentifiedPatch } from '@/reporting/patch-detector';
import type { ReportMetadata } from '@/lib/types';

type CaptureFunctions = {
  capture: () => string;
  focus: (x: number, y: number, zoomIn: boolean) => void;
  resetCamera: () => void;
  setView: (view: 'iso' | 'top' | 'side') => void;
};

interface ReportState {
  // 3D View readiness
  captureFunctions: CaptureFunctions | null;
  is3dViewReady: boolean;
  setCaptureFunctions: (functions: { 
    capture: () => string; 
    focus: (x: number, y: number, zoomIn: boolean) => void; 
    resetCamera: () => void;
    setView: (view: 'iso' | 'top' | 'side') => void;
    isReady: boolean 
  }) => void;
  
  // Step 0: Configuration
  defectThreshold: number;
  setDefectThreshold: (threshold: number) => void;

  // Step 1: Screenshot Generation
  isGeneratingScreenshots: boolean;
  setIsGeneratingScreenshots: (isGenerating: boolean) => void;
  screenshotsReady: boolean;
  globalScreenshots: { iso: string, top: string, side: string } | null;
  patchScreenshots: Record<string, { iso: string, top: string }>;
  patches: IdentifiedPatch[];
  setPatches: (patches: IdentifiedPatch[]) => void;
  setScreenshotData: (data: { 
    global: { iso: string, top: string, side: string } | null; 
    patches: Record<string, { iso: string, top: string }>; 
  }) => void;

  // Step 2: Metadata Submission
  reportMetadata: Omit<ReportMetadata, 'defectThreshold'> | null;
  detailsSubmitted: boolean;
  setReportMetadata: (metadata: Omit<ReportMetadata, 'defectThreshold'>) => void;

  // Progress Tracking
  captureProgress: { current: number, total: number } | null;
  setCaptureProgress: (progress: { current: number, total: number } | null) => void;

  // Global reset
  resetReportState: () => void;
}

const initialState = {
  captureFunctions: null,
  is3dViewReady: false,
  defectThreshold: 50,
  isGeneratingScreenshots: false,
  screenshotsReady: false,
  globalScreenshots: null,
  patchScreenshots: {},
  patches: [],
  reportMetadata: null,
  detailsSubmitted: false,
  captureProgress: null,
};

export const useReportStore = create<ReportState>()(
  (set) => ({
    ...initialState,
    setCaptureFunctions: (functions) => set({ 
      captureFunctions: { 
        capture: functions.capture, 
        focus: functions.focus, 
        resetCamera: functions.resetCamera,
        setView: functions.setView,
      },
      is3dViewReady: functions.isReady 
    }),
    setDefectThreshold: (threshold) => set({ defectThreshold: threshold }),
    setIsGeneratingScreenshots: (isGenerating) => set({ isGeneratingScreenshots: isGenerating }),
    setPatches: (patches) => set({ patches }),
    setScreenshotData: (data) => set({
      globalScreenshots: data.global,
      patchScreenshots: data.patches,
      screenshotsReady: !!data.global,
      isGeneratingScreenshots: false,
    }),
    setReportMetadata: (metadata) => set({
        reportMetadata: metadata,
        detailsSubmitted: true,
    }),
    setCaptureProgress: (progress) => set({ captureProgress: progress }),
    resetReportState: () => set((state) => ({ // Keep threshold on reset
      ...initialState,
      defectThreshold: state.defectThreshold 
    })),
  })
);
