import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  Download, 
  FileText, 
  Upload, 
  Plus, 
  Eye, 
  X, 
  Trash2, 
  Pencil,
  Link as LinkIcon,
  ExternalLink,
  Save,
  FolderOpen,
  File,
  Image,
  FileSpreadsheet,
  FileArchive,
  Maximize2
} from 'lucide-react';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { ScrollArea } from '@/components/ui/scroll-area';
import DOMPurify from 'dompurify';
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
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { openSafeUrl } from '@/lib/url-utils';

interface ProjectDocument {
  id: string;
  name: string;
  description: string | null;
  file_path: string | null;
  file_type: string | null;
  file_size: number | null;
  document_type: string | null;
  document_url: string | null;
  created_at: string | null;
  project_id: string | null;
}

interface BudgetDocumentsTabProps {
  budgetId: string;
  projectId: string | null;
  projectName: string | null;
  isAdmin: boolean;
}

const DEFAULT_DOCUMENT_TYPES = [
  'Plano',
  'Presupuesto',
  'Contrato',
  'Factura',
  'Informe',
  'Fotografía',
  'Certificado',
  'Licencia',
  'Memoria',
  'Enlace web',
  'Otro'
];

const toSafeStorageKey = (input: string) => {
  const normalized = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const safe = normalized
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return safe || 'archivo';
};

const buildDocumentStoragePath = (folder: string, originalName: string) => {
  const lastDot = originalName.lastIndexOf('.');
  const ext = lastDot > -1 ? originalName.slice(lastDot + 1) : '';
  const base = lastDot > -1 ? originalName.slice(0, lastDot) : originalName;

  const safeFolder = (toSafeStorageKey(folder) || 'general').slice(0, 64);
  const safeBase = toSafeStorageKey(base).slice(0, 120);
  const safeExt = toSafeStorageKey(ext).slice(0, 10);

  const safeFile = `${Date.now()}-${safeBase}${safeExt ? `.${safeExt}` : ''}`;
  return `${safeFolder}/${safeFile}`;
};

const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export function BudgetDocumentsTab({ budgetId, projectId, projectName, isAdmin }: BudgetDocumentsTabProps) {
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const allDocumentTypes = [...DEFAULT_DOCUMENT_TYPES, ...customTypes.filter(t => !DEFAULT_DOCUMENT_TYPES.includes(t))];

  // Upload state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadDocType, setUploadDocType] = useState<string>('Otro');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadUrl, setUploadUrl] = useState('');
  const [isAddingCustomType, setIsAddingCustomType] = useState(false);
  const [newCustomType, setNewCustomType] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'pdf' | 'unsupported'>('unsupported');
  const [previewName, setPreviewName] = useState('');

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<ProjectDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [documentToEdit, setDocumentToEdit] = useState<ProjectDocument | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDocType, setEditDocType] = useState('Otro');
  const [editUrl, setEditUrl] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Description preview state
  const [descriptionPreviewOpen, setDescriptionPreviewOpen] = useState(false);
  const [descriptionPreviewContent, setDescriptionPreviewContent] = useState('');
  const [descriptionPreviewTitle, setDescriptionPreviewTitle] = useState('');

  // Helper to truncate description
  const truncateDescription = (text: string | null, maxLength = 50) => {
    if (!text) return '';
    const plainText = text.replace(/<[^>]*>/g, '').trim();
    if (plainText.length <= maxLength) return plainText;
    return plainText.substring(0, maxLength) + '...';
  };

  const fetchDocuments = async () => {
    if (!projectId) {
      setDocuments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_documents')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setDocuments(data || []);

      // Extract custom types from existing documents
      const existingTypes = (data || [])
        .map(d => d.document_type)
        .filter((t): t is string => !!t && !DEFAULT_DOCUMENT_TYPES.includes(t));
      setCustomTypes([...new Set(existingTypes)]);
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast.error('Error al cargar documentos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [projectId]);

  const resetUploadForm = () => {
    setUploadName('');
    setUploadDocType('Otro');
    setUploadDescription('');
    setUploadUrl('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast.error('El archivo no puede superar los 50MB');
      return;
    }

    setSelectedFile(file);
    if (!uploadName) setUploadName(file.name);
  };

  const handleAddCustomType = () => {
    if (!newCustomType.trim()) return;
    const trimmed = newCustomType.trim();
    if (!allDocumentTypes.includes(trimmed)) {
      setCustomTypes([...customTypes, trimmed]);
      setUploadDocType(trimmed);
    } else {
      setUploadDocType(trimmed);
    }
    setNewCustomType('');
    setIsAddingCustomType(false);
  };

  const handleUpload = async () => {
    if (!uploadName.trim()) {
      toast.error('El nombre del documento es obligatorio');
      return;
    }

    if (!projectId) {
      toast.error('Este presupuesto no está asociado a un proyecto');
      return;
    }

    if (uploadUrl && !isValidUrl(uploadUrl)) {
      toast.error('La URL no es válida');
      return;
    }

    setUploading(true);
    try {
      let filePath: string | null = null;
      let fileType: string | null = null;
      let fileSize: number | null = null;

      if (selectedFile) {
        const storagePath = buildDocumentStoragePath(projectId, selectedFile.name);
        
        const { error: uploadError } = await supabase.storage
          .from('project-documents')
          .upload(storagePath, selectedFile);

        if (uploadError) throw uploadError;

        filePath = storagePath;
        fileType = selectedFile.type;
        fileSize = selectedFile.size;
      }

      const { error: dbError } = await supabase
        .from('project_documents')
        .insert({
          project_id: projectId,
          name: uploadName.trim(),
          description: uploadDescription.trim() || null,
          file_path: filePath,
          file_type: fileType,
          file_size: fileSize,
          document_type: uploadDocType,
          document_url: uploadUrl.trim() || null
        });

      if (dbError) throw dbError;

      toast.success('Documento guardado correctamente');
      resetUploadForm();
      setUploadDialogOpen(false);
      fetchDocuments();
    } catch (error: any) {
      console.error('Error uploading:', error);
      toast.error(error.message || 'Error al guardar el documento');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: ProjectDocument) => {
    if (!doc.file_path) return;

    try {
      const { data, error } = await supabase.storage
        .from('project-documents')
        .download(doc.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast.error(error.message || 'Error al descargar');
    }
  };

  const handlePreview = async (doc: ProjectDocument) => {
    if (!doc.file_path) return;

    try {
      const { data, error } = await supabase.storage
        .from('project-documents')
        .createSignedUrl(doc.file_path, 300);

      if (error) throw error;

      setPreviewUrl(data.signedUrl);
      setPreviewName(doc.name);

      if (doc.file_type?.startsWith('image/')) {
        setPreviewType('image');
      } else if (doc.file_type === 'application/pdf') {
        setPreviewType('pdf');
      } else {
        setPreviewType('unsupported');
      }

      setPreviewOpen(true);
    } catch (error: any) {
      toast.error(error.message || 'Error al previsualizar');
    }
  };

  const handleDeleteClick = (doc: ProjectDocument) => {
    setDocumentToDelete(doc);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!documentToDelete) return;

    setDeleting(true);
    try {
      if (documentToDelete.file_path) {
        await supabase.storage
          .from('project-documents')
          .remove([documentToDelete.file_path]);
      }

      const { error } = await supabase
        .from('project_documents')
        .delete()
        .eq('id', documentToDelete.id);

      if (error) throw error;

      toast.success('Documento eliminado');
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
      fetchDocuments();
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar');
    } finally {
      setDeleting(false);
    }
  };

  const handleEditClick = (doc: ProjectDocument) => {
    setDocumentToEdit(doc);
    setEditName(doc.name);
    setEditDescription(doc.description || '');
    setEditDocType(doc.document_type || 'Otro');
    setEditUrl(doc.document_url || '');
    setEditFile(null);
    setEditDialogOpen(true);
  };

  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast.error('El archivo no puede superar los 50MB');
      return;
    }

    setEditFile(file);
  };

  const handleEditSave = async () => {
    if (!documentToEdit) return;

    if (!editName.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    if (editUrl && !isValidUrl(editUrl)) {
      toast.error('La URL no es válida');
      return;
    }

    setSaving(true);
    try {
      let newFilePath = documentToEdit.file_path;
      let newFileType = documentToEdit.file_type;
      let newFileSize = documentToEdit.file_size;

      if (editFile && projectId) {
        const storagePath = buildDocumentStoragePath(projectId, editFile.name);
        
        const { error: uploadError } = await supabase.storage
          .from('project-documents')
          .upload(storagePath, editFile);

        if (uploadError) throw uploadError;

        if (documentToEdit.file_path) {
          await supabase.storage
            .from('project-documents')
            .remove([documentToEdit.file_path]);
        }

        newFilePath = storagePath;
        newFileType = editFile.type;
        newFileSize = editFile.size;
      }

      const { error } = await supabase
        .from('project_documents')
        .update({
          name: editName.trim(),
          description: editDescription.trim() || null,
          document_type: editDocType,
          document_url: editUrl.trim() || null,
          file_path: newFilePath,
          file_type: newFileType,
          file_size: newFileSize
        })
        .eq('id', documentToEdit.id);

      if (error) throw error;

      toast.success('Documento actualizado');
      setEditDialogOpen(false);
      setDocumentToEdit(null);
      fetchDocuments();
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const getFileIcon = (doc: ProjectDocument) => {
    if (doc.document_url && !doc.file_path) {
      return <LinkIcon className="h-5 w-5 text-blue-600" />;
    }
    
    const fileType = doc.file_type;
    if (!fileType) return <File className="h-5 w-5" />;
    if (fileType.startsWith('image/')) return <Image className="h-5 w-5 text-green-600" />;
    if (fileType.includes('pdf')) return <FileText className="h-5 w-5 text-red-600" />;
    if (fileType.includes('spreadsheet') || fileType.includes('excel')) return <FileSpreadsheet className="h-5 w-5 text-emerald-600" />;
    if (fileType.includes('zip') || fileType.includes('archive')) return <FileArchive className="h-5 w-5 text-yellow-600" />;
    return <FileText className="h-5 w-5 text-blue-600" />;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  };

  if (!projectId) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            Este presupuesto no está asociado a ningún proyecto.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Los documentos se gestionan a nivel de proyecto.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documentos del Proyecto
            </CardTitle>
            <CardDescription>
              Documentos asociados al proyecto: {projectName}
            </CardDescription>
          </div>
          {isAdmin && (
            <Button onClick={() => setUploadDialogOpen(true)} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Nuevo documento
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No hay documentos asociados a este proyecto</p>
              {isAdmin && (
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setUploadDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Añadir documento
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="hidden md:table-cell">Tamaño</TableHead>
                  <TableHead className="hidden md:table-cell">Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {getFileIcon(doc)}
                        <div className="min-w-0">
                          <p className="font-medium truncate">{doc.name}</p>
                          {doc.description && (
                            <div className="flex items-center gap-1">
                              <p className="text-xs text-muted-foreground truncate">
                                {truncateDescription(doc.description)}
                              </p>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 shrink-0"
                                onClick={() => {
                                  setDescriptionPreviewTitle(doc.name);
                                  setDescriptionPreviewContent(doc.description || '');
                                  setDescriptionPreviewOpen(true);
                                }}
                                title="Ver descripción completa"
                              >
                                <Maximize2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{doc.document_type || 'Otro'}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {formatFileSize(doc.file_size)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {doc.created_at 
                        ? format(new Date(doc.created_at), 'dd/MM/yyyy', { locale: es })
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {doc.document_url && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openSafeUrl(doc.document_url!)}
                            title="Abrir enlace"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                        {doc.file_path && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePreview(doc)}
                              title="Previsualizar"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownload(doc)}
                              title="Descargar"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {isAdmin && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditClick(doc)}
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteClick(doc)}
                              className="text-destructive hover:text-destructive"
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Nuevo documento
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="upload-name">Nombre del documento *</Label>
              <Input
                id="upload-name"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="Nombre del documento..."
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de documento</Label>
                {isAddingCustomType ? (
                  <div className="flex gap-2">
                    <Input
                      value={newCustomType}
                      onChange={(e) => setNewCustomType(e.target.value)}
                      placeholder="Nuevo tipo..."
                      maxLength={50}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddCustomType();
                        if (e.key === 'Escape') {
                          setIsAddingCustomType(false);
                          setNewCustomType('');
                        }
                      }}
                    />
                    <Button size="icon" variant="ghost" onClick={handleAddCustomType}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Select value={uploadDocType} onValueChange={setUploadDocType}>
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {allDocumentTypes.map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      size="icon" 
                      variant="outline" 
                      onClick={() => setIsAddingCustomType(true)}
                      title="Añadir tipo personalizado"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="upload-url">URL (opcional)</Label>
                <Input
                  id="upload-url"
                  value={uploadUrl}
                  onChange={(e) => setUploadUrl(e.target.value)}
                  placeholder="https://..."
                  type="url"
                />
              </div>
            </div>

            <div className="space-y-2 flex-1 min-h-0">
              <Label htmlFor="upload-description">Descripción</Label>
              <div className="h-[300px] overflow-hidden">
                <RichTextEditor
                  value={uploadDescription}
                  onChange={setUploadDescription}
                  placeholder="Descripción opcional..."
                  minHeight="280px"
                  className="h-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Archivo (opcional)</Label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {selectedFile ? selectedFile.name : 'Seleccionar archivo'}
                </Button>
                {selectedFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Máximo 50MB</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpload} disabled={uploading || !uploadName.trim()}>
              {uploading ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Editar documento
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nombre del documento *</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de documento</Label>
                <Select value={editDocType} onValueChange={setEditDocType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allDocumentTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-url">URL</Label>
                <Input
                  id="edit-url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  placeholder="https://..."
                  type="url"
                />
              </div>
            </div>

            <div className="space-y-2 flex-1 min-h-0">
              <Label htmlFor="edit-description">Descripción</Label>
              <div className="h-[300px] overflow-hidden">
                <RichTextEditor
                  value={editDescription}
                  onChange={setEditDescription}
                  placeholder="Descripción del documento..."
                  minHeight="280px"
                  className="h-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reemplazar archivo</Label>
              <input
                type="file"
                ref={editFileInputRef}
                onChange={handleEditFileChange}
                className="hidden"
              />
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => editFileInputRef.current?.click()}
                  className="flex-1"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {editFile ? editFile.name : 'Seleccionar nuevo archivo'}
                </Button>
                {editFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditFile(null);
                      if (editFileInputRef.current) editFileInputRef.current.value = '';
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEditSave} disabled={saving || !editName.trim()}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {previewName}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center min-h-[400px]">
            {previewType === 'image' && previewUrl && (
              <img 
                src={previewUrl} 
                alt={previewName} 
                className="max-w-full max-h-[70vh] object-contain"
              />
            )}
            {previewType === 'pdf' && previewUrl && (
              <iframe 
                src={previewUrl} 
                className="w-full h-[70vh]"
                title={previewName}
              />
            )}
            {previewType === 'unsupported' && (
              <div className="text-center text-muted-foreground">
                <FileText className="h-16 w-16 mx-auto mb-4" />
                <p>Este tipo de archivo no se puede previsualizar</p>
                <p className="text-sm mt-2">Descarga el archivo para verlo</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente el documento "{documentToDelete?.name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Description Preview Dialog */}
      <Dialog open={descriptionPreviewOpen} onOpenChange={setDescriptionPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Descripción: {descriptionPreviewTitle}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div 
              className="prose prose-sm dark:prose-invert max-w-none p-4"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(descriptionPreviewContent) }}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
