
import * as XLSX from 'xlsx';
import type { MergedGrid, MergedCell } from '../lib/types';

// --- Color Helper ---
// Using a simple numeric mapping for colors now
function getColor(value: number, nominal: number): [number, number, number] {
    const percentage = (value / nominal) * 100;
    if (value <= 0) return [128, 128, 128]; // Grey for ND
    if (percentage < 70) return [255, 0, 0];   // Red
    if (percentage < 80) return [255, 255, 0]; // Yellow
    if (percentage < 90) return [0, 255, 0];   // Green
    return [0, 0, 255];                       // Blue
}

function computeStats(grid: MergedGrid, nominal: number) {
    let minThickness = Infinity;
    let maxThickness = -Infinity;
    let sumThickness = 0;
    let validPointsCount = 0;
    let countND = 0;
    let areaBelow80 = 0;
    let areaBelow70 = 0;
    let areaBelow60 = 0;
    let worstLocation = { x: 0, y: 0 };
    const height = grid.length;
    const width = grid[0]?.length || 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = grid[y][x];
            if (!cell || cell.effectiveThickness === null) {
                if (cell && cell.plateId) countND++;
                continue;
            }
            
            const value = cell.effectiveThickness;
            
            validPointsCount++;
            sumThickness += value;
            if (value < minThickness) {
                minThickness = value;
                worstLocation = { x, y };
            }
            if (value > maxThickness) {
                maxThickness = value;
            }

            const percentage = cell.percentage || 0;
            if (percentage < 80) areaBelow80++;
            if (percentage < 70) areaBelow70++;
            if (percentage < 60) areaBelow60++;
        }
    }
    
    if (validPointsCount === 0) {
        minThickness = 0;
        maxThickness = 0;
    }
    
    const avgThickness = validPointsCount > 0 ? sumThickness / validPointsCount : 0;
    const minPercentage = (minThickness / nominal) * 100;
    const totalPoints = height * width;

    return {
        stats: {
            minThickness,
            maxThickness,
            avgThickness,
            minPercentage: isFinite(minPercentage) ? minPercentage : 0,
            areaBelow80: totalPoints > 0 ? (areaBelow80 / totalPoints) * 100 : 0,
            areaBelow70: totalPoints > 0 ? (areaBelow70 / totalPoints) * 100 : 0,
            areaBelow60: totalPoints > 0 ? (areaBelow60 / totalPoints) * 100 : 0,
            countND,
            totalPoints,
            worstLocation,
            gridSize: { width, height },
            scannedArea: validPointsCount / 1_000_000, // Assuming 1 point = 1mm^2
            nominalThickness: nominal
        },
        condition: minPercentage >= 95 ? 'Healthy' : minPercentage >= 80 ? 'Moderate' : minPercentage >= 60 ? 'Severe' : 'Critical',
    };
}


self.onmessage = async (event: MessageEvent<{ files: {name: string, buffer: ArrayBuffer}[], nominalThickness: number, mergeConfig: any }>) => {
    const { files, nominalThickness, mergeConfig } = event.data;

    try {
        let rawMergedGrid: {plateId: string, rawThickness: number}[][] = [];

        self.postMessage({ type: 'PROGRESS', progress: 10, message: 'Parsing files...' });
        
        for (const file of files) {
            const workbook = XLSX.read(file.buffer, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

            let headerRow = 18; // Default
            for (let i = 0; i < Math.min(20, rawData.length); i++) {
                if (JSON.stringify(rawData[i]).includes('mm')) {
                    headerRow = i;
                    break;
                }
            }

            const dataGrid: {plateId: string, rawThickness: number}[][] = [];
            for (let r = headerRow + 1; r < rawData.length; r++) {
                const row = rawData[r];
                if (!row) continue;
                const cleanRow = row.slice(1).map((val: any) => {
                    const num = parseFloat(val);
                    return { plateId: file.name, rawThickness: isNaN(num) ? -1 : num }; // Use -1 for ND
                });
                dataGrid.push(cleanRow);
            }
            
            // Simple right-append merge logic
            if (rawMergedGrid.length === 0) {
                rawMergedGrid = dataGrid;
            } else {
                 const targetRows = Math.max(rawMergedGrid.length, dataGrid.length);
                 const padCell = { plateId: 'ND', rawThickness: -1 };
                 while(rawMergedGrid.length < targetRows) rawMergedGrid.push(new Array(rawMergedGrid[0].length).fill(padCell));
                 while(dataGrid.length < targetRows) dataGrid.push(new Array(dataGrid[0].length).fill(padCell));
                 for(let i=0; i<targetRows; i++) rawMergedGrid[i] = rawMergedGrid[i].concat(dataGrid[i]);
            }
        }
        
        self.postMessage({ type: 'PROGRESS', progress: 50, message: 'Enriching data...' });

        const height = rawMergedGrid.length;
        const width = rawMergedGrid[0]?.length || 0;
        
        const finalGrid: MergedGrid = Array(height).fill(null).map(() => Array(width).fill(null));
        
        // --- Generate Texture Buffers & Final Grid ---
        const displacementBuffer = new Float32Array(width * height);
        const colorBuffer = new Uint8Array(width * height * 3);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                const cell = rawMergedGrid[y][x];
                
                let effectiveThickness: number | null = null;
                let percentage: number | null = null;
                
                if (cell.rawThickness > 0) {
                    effectiveThickness = Math.min(cell.rawThickness, nominalThickness);
                    percentage = (effectiveThickness / nominalThickness) * 100;
                }

                finalGrid[y][x] = {
                    plateId: cell.plateId,
                    rawThickness: cell.rawThickness > 0 ? cell.rawThickness : null,
                    effectiveThickness: effectiveThickness,
                    percentage: percentage,
                };
                
                // Displacement: raw effective thickness values
                displacementBuffer[index] = effectiveThickness !== null ? effectiveThickness : nominalThickness;

                // Color
                const [r, g, b] = getColor(effectiveThickness !== null ? effectiveThickness : -1, nominalThickness);
                colorBuffer[index * 3] = r;
                colorBuffer[index * 3 + 1] = g;
                colorBuffer[index * 3 + 2] = b;
            }
        }
        
        self.postMessage({ type: 'PROGRESS', progress: 75, message: 'Calculating stats...' });

        const { stats, condition } = computeStats(finalGrid, nominalThickness);
        
        self.postMessage({ type: 'PROGRESS', progress: 95, message: 'Finalizing...' });
        
        // --- Send data back to main thread ---
        self.postMessage({
            type: 'DONE',
            displacementBuffer,
            colorBuffer,
            gridMatrix: finalGrid,
            stats,
            condition,
        }, [displacementBuffer.buffer, colorBuffer.buffer]);

    } catch (error: any) {
        self.postMessage({ type: 'ERROR', message: error.message });
    }
};

// This is required to make TypeScript treat this file as a module.
export {};

    