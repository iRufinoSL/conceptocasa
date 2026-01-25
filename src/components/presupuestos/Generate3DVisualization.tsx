import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Upload, Image as ImageIcon, Sparkles, X } from 'lucide-react';

interface Generate3DVisualizationProps {
  budgetId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: () => void;
  parcelData?: {
    area?: number;
    address?: string;
    municipality?: string;
  };
}

export function Generate3DVisualization({ 
  budgetId, 
  open, 
  onOpenChange, 
  onGenerated,
  parcelData 
}: Generate3DVisualizationProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [additionalContext, setAdditionalContext] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Por favor selecciona un archivo de imagen'
      });
      return;
    }

    setSelectedImage(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerate = async () => {
    if (!selectedImage) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Debes subir una imagen base para generar la visualización'
      });
      return;
    }

    setIsGenerating(true);

    try {
      // Convert image to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(selectedImage);
      });
      
      const base64Image = await base64Promise;

      // Build context prompt
      let contextPrompt = 'Vista aérea 3D de este edificio/vivienda ubicado en una parcela.';
      
      if (parcelData?.area) {
        contextPrompt += ` La parcela tiene ${parcelData.area} m² de superficie.`;
      }
      if (parcelData?.address) {
        contextPrompt += ` Ubicación: ${parcelData.address}.`;
      }
      if (parcelData?.municipality) {
        contextPrompt += ` Municipio: ${parcelData.municipality}.`;
      }
      if (additionalContext.trim()) {
        contextPrompt += ` ${additionalContext.trim()}`;
      }

      contextPrompt += ' Genera una vista aérea/isométrica realista mostrando el edificio sobre un terreno con entorno natural (jardín, vegetación, accesos). Estilo de render arquitectónico profesional.';

      // Call edge function to generate the visualization
      const { data, error } = await supabase.functions.invoke('generate-3d-visualization', {
        body: {
          imageBase64: base64Image,
          prompt: contextPrompt,
          budgetId
        }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: 'Visualización generada',
        description: 'La imagen 3D se ha guardado en el ante-proyecto'
      });

      onGenerated();
      onOpenChange(false);
      
      // Reset form
      clearImage();
      setAdditionalContext('');

    } catch (error) {
      console.error('Error generating 3D visualization:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo generar la visualización'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generar Visualización 3D
          </DialogTitle>
          <DialogDescription>
            Sube una imagen base (render, maqueta, plano 3D) y la IA generará una vista aérea sobre la parcela.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Image upload */}
          <div className="space-y-2">
            <Label>Imagen base *</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            {imagePreview ? (
              <div className="relative">
                <img 
                  src={imagePreview} 
                  alt="Preview" 
                  className="w-full h-48 object-cover rounded-lg border"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8"
                  onClick={clearImage}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div 
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Haz clic para subir una imagen
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Render, maqueta, perspectiva 3D...
                </p>
              </div>
            )}
          </div>

          {/* Parcel info display */}
          {parcelData && (parcelData.area || parcelData.address) && (
            <div className="p-3 bg-muted/50 rounded-lg text-sm">
              <p className="font-medium mb-1">Datos de la parcela:</p>
              {parcelData.area && <p>• Superficie: {parcelData.area.toLocaleString('es-ES')} m²</p>}
              {parcelData.address && <p>• Dirección: {parcelData.address}</p>}
              {parcelData.municipality && <p>• Municipio: {parcelData.municipality}</p>}
            </div>
          )}

          {/* Additional context */}
          <div className="space-y-2">
            <Label htmlFor="context">Contexto adicional (opcional)</Label>
            <Textarea
              id="context"
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              placeholder="Ej: Vivienda unifamiliar de 2 plantas, estilo mediterráneo, con piscina..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating || !selectedImage}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <ImageIcon className="h-4 w-4 mr-2" />
                Generar Vista 3D
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
