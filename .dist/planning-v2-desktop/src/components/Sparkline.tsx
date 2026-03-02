"use client";

type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
};

export function Sparkline({ values, width = 140, height = 32, color = "#0f172a" }: SparklineProps) {
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

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
    </svg>
  );
}
