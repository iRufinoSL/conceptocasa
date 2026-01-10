import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { 
  ArrowLeft, 
  Download, 
  FileText, 
  Search, 
  Filter, 
  FolderOpen, 
  Upload, 
  Plus, 
  Eye, 
  X, 
  Trash2, 
  Pencil,
  Link as LinkIcon,
  ExternalLink,
  Save,
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
import { AppNavDropdown } from '@/components/AppNavDropdown';
import { BackupButton } from '@/components/BackupButton';
import { searchMatch } from '@/lib/search-utils';

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
  project?: {
    id: string;
    name: string;
  } | null;
  // For accounting documents
  source?: 'project' | 'accounting';
  entry_info?: {
    entry_id: string;
    entry_code: string;
    entry_description: string;
    budget_name: string;
  } | null;
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

export default function Documentos() {
  const navigate = useNavigate();
  const { user, loading, isAdmin } = useAuth();
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterProject, setFilterProject] = useState<string>('all');

  // Custom document types
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const allDocumentTypes = [...DEFAULT_DOCUMENT_TYPES, ...customTypes.filter(t => !DEFAULT_DOCUMENT_TYPES.includes(t))];

  // Upload state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadProjectId, setUploadProjectId] = useState<string>('');
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
  const [editProjectId, setEditProjectId] = useState<string>('');
  const [editUrl, setEditUrl] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [isAddingEditCustomType, setIsAddingEditCustomType] = useState(false);
  const [newEditCustomType, setNewEditCustomType] = useState('');
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
      // Fetch project documents
      const { data: projectDocs, error: projectError } = await supabase
        .from('project_documents')
        .select(`
          *,
          project:projects(id, name)
        `);

      if (projectError) throw projectError;

      // Fetch accounting documents with entry and budget info
      const { data: accountingDocs, error: accountingError } = await supabase
        .from('accounting_documents')
        .select(`
          *,
          entry:accounting_entries(
            id,
            code,
            description,
            budget:presupuestos(id, nombre)
          )
        `);

      if (accountingError) throw accountingError;

      // Transform project documents
      const transformedProjectDocs: ProjectDocument[] = (projectDocs || []).map(doc => ({
        ...doc,
        source: 'project' as const,
        entry_info: null
      }));

      // Transform accounting documents to match ProjectDocument interface
      const transformedAccountingDocs: ProjectDocument[] = (accountingDocs || []).map(doc => ({
        id: doc.id,
        name: doc.name,
        description: doc.description,
        file_path: doc.file_path,
        file_type: doc.file_type,
        file_size: doc.file_size,
        document_type: 'Asiento contable',
        document_url: doc.document_url,
        created_at: doc.created_at,
        project_id: null,
        project: null,
        source: 'accounting' as const,
        entry_info: doc.entry ? {
          entry_id: doc.entry.id,
          entry_code: doc.entry.code,
          entry_description: doc.entry.description,
          budget_name: doc.entry.budget?.nombre || 'Sin presupuesto'
        } : null
      }));

      // Combine and sort alphabetically by name
      const allDocs = [...transformedProjectDocs, ...transformedAccountingDocs]
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

      setDocuments(allDocs);
      
      // Extract custom types from existing documents
      const existingTypes = allDocs
        .map(d => d.document_type)
        .filter((t): t is string => !!t && !DEFAULT_DOCUMENT_TYPES.includes(t) && t !== 'Asiento contable');
      setCustomTypes([...new Set(existingTypes)]);
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
      // Use the correct bucket based on document source
      const bucketName = doc.source === 'accounting' ? 'accounting-documents' : 'project-documents';
      
      const { data, error } = await supabase.storage
        .from(bucketName)
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

  const handleOpenUrl = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error('El archivo no puede superar 50MB');
        return;
      }
      setSelectedFile(file);
      // Auto-fill name if empty
      if (!uploadName) {
        setUploadName(file.name);
      }
    }
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

  const handleAddEditCustomType = () => {
    if (!newEditCustomType.trim()) return;
    
    const trimmed = newEditCustomType.trim();
    if (!allDocumentTypes.includes(trimmed)) {
      setCustomTypes([...customTypes, trimmed]);
      setEditDocType(trimmed);
    } else {
      setEditDocType(trimmed);
    }
    setNewEditCustomType('');
    setIsAddingEditCustomType(false);
  };

  const handleUpload = async () => {
    if (!uploadName.trim()) {
      toast.error('El nombre del documento es obligatorio');
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

      // Upload file if selected
      if (selectedFile) {
        const fileName = buildDocumentStoragePath(uploadProjectId || 'general', selectedFile.name);

        const { error: uploadError } = await supabase.storage
          .from('project-documents')
          .upload(fileName, selectedFile);

        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          if (uploadError.message?.includes('row-level security') || uploadError.message?.includes('policy')) {
            toast.error('No tienes permisos para subir documentos');
          } else {
            toast.error(`Error de almacenamiento: ${uploadError.message}`);
          }
          return;
        }

        filePath = fileName;
        fileType = selectedFile.type;
        fileSize = selectedFile.size;
      }

      const { error: dbError } = await supabase.from('project_documents').insert({
        project_id: uploadProjectId || null,
        name: uploadName.trim(),
        description: uploadDescription.trim() || null,
        file_path: filePath,
        file_type: fileType,
        file_size: fileSize,
        document_type: uploadDocType,
        document_url: uploadUrl.trim() || null,
        uploaded_by: user?.id,
      });

      if (dbError) {
        console.error('Database insert error:', dbError);
        // Clean up uploaded file
        if (filePath) {
          await supabase.storage.from('project-documents').remove([filePath]);
        }
        toast.error(`Error de base de datos: ${dbError.message}`);
        return;
      }

      toast.success('Documento guardado correctamente');
      setUploadDialogOpen(false);
      resetUploadForm();
      fetchDocuments();
    } catch (error: any) {
      console.error('Error uploading document:', error);
      toast.error(error?.message || 'Error al guardar el documento');
    } finally {
      setUploading(false);
    }
  };

  const resetUploadForm = () => {
    setSelectedFile(null);
    setUploadName('');
    setUploadProjectId('');
    setUploadDocType('Otro');
    setUploadDescription('');
    setUploadUrl('');
    setIsAddingCustomType(false);
    setNewCustomType('');
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
      // Use the correct bucket based on document source
      const bucketName = doc.source === 'accounting' ? 'accounting-documents' : 'project-documents';
      
      const { data, error } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(doc.file_path, 300);

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
    setEditDocType(doc.document_type || 'Otro');
    setEditProjectId(doc.project_id || '');
    setEditUrl(doc.document_url || '');
    setEditFile(null);
    setEditDialogOpen(true);
  };

  const handleEditFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error('El archivo no puede superar 50MB');
        return;
      }
      setEditFile(file);
    }
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
      let newFilePath: string | null = documentToEdit.file_path;
      let newFileType: string | null = documentToEdit.file_type;
      let newFileSize: number | null = documentToEdit.file_size;

      // If new file selected, upload it and delete old one
      if (editFile) {
        const fileName = buildDocumentStoragePath(editProjectId || 'general', editFile.name);
        
        const { error: uploadError } = await supabase.storage
          .from('project-documents')
          .upload(fileName, editFile);

        if (uploadError) throw uploadError;

        // Delete old file if exists
        if (documentToEdit.file_path) {
          await supabase.storage
            .from('project-documents')
            .remove([documentToEdit.file_path]);
        }

        newFilePath = fileName;
        newFileType = editFile.type;
        newFileSize = editFile.size;
      }

      const { error } = await supabase
        .from('project_documents')
        .update({
          name: editName.trim(),
          description: editDescription.trim() || null,
          document_type: editDocType,
          project_id: editProjectId || null,
          document_url: editUrl.trim() || null,
          file_path: newFilePath,
          file_type: newFileType,
          file_size: newFileSize,
        })
        .eq('id', documentToEdit.id);

      if (error) throw error;

      toast.success('Documento actualizado correctamente');
      setEditDialogOpen(false);
      setDocumentToEdit(null);
      setEditFile(null);
      if (editFileInputRef.current) editFileInputRef.current.value = '';
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
      searchMatch(doc.name, searchTerm) ||
      searchMatch(doc.description, searchTerm) ||
      searchMatch(doc.project?.name, searchTerm) ||
      searchMatch(doc.entry_info?.budget_name, searchTerm) ||
      searchMatch(doc.entry_info?.entry_description, searchTerm);

    const matchesType = filterType === 'all' || doc.document_type === filterType;
    const matchesProject = filterProject === 'all' || 
      (filterProject === 'none' ? !doc.project_id && !doc.entry_info : doc.project_id === filterProject);

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
                    Todos los documentos
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin() && <BackupButton module="documents" variant="outline" />}
              {isAdmin() && (
                <Button onClick={() => setUploadDialogOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Nuevo documento</span>
                </Button>
              )}
            </div>
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
                  {allDocumentTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
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
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{doc.name}</p>
                              {doc.document_url && (
                                <Badge variant="secondary" className="text-xs">
                                  <LinkIcon className="h-3 w-3 mr-1" />
                                  URL
                                </Badge>
                              )}
                            </div>
                            {doc.description && (
                              <div className="flex items-center gap-1">
                                <p className="text-sm text-muted-foreground truncate max-w-xs">
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
                        </TableCell>
                        <TableCell>
                          {doc.project ? (
                            <Badge variant="outline">{doc.project.name}</Badge>
                          ) : doc.entry_info ? (
                            <div className="space-y-1">
                              <Badge variant="outline" className="text-xs">
                                {doc.entry_info.budget_name}
                              </Badge>
                              <p className="text-xs text-muted-foreground">
                                Asiento #{doc.entry_info.entry_code}
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {doc.document_type ? (
                            <Badge variant="secondary">
                              {doc.document_type}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{doc.file_path ? formatFileSize(doc.file_size) : '-'}</TableCell>
                        <TableCell>
                          {doc.created_at
                            ? format(new Date(doc.created_at), 'dd MMM yyyy', { locale: es })
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {doc.document_url && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenUrl(doc.document_url!)}
                                title="Abrir enlace"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
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
                            {doc.file_path && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownload(doc)}
                                title="Descargar"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            {isAdmin() && doc.source !== 'accounting' && (
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
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Nuevo documento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Document Name */}
            <div className="space-y-2">
              <Label>Nombre del documento *</Label>
              <Input
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="Nombre del documento..."
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Document Type with custom option */}
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
                    <Button size="icon" variant="ghost" onClick={() => {
                      setIsAddingCustomType(false);
                      setNewCustomType('');
                    }}>
                      <X className="h-4 w-4" />
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

              {/* Project */}
              <div className="space-y-2">
                <Label>Proyecto (opcional)</Label>
                <Select 
                  value={uploadProjectId || '__none__'} 
                  onValueChange={(val) => setUploadProjectId(val === '__none__' ? '' : val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin proyecto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin proyecto</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* URL field */}
            <div className="space-y-2">
              <Label>URL (opcional)</Label>
              <Input
                value={uploadUrl}
                onChange={(e) => setUploadUrl(e.target.value)}
                placeholder="https://ejemplo.com/documento"
                type="url"
              />
            </div>

            {/* Description */}
            <div className="space-y-2 flex-1 min-h-0">
              <Label>Descripción (opcional)</Label>
              <div className="h-[300px] overflow-hidden">
                <RichTextEditor
                  value={uploadDescription}
                  onChange={setUploadDescription}
                  placeholder="Descripción del documento..."
                  minHeight="280px"
                  className="h-full"
                />
              </div>
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label>Archivo (opcional)</Label>
              <div className="flex gap-2 items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.zip,.txt"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex-1"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {selectedFile ? selectedFile.name : 'Seleccionar archivo'}
                </Button>
                {selectedFile && (
                  <Button 
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
              {selectedFile && (
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Formatos: PDF, imágenes, Word, Excel, ZIP. Máximo 50MB.
              </p>
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
              disabled={uploading || !uploadName.trim()}
            >
              <Save className="h-4 w-4 mr-2" />
              {uploading ? 'Guardando...' : 'Guardar'}
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
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Editar documento
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="space-y-4 py-4 pr-2">
              {/* Edit Name */}
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nombre del documento"
                  maxLength={200}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Edit Type with custom option */}
                <div className="space-y-2">
                  <Label>Tipo de documento</Label>
                  {isAddingEditCustomType ? (
                    <div className="flex gap-2">
                      <Input
                        value={newEditCustomType}
                        onChange={(e) => setNewEditCustomType(e.target.value)}
                        placeholder="Nuevo tipo..."
                        maxLength={50}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddEditCustomType();
                          if (e.key === 'Escape') {
                            setIsAddingEditCustomType(false);
                            setNewEditCustomType('');
                          }
                        }}
                      />
                      <Button size="icon" variant="ghost" onClick={handleAddEditCustomType}>
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => {
                        setIsAddingEditCustomType(false);
                        setNewEditCustomType('');
                      }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Select value={editDocType} onValueChange={setEditDocType}>
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
                        onClick={() => setIsAddingEditCustomType(true)}
                        title="Añadir tipo personalizado"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Edit Project */}
                <div className="space-y-2">
                  <Label>Proyecto (opcional)</Label>
                  <Select 
                    value={editProjectId || '__none__'} 
                    onValueChange={(val) => setEditProjectId(val === '__none__' ? '' : val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sin proyecto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin proyecto</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Edit URL */}
              <div className="space-y-2">
                <Label>URL</Label>
                <Input
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  placeholder="https://ejemplo.com/documento"
                  type="url"
                />
              </div>

              {/* Edit Description */}
              <div className="space-y-2">
                <Label>Descripción</Label>
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

              {/* File Upload/Replace */}
              <div className="space-y-2">
                <Label>Archivo {documentToEdit?.file_path ? '(reemplazar)' : '(añadir)'}</Label>
                
                {/* Current file info */}
                {documentToEdit?.file_path && !editFile && (
                  <div className="p-2 bg-muted rounded text-sm flex items-center justify-between">
                    <div>
                      <span className="text-muted-foreground">Actual: </span>
                      <span className="font-medium">{documentToEdit.file_path.split('/').pop()}</span>
                      <span className="text-muted-foreground ml-2">({formatFileSize(documentToEdit.file_size)})</span>
                    </div>
                  </div>
                )}
                
                {/* New file selected */}
                {editFile && (
                  <div className="p-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded text-sm flex items-center justify-between">
                    <div>
                      <span className="text-green-700 dark:text-green-300">Nuevo: </span>
                      <span className="font-medium">{editFile.name}</span>
                      <span className="text-muted-foreground ml-2">({formatFileSize(editFile.size)})</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        setEditFile(null);
                        if (editFileInputRef.current) editFileInputRef.current.value = '';
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                
                {/* File input */}
                <div className="flex gap-2">
                  <input
                    ref={editFileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleEditFileSelect}
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.zip,.txt"
                  />
                  <Button
                    variant="outline"
                    onClick={() => editFileInputRef.current?.click()}
                    disabled={saving}
                    className="w-full"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {editFile ? 'Cambiar archivo' : documentToEdit?.file_path ? 'Reemplazar archivo' : 'Añadir archivo'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Formatos: PDF, imágenes, Word, Excel, ZIP. Máximo 50MB.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-shrink-0 border-t pt-4 mt-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                setDocumentToEdit(null);
                setEditFile(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={saving || !editName.trim()}
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
