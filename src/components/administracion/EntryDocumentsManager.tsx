import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Plus, Trash2, ExternalLink, Upload, Download, File, Eye, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import DOMPurify from 'dompurify';

interface AccountingDocument {
  id: string;
  entry_id: string;
  name: string;
  description: string | null;
  file_path: string | null;
  file_type: string | null;
  file_size: number | null;
  document_url: string | null;
  created_at: string;
}

interface DocumentForm {
  name: string;
  description: string;
  document_url: string;
}

const emptyForm: DocumentForm = {
  name: '',
  description: '',
  document_url: ''
};

interface Props {
  entryId: string;
  onUpdate?: () => void;
}

const formatFileSize = (bytes: number | null): string => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isPreviewableImage = (fileType: string | null): boolean => {
  if (!fileType) return false;
  return fileType.startsWith('image/');
};

const isPreviewablePdf = (fileType: string | null): boolean => {
  return fileType === 'application/pdf';
};

const canPreview = (doc: AccountingDocument): boolean => {
  if (doc.file_path && (isPreviewableImage(doc.file_type) || isPreviewablePdf(doc.file_type))) {
    return true;
  }
  return false;
};

export function EntryDocumentsManager({ entryId, onUpdate }: Props) {
  const [documents, setDocuments] = useState<AccountingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<AccountingDocument | null>(null);
  const [form, setForm] = useState<DocumentForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploadTab, setUploadTab] = useState<'file' | 'url'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<AccountingDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, [entryId]);

  // Cleanup preview URL on unmount or when preview closes
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('accounting_documents')
        .select('*')
        .eq('entry_id', entryId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast.error('Error al cargar documentos');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setForm(emptyForm);
    setSelectedFile(null);
    setUploadTab('file');
    setDialogOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!form.name.trim()) {
        setForm({ ...form, name: file.name.replace(/\.[^/.]+$/, '') });
      }
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre del documento es obligatorio');
      return;
    }

    if (uploadTab === 'file' && !selectedFile) {
      toast.error('Selecciona un archivo para subir');
      return;
    }

    if (uploadTab === 'url' && !form.document_url.trim()) {
      toast.error('Introduce una URL válida');
      return;
    }

    setSaving(true);
    setUploading(uploadTab === 'file');

    try {
      const { data: user } = await supabase.auth.getUser();
      let filePath: string | null = null;
      let fileType: string | null = null;
      let fileSize: number | null = null;

      if (uploadTab === 'file' && selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${entryId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('accounting-documents')
          .upload(fileName, selectedFile);

        if (uploadError) throw uploadError;

        filePath = fileName;
        fileType = selectedFile.type;
        fileSize = selectedFile.size;
      }

      const { error } = await supabase
        .from('accounting_documents')
        .insert({
          entry_id: entryId,
          name: form.name.trim(),
          description: form.description.trim() || null,
          document_url: uploadTab === 'url' ? form.document_url.trim() : null,
          file_path: filePath,
          file_type: fileType,
          file_size: fileSize,
          uploaded_by: user?.user?.id || null
        });

      if (error) throw error;

      toast.success('Documento añadido');
      setDialogOpen(false);
      fetchDocuments();
      onUpdate?.();
    } catch (error) {
      console.error('Error saving document:', error);
      toast.error('Error al guardar el documento');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!documentToDelete) return;

    try {
      // Delete file from storage if exists
      if (documentToDelete.file_path) {
        await supabase.storage
          .from('accounting-documents')
          .remove([documentToDelete.file_path]);
      }

      const { error } = await supabase
        .from('accounting_documents')
        .delete()
        .eq('id', documentToDelete.id);

      if (error) throw error;

      toast.success('Documento eliminado');
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
      fetchDocuments();
      onUpdate?.();
    } catch (error) {
      console.error('Error deleting document:', error);
      toast.error('Error al eliminar el documento');
    }
  };

  const handleDownload = async (doc: AccountingDocument) => {
    if (!doc.file_path) return;

    try {
      const { data, error } = await supabase.storage
        .from('accounting-documents')
        .download(doc.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name + (doc.file_path.includes('.') ? '.' + doc.file_path.split('.').pop() : '');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error('Error al descargar el archivo');
    }
  };

  const handlePreview = async (doc: AccountingDocument) => {
    if (!doc.file_path || !canPreview(doc)) return;

    setPreviewDoc(doc);
    setPreviewOpen(true);
    setPreviewLoading(true);

    try {
      const { data, error } = await supabase.storage
        .from('accounting-documents')
        .download(doc.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      setPreviewUrl(url);
    } catch (error) {
      console.error('Error loading preview:', error);
      toast.error('Error al cargar la vista previa');
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleClosePreview = () => {
    setPreviewOpen(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setPreviewDoc(null);
  };

  const getPreviewIcon = (doc: AccountingDocument) => {
    if (isPreviewableImage(doc.file_type)) {
      return <ImageIcon className="h-4 w-4 text-primary shrink-0" />;
    }
    if (isPreviewablePdf(doc.file_type)) {
      return <FileText className="h-4 w-4 text-red-500 shrink-0" />;
    }
    if (doc.file_path) {
      return <File className="h-4 w-4 text-primary shrink-0" />;
    }
    return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Documentos asociados</span>
          <Badge variant="secondary" className="text-xs">
            {documents.length}
          </Badge>
        </div>
        <Button size="sm" variant="outline" onClick={handleOpenCreate} className="gap-1">
          <Plus className="h-3 w-3" />
          Añadir documento
        </Button>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No hay documentos asociados a este asiento.
        </p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-2 bg-muted/30 rounded-md border"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {getPreviewIcon(doc)}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{doc.name}</p>
                  <div className="flex items-center gap-2">
                    {doc.description && (
                      <p 
                        className="text-xs text-muted-foreground truncate max-w-[200px]"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(doc.description.replace(/<[^>]*>/g, ' ').substring(0, 100)) }}
                      />
                    )}
                    {doc.file_size && (
                      <Badge variant="outline" className="text-[10px] py-0">
                        {formatFileSize(doc.file_size)}
                      </Badge>
                    )}
                    {canPreview(doc) && (
                      <Badge variant="secondary" className="text-[10px] py-0">
                        Vista previa
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {canPreview(doc) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handlePreview(doc)}
                    title="Vista previa"
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                )}
                {doc.file_path && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleDownload(doc)}
                    title="Descargar archivo"
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                )}
                {doc.document_url && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => window.open(doc.document_url!, '_blank')}
                    title="Abrir enlace"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setDocumentToDelete(doc);
                    setDeleteDialogOpen(true);
                  }}
                  title="Eliminar"
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Document Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir Documento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="doc-name">Nombre del documento *</Label>
              <Input
                id="doc-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: Factura nº 123"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-description">Descripción</Label>
              <RichTextEditor
                value={form.description}
                onChange={(value) => setForm({ ...form, description: value })}
                placeholder="Descripción opcional del documento (puedes usar formato enriquecido)"
                minHeight="100px"
              />
            </div>

            <Tabs value={uploadTab} onValueChange={(v) => setUploadTab(v as 'file' | 'url')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="file" className="gap-1">
                  <Upload className="h-3 w-3" />
                  Subir archivo
                </TabsTrigger>
                <TabsTrigger value="url" className="gap-1">
                  <ExternalLink className="h-3 w-3" />
                  URL externa
                </TabsTrigger>
              </TabsList>

              <TabsContent value="file" className="mt-4">
                <div className="space-y-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.txt,.csv"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-20 border-dashed"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm">
                        {selectedFile ? selectedFile.name : 'Haz clic para seleccionar un archivo'}
                      </span>
                      {selectedFile && (
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(selectedFile.size)}
                        </span>
                      )}
                    </div>
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    PDF, Word, Excel, imágenes o archivos de texto
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="url" className="mt-4">
                <div className="space-y-2">
                  <Label htmlFor="doc-url">URL del documento</Label>
                  <Input
                    id="doc-url"
                    value={form.document_url}
                    onChange={(e) => setForm({ ...form, document_url: e.target.value })}
                    placeholder="https://..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Enlace externo al documento (Google Drive, Dropbox, etc.)
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || uploading}>
              {uploading ? 'Subiendo...' : saving ? 'Guardando...' : 'Añadir Documento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={(open) => !open && handleClosePreview()}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="pr-8">{previewDoc?.name}</DialogTitle>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto min-h-0">
            {previewLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : previewUrl ? (
              <div className="w-full h-full">
                {isPreviewableImage(previewDoc?.file_type || null) ? (
                  <div className="flex items-center justify-center p-4">
                    <img
                      src={previewUrl}
                      alt={previewDoc?.name || 'Preview'}
                      className="max-w-full max-h-[70vh] object-contain rounded-md"
                    />
                  </div>
                ) : isPreviewablePdf(previewDoc?.file_type || null) ? (
                  <iframe
                    src={previewUrl}
                    className="w-full h-[70vh] rounded-md border"
                    title={previewDoc?.name || 'PDF Preview'}
                  />
                ) : null}
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                No se pudo cargar la vista previa
              </div>
            )}
          </div>
          <DialogFooter className="flex-shrink-0 flex gap-2">
            {previewDoc?.file_path && (
              <Button variant="outline" onClick={() => handleDownload(previewDoc)} className="gap-1">
                <Download className="h-4 w-4" />
                Descargar
              </Button>
            )}
            <Button onClick={handleClosePreview}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Eliminar Documento"
        description={`¿Estás seguro de que deseas eliminar el documento "${documentToDelete?.name}"?`}
      />
    </div>
  );
}