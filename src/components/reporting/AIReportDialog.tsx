"use client"

import React, { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useInspectionStore } from '@/store/use-inspection-store'
import { useReportStore } from '@/store/use-report-store'
import { generateAIReport, type AIReportData } from '@/reporting/AIReportGenerator'
import { identifyPatches, type IdentifiedPatch } from '@/reporting/patch-detector'
import type { ReportMetadata } from '@/lib/types'
import { generateReportSummary } from '@/ai/flows/generate-report-summary'
import { generatePatchSummary } from '@/ai/flows/generate-patch-summary'
import { useToast } from '@/hooks/use-toast'

const reportSchema = z.object({
  companyName: z.string().optional(),
  projectName: z.string().optional(),
  assetName: z.string().optional(),
  scanDate: z.date().optional(),
  reportDate: z.date().optional(),
  area: z.string().optional(),
  operatorName: z.string().optional(),
  remarks: z.string().optional(),
})

type ReportFormValues = z.infer<typeof reportSchema>

interface AIReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AIReportDialog({ open, onOpenChange }: AIReportDialogProps) {
  const { inspectionResult } = useInspectionStore()
  const { captureFunctions, isReady } = useReportStore()
  const [isGenerating, setIsGenerating] = useState(false)
  const { toast } = useToast()
  
  const defaultScanDate = React.useMemo(() => {
    if (!inspectionResult?.plates[0]?.metadata) return undefined;
    const dateMeta = inspectionResult.plates[0].metadata.find(m => String(m[0]).toLowerCase().includes('date'));
    if (!dateMeta || !dateMeta[1]) return undefined;

    if (typeof dateMeta[1] === 'number') {
      return new Date(Date.UTC(1899, 11, 30 + dateMeta[1]));
    }
    const parsedDate = new Date(dateMeta[1]);
    if (!isNaN(parsedDate.getTime()) && String(dateMeta[1]).length > 5) {
      return parsedDate;
    }
    return undefined;
  }, [inspectionResult]);

  const { control, handleSubmit, register } = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      reportDate: new Date(),
      scanDate: defaultScanDate,
      assetName: inspectionResult?.plates.map(p => p.fileName.replace('.xlsx', '')).join(', ') || 'N/A',
      projectName: inspectionResult?.plates[0]?.metadata.find(m => String(m[0]).toLowerCase().includes('project'))?.[1] || 'N/A'
    },
  })

  const onSubmit = async (data: ReportFormValues) => {
    if (!inspectionResult || !captureFunctions?.capture || !isReady) {
      toast({
        variant: "destructive",
        title: "Report Generation Error",
        description: "The 3D view is not ready or data is missing.",
      });
      return;
    }
    setIsGenerating(true)

    try {
        // 1. Identify defect patches
        const patches = identifyPatches(inspectionResult.mergedGrid, 20); // 20% threshold

        // 2. Capture screenshots
        if (captureFunctions.resetCamera) captureFunctions.resetCamera();
        await new Promise(resolve => setTimeout(resolve, 500)); // wait for camera
        const overviewScreenshot = captureFunctions.capture();

        const patchScreenshots: Record<string, string> = {};
        for (const patch of patches) {
            if (captureFunctions.focus) {
                captureFunctions.focus(patch.center.x, patch.center.y);
                await new Promise(resolve => setTimeout(resolve, 500)); // Wait for camera to move
            }
            const screenshot = captureFunctions.capture();
            if (screenshot) {
                patchScreenshots[patch.id] = screenshot;
            }
        }
        
        // 3. Generate AI summaries
        const overallSummary = await generateReportSummary(inspectionResult, patches);
        const patchSummaries: Record<string, string> = {};
        for (const patch of patches) {
             patchSummaries[patch.id] = await generatePatchSummary(patch, inspectionResult.nominalThickness, inspectionResult.assetType);
        }

        // 4. Assemble report data
        const reportData: AIReportData = {
            metadata: {
              ...data,
              companyName: data.companyName || 'N/A',
              projectName: data.projectName || 'N/A',
              assetName: data.assetName || 'N/A',
              area: data.area || 'N/A',
              operatorName: data.operatorName || 'N/A',
              remarks: data.remarks || 'N/A',
            },
            inspection: inspectionResult,
            patches,
            screenshots: {
                overview: overviewScreenshot,
                patches: patchScreenshots,
            },
            summaries: {
                overall: overallSummary,
                patches: patchSummaries,
            }
        };

        // 5. Generate PDF
        await generateAIReport(reportData);
        onOpenChange(false);
    } catch (error) {
        console.error("Failed to generate AI report", error);
        toast({
          variant: "destructive",
          title: "Report Generation Failed",
          description: error instanceof Error ? error.message : "An unknown error occurred.",
        });
    } finally {
        setIsGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Generate AI-Powered Report</DialogTitle>
            <DialogDescription>
              Fill in the details for the report. Blank fields will be marked "N/A".
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-6 max-h-[70vh] overflow-y-auto pr-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input id="companyName" {...register('companyName')} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="projectName">Project Name</Label>
                    <Input id="projectName" {...register('projectName')} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="assetName">Equipment / Asset Name</Label>
                    <Input id="assetName" {...register('assetName')} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="area">Area / Region</Label>
                    <Input id="area" {...register('area')} />
                </div>
            </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Date of Scanning</Label>
                    <Controller
                        name="scanDate"
                        control={control}
                        render={({ field }) => (
                            <Popover>
                                <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus/>
                                </PopoverContent>
                            </Popover>
                        )}
                    />
                </div>
                 <div className="space-y-2">
                    <Label>Date of Report</Label>
                     <Controller
                        name="reportDate"
                        control={control}
                        render={({ field }) => (
                           <Popover>
                                <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus/>
                                </PopoverContent>
                            </Popover>
                        )}
                    />
                </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="operatorName">Operator Name</Label>
                <Input id="operatorName" {...register('operatorName')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="remarks">Remarks</Label>
              <Textarea id="remarks" {...register('remarks')} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>Cancel</Button>
            <Button type="submit" disabled={isGenerating || !isReady}>
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isGenerating ? 'Generating...' : 'Generate AI Report'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
