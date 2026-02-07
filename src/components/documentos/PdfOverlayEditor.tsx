import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Download,
  Type,
  MousePointer2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  generateOverlayPdf,
  type TextOverlay,
  type PageOverlays,
} from '@/lib/pdf-overlay-export';
import * as pdfjsLib from 'pdfjs-dist';
import { ensurePdfjsWorker } from '@/lib/pdfjs-worker';

interface Template {
  id: string;
  name: string;
  page_count: number;
  page_image_paths: string[];
  original_file_path: string;
}

/** Extracted text item with position and font info */
interface PdfTextItem {
  /** X position as percentage of page width (0-100) */
  xPct: number;
  /** Y position as percentage of page height (0-100) */
  yPct: number;
  text: string;
  fontSize: number;
  fontFamily: 'helvetica' | 'times' | 'courier';
  bold: boolean;
}

/** Map font name from PDF to our supported families */
function mapFontFamily(fontName: string): 'helvetica' | 'times' | 'courier' {
  const lower = fontName.toLowerCase();
  if (lower.includes('courier') || lower.includes('mono')) return 'courier';
  if (lower.includes('times') || lower.includes('serif') || lower.includes('roman')) return 'times';
  return 'helvetica';
}

function isBoldFont(fontName: string): boolean {
  const lower = fontName.toLowerCase();
  return lower.includes('bold') || lower.includes('black') || lower.includes('heavy');
}

interface PdfOverlayEditorProps {
  template: Template;
  onClose: () => void;
}

export function PdfOverlayEditor({ template, onClose }: PdfOverlayEditorProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [pageImageUrls, setPageImageUrls] = useState<(string | null)[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // All overlays across all pages, keyed by page index
  const [overlaysByPage, setOverlaysByPage] = useState<Map<number, TextOverlay[]>>(new Map());

  // Currently selected overlay
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);

  // Adding mode
  const [isAddingMode, setIsAddingMode] = useState(false);

  const imageContainerRef = useRef<HTMLDivElement>(null);

  /** Extracted text items per page for font detection */
  const [textItemsByPage, setTextItemsByPage] = useState<Map<number, PdfTextItem[]>>(new Map());

  // Load all page images + extract PDF text for font detection
  useEffect(() => {
    loadAllPageImages();
    extractPdfTextItems();
  }, [template]);

  const loadAllPageImages = async () => {
    setLoading(true);
    try {
      const urls: (string | null)[] = [];
      for (let i = 0; i < template.page_count; i++) {
        const path = template.page_image_paths[i];
        if (!path) {
          urls.push(null);
          continue;
        }
        const { data, error } = await supabase.storage
          .from('project-documents')
          .createSignedUrl(path, 3600);
        if (error) {
          urls.push(null);
          continue;
        }
        urls.push(data.signedUrl);
      }
      setPageImageUrls(urls);
    } catch (err) {
      console.error('Error loading pages:', err);
      toast.error('Error al cargar las páginas');
    } finally {
      setLoading(false);
    }
  };

  /** Extract text items from the original PDF for font detection */
  const extractPdfTextItems = async () => {
    try {
      ensurePdfjsWorker();
      const { data: urlData, error: urlError } = await supabase.storage
        .from('project-documents')
        .createSignedUrl(template.original_file_path, 3600);
      if (urlError || !urlData?.signedUrl) return;

      const loadingTask = pdfjsLib.getDocument(urlData.signedUrl);
      const pdf = await loadingTask.promise;
      const itemsMap = new Map<number, PdfTextItem[]>();

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();
        const items: PdfTextItem[] = [];

        for (const item of textContent.items) {
          if (!('str' in item) || !item.str.trim()) continue;
          const tx = item.transform;
          // tx[4] = x, tx[5] = y (from bottom), tx[0] = scaleX (≈fontSize)
          const x = tx[4];
          const y = tx[5];
          const fontSize = Math.abs(tx[0]) || Math.abs(tx[3]) || 12;
          const fontName = item.fontName || '';

          items.push({
            xPct: (x / viewport.width) * 100,
            yPct: ((viewport.height - y) / viewport.height) * 100, // flip Y
            text: item.str,
            fontSize: Math.round(fontSize),
            fontFamily: mapFontFamily(fontName),
            bold: isBoldFont(fontName),
          });
        }
        itemsMap.set(pageNum - 1, items);
      }
      setTextItemsByPage(itemsMap);
    } catch (err) {
      console.error('Error extracting PDF text for font detection:', err);
      // Non-critical: overlays will use defaults
    }
  };

  /** Find the nearest text item to a given position on the current page */
  const findNearestTextItem = useCallback(
    (xPct: number, yPct: number): PdfTextItem | null => {
      const items = textItemsByPage.get(currentPage);
      if (!items || items.length === 0) return null;

      let nearest: PdfTextItem | null = null;
      let minDist = Infinity;

      for (const item of items) {
        // Weight Y distance more since text lines are horizontal
        const dx = item.xPct - xPct;
        const dy = (item.yPct - yPct) * 2;
        const dist = dx * dx + dy * dy;
        if (dist < minDist) {
          minDist = dist;
          nearest = item;
        }
      }

      // Only use if reasonably close (within ~8% of page)
      if (minDist > 8 * 8 * 5) return null;
      return nearest;
    },
    [currentPage, textItemsByPage]
  );

  const currentOverlays = overlaysByPage.get(currentPage) || [];

  const selectedOverlay = currentOverlays.find((o) => o.id === selectedOverlayId) || null;

  const updateOverlay = useCallback(
    (id: string, updates: Partial<TextOverlay>) => {
      setOverlaysByPage((prev) => {
        const next = new Map(prev);
        const pageOverlays = [...(next.get(currentPage) || [])];
        const idx = pageOverlays.findIndex((o) => o.id === id);
        if (idx >= 0) {
          pageOverlays[idx] = { ...pageOverlays[idx], ...updates };
          next.set(currentPage, pageOverlays);
        }
        return next;
      });
    },
    [currentPage]
  );

  const deleteOverlay = useCallback(
    (id: string) => {
      setOverlaysByPage((prev) => {
        const next = new Map(prev);
        const pageOverlays = (next.get(currentPage) || []).filter((o) => o.id !== id);
        next.set(currentPage, pageOverlays);
        return next;
      });
      if (selectedOverlayId === id) setSelectedOverlayId(null);
    },
    [currentPage, selectedOverlayId]
  );

  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isAddingMode) return;

      const container = imageContainerRef.current;
      if (!container) return;
      const img = container.querySelector('img');
      if (!img) return;

      const imgRect = img.getBoundingClientRect();
      const xPct = ((e.clientX - imgRect.left) / imgRect.width) * 100;
      const yPct = ((e.clientY - imgRect.top) / imgRect.height) * 100;

      // Detect font from nearest original text
      const nearest = findNearestTextItem(xPct, yPct);

      const newOverlay: TextOverlay = {
        id: crypto.randomUUID(),
        x: Math.max(0, Math.min(xPct, 90)),
        y: Math.max(0, Math.min(yPct, 95)),
        width: 25,
        text: nearest?.text || 'Texto editable',
        fontSize: nearest?.fontSize || 11,
        fontFamily: nearest?.fontFamily || 'helvetica',
        bold: nearest?.bold || false,
        color: '#000000',
      };

      setOverlaysByPage((prev) => {
        const next = new Map(prev);
        const pageOverlays = [...(next.get(currentPage) || []), newOverlay];
        next.set(currentPage, pageOverlays);
        return next;
      });

      setSelectedOverlayId(newOverlay.id);
      setIsAddingMode(false);
    },
    [isAddingMode, currentPage, findNearestTextItem]
  );

  // Drag state
  const [dragging, setDragging] = useState<{
    id: string;
    startMouseX: number;
    startMouseY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const handleOverlayMouseDown = useCallback(
    (e: React.MouseEvent, overlay: TextOverlay) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedOverlayId(overlay.id);

      const container = imageContainerRef.current;
      if (!container) return;
      const img = container.querySelector('img');
      if (!img) return;

      setDragging({
        id: overlay.id,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startX: overlay.x,
        startY: overlay.y,
      });
    },
    []
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = imageContainerRef.current;
      if (!container) return;
      const img = container.querySelector('img');
      if (!img) return;

      const imgRect = img.getBoundingClientRect();
      const dx = ((e.clientX - dragging.startMouseX) / imgRect.width) * 100;
      const dy = ((e.clientY - dragging.startMouseY) / imgRect.height) * 100;

      const newX = Math.max(0, Math.min(dragging.startX + dx, 95));
      const newY = Math.max(0, Math.min(dragging.startY + dy, 98));

      updateOverlay(dragging.id, { x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setDragging(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, updateOverlay]);

  // Load image as data URL for PDF generation
  const loadImageAsDataUrl = useCallback(async (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = url;
    });
  }, []);

  const handleExportPdf = async () => {
    setGenerating(true);
    try {
      const pagesData: PageOverlays[] = [];

      for (let i = 0; i < template.page_count; i++) {
        const url = pageImageUrls[i];
        if (!url) continue;

        const dataUrl = await loadImageAsDataUrl(url);

        // Determine orientation from image
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.src = dataUrl;
        });

        pagesData.push({
          imageDataUrl: dataUrl,
          isLandscape: img.naturalWidth > img.naturalHeight,
          overlays: overlaysByPage.get(i) || [],
        });
      }

      generateOverlayPdf(pagesData, `${template.name} - Editado.pdf`);
      toast.success('PDF generado correctamente');
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      toast.error(err?.message || 'Error al generar el PDF');
    } finally {
      setGenerating(false);
    }
  };

  const totalOverlays = Array.from(overlaysByPage.values()).reduce(
    (sum, arr) => sum + arr.length,
    0
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Editar PDF: {template.name}</h2>
            <p className="text-sm text-muted-foreground">
              Haz clic en la página para añadir cuadros de texto invisibles.
              Se superpondrán sobre el original al exportar.
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={isAddingMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setIsAddingMode(!isAddingMode);
              setSelectedOverlayId(null);
            }}
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            {isAddingMode ? 'Haz clic en la página...' : 'Añadir cuadro de texto'}
          </Button>
          <Button
            size="sm"
            onClick={handleExportPdf}
            disabled={generating || totalOverlays === 0}
            className="gap-1"
          >
            <Download className="h-4 w-4" />
            {generating ? 'Generando...' : 'Exportar PDF'}
          </Button>
        </div>
      </div>

      {/* Page navigation */}
      {template.page_count > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {Array.from({ length: template.page_count }, (_, i) => {
            const pageOverlayCount = (overlaysByPage.get(i) || []).length;
            return (
              <Button
                key={i}
                variant={currentPage === i ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setCurrentPage(i);
                  setSelectedOverlayId(null);
                }}
              >
                Pág. {i + 1}
                {pageOverlayCount > 0 && (
                  <span className="ml-1 text-xs opacity-70">({pageOverlayCount})</span>
                )}
              </Button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        {/* Page canvas with overlays */}
        <div
          ref={imageContainerRef}
          className="relative border rounded-lg overflow-hidden bg-muted/30"
          style={{ cursor: isAddingMode ? 'crosshair' : 'default' }}
          onClick={handleImageClick}
        >
          {pageImageUrls[currentPage] ? (
            <>
              <img
                src={pageImageUrls[currentPage]!}
                alt={`Página ${currentPage + 1}`}
                className="w-full h-auto"
                draggable={false}
              />

              {/* Text overlays */}
              {currentOverlays.map((overlay) => (
                <div
                  key={overlay.id}
                  className={`absolute group ${
                    selectedOverlayId === overlay.id
                      ? 'ring-2 ring-primary ring-offset-1'
                      : 'hover:ring-1 hover:ring-primary/50'
                  }`}
                  style={{
                    left: `${overlay.x}%`,
                    top: `${overlay.y}%`,
                    width: `${overlay.width}%`,
                    minHeight: '1.5em',
                    cursor: dragging ? 'grabbing' : 'grab',
                  }}
                  onMouseDown={(e) => handleOverlayMouseDown(e, overlay)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedOverlayId(overlay.id);
                  }}
                >
                  {/* The actual text area - transparent background to be invisible */}
                  <textarea
                    value={overlay.text}
                    onChange={(e) => updateOverlay(overlay.id, { text: e.target.value })}
                    className="w-full bg-white/90 border-none outline-none resize-none p-0.5"
                    style={{
                      fontSize: `${overlay.fontSize * 0.85}px`,
                      fontFamily:
                        overlay.fontFamily === 'times'
                          ? 'Times New Roman, serif'
                          : overlay.fontFamily === 'courier'
                          ? 'Courier New, monospace'
                          : 'Helvetica, Arial, sans-serif',
                      fontWeight: overlay.bold ? 'bold' : 'normal',
                      color: overlay.color,
                      lineHeight: '1.3',
                      minHeight: '1.5em',
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    rows={overlay.text.split('\n').length}
                  />

                  {/* Delete button on hover */}
                  <button
                    className="absolute -top-3 -right-3 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteOverlay(overlay.id);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    ×
                  </button>
                </div>
              ))}

              {/* Adding mode indicator */}
              {isAddingMode && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-background/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Type className="h-4 w-4" />
                      Haz clic donde quieras colocar el cuadro de texto
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              No se pudo cargar la imagen de esta página
            </div>
          )}
        </div>

        {/* Properties panel */}
        <div className="space-y-4">
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-medium flex items-center gap-2 text-sm">
              <MousePointer2 className="h-4 w-4" />
              Cuadros de texto ({currentOverlays.length})
            </h3>

            {currentOverlays.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Pulsa "Añadir cuadro de texto" y haz clic en la página para crear uno.
              </p>
            )}

            {/* List of overlays */}
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {currentOverlays.map((overlay, idx) => (
                <div
                  key={overlay.id}
                  className={`flex items-center justify-between p-2 rounded text-xs cursor-pointer ${
                    selectedOverlayId === overlay.id
                      ? 'bg-primary/10 border border-primary/30'
                      : 'bg-muted/50 hover:bg-muted'
                  }`}
                  onClick={() => setSelectedOverlayId(overlay.id)}
                >
                  <span className="truncate flex-1">
                    {idx + 1}. {overlay.text.substring(0, 25)}
                    {overlay.text.length > 25 ? '...' : ''}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteOverlay(overlay.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Selected overlay properties */}
          {selectedOverlay && (
            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="font-medium text-sm">Propiedades del cuadro</h3>

              <div className="space-y-2">
                <Label className="text-xs">Tamaño de fuente (pt)</Label>
                <Input
                  type="number"
                  value={selectedOverlay.fontSize}
                  onChange={(e) =>
                    updateOverlay(selectedOverlay.id, {
                      fontSize: Math.max(6, Math.min(72, Number(e.target.value) || 11)),
                    })
                  }
                  min={6}
                  max={72}
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Ancho (%)</Label>
                <Input
                  type="number"
                  value={Math.round(selectedOverlay.width)}
                  onChange={(e) =>
                    updateOverlay(selectedOverlay.id, {
                      width: Math.max(5, Math.min(95, Number(e.target.value) || 25)),
                    })
                  }
                  min={5}
                  max={95}
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Fuente</Label>
                <Select
                  value={selectedOverlay.fontFamily}
                  onValueChange={(v) =>
                    updateOverlay(selectedOverlay.id, {
                      fontFamily: v as TextOverlay['fontFamily'],
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="helvetica">Helvetica / Arial</SelectItem>
                    <SelectItem value="times">Times New Roman</SelectItem>
                    <SelectItem value="courier">Courier</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="bold-check"
                  checked={selectedOverlay.bold}
                  onCheckedChange={(checked) =>
                    updateOverlay(selectedOverlay.id, { bold: !!checked })
                  }
                />
                <Label htmlFor="bold-check" className="text-xs">
                  Negrita
                </Label>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Color</Label>
                <Input
                  type="color"
                  value={selectedOverlay.color}
                  onChange={(e) =>
                    updateOverlay(selectedOverlay.id, { color: e.target.value })
                  }
                  className="h-8 w-16 p-1"
                />
              </div>
            </div>
          )}

          {/* Export info */}
          {totalOverlays > 0 && (
            <div className="border rounded-lg p-4 bg-muted/30">
              <p className="text-xs text-muted-foreground">
                <strong>{totalOverlays}</strong> cuadro{totalOverlays !== 1 ? 's' : ''} de texto
                en {overlaysByPage.size} página{overlaysByPage.size !== 1 ? 's' : ''}.
                Al exportar, cada cuadro tapará el texto original con fondo blanco
                y lo reemplazará con tu texto editado.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
