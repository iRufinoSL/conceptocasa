import { useMemo } from 'react';

interface SectionAxisViewerProps {
  sectionType: 'vertical' | 'longitudinal' | 'transversal';
  axisValue: number;
  sectionName: string;
  width?: number;
  height?: number;
}

/**
 * Renders a technical grid with XYZ axis representation for any section type.
 * - Z sections (vertical/plant): show X (horizontal) and Y (vertical) axes, Z label fixed
 * - X sections (transversal): show Y (horizontal) and Z (vertical) axes, X label fixed
 * - Y sections (longitudinal): show X (horizontal) and Z (vertical) axes, Y label fixed
 */
export function SectionAxisViewer({
  sectionType,
  axisValue,
  sectionName,
  width = 700,
  height = 500,
}: SectionAxisViewerProps) {
  const config = useMemo(() => {
    const cx = width / 2;
    const cy = height / 2;
    const margin = 50;

    // Define which axes are shown on H/V based on section type
    // and which axis is "fixed" (the section plane)
    switch (sectionType) {
      case 'vertical': // Z section: plane at Z=val, shows X (horiz) and Y (vert)
        return {
          fixedAxis: 'Z' as const,
          fixedColor: 'hsl(220, 70%, 55%)', // blue
          hAxis: 'X' as const,
          hColor: 'hsl(0, 70%, 50%)', // red
          vAxis: 'Y' as const,
          vColor: 'hsl(140, 60%, 40%)', // green
          cx, cy, margin,
        };
      case 'transversal': // X section: plane at X=val, shows Y (horiz) and Z (vert)
        return {
          fixedAxis: 'X' as const,
          fixedColor: 'hsl(0, 70%, 50%)',
          hAxis: 'Y' as const,
          hColor: 'hsl(140, 60%, 40%)',
          vAxis: 'Z' as const,
          vColor: 'hsl(220, 70%, 55%)',
          cx, cy, margin,
        };
      case 'longitudinal': // Y section: plane at Y=val, shows X (horiz) and Z (vert)
        return {
          fixedAxis: 'Y' as const,
          fixedColor: 'hsl(140, 60%, 40%)',
          hAxis: 'X' as const,
          hColor: 'hsl(0, 70%, 50%)',
          vAxis: 'Z' as const,
          vColor: 'hsl(220, 70%, 55%)',
          cx, cy, margin,
        };
    }
  }, [sectionType, width, height]);

  const gridStep = 40;

  // Generate grid lines
  const gridLines = useMemo(() => {
    const lines: JSX.Element[] = [];
    const { margin } = config;
    // Vertical grid lines
    for (let x = margin; x <= width - margin; x += gridStep) {
      lines.push(
        <line key={`gv-${x}`} x1={x} y1={margin} x2={x} y2={height - margin}
          stroke="hsl(var(--border))" strokeWidth={0.5} opacity={0.4} />
      );
    }
    // Horizontal grid lines
    for (let y = margin; y <= height - margin; y += gridStep) {
      lines.push(
        <line key={`gh-${y}`} x1={margin} y1={y} x2={width - margin} y2={y}
          stroke="hsl(var(--border))" strokeWidth={0.5} opacity={0.4} />
      );
    }
    return lines;
  }, [width, height, config]);

  // Tick labels along axes
  const tickLabels = useMemo(() => {
    const labels: JSX.Element[] = [];
    const { cx, cy, margin, hAxis, vAxis } = config;
    const hSteps = Math.floor((width - 2 * margin) / gridStep);
    const vSteps = Math.floor((height - 2 * margin) / gridStep);

    // Horizontal axis ticks (centered at cx)
    const hCenter = Math.round((cx - margin) / gridStep);
    for (let i = 0; i <= hSteps; i++) {
      const x = margin + i * gridStep;
      const val = i - hCenter;
      if (i % 2 === 0) {
        labels.push(
          <text key={`ht-${i}`} x={x} y={height - margin + 16}
            textAnchor="middle" fontSize={10} fill="hsl(var(--muted-foreground))"
            fontFamily="monospace">
            {val}
          </text>
        );
      }
    }

    // Vertical axis ticks (centered at cy, inverted for Z up)
    const vCenter = Math.round((cy - margin) / gridStep);
    for (let i = 0; i <= vSteps; i++) {
      const y = margin + i * gridStep;
      const val = vCenter - i; // inverted: up is positive
      if (i % 2 === 0) {
        labels.push(
          <text key={`vt-${i}`} x={margin - 8} y={y + 4}
            textAnchor="end" fontSize={10} fill="hsl(var(--muted-foreground))"
            fontFamily="monospace">
            {val}
          </text>
        );
      }
    }

    return labels;
  }, [width, height, config]);

  const { cx, cy, margin, hAxis, hColor, vAxis, vColor, fixedAxis, fixedColor } = config;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-3">
        <span className="text-sm font-semibold">{sectionName}</span>
        <span className="text-xs px-2 py-0.5 rounded font-mono font-bold"
          style={{ backgroundColor: fixedColor, color: 'white' }}>
          {fixedAxis}={axisValue}
        </span>
        <div className="ml-auto flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: hColor }} />
            <span className="font-mono font-bold" style={{ color: hColor }}>{hAxis}</span>
            <span className="text-muted-foreground">horizontal</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: vColor }} />
            <span className="font-mono font-bold" style={{ color: vColor }}>{vAxis}</span>
            <span className="text-muted-foreground">vertical</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm border" style={{ borderColor: fixedColor, backgroundColor: `${fixedColor}22` }} />
            <span className="font-mono font-bold" style={{ color: fixedColor }}>{fixedAxis}</span>
            <span className="text-muted-foreground">plano</span>
          </span>
        </div>
      </div>

      {/* SVG Canvas */}
      <svg width={width} height={height} className="block bg-background">
        {/* Grid */}
        {gridLines}

        {/* Horizontal axis line */}
        <line x1={margin} y1={cy} x2={width - margin} y2={cy}
          stroke={hColor} strokeWidth={2} />
        {/* Arrow right */}
        <polygon
          points={`${width - margin},${cy} ${width - margin - 8},${cy - 4} ${width - margin - 8},${cy + 4}`}
          fill={hColor} />
        {/* H axis label */}
        <text x={width - margin + 4} y={cy - 8}
          fontSize={15} fontWeight="bold" fill={hColor} fontFamily="monospace">
          {hAxis}
        </text>

        {/* Vertical axis line */}
        <line x1={cx} y1={margin} x2={cx} y2={height - margin}
          stroke={vColor} strokeWidth={2} />
        {/* Arrow up */}
        <polygon
          points={`${cx},${margin} ${cx - 4},${margin + 8} ${cx + 4},${margin + 8}`}
          fill={vColor} />
        {/* V axis label */}
        <text x={cx + 8} y={margin + 4}
          fontSize={15} fontWeight="bold" fill={vColor} fontFamily="monospace">
          {vAxis}
        </text>

        {/* Fixed axis indicator (perpendicular dot at origin) */}
        <circle cx={cx} cy={cy} r={6} fill={fixedColor} opacity={0.8} />
        <circle cx={cx} cy={cy} r={3} fill="white" />
        <text x={cx - 16} y={cy - 10}
          fontSize={12} fontWeight="bold" fill={fixedColor} fontFamily="monospace">
          {fixedAxis}
        </text>

        {/* Origin label */}
        <text x={cx + 10} y={cy + 16}
          fontSize={10} fill="hsl(var(--muted-foreground))" fontFamily="monospace">
          (0,0)
        </text>

        {/* Tick labels */}
        {tickLabels}

        {/* Section plane label */}
        <rect x={margin} y={margin - 30} width={width - 2 * margin} height={20} rx={4}
          fill={fixedColor} opacity={0.08} />
        <text x={width / 2} y={margin - 16}
          textAnchor="middle" fontSize={11} fill={fixedColor} fontWeight="600" fontFamily="monospace">
          Plano {fixedAxis} = {axisValue}
        </text>
      </svg>
    </div>
  );
}
