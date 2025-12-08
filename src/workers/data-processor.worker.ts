
import * as XLSX from 'xlsx';
import type { MergedGrid, MergedCell, InspectionStats, Condition } from '../lib/types';

type ColorMode = 'mm' | '%';

// --- Color Helper ---
// Gets the absolute color based on a fixed percentage scale
function getAbsoluteColor(percentage: number | null): [number, number, number] {
    if (percentage === null) return [128, 128, 128]; // Grey for ND
    if (percentage < 70) return [255, 0, 0];   // Red
    if (percentage < 80) return [255, 255, 0]; // Yellow
    if (percentage < 90) return [0, 255, 0];   // Green
    return [0, 0, 255];                       // Blue
}

// Gets a normalized color from blue (min) to red (max)
function getNormalizedColor(normalizedPercent: number | null): [number, number, number] {
    if (normalizedPercent === null) return [128, 128, 128]; // Grey for ND
    // Blue (240) to Red (0)
    const hue = 240 * (1 - normalizedPercent);
    const saturation = 1;
    const lightness = 0.5;

    // HSL to RGB conversion
    const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = lightness - c / 2;
    let r = 0, g = 0, b = 0;
    if (0 <= hue && hue < 60) { [r, g, b] = [c, x, 0]; }
    else if (60 <= hue && hue < 120) { [r, g, b] = [x, c, 0]; }
    else if (120 <= hue && hue < 180) { [r, g, b] = [0, c, x]; }
    else if (180 <= hue && hue < 240) { [r, g, b] = [0, x, c]; }
    else if (240 <= hue && hue < 300) { [r, g, b] = [x, 0, c]; }
    else if (300 <= hue && hue < 360) { [r, g, b] = [c, 0, x]; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
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
    
    minThickness = minThickness === Infinity ? 0 : minThickness;
    maxThickness = maxThickness === -Infinity ? 0 : maxThickness;
    
    const avgThickness = validPointsCount > 0 ? sumThickness / validPointsCount : 0;
    const minPercentage = (minThickness / nominal) * 100;
    const totalPoints = height * width;
    const totalScannedPoints = validPointsCount + countND;


    const stats: InspectionStats = {
        minThickness,
        maxThickness,
        avgThickness,
        minPercentage: isFinite(minPercentage) ? minPercentage : 0,
        areaBelow80: totalScannedPoints > 0 ? (areaBelow80 / totalScannedPoints) * 100 : 0,
        areaBelow70: totalScannedPoints > 0 ? (areaBelow70 / totalScannedPoints) * 100 : 0,
        areaBelow60: totalScannedPoints > 0 ? (areaBelow60 / totalScannedPoints) * 100 : 0,
        countND,
        totalPoints,
        worstLocation: minThickness === 0 ? {x: 0, y: 0} : worstLocation,
        gridSize: { width, height },
        scannedArea: totalScannedPoints / 1_000_000,
    };
    
    let condition: Condition;
    const finalPercentage = stats.minPercentage;
    if (!isFinite(finalPercentage) || validPointsCount === 0) {
        condition = 'N/A';
    } else if (finalPercentage >= 95) {
        condition = 'Healthy';
    } else if (finalPercentage >= 80) {
        condition = 'Moderate';
    } else if (finalPercentage >= 60) {
        condition = 'Severe';
    } else {
        condition = 'Critical';
    }

    return {
        stats: { ...stats, nominalThickness: nominal },
        condition,
    };
}


function createFinalGrid(rawMergedGrid: {plateId: string, rawThickness: number}[][], nominalThickness: number): MergedGrid {
    const height = rawMergedGrid.length;
    const width = rawMergedGrid[0]?.length || 0;
    const finalGrid: MergedGrid = Array(height).fill(null).map(() => Array(width).fill(null));

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
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
        }
    }
    return finalGrid;
}

function createBuffers(grid: MergedGrid, nominal: number, min: number, max: number, colorMode: ColorMode) {
    const height = grid.length;
    const width = grid[0]?.length || 0;
    const displacementBuffer = new Float32Array(width * height);
    const colorBuffer = new Uint8Array(width * height * 3);
    const range = max - min;

     for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            const cell = grid[y][x];
            
            // Displacement: raw effective thickness values
            displacementBuffer[index] = cell.effectiveThickness !== null ? cell.effectiveThickness : nominal;

            // Color
            let rgb: [number, number, number];
            if (colorMode === '%') {
                 const normalized = cell.effectiveThickness !== null && range > 0
                    ? (cell.effectiveThickness - min) / range
                    : null;
                 rgb = getNormalizedColor(normalized);
            } else {
                 rgb = getAbsoluteColor(cell.percentage);
            }

            colorBuffer[index * 3] = rgb[0];
            colorBuffer[index * 3 + 1] = rgb[1];
            colorBuffer[index * 3 + 2] = rgb[2];
        }
    }
    return { displacementBuffer, colorBuffer };
}

self.onmessage = async (event: MessageEvent<any>) => {
    const { type } = event.data;

    try {
        if (type === 'PROCESS') {
            const { files, nominalThickness, colorMode } = event.data;
            let rawMergedGrid: {plateId: string, rawThickness: number}[][] = [];
            self.postMessage({ type: 'PROGRESS', progress: 10, message: 'Parsing files...' });
            
            for (const file of files) {
                const workbook = XLSX.read(file.buffer, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

                const headerRow = rawData.findIndex(row => JSON.stringify(row).toLowerCase().includes('mm'));
                if (headerRow === -1) continue;

                const dataGrid: {plateId: string, rawThickness: number}[][] = [];
                for (let r = headerRow + 1; r < rawData.length; r++) {
                    const row = rawData[r];
                    if (!row) continue;
                    const cleanRow = row.slice(1).map((val: any) => ({
                        plateId: file.name,
                        rawThickness: isNaN(parseFloat(val)) ? -1 : parseFloat(val)
                    }));
                    dataGrid.push(cleanRow);
                }
                
                if (rawMergedGrid.length === 0) {
                    rawMergedGrid = dataGrid;
                } else {
                     const targetRows = Math.max(rawMergedGrid.length, dataGrid.length);
                     const padCell = { plateId: 'ND', rawThickness: -1 };
                     while(rawMergedGrid.length < targetRows) rawMergedGrid.push(new Array(rawMergedGrid[0].length).fill(padCell));
                     while(dataGrid.length < targetRows) dataGrid.push(new Array(dataGrid[0].length).fill(padCell));
                     for(let i=0; i<targetRows; i++) {
                        const len1 = rawMergedGrid[i]?.length || 0;
                        const len2 = dataGrid[i]?.length || 0;
                        const targetCols = Math.max(len1, len2);
                        while (rawMergedGrid[i].length < targetCols) rawMergedGrid[i].push(padCell);
                        while (dataGrid[i].length < targetCols) dataGrid[i].push(padCell);
                        rawMergedGrid[i] = rawMergedGrid[i].concat(dataGrid[i]);
                     }
                }
            }
            
            self.postMessage({ type: 'PROGRESS', progress: 50, message: 'Processing data...' });
            const finalGrid = createFinalGrid(rawMergedGrid, nominalThickness);
            const { stats, condition } = computeStats(finalGrid, nominalThickness);
            const { displacementBuffer, colorBuffer } = createBuffers(finalGrid, nominalThickness, stats.minThickness, stats.maxThickness, colorMode);
            
            self.postMessage({
                type: 'DONE', displacementBuffer, colorBuffer, gridMatrix: finalGrid, stats, condition,
            }, [displacementBuffer.buffer, colorBuffer.buffer]);

        } else if (type === 'REPROCESS' || type === 'RECOLOR') {
            const { gridMatrix, nominalThickness, colorMode, stats: oldStats } = event.data;
            
            const finalGrid = type === 'REPROCESS' ? createFinalGrid(gridMatrix.map((row: MergedCell[]) => row.map(cell => ({ plateId: cell.plateId, rawThickness: cell.rawThickness || -1 }))), nominalThickness) : gridMatrix;
            const { stats, condition } = computeStats(finalGrid, nominalThickness);
            const { displacementBuffer, colorBuffer } = createBuffers(finalGrid, nominalThickness, stats.minThickness, stats.maxThickness, colorMode);
            
             self.postMessage({
                type: 'DONE', displacementBuffer, colorBuffer, gridMatrix: finalGrid, stats, condition,
            }, [displacementBuffer.buffer, colorBuffer.buffer]);
        }
    } catch (error: any) {
        self.postMessage({ type: 'ERROR', message: error.message });
    }
};

export {};
