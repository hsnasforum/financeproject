"use client";

type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
};

export function Sparkline({
  values,
  width = 140,
  height = 32,
  color = "#0f172a",
  fillOpacity = 0.1,
}: SparklineProps) {
  if (!values.length) {
    return <div className="h-8 w-36 rounded bg-slate-100" />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  // Path for fill area (closing the shape to the bottom)
  const fillPoints = `${points} ${width.toFixed(2)},${height.toFixed(2)} 0,${height.toFixed(2)}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible">
      {fillOpacity > 0 && (
        <polygon
          fill={color}
          fillOpacity={fillOpacity}
          points={fillPoints}
        />
      )}
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
