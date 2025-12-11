
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

  // 'defval' ensures we get empty strings for empty cells instead of undefined, keeping structure intact
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
  
  let headerRowIndex = -1;

  // --- 1. FIND THE HEADER ROW (Robust Mode) ---
  for (let i = 0; i < Math.min(rows.length, 100); i++) { 
    const row = rows[i];
    if (!row || row.length < 2) continue;
    
    let numberCount = 0;
    let validCells = 0;

    // Start checking from index 1 (skip col 0)
    for (let j = 1; j < row.length; j++) {
      const cellVal = row[j];
      // Check if not empty
      if (cellVal !== '' && cellVal !== null && cellVal !== undefined) {
        validCells++;
        // Check if strictly a number
        const num = parseFloat(String(cellVal).trim());
        if (!isNaN(num) && isFinite(num)) {
          numberCount++;
        }
      }
    }

    // If >80% of data cells are valid numbers, this is the header.
    // We added 'validCells > 5' to avoid matching empty rows with 1 random number.
    if (validCells > 5 && (numberCount / validCells) > 0.8) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error("Could not detect Header Row. Please check file format.");
  }

  // --- 2. EXTRACT METADATA ---
  let detectedNominalThickness: number | null = null;
  let maxThicknessValue: number | null = null;
  const metadata: any[][] = [];
  
  for (let i = 0; i < headerRowIndex; i++) {
    const row = rows[i];
    if (!row) continue;
    
    // Attempt to read "Key = Value" from col 0 or "Key" "Value" from col 0,1
    let keyRaw = row[0] ? String(row[0]) : '';
    let valRaw = row[1] ? String(row[1]) : '';
    
    if (keyRaw.includes('=')) {
      const parts = keyRaw.split('=');
      keyRaw = parts[0];
      valRaw = parts[1]; // Value might be in the same cell
    }

    const key = keyRaw.toLowerCase();
    const valStr = valRaw.trim();
    const valNum = parseFloat(valStr);

    if (key) {
        metadata.push([keyRaw.trim(), valStr]);
        if (key.includes('nominal thickness') && !isNaN(valNum)) detectedNominalThickness = valNum;
        if (key.includes('max thickness') && !isNaN(valNum)) maxThicknessValue = valNum;
    }
  }
  
  if (detectedNominalThickness === null) detectedNominalThickness = maxThicknessValue;

  // --- 3. PARSE X-AXIS COORDINATES ---
  const headerRow = rows[headerRowIndex];
  // Map columns to X-coordinates. Index 0 of `xCoords` corresponds to Column 1 of Excel.
  const xCoords: (number | null)[] = [];
  
  for (let j = 1; j < headerRow.length; j++) {
      const val = parseFloat(String(headerRow[j]).trim());
      if (!isNaN(val) && isFinite(val)) {
          xCoords.push(val);
      } else {
          xCoords.push(null); // Mark invalid columns so we skip them later
      }
  }

  // --- 4. PARSE DATA POINTS ---
  const data: Omit<InspectionDataPoint, 'effectiveThickness' | 'deviation' | 'percentage' | 'wallLoss'>[] = [];
  
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    // Y Coordinate is always in Column 0
    const yVal = parseFloat(String(row[0]).trim());
    if (isNaN(yVal)) continue; // Skip rows without valid Y label

    // Iterate Data Columns
    for (let j = 1; j < row.length; j++) {
        // Match with X Coordinate
        const xIndex = j - 1; 
        if (xIndex >= xCoords.length) break; 
        
        const xVal = xCoords[xIndex];
        if (xVal === null) continue; // Skip if this column didn't have a header

        // Parse Thickness
        const rawVal = row[j];
        let thickness: number | null = null;
        
        if (rawVal !== null && rawVal !== undefined && rawVal !== '') {
            const parsed = parseFloat(String(rawVal).trim());
            if (!isNaN(parsed) && isFinite(parsed)) {
                thickness = parsed;
            }
        }
        
        data.push({
            x: xVal,
            y: yVal,
            rawThickness: thickness
        });
    }
  }

  if (data.length === 0) {
      throw new Error("Header found, but no valid data points extracted.");
  }

  return { metadata, data, detectedNominalThickness };
}
