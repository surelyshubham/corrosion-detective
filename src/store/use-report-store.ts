import { create } from 'zustand';
import type { IdentifiedPatch } from '@/reporting/patch-detector';

type CaptureFunctions = {
  capture: () => string;
  focus: (x: number, y: number) => void;
  resetCamera: () => void;
};

interface ReportState {
  captureFunctions: CaptureFunctions | null;
  isReady: boolean;
  setCaptureFunctions: (functions: { capture: () => string; focus: (x: number, y: number) => void; resetCamera: () => void; isReady: boolean }) => void;

  isGeneratingScreenshots: boolean;
  setIsGeneratingScreenshots: (isGenerating: boolean) => void;

  screenshotsReady: boolean;
  overviewScreenshot: string | null;
  patchScreenshots: Record<string, string>;
  patches: IdentifiedPatch[];
  setScreenshotData: (data: { overview: string | null; patches: Record<string, string>, patchData: IdentifiedPatch[] }) => void;
  resetReportState: () => void;
}

const initialState = {
  captureFunctions: null,
  isReady: false,
  isGeneratingScreenshots: false,
  screenshotsReady: false,
  overviewScreenshot: null,
  patchScreenshots: {},
  patches: [],
};

export const useReportStore = create<ReportState>()(
  (set) => ({
    ...initialState,
    setCaptureFunctions: (functions) => set({ 
      captureFunctions: { capture: functions.capture, focus: functions.focus, resetCamera: functions.resetCamera },
      isReady: functions.isReady 
    }),
    setIsGeneratingScreenshots: (isGenerating) => set({ isGeneratingScreenshots: isGenerating }),
    setScreenshotData: (data) => set({
      overviewScreenshot: data.overview,
      patchScreenshots: data.patches,
      patches: data.patchData,
      screenshotsReady: !!data.overview,
      isGeneratingScreenshots: false,
    }),
    resetReportState: () => set(initialState),
  })
);
