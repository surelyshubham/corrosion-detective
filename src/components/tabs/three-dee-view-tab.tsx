
"use client"

import React, { useRef, useImperativeHandle } from 'react';
import { useInspectionStore } from '@/store/use-inspection-store';
import { PlateView3D, type PlateView3DRef } from '@/components/visualizations/PlateView3D';
import { PipeView3D, type PipeView3DRef } from '@/components/visualizations/PipeView3D';
import { TankView3D, type TankView3DRef } from '@/components/visualizations/TankView3D';

type ViewRef = PlateView3DRef | PipeView3DRef | TankView3DRef;

export type ThreeDeeViewRef = ViewRef;

interface ThreeDeeViewTabProps {}

export const ThreeDeeViewTab = React.forwardRef<ThreeDeeViewRef, ThreeDeeViewTabProps>((props, ref) => {
  const { inspectionResult } = useInspectionStore();
  const viewRef = useRef<ViewRef>(null);

  // Expose the inner ref's methods to the parent component (MainApp)
  useImperativeHandle(ref, () => ({
      captureScreenshot: () => viewRef.current?.captureScreenshot() || '',
      focusOnPoint: (x, y, zoomIn) => viewRef.current?.focusOnPoint(x, y, zoomIn),
      resetCamera: () => viewRef.current?.resetCamera(),
      setView: (view) => viewRef.current?.setView(view),
  }));

  if (!inspectionResult) return null;

  const { assetType } = inspectionResult;

  // The hidden container makes sure this component is always mounted and ready to render
  return (
    <div style={{
      position: 'fixed',
      left: '0px',
      top: '0px',
      width: '800px',
      height: '600px',
      opacity: 0,
      pointerEvents: 'none',
      zIndex: -1,
    }}>
      {(() => {
        switch (assetType) {
          case 'Pipe':
            return <PipeView3D ref={viewRef as React.Ref<PipeView3DRef>} />;
          case 'Tank':
          case 'Vessel':
            return <TankView3D ref={viewRef as React.Ref<TankView3DRef>} />;
          case 'Plate':
          default:
            return <PlateView3D ref={viewRef as React.Ref<PlateView3DRef>} />;
        }
      })()}
    </div>
  );
});

ThreeDeeViewTab.displayName = "ThreeDeeViewTab";
