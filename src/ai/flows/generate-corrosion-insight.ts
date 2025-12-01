'use server';
/**
 * @fileOverview This file defines a Genkit flow for generating insights about asset corrosion, including a recommendation for action.
 *
 * - generateCorrosionInsight - A function that generates insights about the asset's corrosion condition.
 * - CorrosionInsightInput - The input type for the generateCorrosionInsight function.
 * - CorrosionInsightOutput - The return type for the generateCorrosionInsight function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const CorrosionInsightInputSchema = z.object({
  assetType: z.string().describe('The type of asset being inspected (e.g., Plate, Tank, Pipe).'),
  nominalThickness: z.number().describe('The nominal thickness of the asset in millimeters.'),
  minThickness: z.number().describe('The minimum measured effective thickness of the asset in millimeters.'),
  maxThickness: z.number().describe('The maximum measured effective thickness of the asset in millimeters.'),
  avgThickness: z.number().describe('The average measured effective thickness of the asset in millimeters.'),
  areaBelow80: z.number().describe('The percentage of the inspected area with thickness below 80% of the nominal thickness.'),
  areaBelow70: z.number().describe('The percentage of the inspected area with thickness below 70% of the nominal thickness.'),
  areaBelow60: z.number().describe('The percentage of the inspected area with thickness below 60% of the nominal thickness.'),
  worstLocationX: z.number().describe('The X coordinate of the location with the minimum thickness.'),
  worstLocationY: z.number().describe('The Y coordinate of the location with the minimum thickness.'),
  minPercentage: z.number().describe('The minimum effective thickness as a percentage of the nominal thickness.'),
});
export type CorrosionInsightInput = z.infer<typeof CorrosionInsightInputSchema>;

const CorrosionInsightOutputSchema = z.object({
  condition: z.string().describe('A summary of the corrosion condition (e.g., Healthy, Moderate, Severe, Critical).'),
  recommendation: z.string().describe('A recommendation for action based on the corrosion condition (e.g., Continue, Monitor, Repair, Immediate Action).'),
});
export type CorrosionInsightOutput = z.infer<typeof CorrosionInsightOutputSchema>;

export async function generateCorrosionInsight(input: CorrosionInsightInput): Promise<CorrosionInsightOutput> {
  return generateCorrosionInsightFlow(input);
}

const prompt = ai.definePrompt({
  name: 'corrosionInsightPrompt',
  input: {schema: CorrosionInsightInputSchema},
  output: {schema: CorrosionInsightOutputSchema},
  prompt: `You are an expert in non-destructive testing (NDT) and corrosion analysis. Based on the provided data (using effective thickness), you will determine the overall corrosion condition of the asset and provide a recommendation for action.

Asset Type: {{{assetType}}}
Nominal Thickness: {{{nominalThickness}}} mm
Minimum Eff. Thickness: {{{minThickness}}} mm ({{{minPercentage}}}% of nominal)
Maximum Eff. Thickness: {{{maxThickness}}} mm
Average Eff. Thickness: {{{avgThickness}}} mm
Area Below 80% Nominal: {{{areaBelow80}}}%
Area Below 70% Nominal: {{{areaBelow70}}}%
Area Below 60% Nominal: {{{areaBelow60}}}%
Worst Location: X={{{worstLocationX}}}, Y={{{worstLocationY}}}

Consider the following condition evaluation rules based on minimum effective thickness percentage:
- If percentage >= 95% -> Healthy
- Else if 80% <= percentage < 95% -> Moderate
- Else if 60% <= percentage < 80% -> Severe
- Else if percentage < 60% -> Critical

Based on these rules and the data, determine the 'condition' (Healthy, Moderate, Severe, or Critical) and provide a 'recommendation' (e.g., Continue Routine Inspection, Increase Monitoring Frequency, Plan for Repair, Immediate Action Required).

Return your response in JSON format.
`,
});

const generateCorrosionInsightFlow = ai.defineFlow(
  {
    name: 'generateCorrosionInsightFlow',
    inputSchema: CorrosionInsightInputSchema,
    outputSchema: CorrosionInsightOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
