import { create } from 'zustand';

type CaptureFunctions = {
  capture: () => string;
  focus: (x: number, y: number) => void;
};

interface ReportState {
  captureFunctions: CaptureFunctions | null;
  setCaptureFunctions: (functions: CaptureFunctions) => void;
}

export const useReportStore = create<ReportState>()(
  (set) => ({
    captureFunctions: null,
    setCaptureFunctions: (functions) => set({ captureFunctions: functions }),
  })
);
