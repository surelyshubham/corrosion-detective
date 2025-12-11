
import * as XLSX from 'xlsx';
import type { InspectionDataPoint } from './types';

export interface ParsedExcelResult {
  metadata: any[][];
  data: Omit<InspectionDataPoint, 'effectiveThickness' | 'deviation' | 'percentage' | 'wallLoss'>[];
  detectedNominalThickness: number | null;
}

export function parseExcel(file: ArrayBuffer): ParsedExcelResult {
  const workbook = XLSX.read(file, { type: 'array' });
  
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
      throw new Error("No sheets found in the Excel file.");
  }
  const sheet = workbook.Sheets[sheetName];

  // Get all rows including empty cells to preserve structure
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
  
  let headerRowIndex = -1;

  // --- 1. ROBUST HEADER DETECTION ---
  // Loop through rows to find where the Data Grid actually starts.
  // We ignore the first column (Column A) because it often contains labels like "mm" or is empty.
  for (let i = 0; i < Math.min(rows.length, 100); i++) { 
    const row = rows[i];
    if (!row || row.length < 2) continue;
    
    let numberCount = 0;
    let cellCount = 0;

    // Start checking from column 1 (Index 1) to ignore Column 0
    for (let j = 1; j < row.length; j++) {
      const cellVal = row[j];
      // Check if cell has value
      if (cellVal !== null && cellVal !== undefined && cellVal !== '') {
        cellCount++;
        // Check if it is a valid number (coordinates are usually numbers)
        if (!isNaN(parseFloat(cellVal as string))) {
          numberCount++;
        }
      }
    }

    // Heuristic: If >80% of the cells in this row (excluding Col A) are numbers, it's the header.
    if (cellCount > 5 && (numberCount / cellCount) > 0.8) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error("Could not detect the C-Scan data grid header row. Please ensure the file has a row with numeric X-coordinates.");
  }

  // --- 2. METADATA PARSING ---
  let detectedNominalThickness: number | null = null;
  let maxThicknessValue: number | null = null;
  const metadata: any[][] = [];
  
  for (let i = 0; i < headerRowIndex; i++) {
    const row = rows[i];
    // Try to grab key-value pairs (e.g., "Item = Value")
    if (row && (row[0] !== undefined || row[1] !== undefined)) {
      const rawKey = row[0] ? String(row[0]) : '';
      // Clean up key (remove "=..." and "(mm)...")
      const key = rawKey.split('=')[0].split('(')[0].trim().toLowerCase();
      
      // Try to find value in Column B, otherwise split Column A
      let valueString = row[1] !== undefined ? String(row[1]) : (rawKey.split('=')[1]?.trim() || '');
      const value = parseFloat(valueString);
      
      metadata.push([rawKey, valueString]);

      if (key.includes('nominal thickness')) {
        if (!isNaN(value)) detectedNominalThickness = value;
      } else if (key.includes('max thickness')) {
        if (!isNaN(value)) maxThicknessValue = value;
      }
    }
  }

  if (detectedNominalThickness === null && maxThicknessValue !== null) {
      detectedNominalThickness = maxThicknessValue;
  }

  // --- 3. COORDINATE PARSING (SAFE ALIGNMENT) ---
  const xCoordsRow = rows[headerRowIndex];
  
  // Create an array of X-coordinates corresponding to columns.
  // We slice(1) to skip Column A, but we DO NOT filter invalid numbers yet.
  // We keep 'null' for invalid columns to maintain the index alignment (j-1).
  const xCoords: (number | null)[] = xCoordsRow.slice(1).map((val: any) => {
      const num = parseFloat(val);
      return isNaN(num) ? null : num;
  });

  const data: Omit<InspectionDataPoint, 'effectiveThickness' | 'deviation' | 'percentage' | 'wallLoss'>[] = [];
  
  // --- 4. DATA PARSING ---
  // Start parsing data from the row right after the header
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const dataRow = rows[i];
    // Valid data row must have a Y-coordinate in Column 0
    if (!dataRow || dataRow[0] === undefined || dataRow[0] === null || isNaN(Number(dataRow[0]))) continue;

    const y = Number(dataRow[0]);
    
    // Iterate through data columns starting at 1
    for (let j = 1; j < dataRow.length; j++) {
      // Map column index 'j' to xCoords index 'j-1'
      const x = xCoords[j - 1];
      
      // If this column didn't have a valid X-header, skip it (safe alignment)
      if (x === null || x === undefined) continue;

      const thicknessValue = dataRow[j];
      let rawThickness: number | null;

      if (thicknessValue === null || thicknessValue === undefined || String(thicknessValue).trim() === '' || Number.isNaN(Number(thicknessValue))) {
        rawThickness = null;
      } else {
        rawThickness = Number(thicknessValue);
      }
      
      data.push({
        x: x,
        y: y,
        rawThickness: rawThickness,
      });
    }
  }

  if (data.length === 0) {
      throw new Error("Data grid was detected, but no data points could be parsed. Please check the data format.");
  }

  return {
    metadata,
    data,
    detectedNominalThickness,
  };
}
