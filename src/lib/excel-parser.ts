
import * as XLSX from 'xlsx';
import type { InspectionDataPoint } from './types';

export interface ParsedExcelResult {
  metadata: any[][];
  data: Omit<InspectionDataPoint, 'effectiveThickness' | 'deviation' | 'percentage' | 'wallLoss'>[];
}

export function parseExcel(file: ArrayBuffer): ParsedExcelResult {
  const workbook = XLSX.read(file, { type: 'array' });
  
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
      throw new Error("No sheets found in the Excel file.");
  }
  const sheet = workbook.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
  
  if (rows.length < 20) {
      throw new Error("Invalid Excel format: Expected at least 20 rows for metadata and data headers.");
  }

  const metadata: any[][] = [];
  for (let i = 0; i < 18; i++) {
    const row = rows[i];
    if (row && (row[0] !== undefined || row[1] !== undefined)) {
      const key = row[0] ? String(row[0]).split('=')[0].split('(')[0].trim() : '';
      const value = row[1] !== undefined ? row[1] : (row[0] ? String(row[0]).split('=')[1]?.trim() : '');
      metadata.push([key, value || '']);
    }
  }

  const xCoordsRow = rows[18];
  if (!xCoordsRow || xCoordsRow.length < 2) {
      throw new Error("Invalid Excel format: Could not find X-coordinate header row (row 19).");
  }
  const xCoords: number[] = xCoordsRow.slice(1).map(x => Number(x));

  const data: Omit<InspectionDataPoint, 'effectiveThickness' | 'deviation' | 'percentage' | 'wallLoss'>[] = [];
  for (let i = 19; i < rows.length; i++) {
    const dataRow = rows[i];
    if (!dataRow || dataRow[0] === undefined || dataRow[0] === null) continue;

    const y = Number(dataRow[0]);
    
    for (let j = 1; j < dataRow.length; j++) {
      const x = xCoords[j - 1];
      if (x === undefined) continue;

      const thicknessValue = dataRow[j];
      let rawThickness: number | null;

      if (thicknessValue === null || thicknessValue === undefined || String(thicknessValue).trim() === '') {
        rawThickness = null;
      } else {
        const num = Number(thicknessValue);
        rawThickness = isNaN(num) ? null : num;
      }
      
      data.push({
        x: x,
        y: y,
        rawThickness: rawThickness,
      });
    }
  }

  return {
    metadata,
    data,
  };
}
