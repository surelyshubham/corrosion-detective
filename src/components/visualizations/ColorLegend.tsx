
"use client";

import React from 'react';
import { useInspectionStore, type ColorMode } from '@/store/use-inspection-store';
import { DataVault } from '@/store/data-vault';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const GradientBar = ({ min, max }: { min: number, max: number }) => {
    return (
        <div className="h-4 w-full rounded-full bg-gradient-to-r from-blue-500 via-green-500 to-red-500">
            <div className="flex justify-between text-xs text-muted-foreground px-1 relative -top-4">
                <span>{min.toFixed(1)}</span>
                <span>{max.toFixed(1)}</span>
            </div>
        </div>
    );
}

const DiscreteBar = ({ nominal }: { nominal: number }) => {
    const segments = [
        { color: 'bg-blue-500', label: `> ${Number(nominal * 0.9).toFixed(1)}` },
        { color: 'bg-green-500', label: `${Number(nominal * 0.8).toFixed(1)}-${Number(nominal * 0.9).toFixed(1)}` },
        { color: 'bg-yellow-500', label: `${Number(nominal * 0.7).toFixed(1)}-${Number(nominal * 0.8).toFixed(1)}` },
        { color: 'bg-orange-500', label: `${Number(nominal * 0.6).toFixed(1)}-${Number(nominal * 0.7).toFixed(1)}` },
        { color: 'bg-red-500', label: `< ${Number(nominal * 0.6).toFixed(1)}` },
        { color: 'bg-gray-500', label: `ND` },
    ];

    return (
        <div className="space-y-1">
            {segments.map(seg => (
                <div key={seg.label} className="flex items-center gap-2">
                    <div className={`h-3 w-3 rounded-sm ${seg.color}`} />
                    <span className="text-xs text-muted-foreground">{seg.label}</span>
                </div>
            ))}
        </div>
    );
}

export const ColorLegend = () => {
    const { colorMode } = useInspectionStore();
    const stats = DataVault.stats;
    const nominalThickness = stats?.nominalThickness;

    if (!stats || !nominalThickness) {
        return null;
    }

    return (
        <Card className="bg-card/90">
            <CardHeader className="p-4">
                <CardTitle className="text-base font-headline">
                    Legend ({colorMode === '%' ? 'Normalized' : 'Condition'})
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
                {colorMode === '%' ? (
                    <GradientBar min={stats.minThickness} max={stats.maxThickness} />
                ) : (
                    <DiscreteBar nominal={nominalThickness} />
                )}
                 <p className="text-xs text-muted-foreground mt-2 text-center">Values in mm</p>
            </CardContent>
        </Card>
    );
};
