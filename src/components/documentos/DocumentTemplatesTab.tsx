import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import * as pdfjsLib from 'pdfjs-dist';
import { ensurePdfjsWorker } from '@/lib/pdfjs-worker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  Upload,
  Trash2,
  FileText,
  ArrowLeft,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { TemplateZoneCanvas } from './TemplateZoneCanvas';
import { TemplateGenerateDialog } from './TemplateGenerateDialog';

ensurePdfjsWorker();

interface Template {
  id: string;
  name: string;
  description: string | null;
  original_file_path: string;
  original_file_type: string | null;
  page_count: number;
  page_image_paths: string[];
  created_at: string;
  created_by: string | null;
}

interface TemplateZone {
  id: string;
  template_id: string;
  page_number: number;
  zone_x: number;
  zone_y: number;
  zone_width: number;
  zone_height: number;
  table_headers: string[];
  default_data: string[][];
  font_family: string;
  font_size: number;
}

export function DocumentTemplatesTab() {
  const { user, isAdmin } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detail view state
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedPage, setSelectedPage] = useState(0);
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null);
  const [zones, setZones] = useState<TemplateZone[]>([]);
  const [isDefiningZone, setIsDefiningZone] = useState(false);
  const [newZoneRect, setNewZoneRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // Zone definition dialog state
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [zoneHeaders, setZoneHeaders] = useState<string[]>(['']);
  const [zoneDefaultData, setZoneDefaultData] = useState<string[][]>([['']]);
  const [zoneFontSize, setZoneFontSize] = useState(9);

  // Generate dialog state
  const [generateOpen, setGenerateOpen] = useState(false);
  const [selectedZone, setSelectedZone] = useState<TemplateZone | null>(null);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('document_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setTemplates(
        (data || []).map((d: any) => ({
          ...d,
          page_image_paths: (d.page_image_paths as string[]) || [],
        }))
      );
    } catch (err) {
      console.error('Error fetching templates:', err);
      toast.error('Error al cargar plantillas');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadName.trim()) {
      toast.error('Nombre y archivo son obligatorios');
      return;
    }

    setUploading(true);
    try {
      // 1. Upload original file
      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const filePath = `templates/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // 2. Render PDF pages to images
      const arrayBuffer = await selectedFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pageImagePaths: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;

        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), 'image/png');
        });

        const imgPath = `templates/pages/${Date.now()}-page-${i}.png`;
        const { error: imgError } = await supabase.storage
          .from('project-documents')
          .upload(imgPath, blob, { contentType: 'image/png' });

        if (imgError) {
          console.error(`Error uploading page ${i}:`, imgError);
          continue;
        }
        pageImagePaths.push(imgPath);
      }

      // 3. Create template record
      const { error: dbError } = await supabase
        .from('document_templates')
        .insert({
          name: uploadName.trim(),
          description: uploadDescription.trim() || null,
          original_file_path: filePath,
          original_file_type: selectedFile.type,
          page_count: pdf.numPages,
          page_image_paths: pageImagePaths,
          created_by: user?.id,
        });

      if (dbError) throw dbError;

      toast.success('Plantilla creada correctamente');
      setUploadOpen(false);
      setUploadName('');
      setUploadDescription('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchTemplates();
    } catch (err: any) {
      console.error('Error creating template:', err);
      toast.error(err?.message || 'Error al crear la plantilla');
    } finally {
      setUploading(false);
    }
  };

  const loadPageImage = async (template: Template, pageIdx: number) => {
    const path = template.page_image_paths[pageIdx];
    if (!path) return;

    try {
      const { data, error } = await supabase.storage
        .from('project-documents')
        .createSignedUrl(path, 600);

      if (error) throw error;
      setPageImageUrl(data.signedUrl);
    } catch (err) {
      console.error('Error loading page image:', err);
      toast.error('Error al cargar la página');
    }
  };

  const fetchZones = async (templateId: string) => {
    try {
      const { data, error } = await supabase
        .from('document_template_zones')
        .select('*')
        .eq('template_id', templateId);

      if (error) throw error;

      setZones(
        (data || []).map((z: any) => ({
          ...z,
          table_headers: (z.table_headers as string[]) || [],
          default_data: (z.default_data as string[][]) || [],
        }))
      );
    } catch (err) {
      console.error('Error fetching zones:', err);
    }
  };

  const openTemplate = async (template: Template) => {
    setSelectedTemplate(template);
    setSelectedPage(0);
    setPageImageUrl(null);
    await loadPageImage(template, 0);
    await fetchZones(template.id);
  };

  const handleZoneDrawn = (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    setNewZoneRect(rect);
    setIsDefiningZone(false);
    setZoneHeaders(['Columna 1']);
    setZoneDefaultData([['']]);
    setZoneFontSize(9);
    setZoneDialogOpen(true);
  };

  const saveZone = async () => {
    if (!selectedTemplate || !newZoneRect) return;
    const validHeaders = zoneHeaders.filter((h) => h.trim());
    if (validHeaders.length === 0) {
      toast.error('Define al menos un encabezado');
      return;
    }

    try {
      const { error } = await supabase
        .from('document_template_zones')
        .insert({
          template_id: selectedTemplate.id,
          page_number: selectedPage + 1,
          zone_x: newZoneRect.x,
          zone_y: newZoneRect.y,
          zone_width: newZoneRect.width,
          zone_height: newZoneRect.height,
          table_headers: validHeaders,
          default_data: zoneDefaultData.map((row) =>
            row.slice(0, validHeaders.length)
          ),
          font_size: zoneFontSize,
        });

      if (error) throw error;

      toast.success('Zona editable guardada');
      setZoneDialogOpen(false);
      setNewZoneRect(null);
      fetchZones(selectedTemplate.id);
    } catch (err: any) {
      console.error('Error saving zone:', err);
      toast.error('Error al guardar la zona');
    }
  };

  const deleteZone = async (zoneId: string) => {
    try {
      const { error } = await supabase
        .from('document_template_zones')
        .delete()
        .eq('id', zoneId);

      if (error) throw error;

      toast.success('Zona eliminada');
      if (selectedTemplate) fetchZones(selectedTemplate.id);
    } catch (err) {
      console.error('Error deleting zone:', err);
      toast.error('Error al eliminar la zona');
    }
  };

  const confirmDeleteTemplate = async () => {
    if (!templateToDelete) return;
    try {
      const template = templates.find((t) => t.id === templateToDelete);
      if (!template) return;

      const { error } = await supabase
        .from('document_templates')
        .delete()
        .eq('id', templateToDelete);

      if (error) throw error;

      // Clean up storage files
      const filesToDelete = [
        template.original_file_path,
        ...template.page_image_paths,
      ].filter(Boolean);
      if (filesToDelete.length > 0) {
        await supabase.storage.from('project-documents').remove(filesToDelete);
      }

      toast.success('Plantilla eliminada');
      if (selectedTemplate?.id === templateToDelete) {
        setSelectedTemplate(null);
      }
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
      fetchTemplates();
    } catch (err) {
      console.error('Error deleting template:', err);
      toast.error('Error al eliminar la plantilla');
    }
  };

  const openGenerate = (zone: TemplateZone) => {
    setSelectedZone(zone);
    setGenerateOpen(true);
  };

  // Zone header/data editing helpers
  const addHeader = () => {
    setZoneHeaders([...zoneHeaders, '']);
    setZoneDefaultData(zoneDefaultData.map((row) => [...row, '']));
  };

  const removeHeader = (idx: number) => {
    if (zoneHeaders.length <= 1) return;
    setZoneHeaders(zoneHeaders.filter((_, i) => i !== idx));
    setZoneDefaultData(zoneDefaultData.map((row) => row.filter((_, i) => i !== idx)));
  };

  const addRow = () => {
    setZoneDefaultData([
      ...zoneDefaultData,
      new Array(zoneHeaders.length).fill(''),
    ]);
  };

  const removeRow = (idx: number) => {
    if (zoneDefaultData.length <= 1) return;
    setZoneDefaultData(zoneDefaultData.filter((_, i) => i !== idx));
  };

  // ─── DETAIL VIEW ──────────────────────────────────────────────
  if (selectedTemplate) {
    const pageZones = zones.filter((z) => z.page_number === selectedPage + 1);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setSelectedTemplate(null);
                setPageImageUrl(null);
              }}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h2 className="text-lg font-semibold">{selectedTemplate.name}</h2>
              <p className="text-sm text-muted-foreground">
                {selectedTemplate.page_count} página
                {selectedTemplate.page_count !== 1 ? 's' : ''} ·{' '}
                {zones.length} zona{zones.length !== 1 ? 's' : ''} editable
                {zones.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant={isDefiningZone ? 'destructive' : 'outline'}
              onClick={() => setIsDefiningZone(!isDefiningZone)}
              className="gap-2"
              size="sm"
            >
              {isDefiningZone ? (
                <>
                  <X className="h-4 w-4" />
                  Cancelar
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Definir zona editable
                </>
              )}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setTemplateToDelete(selectedTemplate.id);
                setDeleteDialogOpen(true);
              }}
              className="gap-1"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          </div>
        </div>

        {/* Page navigation */}
        {selectedTemplate.page_count > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {Array.from({ length: selectedTemplate.page_count }, (_, i) => (
              <Button
                key={i}
                variant={selectedPage === i ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setSelectedPage(i);
                  loadPageImage(selectedTemplate, i);
                }}
              >
                Pág. {i + 1}
              </Button>
            ))}
          </div>
        )}

        {/* Page image with zone overlay */}
        <Card>
          <CardContent className="p-4">
            {pageImageUrl ? (
              <TemplateZoneCanvas
                imageUrl={pageImageUrl}
                zones={pageZones}
                isDrawing={isDefiningZone}
                onZoneDrawn={handleZoneDrawn}
                onZoneClick={openGenerate}
                onZoneDelete={deleteZone}
              />
            ) : (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Zones list */}
        {pageZones.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Zonas editables en página {selectedPage + 1}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {pageZones.map((zone, idx) => (
                  <div
                    key={zone.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium">Zona {idx + 1}</p>
                      <p className="text-xs text-muted-foreground">
                        {zone.table_headers.join(' | ')} ·{' '}
                        {zone.default_data.length} fila
                        {zone.default_data.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => openGenerate(zone)}
                        className="gap-1"
                      >
                        <FileText className="h-3 w-3" />
                        Generar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteZone(zone.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Zone definition dialog */}
        <Dialog open={zoneDialogOpen} onOpenChange={setZoneDialogOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Definir tabla editable</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Tamaño de fuente (pt)</Label>
                <Input
                  type="number"
                  value={zoneFontSize}
                  onChange={(e) =>
                    setZoneFontSize(Number(e.target.value) || 9)
                  }
                  min={6}
                  max={20}
                  className="w-24"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Encabezados de columna</Label>
                  <Button size="sm" variant="outline" onClick={addHeader}>
                    <Plus className="h-3 w-3 mr-1" /> Columna
                  </Button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {zoneHeaders.map((h, i) => (
                    <div key={i} className="flex gap-1 items-center">
                      <Input
                        value={h}
                        onChange={(e) => {
                          const updated = [...zoneHeaders];
                          updated[i] = e.target.value;
                          setZoneHeaders(updated);
                        }}
                        placeholder={`Col ${i + 1}`}
                        className="w-32"
                      />
                      {zoneHeaders.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => removeHeader(i)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Datos por defecto</Label>
                  <Button size="sm" variant="outline" onClick={addRow}>
                    <Plus className="h-3 w-3 mr-1" /> Fila
                  </Button>
                </div>
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  {zoneDefaultData.map((row, ri) => (
                    <div key={ri} className="flex gap-2 items-center">
                      {row.map((cell, ci) => (
                        <Input
                          key={ci}
                          value={cell}
                          onChange={(e) => {
                            const updated = zoneDefaultData.map((r) => [...r]);
                            updated[ri][ci] = e.target.value;
                            setZoneDefaultData(updated);
                          }}
                          placeholder={zoneHeaders[ci] || `Col ${ci + 1}`}
                          className="w-32"
                        />
                      ))}
                      {zoneDefaultData.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => removeRow(ri)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setZoneDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button onClick={saveZone}>Guardar zona</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Generate dialog */}
        {selectedZone && selectedTemplate && (
          <TemplateGenerateDialog
            open={generateOpen}
            onOpenChange={setGenerateOpen}
            template={selectedTemplate}
            zone={selectedZone}
            pageImageUrl={pageImageUrl}
          />
        )}

        {/* Delete confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar plantilla?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminarán la plantilla, todas sus zonas editables y archivos
                asociados. Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteTemplate}>
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ─── LIST VIEW ──────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Plantillas de documentos</h2>
        {isAdmin() && (
          <Button onClick={() => setUploadOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nueva plantilla
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              No hay plantillas. Sube un PDF para crear tu primera plantilla.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card
              key={template.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => openTemplate(template)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{template.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {template.page_count} pág. ·{' '}
                      {template.original_file_type
                        ?.split('/')[1]
                        ?.toUpperCase() || 'PDF'}
                    </p>
                    {template.description && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {template.description}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Nueva plantilla
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="Nombre de la plantilla..."
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder="Descripción opcional..."
              />
            </div>
            <div className="space-y-2">
              <Label>Archivo PDF *</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setSelectedFile(file);
                    if (!uploadName)
                      setUploadName(file.name.replace(/\.pdf$/i, ''));
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploading || !selectedFile || !uploadName.trim()}
            >
              {uploading ? 'Procesando...' : 'Crear plantilla'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
