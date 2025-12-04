
"use client"

import React, { useRef } from 'react';
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

  React.useEffect(() => {
    if (!inspectionResult) return;

    const { assetType } = inspectionResult;
    switch (assetType) {
      case 'Pipe':
        setCaptureFunctions({
          capture: () => pipeRef.current?.captureScreenshot() || '',
          focus: (x, y) => pipeRef.current?.focusOnPoint(x, y),
        });
        break;
      case 'Tank':
      case 'Vessel':
        setCaptureFunctions({
          capture: () => tankRef.current?.captureScreenshot() || '',
          focus: (x, y) => tankRef.current?.focusOnPoint(x, y),
        });
        break;
      case 'Plate':
      default:
        setCaptureFunctions({
          capture: () => plateRef.current?.captureScreenshot() || '',
          focus: (x, y) => plateRef.current?.focusOnPoint(x, y),
        });
        break;
    }
  }, [inspectionResult, setCaptureFunctions]);

  if (!inspectionResult) return null;

  const { assetType } = inspectionResult;

  switch (assetType) {
    case 'Pipe':
      return <PipeView3D ref={pipeRef}/>;
    case 'Tank':
    case 'Vessel':
      return <TankView3D ref={tankRef}/>;
    case 'Plate':
    default:
      return <PlateView3D ref={plateRef}/>;
  }
}
