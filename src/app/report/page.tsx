"use client";

import { useEffect, useState } from "react";
import { jsPDF } from "jspdf";

// A simplified helper since the complex logic is in the store now.
async function generatePdfReport({ assetId, inspector, patches }: { assetId: string, inspector: string, patches: any }) {
  console.log("Generating PDF with patches:", patches);

  if (!patches || Object.keys(patches).length === 0) {
    alert("PatchVault is empty. Please process a file first.");
    return;
  }

  // Acknowledging the provided logic, but the full implementation from the previous correct step is more robust.
  // We'll use a simplified version for now as requested.
  try {
    const doc = new jsPDF();
    doc.text(`Corrosion Report`, 10, 10);
    doc.text(`Asset ID: ${assetId}`, 10, 20);
    doc.text(`Inspector: ${inspector}`, 10, 30);
    
    let y = 50;
    for (const patchId in patches) {
        if (y > 250) {
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
        if(patch.images?.isoViewDataUrl) {
            try {
                doc.addImage(patch.images.isoViewDataUrl, 'JPEG', 15, y, 80, 60);
                 y += 70;
            } catch (e) {
                console.error(`Could not add image for patch ${patchId}`, e);
            }
        }
    }

    doc.save(`Corrosion-Report-${assetId}.pdf`);
  } catch (err) {
      console.error("PDF generation failed:", err);
      alert("An error occurred while generating the PDF.");
  }
}


export default function ReportPage() {
  const [patchVault, setPatchVault] = useState<any>(null);
  const [assetId, setAssetId] = useState("ASSET-001");
  const [inspector, setInspector] = useState("Sigma NDT");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    // Only runs on client
    try {
      const stored = localStorage.getItem("patchVault");
      if (stored) {
        const parsed = JSON.parse(stored);
        setPatchVault(parsed);
        console.log("Loaded PatchVault from localStorage:", parsed);
      } else {
        console.warn("No PatchVault found in localStorage.");
      }
    } catch (err) {
      console.error("Error loading PatchVault:", err);
    }
  }, []);

  const handleGenerate = async () => {
    if (!patchVault) {
      alert("No patches found. Please process a file first in the main application.");
      return;
    }
    setIsBusy(true);
    try {
        await generatePdfReport({
          assetId,
          inspector,
          patches: patchVault,
        });
    } catch(e) {
        console.error(e);
        alert("Failed to generate report.");
    } finally {
        setIsBusy(false);
    }
  };

  return (
    <div style={{ padding: "40px" }}>
      <h1>Corrosion Report Generator</h1>
      <p>This page generates a lightweight PDF report using cached patch images from your last session.</p>

      <div style={{margin: '20px 0'}}>
        <label style={{display: 'block', marginBottom: '4px'}}>Asset ID</label>
        <input
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          style={{ display: "block", padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
        />
      </div>

      <div style={{margin: '20px 0'}}>
        <label style={{display: 'block', marginBottom: '4px'}}>Inspector</label>
        <input
          value={inspector}
          onChange={(e) => setInspector(e.target.value)}
          style={{ display: "block", padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
        />
      </div>

      <button
        onClick={handleGenerate}
        disabled={isBusy}
        style={{
          padding: "12px 20px",
          background: isBusy ? "#ccc" : "#0ea5e9",
          color: "white",
          border: 'none',
          borderRadius: "6px",
          cursor: isBusy ? 'not-allowed' : 'pointer',
        }}
      >
        {isBusy ? 'Generating...' : 'Generate Corrosion PDF Report'}
      </button>
       {!patchVault && (
        <div style={{marginTop: '20px', color: 'red', background: '#fff0f0', border: '1px solid red', padding: '10px', borderRadius: '4px'}}>
          <strong>No data found.</strong> Please go back to the main application, process a file, and ensure the "Finalize Project" step completes.
        </div>
      )}
    </div>
  );
}
