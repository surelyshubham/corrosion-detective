
"use client"

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useInspectionStore, type ColorMode } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '../ui/label'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { Percent, Ruler, ZoomIn, Search, MousePointer } from 'lucide-react'

// --- Color Helper Functions ---
const getAbsColor = (percentage: number | null): string => {
    if (percentage === null) return '#888888'; // Grey for ND
    if (percentage <= 60) return '#ff0000'; // Red
    if (percentage <= 80) return '#ffa500'; // Orange
    if (percentage <= 95) return '#ffff00'; // Yellow
    return '#00ff00'; // Green
};

const getNormalizedColor = (normalizedPercent: number | null): string => {
    if (normalizedPercent === null) return '#888888'; // Grey for ND
    // Blue to Red
    const hue = 240 * (1 - normalizedPercent);
    return `hsl(${hue}, 100%, 50%)`;
};


// --- UI Components ---
const ColorLegend = ({ mode, stats, nominalThickness }: { mode: ColorMode, stats: any, nominalThickness: number}) => {
    const renderMmLegend = () => {
        const levels = [
            { label: `> 95%`, color: '#00ff00' },
            { label: `80-95%`, color: '#ffff00' },
            { label: `60-80%`, color: '#ffa500' },
            { label: `< 60%`, color: '#ff0000' },
        ];
        return (
            <>
                <div className="font-medium text-xs mb-1">Eff. Thickness (% of {nominalThickness}mm)</div>
                {levels.map(l => (
                    <div key={l.label} className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-sm border" style={{ backgroundColor: l.color }} />
                        <span>{l.label}</span>
                    </div>
                ))}
            </>
        )
    }

    const renderPercentLegend = () => {
        const min = stats.minThickness;
        const max = stats.maxThickness;
        const levels = [
            { pct: 1, label: `${max.toFixed(2)}mm (Max)` },
            { pct: 0.75, label: '' },
            { pct: 0.5, label: `${((max + min) / 2).toFixed(2)}mm` },
            { pct: 0.25, label: '' },
            { pct: 0, label: `${min.toFixed(2)}mm (Min)` },
        ];
        return (
             <>
                <div className="font-medium text-xs mb-1">Eff. Thickness (Normalized)</div>
                <div className="flex flex-col-reverse">
                {levels.map(l => (
                    <div key={l.pct} className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-sm border" style={{ backgroundColor: getNormalizedColor(l.pct) }} />
                        <span>{l.label}</span>
                    </div>
                ))}
                </div>
            </>
        )
    }

    return (
        <Card className="mt-4">
          <CardHeader className="p-3">
             <CardTitle className="text-base font-headline">Legend</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 text-xs">
            {mode === 'mm' ? renderMmLegend() : renderPercentLegend()}
            <div className="text-xs text-muted-foreground mt-1">ND: Gray</div>
          </CardContent>
        </Card>
    )
}

const getNiceInterval = (range: number, maxTicks: number): number => {
    const roughStep = range / maxTicks;
    const goodSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    const step = goodSteps.find(s => s > roughStep) || goodSteps[goodSteps.length - 1];
    return step;
};


// --- Main Component ---
export function TwoDeeHeatmapTab() {
  const { inspectionResult, selectedPoint, setSelectedPoint, colorMode, setColorMode } = useInspectionStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const [transform, setTransform] = useState({ scale: 1, offsetX: 0, offsetY: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 })
  const [hoveredPoint, setHoveredPoint] = useState<any>(null)

  const { processedData, stats, nominalThickness } = inspectionResult || {};
  const { gridSize, minThickness: minEffT, maxThickness: maxEffT } = stats || {};
  const effTRange = (maxEffT && minEffT) ? maxEffT - minEffT : 0;
  
  const AXIS_SIZE = 40;
  const CELL_SIZE = 6; // Base cell size

  const dataMap = React.useMemo(() => {
    const map = new Map<string, any>();
    if (!processedData) return map;
    processedData.forEach(p => map.set(`${p.x},${p.y}`, p));
    return map;
  }, [processedData]);

  // --- Drawing Logic ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gridSize || !containerRef.current) return;
    
    const dpr = window.devicePixelRatio || 1;
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    // The canvas is always its "natural" size, the container div handles scrolling
    const canvasWidth = gridSize.width * CELL_SIZE;
    const canvasHeight = gridSize.height * CELL_SIZE;
    
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.scale(dpr, dpr);

    // No transforms here on the main context, they happen on a wrapper group if needed
    // but for simple pan/zoom, we manage it via scroll and scale transform on the canvas element style

    // Draw Heatmap
    for (let y = 0; y < gridSize.height; y++) {
      for (let x = 0; x < gridSize.width; x++) {
        const point = dataMap.get(`${x},${y}`);
        let color: string;
        
        if (point === undefined) continue;

        if (colorMode === '%') {
            const normalized = (point?.effectiveThickness !== null && effTRange > 0)
                ? (point.effectiveThickness - minEffT) / effTRange
                : null;
            color = getNormalizedColor(normalized);
        } else {
            color = getAbsColor(point?.percentage ?? null);
        }

        ctx.fillStyle = color;
        ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }
    
    // Draw Bounded Grid Lines
    if (transform.scale > 5) {
      ctx.strokeStyle = "rgba(200, 200, 200, 0.2)";
      ctx.lineWidth = 1; // It's always 1px regardless of zoom
      for (let x = 0; x <= gridSize.width; x++) {
        ctx.beginPath();
        ctx.moveTo(x * CELL_SIZE, 0);
        ctx.lineTo(x * CELL_SIZE, canvasHeight);
        ctx.stroke();
      }
      for (let y = 0; y <= gridSize.height; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * CELL_SIZE);
        ctx.lineTo(canvasWidth, y * CELL_SIZE);
        ctx.stroke();
      }
    }

    // Draw selection outline
    if (selectedPoint) {
        ctx.strokeStyle = '#00ffff'; // Cyan
        ctx.lineWidth = 2; // Always 2px
        ctx.strokeRect(selectedPoint.x * CELL_SIZE, selectedPoint.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }
    
  }, [gridSize, colorMode, dataMap, minEffT, effTRange, transform.scale, selectedPoint]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleContainerResize = useCallback(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver(handleContainerResize);
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [handleContainerResize]);


  // --- Interaction Handlers ---
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !containerRef.current) return;
    setIsPanning(true);
    setLastPanPoint({ 
        x: e.clientX, 
        y: e.clientY 
    });
    containerRef.current.style.cursor = 'grabbing';
  };
  
  const handleMouseUp = () => {
    if (!containerRef.current) return;
    setIsPanning(false);
    containerRef.current.style.cursor = 'grab';
  };

  const handleMouseLeave = () => {
     if (!containerRef.current) return;
    setIsPanning(false);
    setHoveredPoint(null);
    containerRef.current.style.cursor = 'grab';
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning && containerRef.current) {
        const dx = e.clientX - lastPanPoint.x;
        const dy = e.clientY - lastPanPoint.y;
        containerRef.current.scrollLeft -= dx;
        containerRef.current.scrollTop -= dy;
        setLastPanPoint({ x: e.clientX, y: e.clientY });
    }
    
    // Tooltip logic
    if (!gridSize || !containerRef.current || !canvasRef.current) {
        setHoveredPoint(null);
        return;
    };
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const gridX = Math.floor(x / (CELL_SIZE * transform.scale));
    const gridY = Math.floor(y / (CELL_SIZE * transform.scale));

    if (gridX >= 0 && gridX < gridSize.width && gridY >= 0 && gridY < gridSize.height) {
        const pointData = dataMap.get(`${gridX},${gridY}`);
        if(pointData) {
            setHoveredPoint({ ...pointData, clientX: e.clientX, clientY: e.clientY });
        } else {
            setHoveredPoint(null);
        }
    } else {
        setHoveredPoint(null);
    }
  };
  
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const scaleAmount = 1.1;
    const newScale = e.deltaY < 0 ? transform.scale * scaleAmount : transform.scale / scaleAmount;
    const clampedScale = Math.max(0.2, Math.min(newScale, 20)); // Zoom limits
    
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const scrollLeft = containerRef.current.scrollLeft;
    const scrollTop = containerRef.current.scrollTop;
    
    const worldX = (scrollLeft + mouseX) / transform.scale;
    const worldY = (scrollTop + mouseY) / transform.scale;

    const newScrollLeft = worldX * clampedScale - mouseX;
    const newScrollTop = worldY * clampedScale - mouseY;

    setTransform({ ...transform, scale: clampedScale });

    // Apply new scroll positions after state has updated
    requestAnimationFrame(() => {
        if(containerRef.current){
            containerRef.current.scrollLeft = newScrollLeft;
            containerRef.current.scrollTop = newScrollTop;
        }
    });
  };

  const handleDoubleClick = () => {
    setTransform({ scale: 1, offsetX: 0, offsetY: 0 });
    if(containerRef.current){
        containerRef.current.scrollLeft = 0;
        containerRef.current.scrollTop = 0;
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!gridSize || !containerRef.current || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const gridX = Math.floor(x / (CELL_SIZE * transform.scale));
    const gridY = Math.floor(y / (CELL_SIZE * transform.scale));

    if (gridX >= 0 && gridX < gridSize.width && gridY >= 0 && gridY < gridSize.height) {
        setSelectedPoint({ x: gridX, y: gridY });
    }
  }

  // --- Render ---
  if (!inspectionResult) return null

  return (
    <div className="grid md:grid-cols-4 gap-6 h-full">
      <Card className="h-full flex flex-col md:col-span-3">
        <CardHeader>
          <CardTitle className="font-headline">2D Heatmap</CardTitle>
        </CardHeader>
        <CardContent 
            ref={containerRef}
            className="flex-grow relative p-0 overflow-auto bg-muted/20 cursor-grab"
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
            onDoubleClick={handleDoubleClick}
            onClick={handleClick}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div style={{ position: 'relative', width: `${gridSize!.width * CELL_SIZE}px`, height: `${gridSize!.height * CELL_SIZE}px`}}>
                <canvas
                    ref={canvasRef}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        transformOrigin: 'top left',
                        transform: `scale(${transform.scale})`,
                    }}
                />
            </div>

            {hoveredPoint && (
              <div
                className="fixed p-2 text-xs rounded-md shadow-lg pointer-events-none bg-popover text-popover-foreground border z-20"
                style={{
                  left: `${hoveredPoint.clientX + 15}px`,
                  top: `${hoveredPoint.clientY - 30}px`,
                }}
              >
                <div className="font-bold">X: {hoveredPoint.x}, Y: {hoveredPoint.y}</div>
                <div>Raw Thick: {hoveredPoint.rawThickness?.toFixed(2) ?? 'ND'} mm</div>
                <div>Eff. Thick: {hoveredPoint.effectiveThickness?.toFixed(2) ?? 'ND'} mm</div>
                <div>Percentage: {hoveredPoint.percentage?.toFixed(1) ?? 'N/A'}%</div>
              </div>
            )}
            <div className="absolute bottom-2 right-2 text-xs text-muted-foreground pointer-events-none p-2 rounded bg-background/80 border z-10">
              <p className="flex items-center gap-1"><MousePointer className="h-3 w-3"/> Drag to Pan</p>
              <p className="flex items-center gap-1"><ZoomIn className="h-3 w-3"/> Scroll to Zoom</p>
              <p className="flex items-center gap-1"><Search className="h-3 w-3"/> Dbl-Click to Reset</p>
            </div>
        </CardContent>
      </Card>
      <div className="md:col-span-1 space-y-4">
        <Card>
            <CardHeader>
                <CardTitle className="font-headline text-lg">Controls</CardTitle>
            </CardHeader>
            <CardContent>
                <RadioGroup value={colorMode} onValueChange={(val) => setColorMode(val as ColorMode)} className="space-y-2">
                    <Label>Color Scale</Label>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="mm" id="mm-2d" />
                      <Label htmlFor="mm-2d" className="flex items-center gap-2 font-normal"><Ruler className="h-4 w-4"/> Absolute (mm)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="%" id="pct-2d" />
                      <Label htmlFor="pct-2d" className="flex items-center gap-2 font-normal"><Percent className="h-4 w-4"/>Normalized (%)</Label>
                    </div>
                </RadioGroup>
            </CardContent>
        </Card>
        {stats && nominalThickness && (
          <ColorLegend mode={colorMode} stats={stats} nominalThickness={nominalThickness} />
        )}
      </div>
    </div>
  )
}
