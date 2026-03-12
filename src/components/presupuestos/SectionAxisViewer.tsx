import { useMemo, useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save } from 'lucide-react';

interface SectionScale {
  hScale: number; // mm per grid cell on horizontal axis
  vScale: number; // mm per grid cell on vertical axis
}

interface SectionAxisViewerProps {
  sectionType: 'vertical' | 'longitudinal' | 'transversal';
  axisValue: number;
  sectionName: string;
  /** Persisted scale in mm */
  savedScale?: { hScale: number; vScale: number };
  onSaveScale?: (scale: { hScale: number; vScale: number }) => void;
}

const AXIS_COLORS = {
  X: 'hsl(0, 70%, 50%)',
  Y: 'hsl(140, 60%, 40%)',
  Z: 'hsl(220, 70%, 55%)',
};

function getConfig(sectionType: string) {
  switch (sectionType) {
    case 'vertical': return { fixedAxis: 'Z' as const, hAxis: 'X' as const, vAxis: 'Y' as const };
    case 'transversal': return { fixedAxis: 'X' as const, hAxis: 'Y' as const, vAxis: 'Z' as const };
    case 'longitudinal': return { fixedAxis: 'Y' as const, hAxis: 'X' as const, vAxis: 'Z' as const };
    default: return { fixedAxis: 'Z' as const, hAxis: 'X' as const, vAxis: 'Y' as const };
  }
}

export function SectionAxisViewer({
  sectionType,
  axisValue,
  sectionName,
  savedScale,
  onSaveScale,
}: SectionAxisViewerProps) {
  const { fixedAxis, hAxis, vAxis } = getConfig(sectionType);
  const hColor = AXIS_COLORS[hAxis];
  const vColor = AXIS_COLORS[vAxis];
  const fixedColor = AXIS_COLORS[fixedAxis];

  // Scale inputs (mm per cell)
  const [hScaleInput, setHScaleInput] = useState(String(savedScale?.hScale || ''));
  const [vScaleInput, setVScaleInput] = useState(String(savedScale?.vScale || ''));
  const [scale, setScale] = useState<SectionScale | null>(savedScale || null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 500 });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setContainerSize({ w: entry.contentRect.width, h: Math.max(400, window.innerHeight - 280) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Sync from savedScale
  useEffect(() => {
    if (savedScale) {
      setScale(savedScale);
      setHScaleInput(String(savedScale.hScale));
      setVScaleInput(String(savedScale.vScale));
    }
  }, [savedScale]);

  const handleSaveScale = () => {
    const h = parseFloat(hScaleInput);
    const v = parseFloat(vScaleInput);
    if (!h || h <= 0 || !v || v <= 0) return;
    const newScale = { hScale: h, vScale: v };
    setScale(newScale);
    onSaveScale?.(newScale);
  };

  const cellPx = 40; // pixels per grid cell
  const margin = 50;
  const w = containerSize.w;
  const h = containerSize.h;

  // Grid rendering
  const gridContent = useMemo(() => {
    if (!scale) return null;

    const drawW = w - margin * 2;
    const drawH = h - margin * 2;
    const cols = Math.floor(drawW / cellPx);
    const rows = Math.floor(drawH / cellPx);
    const gridW = cols * cellPx;
    const gridH = rows * cellPx;
    const ox = margin + Math.floor((drawW - gridW) / 2); // grid origin x (left)
    const oy = margin + Math.floor((drawH - gridH) / 2); // grid origin y (top)

    // Origin at center of grid
    const originCol = Math.floor(cols / 2);
    const originRow = Math.floor(rows / 2);
    const originX = ox + originCol * cellPx;
    const originY = oy + originRow * cellPx;

    const elements: JSX.Element[] = [];

    // Grid lines - discrete but visible
    for (let c = 0; c <= cols; c++) {
      const x = ox + c * cellPx;
      const isOrigin = c === originCol;
      elements.push(
        <line key={`gv${c}`} x1={x} y1={oy} x2={x} y2={oy + gridH}
          stroke={isOrigin ? hColor : 'hsl(var(--border))'} strokeWidth={isOrigin ? 2 : 0.5} opacity={isOrigin ? 1 : 0.3} />
      );
    }
    for (let r = 0; r <= rows; r++) {
      const y = oy + r * cellPx;
      const isOrigin = r === originRow;
      elements.push(
        <line key={`gh${r}`} x1={ox} y1={y} x2={ox + gridW} y2={y}
          stroke={isOrigin ? vColor : 'hsl(var(--border))'} strokeWidth={isOrigin ? 2 : 0.5} opacity={isOrigin ? 1 : 0.3} />
      );
    }

    // Horizontal tick labels: X0, X1, X-1, etc.
    for (let c = 0; c <= cols; c++) {
      const x = ox + c * cellPx;
      const idx = c - originCol;
      elements.push(
        <text key={`ht${c}`} x={x} y={oy + gridH + 16}
          textAnchor="middle" fontSize={9} fill={hColor} fontFamily="monospace" fontWeight={idx === 0 ? 'bold' : 'normal'}>
          {hAxis}{idx}
        </text>
      );
    }

    // Vertical tick labels: Y0, Y1 (up), Y-1 (down), etc.
    for (let r = 0; r <= rows; r++) {
      const y = oy + r * cellPx;
      const idx = originRow - r; // positive up, negative down
      elements.push(
        <text key={`vt${r}`} x={ox - 6} y={y + 4}
          textAnchor="end" fontSize={9} fill={vColor} fontFamily="monospace" fontWeight={idx === 0 ? 'bold' : 'normal'}>
          {vAxis}{idx}
        </text>
      );
    }

    // H axis arrow
    elements.push(
      <polygon key="harrow"
        points={`${ox + gridW},${originY} ${ox + gridW - 8},${originY - 4} ${ox + gridW - 8},${originY + 4}`}
        fill={hColor} />
    );
    elements.push(
      <text key="hlabel" x={ox + gridW + 4} y={originY - 8}
        fontSize={14} fontWeight="bold" fill={hColor} fontFamily="monospace">{hAxis}</text>
    );

    // V axis arrow (up)
    elements.push(
      <polygon key="varrow"
        points={`${originX},${oy} ${originX - 4},${oy + 8} ${originX + 4},${oy + 8}`}
        fill={vColor} />
    );
    elements.push(
      <text key="vlabel" x={originX + 8} y={oy + 4}
        fontSize={14} fontWeight="bold" fill={vColor} fontFamily="monospace">{vAxis}</text>
    );

    // Origin indicator
    elements.push(<circle key="origin" cx={originX} cy={originY} r={5} fill={fixedColor} opacity={0.8} />);
    elements.push(<circle key="originInner" cx={originX} cy={originY} r={2.5} fill="white" />);
    elements.push(
      <text key="originLabel" x={originX + 10} y={originY + 16}
        fontSize={10} fill="hsl(var(--muted-foreground))" fontFamily="monospace">(0,0)</text>
    );

    // Scale legend
    elements.push(
      <text key="scaleLegend" x={ox + gridW} y={oy - 6}
        textAnchor="end" fontSize={10} fill="hsl(var(--muted-foreground))" fontFamily="monospace">
        Escala: {hAxis}={scale.hScale}mm · {vAxis}={scale.vScale}mm
      </text>
    );

    return elements;
  }, [scale, w, h, hAxis, vAxis, hColor, vColor, fixedColor, fixedAxis]);

  return (
    <div ref={containerRef} className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold">{sectionName}</span>
        <span className="text-xs px-2 py-0.5 rounded font-mono font-bold"
          style={{ backgroundColor: fixedColor, color: 'white' }}>
          {fixedAxis}={axisValue}
        </span>
        <div className="ml-auto flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: hColor }} />
            <span className="font-mono font-bold" style={{ color: hColor }}>{hAxis}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: vColor }} />
            <span className="font-mono font-bold" style={{ color: vColor }}>{vAxis}</span>
          </span>
        </div>
      </div>

      {/* Scale config bar */}
      <div className="px-3 py-2 border-b bg-muted/10 flex items-end gap-3 flex-wrap">
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">Escala {hAxis} (mm)</Label>
            <Input className="h-7 w-24 text-xs font-mono" type="number" min={1}
              value={hScaleInput} onChange={e => setHScaleInput(e.target.value)}
              placeholder="625" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Escala {vAxis} (mm)</Label>
            <Input className="h-7 w-24 text-xs font-mono" type="number" min={1}
              value={vScaleInput} onChange={e => setVScaleInput(e.target.value)}
              placeholder="625" />
          </div>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSaveScale}
            disabled={!parseFloat(hScaleInput) || !parseFloat(vScaleInput)}>
            <Save className="h-3 w-3" /> Guardar escala
          </Button>
        </div>
        {scale && (
          <span className="text-[10px] text-muted-foreground ml-2">
            ✓ {hAxis}={scale.hScale}mm · {vAxis}={scale.vScale}mm
          </span>
        )}
      </div>

      {/* SVG Canvas */}
      {scale ? (
        <svg width={w} height={h} className="block bg-background">
          {gridContent}
        </svg>
      ) : (
        <div className="flex items-center justify-center bg-background" style={{ height: h }}>
          <p className="text-sm text-muted-foreground">
            Define las escalas {hAxis} y {vAxis} en milímetros y pulsa <strong>Guardar escala</strong> para generar la cuadrícula.
          </p>
        </div>
      )}
    </div>
  );
}
