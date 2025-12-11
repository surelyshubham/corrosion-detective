
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

  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
  
  let headerRowIndex = -1;

  // LOOP through rows to find where the Data actually starts
  for (let i = 0; i < Math.min(rows.length, 100); i++) { // Limit search to first 100 rows for performance
    const row = rows[i];
    if (!row || row.length < 2) continue;
    
    let numberCount = 0;
    let cellCount = 0;

    // Start checking from column 1 (skipping column 0 which might be "mm" or empty)
    for (let j = 1; j < row.length; j++) {
      const cellVal = row[j];
      if (cellVal !== null && cellVal !== undefined && cellVal !== '') {
        cellCount++;
        if (!isNaN(parseFloat(cellVal as string))) {
          numberCount++;
        }
      }
    }

    // If more than 80% of the row cells are numbers and there are at least 5 data points, WE FOUND THE HEADER!
    if (cellCount > 5 && (numberCount / cellCount) > 0.8) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error("Could not detect the C-Scan data grid header row. Please ensure the file has a row with numeric X-coordinates.");
  }

  let detectedNominalThickness: number | null = null;
  let maxThicknessValue: number | null = null;
  const metadata: any[][] = [];
  
  // Metadata is everything before the header row
  for (let i = 0; i < headerRowIndex; i++) {
    const row = rows[i];
    if (row && (row[0] !== undefined || row[1] !== undefined)) {
      const key = row[0] ? String(row[0]).split('=')[0].split('(')[0].trim().toLowerCase() : '';
      const valueString = row[1] !== undefined ? String(row[1]) : (row[0] ? String(row[0]).split('=')[1]?.trim() : '');
      const value = parseFloat(valueString);
      
      metadata.push([row[0] || '', row[1] || '']);

      if (key.includes('nominal thickness')) {
        if (!isNaN(value)) {
            detectedNominalThickness = value;
        }
      } else if (key.includes('max thickness')) {
        if (!isNaN(value)) {
            maxThicknessValue = value;
        }
      }
    }
  }

  if (detectedNominalThickness === null && maxThicknessValue !== null) {
      detectedNominalThickness = maxThicknessValue;
  }

  const xCoordsRow = rows[headerRowIndex];
  // Start at k=1 to ignore the potential "mm" label
  const xCoords: number[] = xCoordsRow.slice(1).map(x => Number(x)).filter(x => !isNaN(x));

  const data: Omit<InspectionDataPoint, 'effectiveThickness' | 'deviation' | 'percentage' | 'wallLoss'>[] = [];
  // Start parsing data from the row right after the header
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const dataRow = rows[i];
    if (!dataRow || dataRow[0] === undefined || dataRow[0] === null || isNaN(Number(dataRow[0]))) continue;

    const y = Number(dataRow[0]);
    
    for (let j = 1; j < dataRow.length; j++) {
      const x = xCoords[j - 1];
      if (x === undefined) continue;

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
