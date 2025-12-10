// src/report/patchHelpers.ts
import { jsPDF } from 'jspdf';

export async function generatePdfReport({ assetId, inspector, patches }: { assetId: string, inspector: string, patches: any }) {
  console.log("Generating PDF with patches:", patches);

  if (!patches || Object.keys(patches).length === 0) {
    alert("PatchVault is empty. Please process a file first.");
    return;
  }

  // Use patches to create images + table
  // ---------------------------
  // Example:
  const doc = new jsPDF();

  doc.text(`Asset ID: ${assetId}`, 10, 10);
  doc.text(`Inspector: ${inspector}`, 10, 20);

  let y = 40;
  for (const patchId in patches) {
    if (y > 250) {
        doc.addPage();
        y = 20;
    }
    const patch = patches[patchId];

    doc.text(`Patch ${patchId}`, 10, y);
    y += 10;
    
    // Check if image data exists and is a valid format
    if (patch.images?.isoViewDataUrl && patch.images.isoViewDataUrl.startsWith('data:image')) {
      try {
        doc.addImage(patch.images.isoViewDataUrl, "JPEG", 10, y, 120, 80);
        y += 90;
      } catch (e) {
          console.error(`Failed to add image for patch ${patchId}:`, e);
          doc.text(`(Image for patch ${patchId} could not be loaded)`, 10, y);
          y += 10;
      }
    } else {
        doc.text(`(No image available for patch ${patchId})`, 10, y);
        y+= 10;
    }
  }

  doc.save(`corrosion_report_${assetId}.pdf`);
}
