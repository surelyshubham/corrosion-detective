'use server';
/**
 * @fileOverview A Genkit flow to generate a summary for a specific corrosion patch.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { IdentifiedPatch } from '@/reporting/patch-detector';

const PatchSummaryInputSchema = z.object({
    patch: z.any().describe('The corrosion patch object with stats like min/avg thickness, bounding box, etc.'),
    nominalThickness: z.number().describe('The nominal thickness of the asset in mm.'),
    assetType: z.string().describe('The type of asset, e.g., "Pipe" or "Tank".')
});

const PatchSummaryOutputSchema = z.object({
  summary: z.string().describe('A concise, professional summary of the patch condition, location, severity, and a recommendation. Use NDT-style language.')
});

export async function generatePatchSummary(patch: IdentifiedPatch, nominalThickness: number, assetType: string): Promise<string> {
    const result = await patchSummaryFlow({ patch, nominalThickness, assetType });
    return result.summary;
}

const prompt = ai.definePrompt({
    name: 'patchSummaryPrompt',
    input: { schema: PatchSummaryInputSchema },
    output: { schema: PatchSummaryOutputSchema },
    prompt: `You are an expert NDT analyst. Generate a concise engineering summary for the provided corrosion patch data.
Focus on corrosion severity, remaining thickness, patch location, and a clear recommendation. Use professional, direct NDT-style language.

Example Output:
"Corrosion Patch #{{patch.id}} shows significant localized thinning around X={{patch.coordinates.xMin}}-{{patch.coordinates.xMax}} / Y={{patch.coordinates.yMin}}-{{patch.coordinates.yMax}}. Minimum thickness is {{patch.minThickness.toFixed(2)}}mm. Recommended immediate localized repair and monitoring."

Data:
- Patch ID: {{patch.id}}
- Asset Type: {{{assetType}}}
- Nominal Thickness: {{{nominalThickness}}}mm
- Patch Bounding Box: X={{patch.coordinates.xMin}}-{{patch.coordinates.xMax}}, Y={{patch.coordinates.yMin}}-{{patch.coordinates.yMax}}
- Patch Area: {{patch.boundingBox}}mm²
- Minimum Thickness in Patch: {{patch.minThickness.toFixed(2)}}mm
- Average Thickness in Patch: {{patch.avgThickness.toFixed(2)}}mm
- Severity: {{patch.severity}}

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
