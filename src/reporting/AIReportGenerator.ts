import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib';
import { downloadFile } from '@/lib/utils';
import type { MergedInspectionResult, ReportMetadata } from '@/lib/types';
import { format } from 'date-fns';
import { IdentifiedPatch } from './patch-detector';

export interface AIReportData {
  metadata: ReportMetadata;
  inspection: MergedInspectionResult;
  patches: IdentifiedPatch[];
  screenshots: {
    overview: string;
    patches: Record<string, string>;
  };
  summaries: {
    overall: string;
    patches: Record<string, string>;
  };
}

const THEME_PRIMARY = rgb(0.12, 0.56, 1.0); // dodgerblue
const THEME_TEXT = rgb(0.1, 0.1, 0.1);
const THEME_MUTED = rgb(0.4, 0.4, 0.4);
const THEME_BG = rgb(0.95, 0.96, 0.98);

let helveticaFont: any;
let helveticaBoldFont: any;

async function drawHeader(page: any, data: AIReportData) {
    const { width } = page.getSize();
    page.drawText(data.metadata.companyName || 'N/A', {
        x: 50,
        y: page.getHeight() - 60,
        size: 20,
        font: helveticaBoldFont,
        color: THEME_PRIMARY,
    });
    page.drawText('AI Inspection Report', {
        x: width - 220,
        y: page.getHeight() - 60,
        size: 16,
        font: helveticaFont,
        color: THEME_TEXT,
    });
    page.drawLine({
        start: { x: 50, y: page.getHeight() - 75 },
        end: { x: width - 50, y: page.getHeight() - 75 },
        thickness: 1,
        color: THEME_PRIMARY,
    });
}

function drawSectionHeader(page: any, y: number, title: string) {
    page.drawText(title, { x: 50, y, font: helveticaBoldFont, size: 14, color: THEME_TEXT });
    page.drawLine({ start: { x: 50, y: y - 5 }, end: { x: page.getWidth() - 50, y: y - 5 }, thickness: 0.5, color: THEME_MUTED });
    return y - 25;
}

function drawField(page: any, y: number, label: string, value: string) {
    page.drawText(label, { x: 60, y, font: helveticaBoldFont, size: 10, color: THEME_MUTED });
    page.drawText(value, { x: 180, y, font: helveticaFont, size: 10, color: THEME_TEXT });
    return y - 20;
}

export async function generateAIReport(data: AIReportData) {
  const pdfDoc = await PDFDocument.create();
  helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page = pdfDoc.addPage(PageSizes.A4);
  let { width, height } = page.getSize();
  
  // --- PAGE 1: HEADER & SUMMARY ---
  await drawHeader(page, data);
  let y = height - 100;

  y = drawSectionHeader(page, y, 'Inspection Summary');

  y = drawField(page, y, 'Project:', data.metadata.projectName || 'N/A');
  y = drawField(page, y, 'Equipment:', data.metadata.assetName || 'N/A');
  y = drawField(page, y, 'Area:', data.metadata.area || 'N/A');
  y = drawField(page, y, 'Scan Date:', data.metadata.scanDate ? format(data.metadata.scanDate, 'PP') : 'N/A');
  y = drawField(page, y, 'Report Date:', data.metadata.reportDate ? format(data.metadata.reportDate, 'PP') : 'N/A');
  y = drawField(page, y, 'Operator:', data.metadata.operatorName || 'N/A');
  y -= 10;
  
  y = drawField(page, y, 'Nominal Thickness:', `${data.inspection.nominalThickness.toFixed(2)} mm`);
  y = drawField(page, y, 'Minimum Thickness:', `${data.inspection.stats.minThickness.toFixed(2)} mm (${data.inspection.stats.minPercentage.toFixed(1)}%)`);
  y = drawField(page, y, 'Defect Patches (<20%):', `${data.patches.length}`);
  y -= 10;
  
  // AI Summary
  const textLines = helveticaFont.getLinesOfText(data.summaries.overall, { maxWidth: width - 100, size: 11 });
  for (const line of textLines) {
    page.drawText(line, { x: 50, y, font: helveticaFont, size: 11, color: THEME_TEXT });
    y -= 15;
  }
  y -= 15;

  // Overview Screenshot
  if (data.screenshots.overview) {
    const overviewImage = await pdfDoc.embedPng(data.screenshots.overview);
    const imgDims = overviewImage.scaleToFit(width - 100, y - 100);
    page.drawImage(overviewImage, {
        x: (width - imgDims.width) / 2,
        y: y - imgDims.height,
        width: imgDims.width,
        height: imgDims.height,
    });
  }

  // --- PAGE 2: DEFECT TABLE ---
  if(data.patches.length > 0) {
    page = pdfDoc.addPage(PageSizes.A4);
    ({ width, height } = page.getSize());
    await drawHeader(page, data);
    y = height - 100;
    
    y = drawSectionHeader(page, y, `Critical Defect Patch Summary (<20% Remaining Wall)`);

    const tableHeaders = ['Patch ID', 'Min Thk (mm)', 'Avg Thk (mm)', 'Area (mm²)', 'X Range', 'Y Range'];
    const colWidths = [60, 80, 80, 80, 100, 100];
    let currentX = 50;
    
    tableHeaders.forEach((header, i) => {
        page.drawText(header, { x: currentX, y, font: helveticaBoldFont, size: 9 });
        currentX += colWidths[i];
    });
    y -= 20;
    
    for (const patch of data.patches) {
        if (y < 80) { // Add new page
            page = pdfDoc.addPage(PageSizes.A4);
            ({ width, height } = page.getSize());
            await drawHeader(page, data);
            y = height - 100;
        }
        currentX = 50;
        const row = [
            patch.id,
            patch.minThickness.toFixed(2),
            patch.avgThickness.toFixed(2),
            patch.boundingBox.toFixed(0),
            `${patch.coordinates.xMin}-${patch.coordinates.xMax}`,
            `${patch.coordinates.yMin}-${patch.coordinates.yMax}`,
        ];
        row.forEach((cell, i) => {
            page.drawText(String(cell), { x: currentX, y, font: helveticaFont, size: 9 });
            currentX += colWidths[i];
        });
        y -= 15;
    };
  }

  // --- PAGE 3+: INDIVIDUAL PATCHES ---
   for (const patch of data.patches) {
     page = pdfDoc.addPage(PageSizes.A4);
     ({ width, height } = page.getSize());
     await drawHeader(page, data);
     y = height - 100;

     y = drawSectionHeader(page, y, `Defect Patch #${patch.id} - ${patch.severity}`);
     
     const screenshot = data.screenshots.patches[patch.id];
     if (screenshot) {
        const defectImage = await pdfDoc.embedPng(screenshot);
        const imgDims = defectImage.scaleToFit(width / 2 - 75, 250);
        page.drawImage(defectImage, {
            x: 50,
            y: y - imgDims.height,
            width: imgDims.width,
            height: imgDims.height,
        });

        const statsX = width / 2 + 25;
        let statsY = y;
        statsY = drawField(page, statsY, 'Min Thickness:', `${patch.minThickness.toFixed(2)} mm`);
        statsY = drawField(page, statsY, 'Avg Thickness:', `${patch.avgThickness.toFixed(2)} mm`);
        statsY = drawField(page, statsY, 'Point Count:', `${patch.pointCount}`);
        statsY = drawField(page, statsY, 'Bounding Box:', `${patch.boundingBox.toFixed(0)} mm²`);
        statsY = drawField(page, statsY, 'X-Coordinates:', `${patch.coordinates.xMin} - ${patch.coordinates.xMax}`);
        statsY = drawField(page, statsY, 'Y-Coordinates:', `${patch.coordinates.yMin} - ${patch.coordinates.yMax}`);

        y -= (imgDims.height + 20);
     }
    
     y = drawSectionHeader(page, y, 'AI Analysis & Recommendation');
     const summary = data.summaries.patches[patch.id];
     if (summary) {
        const summaryLines = helveticaFont.getLinesOfText(summary, { maxWidth: width - 100, size: 11 });
        for (const line of summaryLines) {
            page.drawText(line, { x: 50, y, font: helveticaFont, size: 11, color: THEME_TEXT });
            y -= 15;
        }
     }
     y -= 20;

     y = drawSectionHeader(page, y, 'Notes');
     page.drawRectangle({
         x: 50,
         y: y - 150,
         width: width - 100,
         height: 150,
         borderColor: THEME_MUTED,
         borderWidth: 0.5,
     });
   }


  // --- FINAL PAGE: REMARKS ---
  page = pdfDoc.addPage(PageSizes.A4);
  ({ width, height } = page.getSize());
  await drawHeader(page, data);
  y = height - 100;

  y = drawSectionHeader(page, y, 'General Remarks');
  
  if (data.metadata.remarks && data.metadata.remarks !== 'N/A') {
    const remarkLines = helveticaFont.getLinesOfText(data.metadata.remarks, { maxWidth: width - 100, size: 11 });
    for(const line of remarkLines) {
        page.drawText(line, { x: 50, y, font: helveticaFont, size: 11 });
        y -= 15;
    }
  } else {
    page.drawText('No remarks provided.', { x: 50, y, font: helveticaFont, size: 11, color: THEME_MUTED });
  }

  y = 150;
  page.drawText('Operator Signature:', { x: 50, y, font: helveticaBoldFont, size: 11 });
  page.drawLine({ start: { x: 180, y: y - 2 }, end: { x: 380, y: y - 2 }, thickness: 0.5, color: THEME_TEXT });
  page.drawText(data.metadata.operatorName || 'N/A', { x: 180, y: y-15, font: helveticaFont, size: 10, color: THEME_MUTED });

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  downloadFile(blob, `AI_Report_${data.metadata.assetName || 'Asset'}.pdf`);
}
