
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ImageRun,
  Header,
  VerticalAlign,
  BorderStyle,
} from "docx";
import type { MergedInspectionResult, ReportMetadata, SegmentBox } from '@/lib/types';
import { format } from 'date-fns';

const SIGMA_LOGO_BASE64 = "data:image/png;base64,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";

export interface ReportData {
  metadata: ReportMetadata & { defectThreshold: number };
  inspection: MergedInspectionResult;
  segments: SegmentBox[];
  images: {
    fullModel3D?: string;
    fullHeatmap2D?: string;
    segmentShots?: { segmentId: number; imageDataUrl: string }[];
  };
}

function dataUriToBuffer(dataUri: string): ArrayBuffer {
    if (!dataUri || !dataUri.includes(',')) {
        const errorPart = dataUri ? dataUri.substring(0, 50) + '...' : 'null or empty';
        throw new Error(`Invalid data URI. It does not contain a comma. Start of URI: ${errorPart}`);
    }
    const base64 = dataUri.split(',')[1];
    if (!base64) {
        throw new Error('Invalid data URI, base64 content is missing.');
    }
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

export async function generateReportDocx(data: ReportData) {
  const { metadata, inspection, segments, images } = data;
  
  if (!inspection) {
    console.error("generateReportDocx called with no inspection data.");
    return;
  }
  
  const stats = inspection.stats;

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
           new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: dataUriToBuffer(SIGMA_LOGO_BASE64),
                transformation: { width: 200, height: 48 },
              }),
            ],
            spacing: { after: 200 },
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "Corrosion Inspection Report",
                bold: true,
                size: 36,
              }),
            ],
          }),

          new Paragraph({
            text: "1.0 Executive Summary",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),
           new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Client Name")] }),
                  new TableCell({ children: [new Paragraph(String(metadata.companyName || "-"))] }),
                  new TableCell({ children: [new Paragraph("Scan Date")] }),
                  new TableCell({ children: [new Paragraph(metadata.scanDate ? format(metadata.scanDate, 'PP') : "-")] }),
                ],
              }),
               new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Project Name")] }),
                  new TableCell({ children: [new Paragraph(String(metadata.projectName || "-"))] }),
                  new TableCell({ children: [new Paragraph("Report Date")] }),
                  new TableCell({ children: [new Paragraph(metadata.reportDate ? format(metadata.reportDate, 'PP') : "-")] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Asset / Equipment")] }),
                  new TableCell({ children: [new Paragraph(String(metadata.assetName || "-"))] }),
                   new TableCell({ children: [new Paragraph("Operator")] }),
                  new TableCell({ children: [new Paragraph(String(metadata.operatorName || "-"))] }),
                ],
              }),
            ],
           }),

          new Paragraph({
            text: "2.0 Inspection Statistics",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Overall Condition")] }),
                  new TableCell({ children: [new Paragraph(String(inspection.condition || "-"))] }),
                  new TableCell({ children: [new Paragraph("Nominal Thickness")] }),
                  new TableCell({ children: [new Paragraph(`${stats.nominalThickness.toFixed(2)} mm`)] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Minimum Thickness")] }),
                  new TableCell({ children: [new Paragraph(`${stats.minThickness?.toFixed(2) || "-"} mm (${stats.minPercentage?.toFixed(1) || "-"}%)`)] }),
                   new TableCell({ children: [new Paragraph("Maximum Thickness")] }),
                  new TableCell({ children: [new Paragraph(`${stats.maxThickness?.toFixed(2) || "-"} mm`)] }),
                ],
              }),
               new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Average Thickness")] }),
                  new TableCell({ children: [new Paragraph(`${stats.avgThickness?.toFixed(2) || "-"} mm`)] }),
                  new TableCell({ children: [new Paragraph("Worst Location")] }),
                  new TableCell({ children: [new Paragraph(stats.worstLocation ? `X:${stats.worstLocation.x}, Y:${stats.worstLocation.y}`: "-")] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Total Scanned Area")] }),
                  new TableCell({ children: [new Paragraph(`${stats.scannedArea.toFixed(2)} m²`)] }),
                  new TableCell({ children: [new Paragraph("Defect Threshold")] }),
                  new TableCell({ children: [new Paragraph(`< ${metadata.defectThreshold}%`)] }),
                ],
              }),
            ],
          }),
          
          new Paragraph({ text: "", pageBreakBefore: true }),

          new Paragraph({
            text: "3.0 Overall Asset Views",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),
          
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("3.1 3D Surface View")],
          }),

          ...(images.fullModel3D
            ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new ImageRun({
                      data: dataUriToBuffer(images.fullModel3D),
                      transformation: { width: 500, height: 250 },
                    }),
                  ],
                }),
              ]
            : []),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("3.2 2D Heatmap View")],
            spacing: { before: 200 },
          }),

          ...(images.fullHeatmap2D
            ? [
                new Paragraph({
                   alignment: AlignmentType.CENTER,
                  children: [
                    new ImageRun({
                      data: dataUriToBuffer(images.fullHeatmap2D),
                      transformation: { width: 500, height: 250 },
                    }),
                  ],
                }),
              ]
            : []),
          
            ...(segments && segments.length > 0 ? [new Paragraph({ text: "", pageBreakBefore: true })] : []),
            
            ...(segments && segments.length > 0 ? [new Paragraph({
                text: "4.0 Defect Areas Summary",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 200 },
            })] : []),
            
            ...segments.flatMap((segment, index) => {
              const segmentImage = images.segmentShots?.find(shot => shot.segmentId === segment.id);
              return [
                new Paragraph({
                  text: `4.${index + 1} Defect Patch #${segment.id}`,
                  heading: HeadingLevel.HEADING_2,
                  spacing: { before: 300, after: 150 },
                }),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({ children: [new Paragraph("Severity Tier")], verticalAlign: VerticalAlign.CENTER }),
                                new TableCell({ children: [new Paragraph(segment.tier)], verticalAlign: VerticalAlign.CENTER }),
                                new TableCell({ rowSpan: 4, children: [
                                    ...(segmentImage ? [new Paragraph({
                                        alignment: AlignmentType.CENTER,
                                        children: [new ImageRun({
                                            data: dataUriToBuffer(segmentImage.imageDataUrl),
                                            transformation: { width: 250, height: 150 },
                                        })]
                                    })] : [new Paragraph("No Image")])
                                ]}),
                            ]
                        }),
                        new TableRow({ children: [new TableCell({ children: [new Paragraph("Min. Thickness")] }), new TableCell({ children: [new Paragraph(`${segment.worstThickness.toFixed(2)} mm`)] })] }),
                        new TableRow({ children: [new TableCell({ children: [new Paragraph("Avg. Thickness")] }), new TableCell({ children: [new Paragraph(`${segment.avgThickness.toFixed(2)} mm`)] })] }),
                        new TableRow({ children: [new TableCell({ children: [new Paragraph("Location (Bounding Box)")] }), new TableCell({ children: [new Paragraph(`X: ${segment.coordinates.xMin}-${segment.coordinates.xMax}, Y: ${segment.coordinates.yMin}-${segment.coordinates.yMax}`)] })] }),
                    ]
                })
              ];
            })
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Report_${metadata.assetName?.replace(/ /g, "_") || 'Inspection'}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

    