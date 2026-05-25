"use client";

import { useState, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";

type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
  formatValue?: (value: number, index: number) => string;
  className?: string;
};

export function Sparkline({
  values,
  width = 140,
  height = 32,
  color = "#0f172a",
  fillOpacity = 0.1,
  formatValue,
  className,
}: SparklineProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { points, fillPoints, svgPoints } = useMemo(() => {
    if (!values.length) return { points: [], fillPoints: "", svgPoints: "" };

    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const rangeVal = maxVal - minVal || 1;

    const calculatedPoints = values.map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * width;
      const y = height - ((v - minVal) / rangeVal) * height;
      return { x, y, value: v, index: i };
    });

    const svgPointsStr = calculatedPoints.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
    const fillPointsStr = `${svgPointsStr} ${width.toFixed(2)},${height.toFixed(2)} 0,${height.toFixed(2)}`;

    return {
      points: calculatedPoints,
      svgPoints: svgPointsStr,
      fillPoints: fillPointsStr,
    };
  }, [values, width, height]);

  if (!values.length) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        className={cn("inline-block rounded bg-surface-muted align-top", className)}
      >
        <rect x="0" y="0" width={width} height={height} rx="6" fill="currentColor" className="text-surface-muted" />
      </svg>
    );
  }

  const handleMouseMove = (e: React.MouseEvent | React.FocusEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ("clientX" in e ? e.clientX : (e.target as HTMLElement).getBoundingClientRect().left) - rect.left;
    const ratio = Math.max(0, Math.min(1, x / width));
    const index = Math.round(ratio * (values.length - 1));
    setHoveredIndex(index);
  };

  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null;
  const tooltipValue = hoveredPoint && formatValue ? formatValue(hoveredPoint.value, hoveredPoint.index) : null;
  const tooltipLabel = hoveredPoint ? `Point ${hoveredPoint.index + 1}` : null;
  const tooltipWidth = Math.max(
    64,
    Math.max(tooltipLabel?.length ?? 0, tooltipValue?.length ?? 0) * 6.5 + 18,
  );
  const tooltipHeight = 32;
  const tooltipX = hoveredPoint
    ? Math.max(4, Math.min(width - tooltipWidth - 4, hoveredPoint.x - tooltipWidth / 2))
    : 0;
  const tooltipArrowX = hoveredPoint
    ? Math.max(tooltipX + 8, Math.min(tooltipX + tooltipWidth - 8, hoveredPoint.x))
    : 0;
  const tooltipY = -40;

  return (
    <div
      ref={containerRef}
      className={cn("group/sparkline relative inline-block cursor-crosshair touch-none align-top outline-none", className)}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredIndex(null)}
      onFocus={handleMouseMove}
      onBlur={() => setHoveredIndex(null)}
      tabIndex={0}
      role="img"
      aria-label="Sparkline chart"
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        className="overflow-visible"
      >
        {fillOpacity > 0 && (
          <polygon
            fill={color}
            fillOpacity={fillOpacity}
            points={fillPoints}
            className="transition-all duration-300"
          />
        )}
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={svgPoints}
          className="transition-all duration-300"
        />

        {hoveredPoint ? (
          <g>
              {/* Vertical Guide Line */}
              <line
                x1={hoveredPoint.x}
                y1={0}
                x2={hoveredPoint.x}
                y2={height}
                stroke={color}
                strokeWidth="1"
                strokeDasharray="2,2"
                opacity={0.4}
              />
              {/* Point Highlight */}
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.y}
                r="3"
                fill="white"
                stroke={color}
                strokeWidth="1.5"
                className="shadow-sm"
              />
          </g>
        ) : null}
        {hoveredPoint && tooltipValue && tooltipLabel ? (
          <g pointerEvents="none">
              <rect
                x={tooltipX}
                y={tooltipY}
                width={tooltipWidth}
                height={tooltipHeight}
                rx="8"
                fill="white"
                stroke="currentColor"
                className="text-slate-200"
              />
              <polygon
                points={`${tooltipArrowX - 4},${tooltipY + tooltipHeight} ${tooltipArrowX + 4},${tooltipY + tooltipHeight} ${tooltipArrowX},${tooltipY + tooltipHeight + 6}`}
                fill="white"
                stroke="currentColor"
                className="text-slate-200"
              />
              <text
                x={tooltipX + tooltipWidth / 2}
                y={tooltipY + 12}
                textAnchor="middle"
                fill="currentColor"
                className="fill-current text-[9px] font-black uppercase tracking-tight text-slate-400"
              >
                {tooltipLabel}
              </text>
              <text
                x={tooltipX + tooltipWidth / 2}
                y={tooltipY + 24}
                textAnchor="middle"
                fill="currentColor"
                className="fill-current text-[10px] font-black tabular-nums text-slate-700"
              >
                {tooltipValue}
              </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
