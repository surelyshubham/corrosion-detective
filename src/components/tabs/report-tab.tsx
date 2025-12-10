

"use client"

import React, { useEffect, useState, useRef } from 'react'
import { useInspectionStore } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '../ui/button'
import { AIReportDialog } from '../reporting/AIReportDialog'
import { useReportStore } from '@/store/use-report-store'
import { useToast } from '@/hooks/use-toast'
import type { FinalReportPayload, ReportPatchSegment } from '@/reporting/DocxReportGenerator'
import { Progress } from '../ui/progress'
import { Slider } from '../ui/slider'
import { Label } from '../ui/label'
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import type { ThreeDeeViewRef } from './three-dee-view-tab'
import type { TwoDeeViewRef } from './two-dee-heatmap-tab'
import { ScrollArea } from '../ui/scroll-area'
import { Camera, Download, Edit, FileText, Info, Loader2, Lock, Pencil, UploadCloud } from 'lucide-react'
import ReportList from '../reporting/ReportList'
import { PatchVault } from '@/vaults/patchVault'
import { generatePatchSummary } from '@/ai/flows/generate-patch-summary'
import { canvasToArrayBuffer, downloadFile } from '@/lib/utils'
import { useFirebase } from '@/firebase'
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { pickTopPatches, type PatchMeta } from '@/utils/patchSelection'
import { generateDocxFromSelectedPatches } from '@/utils/docxClientGenerator'


interface ReportTabProps {
  threeDViewRef: React.RefObject<ThreeDeeViewRef>;
  twoDViewRef: React.RefObject<TwoDeeViewRef>;
}


export function ReportTab({ threeDViewRef, twoDViewRef }: ReportTabProps) {
  const { inspectionResult, segments } = useInspectionStore();
  const { toast } = useToast();
  const { app: firebaseApp } = useFirebase();
  const storage = firebaseApp ? getStorage(firebaseApp) : null;
  
  const threshold = useInspectionStore((s) => s.defectThreshold);
  const setThreshold = useInspectionStore((s) => s.setDefectThreshold);
  const setSegmentsForThreshold = useInspectionStore((s) => s.setSegmentsForThreshold);
  
  const {
    isGenerating,
    setIsGenerating,
    resetReportState,
    reportMetadata,
    detailsSubmitted,
    setReportMetadata,
    generationProgress,
    setGenerationProgress,
    isThresholdLocked,
    setIsThresholdLocked,
    enrichedSegments,
    setEnrichedSegments,
  } = useReportStore();
  
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const patchIds = enrichedSegments?.map(s => String(s.id)) || [];
  
  const captureFunctions3D = threeDViewRef.current;
  const captureFunctions2D = twoDViewRef.current;
  const isCaptureReady = !!captureFunctions3D?.capture && !!captureFunctions2D?.capture;

  useEffect(() => {
    resetReportState();
    if (inspectionResult) {
      setSegmentsForThreshold(threshold);
    }
    // Cleanup worker and vault on unmount
    return () => {
       PatchVault.clearAll();
    }
  }, [inspectionResult, resetReportState, setSegmentsForThreshold, threshold]);

  const handleThresholdChange = (value: number[]) => {
    const newThreshold = value[0];
    setThreshold(newThreshold);
  }
  
  const handleThresholdCommit = (value: number[]) => {
    const newThreshold = value[0];
    setSegmentsForThreshold(newThreshold);
  }

  const handleGenerateAndCapture = async () => {
    if (!isCaptureReady || !captureFunctions3D || !captureFunctions2D) {
      toast({
        variant: "destructive",
        title: "Views Not Ready",
        description: "Please wait a moment for the 2D/3D views to initialize.",
      });
      return;
    }

    if (!segments || segments.length === 0) {
      toast({
        variant: "destructive",
        title: "No Segments Detected",
        description: "No patches were found for the current threshold. Adjust the slider and try again.",
      });
      return;
    }
    
    setIsGenerating(true);
    const totalSteps = segments.length;
    setGenerationProgress({ current: 0, total: totalSteps, task: 'Starting Capture Sequence...' });
    
    // Clear previous captures
    PatchVault.clearAll();
    const finalSegments: ReportPatchSegment[] = [];

    const captureAndConvert = async (captureFn: () => string | HTMLCanvasElement): Promise<ArrayBuffer> => {
        const result = captureFn();
        if (typeof result === 'string') {
             // It's a data URL, fetch and convert
            const res = await fetch(result);
            return await res.arrayBuffer();
        }
        // It's a canvas element
        return canvasToArrayBuffer(result);
    };

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        setGenerationProgress({ current: i + 1, total: totalSteps, task: `Capturing views for Patch #${segment.id}` });
        
        captureFunctions3D.focus(segment.center.x, segment.center.y, true);
        await new Promise(resolve => setTimeout(resolve, 250));

        captureFunctions3D.setView('iso');
        await new Promise(resolve => setTimeout(resolve, 250));
        const isoViewBuffer = await captureAndConvert(captureFunctions3D.capture);

        captureFunctions3D.setView('top');
        await new Promise(resolve => setTimeout(resolve, 250));
        const topViewBuffer = await captureAndConvert(captureFunctions3D.capture);

        captureFunctions3D.setView('side');
        await new Promise(resolve => setTimeout(resolve, 250));
        const sideViewBuffer = await captureAndConvert(captureFunctions3D.capture);
        
        const heatmapBuffer = await captureAndConvert(captureFunctions2D.capture);
        
        const aiObservation = await generatePatchSummary(segment, inspectionResult?.nominalThickness || 0, inspectionResult?.assetType || 'N/A', threshold);

        const enrichedSegment: ReportPatchSegment = { ...segment, aiObservation };
        finalSegments.push(enrichedSegment);
        
         PatchVault.set(String(segment.id), {
            buffers: [
                { name: 'iso', buffer: isoViewBuffer, mime: 'image/png' },
                { name: 'top', buffer: topViewBuffer, mime: 'image/png' },
                { name: 'side', buffer: sideViewBuffer, mime: 'image/png' },
                { name: 'heat', buffer: heatmapBuffer, mime: 'image/png' },
            ],
            meta: {
                title: `Patch #${segment.id}`,
                summary: `${segment.tier} | Min: ${segment.worstThickness.toFixed(2)}mm`,
                ...segment
            }
        });
    }
      
    captureFunctions3D.resetCamera();
    setEnrichedSegments(finalSegments);
    setIsGenerating(false);
    setGenerationProgress(null);
    toast({
      title: "Visual Assets Captured",
      description: `Captured ${finalSegments.length} patches with 4 views each. Please fill in report details.`,
    });
  };
  
 const handleGenerateFinalReport = async () => {
    if (!enrichedSegments || enrichedSegments.length === 0 || !reportMetadata || !inspectionResult) {
        toast({
            variant: "destructive",
            title: "Cannot Generate Report",
            description: "Please capture assets and submit report details.",
        });
        return;
    }

    setIsGenerating(true);
    setGenerationProgress({percent:0, message:'Selecting top patches...'});
    
    try {
        const allMetas: PatchMeta[] = enrichedSegments.map((s, i) => ({
            id: String(s.id),
            severity: s.tier,
            maxDepth_mm: (inspectionResult.nominalThickness || 0) - s.worstThickness,
            avgDepth_mm: (inspectionResult.nominalThickness || 0) - s.avgThickness,
            area_m2: s.pointCount / 1_000_000,
            detectionIndex: i,
        }));
        
        const topPatchesMeta = pickTopPatches(allMetas, 10);
        setGenerationProgress({percent:5, message:`Gathering images for top ${topPatchesMeta.length} patches...`});

        const selectedPatches = topPatchesMeta.map(t => {
            const entry = PatchVault.get(t.id);
            const segment = enrichedSegments.find(s => String(s.id) === t.id);
            return {
                id: t.id,
                meta: entry?.meta || {},
                shortInsight: segment?.aiObservation || '',
                buffers: entry?.buffers || [],
            }
        });

        setGenerationProgress({percent:20, message:'Preparing global data...'});

        const metadata = {
            title: reportMetadata.projectName,
            assetId: reportMetadata.assetName,
            inspectionDate: reportMetadata.scanDate?.toISOString().slice(0, 10),
            inspector: reportMetadata.operatorName,
            globalStats: {
                totalPatches: segments?.length,
                totalCorrodedArea_m2: inspectionResult.stats.scannedArea,
            },
            recommendations: [inspectionResult.aiInsight?.recommendation || 'Review findings and schedule maintenance as required.'],
            globalImages: [], // This can be populated if global images are captured
        };

        setGenerationProgress({percent:30, message:'Generating DOCX in worker...'});

        const files = await generateDocxFromSelectedPatches(metadata, selectedPatches, (p) => setGenerationProgress(p));
        
        setGenerationProgress({percent:100, message:'Done. Triggering download...'});

        for (const f of files) {
          const url = URL.createObjectURL(f.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = f.name;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            URL.revokeObjectURL(url);
            try { a.remove(); } catch(e){}
          }, 2000);
        }

    } catch (error: any) {
        console.error("Report generation failed:", error);
        toast({
            variant: "destructive",
            title: "Report Generation Failed",
            description: error.message || "An unknown error occurred in the worker.",
        });
    } finally {
        setIsGenerating(false);
        setGenerationProgress(null);
    }
};

  
  const hasImages = enrichedSegments && enrichedSegments.length > 0;

  return (
    <ScrollArea className="h-full">
    <div className="p-1">
       <Card>
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2">
              <FileText className="text-primary"/>
              DOCX Report Generation
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-8">
            {/* --- STEP 1: THRESHOLD --- */}
            <div className="space-y-4 border p-4 rounded-lg">
                <h3 className="font-semibold flex items-center">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full font-bold bg-primary text-primary-foreground mr-3">1</span>
                    Configure Defect Threshold
                </h3>
                <div className="grid md:grid-cols-2 gap-4 items-center">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="defectThreshold">Threshold: {threshold}%</Label>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p className="max-w-xs">Areas with wall thickness below this % will be marked as defects.</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                        <Slider
                            id="defectThreshold"
                            min={10}
                            max={95}
                            step={5}
                            value={[threshold]}
                            onValueChange={handleThresholdChange}
                            onValueCommit={handleThresholdCommit}
                            disabled={isThresholdLocked}
                        />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <p className="text-sm text-center text-muted-foreground font-medium">
                            Detected Patches: <span className="font-bold text-foreground text-base">{segments?.length || 0}</span>
                        </p>
                        <Button 
                            className="w-full"
                            variant={isThresholdLocked ? "secondary" : "default"}
                            onClick={() => setIsThresholdLocked(!isThresholdLocked)}
                            disabled={isGenerating}
                        >
                            {isThresholdLocked ? <Edit className="mr-2" /> : <Lock className="mr-2" />}
                            {isThresholdLocked ? `Edit Threshold` : 'Confirm & Lock Threshold'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* --- STEP 2: CAPTURE --- */}
            <div className="space-y-4 border p-4 rounded-lg">
                <h3 className="font-semibold flex items-center">
                     <span className={`flex items-center justify-center w-6 h-6 rounded-full font-bold ${hasImages ? 'bg-green-500' : 'bg-primary'} text-primary-foreground mr-3`}>2</span>
                    Capture Visual Assets
                </h3>
                 {generationProgress && isGenerating && generationProgress.task.includes('Capturing') && (
                  <div className="space-y-2">
                    <Progress value={(generationProgress.current / generationProgress.total) * 100} />
                    <p className="text-xs text-muted-foreground text-center">{generationProgress.task}</p>
                  </div>
                 )}
                <Button 
                  className="w-full" 
                  onClick={handleGenerateAndCapture}
                  disabled={!isThresholdLocked || isGenerating}
                >
                  {isGenerating && generationProgress?.task.includes('Capturing') ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2" />}
                  {isGenerating && generationProgress?.task.includes('Capturing') ? 'Generating...' : (hasImages ? 'Re-Capture All Assets' : 'Start Capture Sequence')}
                </Button>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8">
                {/* --- STEP 3: DETAILS --- */}
                <div className="space-y-4 border p-4 rounded-lg">
                    <h3 className="font-semibold flex items-center">
                       <span className={`flex items-center justify-center w-6 h-6 rounded-full font-bold ${detailsSubmitted ? 'bg-green-500' : 'bg-primary'} text-primary-foreground mr-3`}>3</span>
                       Fill In Report Details
                    </h3>
                     <Button 
                      className="w-full" 
                      onClick={() => setIsReportDialogOpen(true)}
                      disabled={!hasImages || isGenerating}
                      variant="outline"
                    >
                      <Pencil className="mr-2" />
                      {detailsSubmitted ? 'Edit Report Details' : 'Add Report Details'}
                    </Button>
                </div>
                
                {/* --- IMAGE PREVIEW --- */}
                <div className="space-y-4 border p-4 rounded-lg min-h-[300px]">
                    <h3 className="font-semibold">Image Preview (Top 10 Patches)</h3>
                    {hasImages ? (
                        <ReportList patchIds={patchIds} />
                    ) : (
                      <div className="text-sm text-center text-muted-foreground py-10">No visual assets captured yet.</div>
                    )}
                </div>
            </div>

            {/* --- STEP 4: DOWNLOAD --- */}
            <div className="space-y-4 border p-4 rounded-lg">
                <h3 className="font-semibold flex items-center">
                   <span className={`flex items-center justify-center w-6 h-6 rounded-full font-bold bg-primary text-primary-foreground mr-3`}>4</span>
                   Create and Download DOCX (Client-Side)
                </h3>
                 {generationProgress && isGenerating && !generationProgress.task.includes('Capturing') && (
                  <div className="space-y-2">
                    <Progress value={generationProgress.percent} />
                    <p className="text-xs text-muted-foreground text-center">{generationProgress.message}</p>
                  </div>
                 )}
                <Button 
                  className="w-full" 
                  onClick={handleGenerateFinalReport}
                  disabled={!hasImages || !detailsSubmitted || isGenerating}
                >
                  {isGenerating && generationProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2" />}
                  {isGenerating && generationProgress ? 'Generating...' : 'Generate Top-10 Report'}
                </Button>
            </div>

          </CardContent>
        </Card>
        {<AIReportDialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen} />}
    </div>
    </ScrollArea>
  )
}
