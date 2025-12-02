"use client"

import React from 'react'
import * as XLSX from 'xlsx';
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { downloadFile } from '@/lib/utils';

interface DummyDataGeneratorProps {
  isLoading: boolean;
}

export function DummyDataGenerator({ isLoading }: DummyDataGeneratorProps) {

  const generateData = (size: number, type: 'plate' | 'localized' | 'severe') => {
    const dataGrid: (number | null)[][] = Array(size).fill(null).map(() => Array(size).fill(null));
    const nominal = 6.0;

    for (let i = 0; i < size; i++) { // y
      for (let j = 0; j < size; j++) { // x
        let thickness: number;
        if (type === 'plate') {
          thickness = nominal - Math.random() * 0.5; // Healthy
        } else if (type === 'localized') {
          const distance = Math.sqrt(Math.pow(j - size / 2, 2) + Math.pow(i - size / 2, 2));
          if (distance < size / 10) {
            thickness = nominal * (0.6 + Math.random() * 0.1); // 60-70%
          } else {
            thickness = nominal - Math.random() * 0.5;
          }
        } else { // severe
          if (j > size * 0.7 && i > size * 0.7) {
            thickness = nominal * (0.4 + Math.random() * 0.15); // 40-55%
          } else {
            thickness = nominal - Math.random();
          }
        }
        dataGrid[i][j] = parseFloat(thickness.toFixed(2));
      }
    }
    return dataGrid;
  };
  
  const handleGenerate = (size: number, type: 'plate' | 'localized' | 'severe') => {
    // 1. Create data grid matching the parser's expectation
    const dataGrid = generateData(size, type);

    // 2. Create sheet data as an array of arrays
    const sheetData: any[][] = [];

    // 3. Add 18 rows of metadata
    const metadata = [
      ['Project', 'Dummy Project'],
      ['Asset ID', `DUMMY-${type.toUpperCase()}-${size}x${size}`],
      ['Date', new Date().toLocaleDateString()],
      ['Inspector', 'Firebase Studio'],
      // Add empty rows to make up 18 total
    ];
    for (let i = 0; i < 18; i++) {
        sheetData.push(metadata[i] || []);
    }

    // 4. Add X-coordinate header row (row 19)
    const xCoords = Array.from({ length: size }, (_, i) => i);
    sheetData.push(['', ...xCoords]);

    // 5. Add data rows (from row 20 onwards)
    for (let y = 0; y < size; y++) {
        const row = [y, ...dataGrid[y]];
        sheetData.push(row);
    }
    
    // 6. Create worksheet and workbook
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'C-Scan Data');

    // 7. Download the file
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    downloadFile(blob, `dummy_${type}_${size}x${size}.xlsx`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">No File?</CardTitle>
        <CardDescription>Generate a dummy Excel file to test the application's features.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <h4 className="col-span-2 text-sm font-medium">Generate Healthy Plate</h4>
        <Button variant="secondary" onClick={() => handleGenerate(20, 'plate')} disabled={isLoading}>20x20</Button>
        <Button variant="secondary" onClick={() => handleGenerate(50, 'plate')} disabled={isLoading}>50x50</Button>
        
        <h4 className="col-span-2 text-sm font-medium mt-4">Generate Localized Corrosion</h4>
        <Button variant="secondary" onClick={() => handleGenerate(50, 'localized')} disabled={isLoading}>50x50</Button>
        <Button variant="secondary" onClick={() => handleGenerate(100, 'localized')} disabled={isLoading}>100x100</Button>

        <h4 className="col-span-2 text-sm font-medium mt-4">Generate Severe Corrosion</h4>
        <Button variant="secondary" onClick={() => handleGenerate(50, 'severe')} disabled={isLoading}>50x50</Button>
        <Button variant="secondary" onClick={() => handleGenerate(100, 'severe')} disabled={isLoading}>100x100</Button>

      </CardContent>
    </Card>
  );
}
