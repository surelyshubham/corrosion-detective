
"use client"

import React, { useRef, useCallback } from 'react';
import { useInspectionStore } from '@/store/use-inspection-store';
import { PlateView3D, type PlateView3DRef } from '@/components/visualizations/PlateView3D';
import { PipeView3D, type PipeView3DRef } from '@/components/visualizations/PipeView3D';
import { TankView3D, type TankView3DRef } from '@/components/visualizations/TankView3D';
import { useReportStore } from '@/store/use-report-store';

export function ThreeDeeViewTab() {
  const { inspectionResult } = useInspectionStore();
  const setCaptureFunctions = useReportStore(state => state.setCaptureFunctions);

  const plateRef = useRef<PlateView3DRef>(null);
  const pipeRef = useRef<PipeView3DRef>(null);
  const tankRef = useRef<TankView3DRef>(null);

  const handleReady = useCallback((assetType: 'Plate' | 'Pipe' | 'Tank' | 'Vessel') => {
    let functions: { capture: () => string; focus: (x: number, y: number) => void; };
    switch (assetType) {
      case 'Pipe':
        functions = {
          capture: () => pipeRef.current?.captureScreenshot() || '',
          focus: (x, y) => pipeRef.current?.focusOnPoint(x, y),
        };
        break;
      case 'Tank':
      case 'Vessel':
        functions = {
          capture: () => tankRef.current?.captureScreenshot() || '',
          focus: (x, y) => tankRef.current?.focusOnPoint(x, y),
        };
        break;
      case 'Plate':
      default:
        functions = {
          capture: () => plateRef.current?.captureScreenshot() || '',
          focus: (x, y) => plateRef.current?.focusOnPoint(x, y),
        };
        break;
    }
    setCaptureFunctions({ ...functions, isReady: true });
  }, [setCaptureFunctions]);


  React.useEffect(() => {
    // When the inspection result changes (e.g., cleared), reset the ready state.
    if (!inspectionResult) {
      setCaptureFunctions({ capture: () => '', focus: () => {}, isReady: false });
    }
  }, [inspectionResult, setCaptureFunctions]);


  if (!inspectionResult) return null;

  const { assetType } = inspectionResult;

  switch (assetType) {
    case 'Pipe':
      return <PipeView3D ref={pipeRef} onReady={() => handleReady('Pipe')}/>;
    case 'Tank':
    case 'Vessel':
      return <TankView3D ref={tankRef} onReady={() => handleReady('Tank')}/>;
    case 'Plate':
    default:
      return <PlateView3D ref={plateRef} onReady={() => handleReady('Plate')}/>;
  }
}
