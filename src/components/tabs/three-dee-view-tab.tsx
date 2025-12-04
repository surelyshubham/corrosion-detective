
"use client"

import React from 'react';
import { useInspectionStore } from '@/store/use-inspection-store';
import { PlateView3D } from '@/components/visualizations/PlateView3D';
import { PipeView3D } from '@/components/visualizations/PipeView3D';
import { TankView3D } from '@/components/visualizations/TankView3D';

export function ThreeDeeViewTab() {
  const { inspectionResult } = useInspectionStore();

  if (!inspectionResult) return null;

  const { assetType } = inspectionResult;

  switch (assetType) {
    case 'Pipe':
      return <PipeView3D />;
    case 'Tank':
    case 'Vessel':
      return <TankView3D />;
    case 'Plate':
    default:
      return <PlateView3D />;
  }
}
