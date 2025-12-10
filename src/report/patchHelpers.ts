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

  doc.text(`Corrosion Report`, 10, 10);
  doc.text(`Asset ID: ${assetId}`, 10, 20);
  doc.text(`Inspector: ${inspector}`, 10, 30);

  let y = 50;
  for (const patchId in patches) {
    if (y > 250) { // Add a new page if content overflows
        doc.addPage();
        y = 20;
    }
    const patch = patches[patchId];
    
    doc.text(`Patch ID: ${patchId}`, 10, y);
    y += 7;
    doc.text(`Severity: ${patch.meta?.tier || 'N/A'}`, 15, y);
    y += 7;
    doc.text(`Min Thickness: ${patch.meta?.worstThickness?.toFixed(2) || 'N/A'} mm`, 15, y);
    y += 10;

    // CORRECTED: Look for the image in the right place
    if(patch.images?.isoViewDataUrl) {
        try {
            // Add the image from the data URL
            doc.addImage(patch.images.isoViewDataUrl, 'JPEG', 15, y, 80, 60);
             y += 70; // Move down after adding image
        } catch (e) {
            console.error(`Could not add image for patch ${patchId}`, e);
        }
    }
  }

  doc.save(`Corrosion-Report-${assetId}.pdf`);
}
