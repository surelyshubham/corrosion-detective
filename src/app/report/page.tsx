"use client";

import React, { useState } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

import {
  pickTopNPatches,
  getPatchFromVault,
  getPatchViewUrls,
} from "@/report/patchHelpers";

const LOGO_URL = "https://www.sigmandt.com/images/logo.png";

export default function ReportPage() {
  const [assetId, setAssetId] = useState("ASSET-001");
  const [inspector, setInspector] = useState("Sigma NDT");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  async function generatePdf() {
    try {
      setBusy(true);
      setProgress(3);

      // -------------------------------
      // 1. Load patch vault data
      // -------------------------------
      const topPatches = pickTopNPatches(10);
      if (!topPatches.length) {
        alert("No patches found in PatchVault. Please process a file first.");
        setBusy(false);
        return;
      }

      setProgress(10);

      // ---------------------------------
      // 2. Load and convert logo
      // ---------------------------------
      const logoBase64 = await fetch(LOGO_URL)
        .then((r) => r.blob())
        .then(
          (b) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = reject;
              reader.readAsDataURL(b);
            })
        );

      setProgress(15);

      // ---------------------------------
      // 3. Create hidden DOM container
      // ---------------------------------
      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-99999px";
      container.style.top = "0";
      container.style.width = "800px";
      container.style.zIndex = "-9999";
      document.body.appendChild(container);

      const pageStyle = `
        box-sizing:border-box;
        width:794px;
        min-height:1123px;
        padding:28px;
        background:white;
        color:#111;
        font-family: Arial, Helvetica, sans-serif;
        position:relative;
      `;

      const watermarkStyle = `
        position:absolute;
        left:50%;
        top:50%;
        transform:translate(-50%, -50%) rotate(-12deg);
        opacity:0.06;
        width:240px;
        pointer-events:none;
        filter:grayscale(100%);
      `;

      // ---------------------------------
      // COVER PAGE
      // ---------------------------------
      const cover = document.createElement("div");
      cover.setAttribute("style", pageStyle);
      cover.innerHTML = `
        <div style="text-align:center; margin-top:90px;">
          <img src="${logoBase64}" style="width:300px; margin-bottom:24px;" />
          <h1 style="font-size:28px;">Corrosion Inspection Report</h1>
          <div style="margin-top:12px; font-size:14px;">Asset: ${assetId}</div>
          <div style="font-size:14px;">Inspector: ${inspector}</div>
          <div style="font-size:14px;">Date: ${new Date().toISOString().slice(0,10)}</div>
        </div>
      `;
      const wm1 = document.createElement("img");
      wm1.src = logoBase64;
      wm1.setAttribute("style", watermarkStyle);
      cover.appendChild(wm1);
      container.appendChild(cover);

      setProgress(25);

      // ---------------------------------
      // PATCH PAGES
      // ---------------------------------
      topPatches.forEach((meta, rank) => {
        const entry = getPatchFromVault(meta.id);
        const urls = entry ? getPatchViewUrls(entry) : [];

        const page = document.createElement("div");
        page.setAttribute("style", pageStyle);

        let html = `
          <h2 style="margin-top:0;">Patch ${meta.id} — Rank ${rank + 1}</h2>
          <div><strong>Area:</strong> ${(meta.area_m2 ?? 0).toFixed(4)} m²</div>
          <div><strong>Avg Depth:</strong> ${meta.avgDepth_mm ?? "-"} mm</div>
          <div><strong>Max Depth:</strong> ${meta.maxDepth_mm ?? "-"} mm</div>
          <br />
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        `;

        urls.forEach((u) => {
          html += `
            <div style="border:1px solid #ddd; padding:6px; display:flex; align-items:center; justify-content:center;">
              <img src="${u}" style="max-width:100%; max-height:280px; object-fit:contain;" />
            </div>
          `;
        });

        html += `</div>`;
        page.innerHTML = html;

        const wm = document.createElement("img");
        wm.src = logoBase64;
        wm.setAttribute("style", watermarkStyle);
        page.appendChild(wm);

        container.appendChild(page);
      });

      setProgress(70);

      await new Promise((res) => setTimeout(res, 80));

      // ---------------------------------
      // PDF RENDERING
      // ---------------------------------
      const pages = Array.from(container.children) as HTMLElement[];
      const pdf = new jsPDF("p", "pt", "a4");

      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
        });

        const img = canvas.toDataURL("image/jpeg", 0.9);

        if (i > 0) pdf.addPage();
        pdf.addImage(img, "JPEG", 0, 0, 595, 842);

        setProgress(70 + Math.round((i / pages.length) * 30));
      }

      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Corrosion_Report_${assetId}_${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`;
      a.click();

      setProgress(100);
      document.body.removeChild(container);
    } catch (err) {
      console.error(err);
      alert("Failed to generate PDF: " + String(err));
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 800);
    }
  }

  return (
    <div style={{ padding: 30 }}>
      <h1>Corrosion Report Generator</h1>

      <p style={{ opacity: 0.7 }}>
        This tool generates a lightweight PDF report using cached patch images.
        It does not re-render 2D/3D or upload anything to a server.
      </p>

      <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
        <div>
          <label>Asset ID</label>
          <input
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            style={{ display: "block", padding: 8 }}
          />
        </div>

        <div>
          <label>Inspector</label>
          <input
            value={inspector}
            onChange={(e) => setInspector(e.target.value)}
            style={{ display: "block", padding: 8 }}
          />
        </div>
      </div>

      <button
        onClick={generatePdf}
        disabled={busy}
        style={{
          marginTop: 30,
          padding: "10px 22px",
          fontSize: 16,
          background: "#0284c7",
          color: "white",
          borderRadius: 8,
        }}
      >
        {busy ? `Generating... ${progress}%` : "Generate Corrosion PDF Report"}
      </button>
    </div>
  );
}
