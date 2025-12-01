
"use client"

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useInspectionStore } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useResizeDetector } from 'react-resize-detector'

// Based on thickness percentage:
// Red        = 0–20%
// Orange     = 21–40%
// Yellow     = 41–60%
// LightGreen = 61–80%
// DarkGreen  = 81–100%
const getColor = (percentage: number | null) => {
    if (percentage === null) return 'rgba(0,0,0,0)'; // Transparent for ND
    if (percentage <= 20) return '#ff0000'; // Red
    if (percentage <= 40) return '#ffa500'; // Orange
    if (percentage <= 60) return '#ffff00'; // Yellow
    if (percentage <= 80) return '#90ee90'; // LightGreen
    return '#006400'; // DarkGreen
};


export function TwoDeeHeatmapTab() {
  const { inspectionResult, selectedPoint, setSelectedPoint } = useInspectionStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hoveredPoint, setHoveredPoint] = useState<any>(null)
  const { width, ref: containerRef } = useResizeDetector();

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas || !inspectionResult || !width) return;
    
    const { processedData, stats } = inspectionResult
    const { gridSize } = stats;

    const canvasWidth = width;
    const pixelSizeX = canvasWidth / gridSize.width;
    const canvasHeight = pixelSizeX * gridSize.height;
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Create a map for quick lookup
    const dataMap = new Map<string, any>();
    processedData.forEach(p => dataMap.set(`${p.x},${p.y}`, p));

    for (let i = 0; i < gridSize.width; i++) {
        for (let j = 0; j < gridSize.height; j++) {
            const point = dataMap.get(`${i},${j}`);
            ctx.fillStyle = getColor(point?.percentage ?? null);
            ctx.fillRect(i * pixelSizeX, j * pixelSizeX, pixelSizeX, pixelSizeX);

            if(selectedPoint && selectedPoint.x === i && selectedPoint.y === j) {
                ctx.strokeStyle = '#00ffff'; // Cyan highlight
                ctx.lineWidth = 3;
                ctx.strokeRect(i * pixelSizeX + 1.5, j * pixelSizeX + 1.5, pixelSizeX - 3, pixelSizeX - 3);
            }
        }
    }

  }, [inspectionResult, width, selectedPoint]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !inspectionResult || !width) return;
    
    const { stats } = inspectionResult;
    const { gridSize } = stats;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const pixelSizeX = width / gridSize.width;

    const gridX = Math.floor(x / pixelSizeX);
    const gridY = Math.floor(y / pixelSizeX);

    const point = inspectionResult.processedData.find(p => p.x === gridX && p.y === gridY);
    setHoveredPoint(point ? { ...point, clientX: e.clientX, clientY: e.clientY } : null);
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };
  
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if(hoveredPoint) {
          setSelectedPoint({x: hoveredPoint.x, y: hoveredPoint.y});
      }
  }

  if (!inspectionResult) return null

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-headline">2D Heatmap</CardTitle>
      </CardHeader>
      <CardContent ref={containerRef} className="relative h-[calc(100%-4rem)]">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          style={{ touchAction: 'none', imageRendering: 'pixelated' }}
        />
        {hoveredPoint && (
          <div
            className="absolute p-2 text-xs rounded-md shadow-lg pointer-events-none bg-popover text-popover-foreground border"
            style={{
              left: `${hoveredPoint.clientX + 15}px`,
              top: `${hoveredPoint.clientY + 15}px`,
              transform: `translate(-50%, -100%)`
            }}
          >
            <div className="font-bold">X: {hoveredPoint.x}, Y: {hoveredPoint.y}</div>
            <div>Thickness: {hoveredPoint.thickness?.toFixed(2) ?? 'ND'} mm</div>
            <div>Percentage: {hoveredPoint.percentage?.toFixed(1) ?? 'N/A'}%</div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
