
"use client"

import React, { useEffect } from 'react'
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
import { Calendar as CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useInspectionStore } from '@/store/use-inspection-store'
import { useReportStore } from '@/store/use-report-store'
import { useToast } from '@/hooks/use-toast'
import type { ReportMetadata } from '@/lib/types'

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
  const { reportMetadata, setReportMetadata, defectThreshold } = useReportStore()
  const { toast } = useToast()
  
  const defaultScanDate = React.useMemo(() => {
    if (!inspectionResult?.plates[0]?.metadata) return undefined;
    const dateMeta = inspectionResult.plates[0].metadata.find(m => String(m[0]).toLowerCase().includes('date'));
    if (!dateMeta || !dateMeta[1]) return undefined;

    if (typeof dateMeta[1] === 'number') {
        const jsDate = new Date((dateMeta[1] - 25569) * 86400 * 1000);
        return isNaN(jsDate.getTime()) ? undefined : jsDate;
    }
    
    const dateString = String(dateMeta[1]);
    const parsedDate = new Date(dateString);
    return isNaN(parsedDate.getTime()) ? undefined : parsedDate;
  }, [inspectionResult]);

  const { control, handleSubmit, register, reset } = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema),
  });

  useEffect(() => {
    const defaultValues: ReportFormValues = {
      reportDate: reportMetadata?.reportDate || new Date(),
      scanDate: reportMetadata?.scanDate || defaultScanDate,
      assetName: reportMetadata?.assetName || inspectionResult?.plates.map(p => p.fileName.replace('.xlsx', '')).join(', ') || 'N/A',
      projectName: reportMetadata?.projectName || inspectionResult?.plates[0]?.metadata?.find(m => String(m[0]).toLowerCase().includes('project'))?.[1] || 'N/A',
      companyName: reportMetadata?.companyName || '',
      area: reportMetadata?.area || '',
      operatorName: reportMetadata?.operatorName || '',
      remarks: reportMetadata?.remarks || '',
    };
    reset(defaultValues);
  }, [inspectionResult, reportMetadata, defaultScanDate, reset, open]);


  const onSubmit = (data: ReportFormValues) => {
    const finalMetadata: ReportMetadata = {
        ...data,
        companyName: data.companyName || 'N/A',
        projectName: data.projectName || 'N/A',
        assetName: data.assetName || 'N/A',
        area: data.area || 'N/A',
        operatorName: data.operatorName || 'N/A',
        remarks: data.remarks || 'N/A',
        defectThreshold: defectThreshold,
    };
    setReportMetadata(finalMetadata);
    toast({
      title: "Report Details Saved",
      description: "You can now generate the final report.",
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Add/Edit Report Details</DialogTitle>
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">
              Save Details
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
