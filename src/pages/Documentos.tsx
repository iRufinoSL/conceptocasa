import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ArrowLeft, Download, FileText, Search, Filter, FolderOpen, Upload, Plus, Eye, X, Trash2, Pencil } from 'lucide-react';
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
import { AppNavDropdown } from '@/components/AppNavDropdown';

interface ProjectDocument {
  id: string;
  name: string;
  description: string | null;
  file_path: string | null;
  file_type: string | null;
  file_size: number | null;
  document_type: string | null;
  created_at: string | null;
  project_id: string | null;
  project?: {
    id: string;
    name: string;
  } | null;
}

const documentTypeLabels: Record<string, string> = {
  plano: 'Plano',
  contrato: 'Contrato',
  factura: 'Factura',
  presupuesto: 'Presupuesto',
  foto: 'Fotografía',
  informe: 'Informe',
  otro: 'Otro',
};

export default function Documentos() {
  const navigate = useNavigate();
  const { user, loading, isAdmin } = useAuth();
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterProject, setFilterProject] = useState<string>('all');

  // Upload state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProjectId, setUploadProjectId] = useState<string>('');
  const [uploadDocType, setUploadDocType] = useState<string>('otro');
  const [uploadDescription, setUploadDescription] = useState('');
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
  const [editDocType, setEditDocType] = useState('otro');
  const [editProjectId, setEditProjectId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchDocuments();
      fetchProjects();
    }
  }, [user]);

  const fetchDocuments = async () => {
    setLoadingDocs(true);
    try {
      const { data, error } = await supabase
        .from('project_documents')
        .select(`
          *,
          project:projects(id, name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast.error('Error al cargar los documentos');
    } finally {
      setLoadingDocs(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const handleDownload = async (doc: ProjectDocument) => {
    if (!doc.file_path) {
      toast.error('No hay archivo asociado');
      return;
    }

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

      toast.success('Documento descargado');
    } catch (error) {
      console.error('Error downloading document:', error);
      toast.error('Error al descargar el documento');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error('El archivo no puede superar 50MB');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Selecciona un archivo');
      return;
    }

    setUploading(true);
    try {
      const fileExt = selectedFile.name.split('.').pop();
      const folderPath = uploadProjectId || 'general';
      const fileName = `${folderPath}/${Date.now()}-${selectedFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from('project_documents').insert({
        project_id: uploadProjectId || null,
        name: selectedFile.name,
        description: uploadDescription || null,
        file_path: fileName,
        file_type: selectedFile.type,
        file_size: selectedFile.size,
        document_type: uploadDocType,
        uploaded_by: user?.id,
      });

      if (dbError) throw dbError;

      toast.success('Documento subido correctamente');
      setUploadDialogOpen(false);
      resetUploadForm();
      fetchDocuments();
    } catch (error) {
      console.error('Error uploading document:', error);
      toast.error('Error al subir el documento');
    } finally {
      setUploading(false);
    }
  };

  const resetUploadForm = () => {
    setSelectedFile(null);
    setUploadProjectId('');
    setUploadDocType('otro');
    setUploadDescription('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getPreviewType = (fileType: string | null): 'image' | 'pdf' | 'unsupported' => {
    if (!fileType) return 'unsupported';
    if (fileType.startsWith('image/')) return 'image';
    if (fileType === 'application/pdf') return 'pdf';
    return 'unsupported';
  };

  const canPreview = (doc: ProjectDocument): boolean => {
    return getPreviewType(doc.file_type) !== 'unsupported';
  };

  const handlePreview = async (doc: ProjectDocument) => {
    if (!doc.file_path) {
      toast.error('No hay archivo asociado');
      return;
    }

    const type = getPreviewType(doc.file_type);
    if (type === 'unsupported') {
      toast.error('Vista previa no disponible para este tipo de archivo');
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from('project-documents')
        .createSignedUrl(doc.file_path, 300); // 5 min URL

      if (error) throw error;

      setPreviewUrl(data.signedUrl);
      setPreviewType(type);
      setPreviewName(doc.name);
      setPreviewOpen(true);
    } catch (error) {
      console.error('Error getting preview URL:', error);
      toast.error('Error al obtener la vista previa');
    }
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewUrl(null);
    setPreviewName('');
  };

  const handleDeleteClick = (doc: ProjectDocument) => {
    setDocumentToDelete(doc);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!documentToDelete) return;

    setDeleting(true);
    try {
      // Delete from storage if file exists
      if (documentToDelete.file_path) {
        const { error: storageError } = await supabase.storage
          .from('project-documents')
          .remove([documentToDelete.file_path]);

        if (storageError) {
          console.error('Error deleting file from storage:', storageError);
        }
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('project_documents')
        .delete()
        .eq('id', documentToDelete.id);

      if (dbError) throw dbError;

      toast.success('Documento eliminado correctamente');
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
      fetchDocuments();
    } catch (error) {
      console.error('Error deleting document:', error);
      toast.error('Error al eliminar el documento');
    } finally {
      setDeleting(false);
    }
  };

  const handleEditClick = (doc: ProjectDocument) => {
    setDocumentToEdit(doc);
    setEditName(doc.name);
    setEditDescription(doc.description || '');
    setEditDocType(doc.document_type || 'otro');
    setEditProjectId(doc.project_id || '');
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!documentToEdit) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('project_documents')
        .update({
          name: editName,
          description: editDescription || null,
          document_type: editDocType,
          project_id: editProjectId || null,
        })
        .eq('id', documentToEdit.id);

      if (error) throw error;

      toast.success('Documento actualizado correctamente');
      setEditDialogOpen(false);
      setDocumentToEdit(null);
      fetchDocuments();
    } catch (error) {
      console.error('Error updating document:', error);
      toast.error('Error al actualizar el documento');
    } finally {
      setSaving(false);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  };

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.project?.name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = filterType === 'all' || doc.document_type === filterType;
    const matchesProject = filterProject === 'all' || 
      (filterProject === 'none' ? !doc.project_id : doc.project_id === filterProject);

    return matchesSearch && matchesType && matchesProject;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <AppNavDropdown />
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">Gestión Documental</h1>
                  <p className="text-sm text-muted-foreground">
                    Todos los documentos de proyectos
                  </p>
                </div>
              </div>
            </div>
            {isAdmin() && (
              <Button onClick={() => setUploadDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Subir documento</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Filters */}
        <Card className="mb-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar documentos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue placeholder="Tipo de documento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  {Object.entries(documentTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterProject} onValueChange={setFilterProject}>
                <SelectTrigger>
                  <SelectValue placeholder="Proyecto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los proyectos</SelectItem>
                  <SelectItem value="none">Sin proyecto</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Documents Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Documentos ({filteredDocuments.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingDocs ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="text-center py-12">
                <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No se encontraron documentos</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Proyecto</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Tamaño</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocuments.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{doc.name}</p>
                            {doc.description && (
                              <p className="text-sm text-muted-foreground truncate max-w-xs">
                                {doc.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {doc.project ? (
                            <Badge variant="outline">{doc.project.name}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {doc.document_type ? (
                            <Badge variant="secondary">
                              {documentTypeLabels[doc.document_type] || doc.document_type}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{formatFileSize(doc.file_size)}</TableCell>
                        <TableCell>
                          {doc.created_at
                            ? format(new Date(doc.created_at), 'dd MMM yyyy', { locale: es })
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canPreview(doc) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handlePreview(doc)}
                                title="Vista previa"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownload(doc)}
                              disabled={!doc.file_path}
                              title="Descargar"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            {isAdmin() && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditClick(doc)}
                                  title="Editar"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteClick(doc)}
                                  title="Eliminar"
                                  className="text-destructive hover:text-destructive"
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
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Subir documento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Proyecto (opcional)</Label>
              <Select value={uploadProjectId} onValueChange={setUploadProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin proyecto asignado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin proyecto</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de documento</Label>
              <Select value={uploadDocType} onValueChange={setUploadDocType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(documentTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Archivo *</Label>
              <Input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip"
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground">
                  {selectedFile.name} ({formatFileSize(selectedFile.size)})
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder="Descripción del documento (opcional)"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUploadDialogOpen(false);
                resetUploadForm();
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploading || !selectedFile}
            >
              {uploading ? 'Subiendo...' : 'Subir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Eye className="h-5 w-5" />
                {previewName}
              </DialogTitle>
              <Button variant="ghost" size="icon" onClick={closePreview}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-4 bg-muted/30">
            {previewUrl && previewType === 'image' && (
              <div className="flex items-center justify-center min-h-[400px]">
                <img
                  src={previewUrl}
                  alt={previewName}
                  className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
                />
              </div>
            )}
            {previewUrl && previewType === 'pdf' && (
              <iframe
                src={previewUrl}
                title={previewName}
                className="w-full h-[70vh] rounded-lg border"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente el documento "{documentToDelete?.name}". 
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Editar documento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nombre del documento"
              />
            </div>
            <div className="space-y-2">
              <Label>Proyecto (opcional)</Label>
              <Select value={editProjectId} onValueChange={setEditProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin proyecto asignado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin proyecto</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de documento</Label>
              <Select value={editDocType} onValueChange={setEditDocType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(documentTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Descripción del documento (opcional)"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                setDocumentToEdit(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={saving || !editName.trim()}
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
