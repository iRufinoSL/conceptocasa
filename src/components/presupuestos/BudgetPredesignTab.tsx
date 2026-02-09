import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Upload, X, Maximize2, FileImage, FileText, LayoutGrid, Layers, ChevronDown, ChevronRight, Sparkles, Move, Home } from 'lucide-react';
import { PdfThumbnail } from '@/components/ui/pdf-thumbnail';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { Generate3DVisualization } from './Generate3DVisualization';
import { VisualizationAdjustmentViewer } from './VisualizationAdjustmentViewer';
import { BudgetHousingProfileTab } from './BudgetHousingProfileTab';
interface BudgetPredesign {
  id: string;
  budget_id: string;
  content: string;
  description: string | null;
  content_type: string;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number;
  created_at: string;
}

interface BudgetPredesignTabProps {
  budgetId: string;
  isAdmin: boolean;
  projectId?: string | null;
}

const DEFAULT_CONTENT_TYPES = [
  'Referencia catastral',
  'Plano',
  'Alzado',
  'Perspectiva',
  'Otro'
];

type ViewMode = 'alphabetical' | 'grouped';

export function BudgetPredesignTab({ budgetId, isAdmin, projectId }: BudgetPredesignTabProps) {
  const { toast } = useToast();
  const [predesigns, setPredesigns] = useState<BudgetPredesign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetPredesign | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<BudgetPredesign | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [customContentTypes, setCustomContentTypes] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('predesign-view-mode') as ViewMode) || 'alphabetical';
  });
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [activeSubTab, setActiveSubTab] = useState<string>('ante-proyecto');
  const [generate3DOpen, setGenerate3DOpen] = useState(false);
  const [adjustmentViewerOpen, setAdjustmentViewerOpen] = useState(false);
  const [adjustmentItem, setAdjustmentItem] = useState<BudgetPredesign | null>(null);
  const [urbanProfileData, setUrbanProfileData] = useState<{
    area?: number;
    address?: string;
    municipality?: string;
    lat?: number;
    lng?: number;
  } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    content: '',
    description: '',
    content_type: 'Otro',
    newContentType: ''
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Toggle view mode and save preference
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('predesign-view-mode', mode);
  };

  // Toggle group expansion
  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  // Get sorted predesigns for alphabetical view
  const getSortedPredesigns = () => {
    return [...predesigns].sort((a, b) => a.content.localeCompare(b.content, 'es'));
  };

  // Get grouped predesigns by content type
  const getGroupedPredesigns = () => {
    const groups: Record<string, BudgetPredesign[]> = {};
    
    predesigns.forEach(item => {
      const type = item.content_type || 'Sin tipo';
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(item);
    });

    // Sort items within each group alphabetically
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => a.content.localeCompare(b.content, 'es'));
    });

    // Sort groups alphabetically by type name
    const sortedGroups: Record<string, BudgetPredesign[]> = {};
    Object.keys(groups).sort((a, b) => a.localeCompare(b, 'es')).forEach(key => {
      sortedGroups[key] = groups[key];
    });

    return sortedGroups;
  };

  const fetchPredesigns = async () => {
    try {
      const { data, error } = await supabase
        .from('budget_predesigns')
        .select('*')
        .eq('budget_id', budgetId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPredesigns(data || []);

      // Extract custom content types
      const types = (data || [])
        .map(p => p.content_type)
        .filter(t => !DEFAULT_CONTENT_TYPES.includes(t));
      setCustomContentTypes([...new Set(types)]);
    } catch (error) {
      console.error('Error fetching predesigns:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron cargar los elementos del ante-proyecto'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPredesigns();
  }, [budgetId]);

  // Fetch urban profile data for 3D visualization context
  // If no coordinates but has cadastral reference, fetch from Catastro
  useEffect(() => {
    const fetchUrbanProfile = async () => {
      try {
        const { data } = await supabase
          .from('urban_profiles')
          .select('id, surface_area, address, municipality, google_maps_lat, google_maps_lng, cadastral_reference')
          .eq('budget_id', budgetId)
          .maybeSingle();
        
        if (data) {
          let lat = data.google_maps_lat ? Number(data.google_maps_lat) : undefined;
          let lng = data.google_maps_lng ? Number(data.google_maps_lng) : undefined;
          
          // If no coordinates but has cadastral reference, fetch from Catastro
          if ((!lat || !lng) && data.cadastral_reference) {
            console.log('No coordinates found, fetching from Catastro for:', data.cadastral_reference);
            try {
              const { data: catastroResult, error: catastroError } = await supabase.functions.invoke('catastro-lookup', {
                body: { 
                  cadastralReference: data.cadastral_reference,
                  budgetId: budgetId,
                  saveToProfile: false // Don't save, we'll update manually with coordinates only
                }
              });
              
              if (!catastroError && catastroResult?.success && catastroResult?.data?.coordinates) {
                const coords = catastroResult.data.coordinates;
                lat = coords.lat;
                lng = coords.lng;
                
                // Update the urban profile with the new coordinates
                await supabase
                  .from('urban_profiles')
                  .update({
                    google_maps_lat: coords.lat,
                    google_maps_lng: coords.lng,
                    coordinates_source: 'Catastro (automático desde referencia catastral)'
                  })
                  .eq('id', data.id);
                
                console.log('Coordinates fetched and saved:', coords);
              }
            } catch (catastroFetchError) {
              console.error('Error fetching coordinates from Catastro:', catastroFetchError);
            }
          }
          
          setUrbanProfileData({
            area: data.surface_area ?? undefined,
            address: data.address ?? undefined,
            municipality: data.municipality ?? undefined,
            lat,
            lng
          });
        }
      } catch (error) {
        console.error('Error fetching urban profile:', error);
      }
    };
    fetchUrbanProfile();
  }, [budgetId]);

  const handleNew = () => {
    setEditingItem(null);
    setFormData({
      content: '',
      description: '',
      content_type: 'Otro',
      newContentType: ''
    });
    setSelectedFile(null);
    setFormOpen(true);
  };

  const handleEdit = (item: BudgetPredesign) => {
    setEditingItem(item);
    setFormData({
      content: item.content,
      description: item.description || '',
      content_type: item.content_type,
      newContentType: ''
    });
    setSelectedFile(null);
    setFormOpen(true);
  };

  const handleDeleteClick = (item: BudgetPredesign) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;

    try {
      // Delete file from storage if exists
      if (itemToDelete.file_path) {
        await supabase.storage
          .from('budget-predesigns')
          .remove([itemToDelete.file_path]);
      }

      const { error } = await supabase
        .from('budget_predesigns')
        .delete()
        .eq('id', itemToDelete.id);

      if (error) throw error;

      toast({
        title: 'Eliminado',
        description: 'Elemento del ante-proyecto eliminado correctamente'
      });
      fetchPredesigns();
    } catch (error) {
      console.error('Error deleting predesign:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo eliminar el elemento'
      });
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const handleSubmit = async () => {
    if (!formData.content.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'El contenido es obligatorio'
      });
      return;
    }

    setIsSaving(true);

    try {
      let filePath = editingItem?.file_path || null;
      let fileName = editingItem?.file_name || null;
      let fileType = editingItem?.file_type || null;
      let fileSize = editingItem?.file_size || 0;

      // Upload new file if selected
      if (selectedFile) {
        // Delete old file if replacing
        if (editingItem?.file_path) {
          await supabase.storage
            .from('budget-predesigns')
            .remove([editingItem.file_path]);
        }

        const fileExt = selectedFile.name.split('.').pop();
        const newFilePath = `${budgetId}/${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('budget-predesigns')
          .upload(newFilePath, selectedFile);

        if (uploadError) throw uploadError;

        filePath = newFilePath;
        fileName = selectedFile.name;
        fileType = selectedFile.type;
        fileSize = selectedFile.size;
      }

      const contentType = formData.content_type === '__new__' && formData.newContentType.trim()
        ? formData.newContentType.trim()
        : formData.content_type;

      const payload = {
        budget_id: budgetId,
        content: formData.content.trim(),
        description: formData.description.trim() || null,
        content_type: contentType,
        file_path: filePath,
        file_name: fileName,
        file_type: fileType,
        file_size: fileSize
      };

      if (editingItem) {
        const { error } = await supabase
          .from('budget_predesigns')
          .update(payload)
          .eq('id', editingItem.id);

        if (error) throw error;
        toast({ title: 'Actualizado', description: 'Elemento actualizado correctamente' });
      } else {
        const { error } = await supabase
          .from('budget_predesigns')
          .insert(payload);

        if (error) throw error;
        toast({ title: 'Creado', description: 'Elemento añadido al ante-proyecto' });
      }

      setFormOpen(false);
      fetchPredesigns();
    } catch (error) {
      console.error('Error saving predesign:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo guardar el elemento'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});

  // Generate signed URLs for private bucket access
  useEffect(() => {
    const generateSignedUrls = async () => {
      const urlMap: Record<string, string> = {};
      
      for (const item of predesigns) {
        if (item.file_path) {
          const { data, error } = await supabase.storage
            .from('budget-predesigns')
            .createSignedUrl(item.file_path, 3600); // 1 hour expiry
          
          if (data && !error) {
            urlMap[item.file_path] = data.signedUrl;
          }
        }
      }
      
      setFileUrls(urlMap);
    };

    if (predesigns.length > 0) {
      generateSignedUrls();
    }
  }, [predesigns]);

  const getFileUrl = (filePath: string) => {
    return fileUrls[filePath] || '';
  };

  const isImageFile = (fileType: string | null) => {
    return fileType?.startsWith('image/');
  };

  const isPdfFile = (fileType: string | null) => {
    return fileType === 'application/pdf';
  };

  const allContentTypes = [...DEFAULT_CONTENT_TYPES, ...customContentTypes];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Render a single predesign card
  const renderPredesignCard = (item: BudgetPredesign) => (
    <Card key={item.id} className="overflow-hidden group">
      {item.file_path && (
        <div className="relative aspect-video bg-muted">
          {isImageFile(item.file_type) ? (
            <>
              <img
                src={getFileUrl(item.file_path)}
                alt={item.content}
                className="w-full h-full object-cover"
              />
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => setFullscreenImage(getFileUrl(item.file_path!))}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </>
          ) : isPdfFile(item.file_type) ? (
            <PdfThumbnail
              url={getFileUrl(item.file_path!)}
              alt={item.file_name || 'PDF'}
              className="w-full h-full"
              onClick={() => window.open(getFileUrl(item.file_path!), '_blank')}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <FileText className="h-12 w-12 text-muted-foreground" />
            </div>
          )}
        </div>
      )}
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {viewMode === 'alphabetical' && (
              <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary mb-2">
                {item.content_type}
              </span>
            )}
            <CardTitle className="text-base truncate">{item.content}</CardTitle>
            {item.description && (
              <CardDescription className="line-clamp-2 mt-1">
                {item.description}
              </CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      {isAdmin && (
        <CardContent className="pt-0">
          <div className="flex gap-2 flex-wrap">
            {/* Show adjust button for 3D visualizations */}
            {item.content_type === 'Visualización 3D' && isImageFile(item.file_type) && urbanProfileData?.lat && urbanProfileData?.lng && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setAdjustmentItem(item);
                  setAdjustmentViewerOpen(true);
                }}
              >
                <Move className="h-3 w-3 mr-1" />
                Ajustar
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => handleEdit(item)}>
              <Pencil className="h-3 w-3 mr-1" />
              Editar
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleDeleteClick(item)}>
              <Trash2 className="h-3 w-3 mr-1" />
              Eliminar
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );

  // Get cadastral reference from predesigns if exists
  const cadastralPredesign = predesigns.find(p => p.content_type === 'Referencia catastral');
  const cadastralReference = cadastralPredesign?.content;

  return (
    <div className="space-y-6">
      {/* Sub-pestañas de Ante-proyecto */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="ante-proyecto" className="gap-2">
            <FileImage className="h-4 w-4" />
            Ante-proyecto
          </TabsTrigger>
          <TabsTrigger value="perfil-vivienda" className="gap-2">
            <Home className="h-4 w-4" />
            Perfil vivienda
          </TabsTrigger>
          <TabsTrigger value="elementos" className="gap-2">
            <Layers className="h-4 w-4" />
            Elementos
          </TabsTrigger>
        </TabsList>

        {/* Pestaña Ante-proyecto - Imágenes: planos, alzados, perspectivas */}
        <TabsContent value="ante-proyecto" className="mt-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="text-lg font-semibold">Imágenes del Ante-proyecto</h3>
                <p className="text-sm text-muted-foreground">
                  Planos, alzados, perspectivas y visualizaciones 3D del proyecto
                </p>
              </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center border rounded-lg p-1 bg-muted/30">
            <Button
              variant={viewMode === 'alphabetical' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => handleViewModeChange('alphabetical')}
              className="gap-1"
            >
              <LayoutGrid className="h-4 w-4" />
              Alfabético
            </Button>
            <Button
              variant={viewMode === 'grouped' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => handleViewModeChange('grouped')}
              className="gap-1"
            >
              <Layers className="h-4 w-4" />
              Por Tipo
            </Button>
          </div>
          {isAdmin && (
            <>
              <Button variant="outline" onClick={() => setGenerate3DOpen(true)}>
                <Sparkles className="h-4 w-4 mr-2" />
                Visualización 3D
              </Button>
              <Button onClick={handleNew}>
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Elemento
              </Button>
            </>
          )}
        </div>
      </div>

      {predesigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileImage className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No hay elementos en el ante-proyecto</p>
            {isAdmin && (
              <Button variant="outline" className="mt-4" onClick={handleNew}>
                <Plus className="h-4 w-4 mr-2" />
                Añadir primer elemento
              </Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'alphabetical' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {getSortedPredesigns().map(renderPredesignCard)}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(getGroupedPredesigns()).map(([contentType, items]) => (
            <Collapsible
              key={contentType}
              open={expandedGroups[contentType] !== false}
              onOpenChange={() => toggleGroup(contentType)}
            >
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {expandedGroups[contentType] !== false ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                        <CardTitle className="text-base">{contentType}</CardTitle>
                        <span className="text-sm text-muted-foreground">
                          ({items.length} {items.length === 1 ? 'elemento' : 'elementos'})
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {items.map(renderPredesignCard)}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )
      }

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Editar Elemento' : 'Nuevo Elemento de Ante-proyecto'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="content">Contenido *</Label>
              <Input
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Ej: Referencia catastral 1234567AB"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descripción opcional del elemento"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content_type">Tipo de Contenido</Label>
              <Select
                value={formData.content_type}
                onValueChange={(value) => setFormData({ ...formData, content_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allContentTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">+ Añadir nuevo tipo...</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.content_type === '__new__' && (
              <div className="space-y-2">
                <Label htmlFor="newContentType">Nuevo Tipo de Contenido</Label>
                <Input
                  id="newContentType"
                  value={formData.newContentType}
                  onChange={(e) => setFormData({ ...formData, newContentType: e.target.value })}
                  placeholder="Nombre del nuevo tipo"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Imagen/Archivo (JPG, PDF)</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                {selectedFile ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm truncate">{selectedFile.name}</span>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedFile(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : editingItem?.file_name ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm truncate text-muted-foreground">
                      Archivo actual: {editingItem.file_name}
                    </span>
                    <label className="cursor-pointer">
                      <span className="text-sm text-primary hover:underline">Cambiar</span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Clic para subir o arrastra un archivo
                    </p>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? 'Guardando...' : editingItem ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fullscreen Image Dialog */}
      <Dialog open={!!fullscreenImage} onOpenChange={() => setFullscreenImage(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden">
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-10 text-white hover:bg-white/20"
              onClick={() => setFullscreenImage(null)}
            >
              <X className="h-6 w-6" />
            </Button>
            {fullscreenImage && (
              <img
                src={fullscreenImage}
                alt="Vista ampliada"
                className="max-w-full max-h-[90vh] object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Eliminar elemento"
        description={`¿Estás seguro de que deseas eliminar "${itemToDelete?.content}"? Esta acción no se puede deshacer.`}
      />

      {/* 3D Visualization Generator */}
      <Generate3DVisualization
        budgetId={budgetId}
        open={generate3DOpen}
        onOpenChange={setGenerate3DOpen}
        onGenerated={fetchPredesigns}
        parcelData={urbanProfileData ?? undefined}
      />

      {/* 3D Visualization Adjustment Viewer */}
      {adjustmentItem && (
        <VisualizationAdjustmentViewer
          open={adjustmentViewerOpen}
          onOpenChange={(open) => {
            setAdjustmentViewerOpen(open);
            if (!open) setAdjustmentItem(null);
          }}
          generatedImageUrl={adjustmentItem.file_path ? getFileUrl(adjustmentItem.file_path) : ''}
          parcelData={{
            lat: urbanProfileData?.lat,
            lng: urbanProfileData?.lng,
            area: urbanProfileData?.area
          }}
          predesignId={adjustmentItem.id}
          onSave={() => {
            fetchPredesigns();
          }}
        />
      )}
          </div>
        </TabsContent>

        {/* Pestaña Perfil vivienda */}
        <TabsContent value="perfil-vivienda" className="mt-6">
          <BudgetHousingProfileTab budgetId={budgetId} projectId={projectId || null} />
        </TabsContent>

        {/* Pestaña Elementos - Otros documentos y referencias */}
        <TabsContent value="elementos" className="mt-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Elementos Adicionales</h3>
              <p className="text-sm text-muted-foreground">
                Referencias catastrales y otros documentos del proyecto
              </p>
            </div>
            <Card>
              <CardContent className="py-8 text-center">
                <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Gestiona elementos adicionales desde la pestaña "Ante-proyecto"
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}