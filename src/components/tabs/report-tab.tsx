
"use client"

import React, { useEffect, useState } from 'react'
import { useInspectionStore } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '../ui/button'
import { AIReportDialog } from '../reporting/AIReportDialog'
import { useReportStore } from '@/store/use-report-store'
import { useToast } from '@/hooks/use-toast'
import { identifyPatches } from '@/reporting/patch-detector'
import { generateAIReport, AIReportData } from '@/reporting/AIReportGenerator'
import { generateReportSummary } from '@/ai/flows/generate-report-summary'
import { generateAllPatchSummaries } from '@/ai/flows/generate-all-patch-summaries'
import { Progress } from '../ui/progress'
import { Slider } from '../ui/slider'
import { Label } from '../ui/label'
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import type { ThreeDeeViewRef } from './three-dee-view-tab'
import { ScrollArea } from '../ui/scroll-area'
import { Camera, Download, Edit, FileText, Info, Loader2, Lock, Pencil } from 'lucide-react'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '../ui/carousel'
import Image from 'next/image'

interface ReportTabProps {
  viewRef: React.RefObject<ThreeDeeViewRef>;
}

export function ReportTab({ viewRef }: ReportTabProps) {
  const { inspectionResult } = useInspectionStore();
  const { toast } = useToast();
  
  const {
    isGeneratingScreenshots,
    setIsGeneratingScreenshots,
    screenshotsReady,
    setScreenshotData,
    resetReportState,
    reportMetadata,
    setReportMetadata,
    detailsSubmitted,
    patches,
    setPatches,
    globalScreenshots,
    patchScreenshots,
    captureProgress,
    setCaptureProgress,
    defectThreshold,
    setDefectThreshold,
    isThresholdLocked,
    setIsThresholdLocked,
  } = useReportStore();
  
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [isGeneratingFinalReport, setIsGeneratingFinalReport] = useState(false);
  
  const captureFunctions = viewRef.current;
  const is3dViewReady = !!captureFunctions?.capture;

  useEffect(() => {
    // Reset report state if inspection data changes
    resetReportState();
  }, [inspectionResult, resetReportState]);

  // Live patch detection when slider changes
  useEffect(() => {
    if (inspectionResult && !isThresholdLocked) {
      const detected = identifyPatches(inspectionResult.mergedGrid, defectThreshold);
      setPatches(detected);
    }
  }, [defectThreshold, inspectionResult, setPatches, isThresholdLocked]);


  const handleGenerateScreenshots = async () => {
    if (!is3dViewReady) {
      toast({
        variant: "destructive",
        title: "3D Engine Not Ready",
        description: "Please wait a moment for the 3D view to initialize, then try again.",
      });
      return;
    }
    
    setIsGeneratingScreenshots(true);
    setCaptureProgress({ current: 0, total: 1 });

    try {
      const identifiedPatches = patches; 
      const totalImages = 3 + (identifiedPatches.length * 2);
      setCaptureProgress({ current: 0, total: totalImages });
      
      const capturedGlobalScreenshots: any = {};
      const capturedPatchScreenshots: Record<string, any> = {};
      
      await new Promise(resolve => setTimeout(resolve, 500));

      const globalViews: ('iso' | 'top' | 'side')[] = ['iso', 'top', 'side'];
      for (const view of globalViews) {
        setCaptureProgress(prev => ({ current: (prev?.current ?? 0) + 1, total: totalImages }));
        captureFunctions.setView(view);
        await new Promise(resolve => setTimeout(resolve, 500));
        const screenshot = captureFunctions.capture();
        if (screenshot) {
          capturedGlobalScreenshots[view] = screenshot;
        } else {
            throw new Error(`Failed to capture global ${view} view.`);
        }
      }

      for (const patch of identifiedPatches) {
        captureFunctions.focus(patch.center.x, patch.center.y, true);
        
        setCaptureProgress(prev => ({ current: (prev?.current ?? 0) + 1, total: totalImages }));
        captureFunctions.setView('iso');
        await new Promise(resolve => setTimeout(resolve, 500));
        const isoScreenshot = captureFunctions.capture();
        
        setCaptureProgress(prev => ({ current: (prev?.current ?? 0) + 1, total: totalImages }));
        captureFunctions.setView('top');
        await new Promise(resolve => setTimeout(resolve, 500));
        const topScreenshot = captureFunctions.capture();
        
        captureFunctions.resetCamera();

        if (isoScreenshot && topScreenshot) {
          capturedPatchScreenshots[patch.id] = { iso: isoScreenshot, top: topScreenshot };
        } else {
            throw new Error(`Failed to capture patch ${patch.id} images.`);
        }
      }
      
      captureFunctions.resetCamera();

      setScreenshotData({
        global: capturedGlobalScreenshots,
        patches: capturedPatchScreenshots,
      });

      toast({
        title: "Screenshots Generated Successfully",
        description: `Captured ${totalImages} images. You can now add report details.`,
      });

    } catch (error) {
      console.error("Failed to generate screenshots", error);
      toast({
        variant: "destructive",
        title: "Screenshot Generation Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
      });
      // Do not reset the entire state, just the capturing part
      setIsGeneratingScreenshots(false);
      setCaptureProgress(null);
    }
  };
  
  const handleGenerateFinalReport = async () => {
      if (!screenshotsReady || !reportMetadata) {
        toast({
            variant: "destructive",
            title: "Cannot Generate Report",
            description: "Please ensure screenshots are generated and report details are submitted.",
        });
        return;
      }
      setIsGeneratingFinalReport(true);
      try {
        const overallSummary = await generateReportSummary(inspectionResult!, patches, defectThreshold);

        let patchSummaries: Record<string, string> = {};
        if (patches.length > 0) {
            const allPatchesInput = {
                patches: patches.map(p => ({
                    patchId: p.id,
                    minThickness: p.minThickness.toFixed(2),
                    severity: p.severity,
                    xMin: p.coordinates.xMin,
                    xMax: p.coordinates.xMax,
                    yMin: p.coordinates.yMin,
                    yMax: p.coordinates.yMax,
                })),
                assetType: inspectionResult!.assetType,
                nominalThickness: inspectionResult!.nominalThickness,
                defectThreshold: defectThreshold,
            };
            const allSummariesResult = await generateAllPatchSummaries(allPatchesInput);
            for (const summary of allSummariesResult.summaries) {
                patchSummaries[summary.patchId] = summary.summary;
            }
        }
        
        if (patches.length === 0 && !overallSummary) {
          toast({
            title: "No Critical Defects Found",
            description: `Generating a report indicating no issues below the ${defectThreshold}% threshold.`,
          });
        }

        const reportData: AIReportData = {
            metadata: { ...reportMetadata, defectThreshold },
            inspection: inspectionResult!,
            patches,
            screenshots: {
                global: globalScreenshots!,
                patches: patchScreenshots,
            },
            summaries: {
                overall: overallSummary || `No critical corrosion areas detected below ${defectThreshold}% remaining wall thickness.`,
                patches: patchSummaries,
            }
        };
        await generateAIReport(reportData);

      } catch (error) {
        console.error("Failed to generate final AI report", error);
        toast({
          variant: "destructive",
          title: "Report Generation Failed",
          description: error instanceof Error ? error.message : "An unknown error occurred.",
        });
      } finally {
          setIsGeneratingFinalReport(false);
      }
  };

  return (
    <ScrollArea className="h-full">
    <div className="p-1">
       <Card>
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2">
              <FileText className="text-primary"/>
              Report Generation
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
                            <Label htmlFor="defectThreshold">Threshold: {defectThreshold}%</Label>
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
                            max={90}
                            step={5}
                            value={[defectThreshold]}
                            onValueChange={(value) => setDefectThreshold(value[0])}
                            disabled={isThresholdLocked}
                        />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <p className="text-sm text-center text-muted-foreground font-medium">
                            Detected Patches: <span className="font-bold text-foreground text-base">{patches.length}</span>
                        </p>
                        <Button 
                            className="w-full"
                            variant={isThresholdLocked ? "secondary" : "default"}
                            onClick={() => setIsThresholdLocked(!isThresholdLocked)}
                            disabled={isGeneratingScreenshots}
                        >
                            {isThresholdLocked ? <Edit className="mr-2" /> : <Lock className="mr-2" />}
                            {isThresholdLocked ? `Edit Threshold` : 'Confirm Threshold'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* --- STEP 2: CAPTURE --- */}
            <div className="space-y-4 border p-4 rounded-lg">
                <h3 className="font-semibold flex items-center">
                     <span className={`flex items-center justify-center w-6 h-6 rounded-full font-bold ${screenshotsReady ? 'bg-green-500' : 'bg-primary'} text-primary-foreground mr-3`}>2</span>
                    Capture Visual Assets
                </h3>
                 {captureProgress && (
                  <div className="space-y-2">
                    <Progress value={(captureProgress.current / captureProgress.total) * 100} />
                    <p className="text-xs text-muted-foreground text-center">Capturing image {captureProgress.current} of {captureProgress.total}...</p>
                  </div>
                 )}
                <Button 
                  className="w-full" 
                  onClick={handleGenerateScreenshots}
                  disabled={!isThresholdLocked || isGeneratingScreenshots || screenshotsReady}
                >
                  {isGeneratingScreenshots ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2" />}
                  {isGeneratingScreenshots ? 'Generating...' : (screenshotsReady ? 'Screenshots Ready' : 'Start Capture Sequence')}
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
                      disabled={!screenshotsReady}
                      variant="outline"
                    >
                      <Pencil className="mr-2" />
                      {detailsSubmitted ? 'Edit Report Details' : 'Add Report Details'}
                    </Button>
                </div>
                
                {/* --- IMAGE PREVIEW --- */}
                <div className="space-y-4 border p-4 rounded-lg">
                    <h3 className="font-semibold">Image Preview</h3>
                    <Carousel className="w-full max-w-sm mx-auto">
                      <CarouselContent>
                        {globalScreenshots?.iso && <CarouselItem><Card><CardContent className="p-2"><Image src={globalScreenshots.iso} alt="ISO" width={300} height={200} className="rounded-md" /></CardContent></Card></CarouselItem>}
                        {globalScreenshots?.top && <CarouselItem><Card><CardContent className="p-2"><Image src={globalScreenshots.top} alt="Top" width={300} height={200} className="rounded-md" /></CardContent></Card></CarouselItem>}
                        {globalScreenshots?.side && <CarouselItem><Card><CardContent className="p-2"><Image src={globalScreenshots.side} alt="Side" width={300} height={200} className="rounded-md" /></CardContent></Card></CarouselItem>}
                        {Object.entries(patchScreenshots).map(([id, imgs]) => (
                            <React.Fragment key={id}>
                                <CarouselItem><Card><CardHeader className="p-2 pb-0"><CardTitle className="text-sm">Patch {id} ISO</CardTitle></CardHeader><CardContent className="p-2"><Image src={imgs.iso} alt={`Patch ${id} ISO`} width={300} height={200} className="rounded-md" /></CardContent></Card></CarouselItem>
                                <CarouselItem><Card><CardHeader className="p-2 pb-0"><CardTitle className="text-sm">Patch {id} Top</CardTitle></CardHeader><CardContent className="p-2"><Image src={imgs.top} alt={`Patch ${id} Top`} width={300} height={200} className="rounded-md" /></CardContent></Card></CarouselItem>
                            </React.Fragment>
                        ))}
                      </CarouselContent>
                      <CarouselPrevious />
                      <CarouselNext />
                    </Carousel>
                </div>
            </div>

            {/* --- STEP 4: DOWNLOAD --- */}
            <div className="space-y-4 border p-4 rounded-lg">
                <h3 className="font-semibold flex items-center">
                   <span className={`flex items-center justify-center w-6 h-6 rounded-full font-bold bg-primary text-primary-foreground mr-3`}>4</span>
                   Create and Download PDF
                </h3>
                <Button 
                  className="w-full" 
                  onClick={handleGenerateFinalReport}
                  disabled={!screenshotsReady || !detailsSubmitted || isGeneratingFinalReport}
                >
                  {isGeneratingFinalReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2" />}
                  {isGeneratingFinalReport ? 'Generating...' : 'Generate Final Report'}
                </Button>
            </div>

          </CardContent>
        </Card>
        {<AIReportDialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen} />}
    </div>
    </ScrollArea>
  )
}

    