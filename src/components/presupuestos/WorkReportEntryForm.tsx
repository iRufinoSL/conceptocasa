import { useState, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown, Camera, X, ImageIcon, Trash2 } from 'lucide-react';
import { formatActividadId } from '@/lib/activity-id';

export interface WorkReportEntryData {
  id?: string;
  description: string;
  activityId: string | null;
  images: File[];
  existingImages?: { id: string; file_name: string; file_path: string }[];
  imagesToDelete?: string[];
}

interface WorkReportEntryFormProps {
  entry: WorkReportEntryData;
  index: number;
  activities: { id: string; name: string; code: string; phase_code?: string | null }[];
  onChange: (entry: WorkReportEntryData) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export function WorkReportEntryForm({ 
  entry, 
  index, 
  activities, 
  onChange, 
  onRemove,
  canRemove 
}: WorkReportEntryFormProps) {
  const [activityPopoverOpen, setActivityPopoverOpen] = useState(false);
  const [activitySearchQuery, setActivitySearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activityOptions = useMemo(() => {
    return activities
      .map(a => {
        const label = formatActividadId({
          phaseCode: a.phase_code,
          activityCode: a.code,
          name: a.name,
        });
        const searchContent = `${a.phase_code || ''} ${a.code} ${a.name}`.toLowerCase();
        return { value: a.id, label, searchContent };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [activities]);

  const filteredActivities = useMemo(() => {
    const q = activitySearchQuery.toLowerCase().trim();
    if (!q) return activityOptions;
    return activityOptions.filter(a => a.searchContent.includes(q));
  }, [activityOptions, activitySearchQuery]);

  const handleImageCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    onChange({
      ...entry,
      images: [...entry.images, ...imageFiles]
    });
    // Reset the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeNewImage = (imageIndex: number) => {
    onChange({
      ...entry,
      images: entry.images.filter((_, i) => i !== imageIndex)
    });
  };

  const markExistingImageForDeletion = (imageId: string) => {
    onChange({
      ...entry,
      existingImages: (entry.existingImages || []).filter(img => img.id !== imageId),
      imagesToDelete: [...(entry.imagesToDelete || []), imageId]
    });
  };

  const selectedActivityLabel = entry.activityId 
    ? activityOptions.find(a => a.value === entry.activityId)?.label 
    : null;

  return (
    <Card className="relative">
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            Trabajo #{index + 1}
          </span>
          {canRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label>Descripción del trabajo realizado *</Label>
          <Textarea
            value={entry.description}
            onChange={(e) => onChange({ ...entry, description: e.target.value })}
            placeholder="Describa el trabajo realizado..."
            rows={3}
          />
        </div>

        {/* Activity selector */}
        <div className="space-y-2">
          <Label>Actividad del presupuesto (opcional)</Label>
          <Popover open={activityPopoverOpen} onOpenChange={setActivityPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={activityPopoverOpen}
                className="w-full justify-between font-normal"
                type="button"
              >
                <span className="truncate">
                  {selectedActivityLabel || 'Sin actividad vinculada'}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Buscar actividad..."
                  value={activitySearchQuery}
                  onValueChange={setActivitySearchQuery}
                />
                <CommandList className="max-h-[240px]">
                  <CommandEmpty>No se encontraron actividades.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="__none__"
                      onSelect={() => {
                        onChange({ ...entry, activityId: null });
                        setActivityPopoverOpen(false);
                        setActivitySearchQuery('');
                      }}
                      className="cursor-pointer"
                    >
                      <Check className={`mr-2 h-4 w-4 ${!entry.activityId ? 'opacity-100' : 'opacity-0'}`} />
                      Sin actividad vinculada
                    </CommandItem>
                    {filteredActivities.map(opt => (
                      <CommandItem
                        key={opt.value}
                        value={opt.value}
                        onSelect={() => {
                          onChange({ ...entry, activityId: opt.value });
                          setActivityPopoverOpen(false);
                          setActivitySearchQuery('');
                        }}
                        className="cursor-pointer"
                      >
                        <Check className={`mr-2 h-4 w-4 ${entry.activityId === opt.value ? 'opacity-100' : 'opacity-0'}`} />
                        <span className="truncate">{opt.label}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Image capture */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Fotografías
          </Label>
          
          <div className="flex flex-wrap gap-2">
            {/* Existing images */}
            {(entry.existingImages || []).map((img) => (
              <div 
                key={img.id}
                className="relative w-20 h-20 rounded-md overflow-hidden border bg-muted"
              >
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
                <button
                  type="button"
                  onClick={() => markExistingImageForDeletion(img.id)}
                  className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
                <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] px-1 truncate">
                  {img.file_name}
                </span>
              </div>
            ))}
            
            {/* New images */}
            {entry.images.map((file, imgIndex) => (
              <div 
                key={imgIndex}
                className="relative w-20 h-20 rounded-md overflow-hidden border"
              >
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeNewImage(imgIndex)}
                  className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            
            {/* Add image button */}
            <label className="w-20 h-20 border-2 border-dashed rounded-md flex flex-col items-center justify-center cursor-pointer hover:bg-accent/50 transition-colors">
              <Camera className="h-6 w-6 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground mt-1">Añadir</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={handleImageCapture}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            En móvil se abrirá la cámara directamente. Máx. 10MB por imagen.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
