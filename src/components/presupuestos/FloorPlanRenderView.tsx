import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ImageIcon, Download, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { FloorPlanData, RoomData } from '@/lib/floor-plan-calculations';

const STYLES = [
  { value: 'moderno', label: 'Moderno' },
  { value: 'rustico', label: 'Rústico' },
  { value: 'mediterraneo', label: 'Mediterráneo' },
  { value: 'clasico', label: 'Clásico' },
  { value: 'ecologico', label: 'Ecológico' },
  { value: 'industrial', label: 'Industrial' },
];

interface FloorPlanRenderViewProps {
  plan: FloorPlanData;
  rooms: RoomData[];
  budgetId: string;
}

export function FloorPlanRenderView({ plan, rooms, budgetId }: FloorPlanRenderViewProps) {
  const [style, setStyle] = useState('moderno');
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [renderImage, setRenderImage] = useState<string | null>(null);
  const [renderDescription, setRenderDescription] = useState('');

  const handleGenerate = async () => {
    setGenerating(true);
    setRenderImage(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-floor-render', {
        body: {
          style,
          planDescription: description,
          rooms: rooms.map(r => ({ name: r.name, width: r.width, length: r.length })),
          dimensions: {
            width: plan.width,
            length: plan.length,
            height: plan.defaultHeight,
          },
        },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setRenderImage(data.imageUrl);
      setRenderDescription(data.description || '');
      toast.success('Render generado');
    } catch (err: any) {
      console.error('Render error:', err);
      toast.error(err.message || 'Error al generar el render');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!renderImage) return;
    const link = document.createElement('a');
    link.href = renderImage;
    link.download = `render-${style}-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-semibold">Estilo arquitectónico</Label>
              <Select value={style} onValueChange={setStyle}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STYLES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs font-semibold">Descripción adicional (opcional)</Label>
              <Textarea
                placeholder="Ej: Fachada con piedra natural, jardín con piscina, orientación sur..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="h-9 min-h-[36px] resize-none text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleGenerate} disabled={generating} className="gap-2">
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {generating ? 'Generando render…' : 'Generar render fotorrealista'}
            </Button>
            <span className="text-xs text-muted-foreground">
              {plan.width}×{plan.length}m · {rooms.length} estancias · Estilo {style}
            </span>
          </div>
        </CardContent>
      </Card>

      {generating && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Generando render fotorrealista con IA…</p>
            <p className="text-xs text-muted-foreground">Esto puede tardar 15-30 segundos</p>
          </CardContent>
        </Card>
      )}

      {renderImage && !generating && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Render — Estilo {STYLES.find(s => s.value === style)?.label}</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1">
                <Download className="h-3.5 w-3.5" />
                Descargar
              </Button>
            </div>
            <img
              src={renderImage}
              alt={`Render ${style}`}
              className="w-full rounded-lg border shadow-sm"
            />
            {renderDescription && (
              <p className="text-xs text-muted-foreground">{renderDescription}</p>
            )}
          </CardContent>
        </Card>
      )}

      {!renderImage && !generating && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
              <ImageIcon className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Genera un render fotorrealista de la vivienda basado en los datos del plano.
              Ideal para presentaciones comerciales y CRM.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
