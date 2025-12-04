'use server';
/**
 * @fileOverview A Genkit flow to generate a summary for a specific corrosion patch.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const PatchSummaryInputSchema = z.object({
    patchId: z.number().describe('The ID of the corrosion patch.'),
    xMin: z.number(),
    xMax: z.number(),
    yMin: z.number(),
    yMax: z.number(),
    patchArea: z.string(),
    minThickness: z.string(),
    avgThickness: z.string(),
    severity: z.string(),
    nominalThickness: z.number().describe('The nominal thickness of the asset in mm.'),
    assetType: z.string().describe('The type of asset, e.g., "Pipe" or "Tank".'),
    defectThreshold: z.number().describe('The user-defined threshold for what constitutes a critical defect.')
});


const PatchSummaryOutputSchema = z.object({
  summary: z.string().describe('A concise, professional summary of the patch condition, location, severity, and a recommendation. Use NDT-style language.')
});

export async function generatePatchSummary(
    patch: any, 
    nominalThickness: number, 
    assetType: string,
    defectThreshold: number,
): Promise<string> {
    const input = {
        patchId: patch.id,
        xMin: patch.coordinates.xMin,
        xMax: patch.coordinates.xMax,
        yMin: patch.coordinates.yMin,
        yMax: patch.coordinates.yMax,
        patchArea: patch.boundingBox.toFixed(0),
        minThickness: patch.minThickness.toFixed(2),
        avgThickness: patch.avgThickness.toFixed(2),
        severity: patch.severity,
        nominalThickness,
        assetType,
        defectThreshold,
    };
    const result = await patchSummaryFlow(input);
    return result.summary;
}

const prompt = ai.definePrompt({
    name: 'patchSummaryPrompt',
    input: { schema: PatchSummaryInputSchema },
    output: { schema: PatchSummaryOutputSchema },
    prompt: `You are an expert NDT analyst. Generate a concise engineering summary for the provided corrosion patch data.
The user has defined the critical defect threshold at {{defectThreshold}}% remaining thickness.
Focus on corrosion severity, remaining thickness, patch location, and a clear recommendation. Use professional, direct NDT-style language.

Example Output:
"Corrosion Patch #{{patchId}} shows significant localized thinning around X={{xMin}}-{{xMax}} / Y={{yMin}}-{{yMax}}. Minimum thickness is {{minThickness}}mm. Recommended immediate localized repair and monitoring."

Data:
- Patch ID: {{patchId}}
- Asset Type: {{{assetType}}}
- Nominal Thickness: {{{nominalThickness}}}mm
- Patch Bounding Box: X={{xMin}}-{{xMax}}, Y={{yMin}}-{{yMax}}
- Patch Area: {{patchArea}}mm²
- Minimum Thickness in Patch: {{minThickness}}mm
- Average Thickness in Patch: {{avgThickness}}mm
- Severity: {{severity}}

Generate the summary now.`,
});


const patchSummaryFlow = ai.defineFlow(
  {
    name: 'patchSummaryFlow',
    inputSchema: PatchSummaryInputSchema,
    outputSchema: PatchSummaryOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
