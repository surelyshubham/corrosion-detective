'use server';
/**
 * @fileOverview A Genkit flow to generate a narrative summary for the entire inspection report.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { MergedInspectionResult } from '@/lib/types';
import type { IdentifiedPatch } from '@/reporting/patch-detector';

const ReportSummaryInputSchema = z.object({
  inspection: z.any().describe('The main inspection result object, containing overall stats.'),
  patches: z.array(z.any()).describe('An array of all identified critical corrosion patches.'),
});

const ReportSummaryOutputSchema = z.object({
  summary: z.string().describe('A narrative summary for the report\'s first page. It should be a professional, high-level overview of the inspection findings.')
});

export async function generateReportSummary(inspection: MergedInspectionResult, patches: IdentifiedPatch[]): Promise<string> {
  const result = await reportSummaryFlow({ inspection, patches });
  return result.summary;
}

const prompt = ai.definePrompt({
  name: 'reportSummaryPrompt',
  input: { schema: ReportSummaryInputSchema },
  output: { schema: ReportSummaryOutputSchema },
  prompt: `You are an expert NDT analyst. Generate a professional, high-level narrative summary for the first page of an inspection report based on the provided data.

Focus on the overall condition, the number of critical findings, and the most severe reading. Do not go into extreme detail on each patch, as that will be covered later.

Data:
- Asset Type: {{inspection.assetType}}
- Nominal Thickness: {{inspection.nominalThickness}}mm
- Minimum Thickness Found: {{inspection.stats.minThickness}}mm ({{inspection.stats.minPercentage.toFixed(1)}}% of nominal)
- Total Scanned Area: {{inspection.stats.scannedArea.toFixed(2)}} m²
- Number of Critical Defect Patches (<20%): {{patches.length}}
- Overall Condition Assessment: {{inspection.condition}}

Generate a concise summary suitable for a customer report.
Example: "The inspection of the {{inspection.assetType}} revealed a total of {{patches.length}} critical corrosion patches with wall thickness below 20% of nominal. The most severe finding was a measurement of {{inspection.stats.minThickness.toFixed(2)}}mm. The overall condition is rated as {{inspection.condition}}."
`,
});

const reportSummaryFlow = ai.defineFlow(
  {
    name: 'reportSummaryFlow',
    inputSchema: ReportSummaryInputSchema,
    outputSchema: ReportSummaryOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
