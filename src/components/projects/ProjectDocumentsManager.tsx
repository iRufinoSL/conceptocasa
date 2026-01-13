import { useState, useEffect, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  FileText, 
  Upload, 
  Trash2, 
  Download, 
  Edit,
  File,
  Image,
  FileSpreadsheet,
  FileArchive,
  Link as LinkIcon,
  ExternalLink,
  Plus,
  X,
  Save,
  List,
  FolderOpen,
  ChevronDown
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ProjectDocument {
  id: string;
  name: string;
  description: string | null;
  file_path: string | null;
  file_type: string | null;
  file_size: number | null;
  document_type: string | null;
  document_url: string | null;
  tags: string[] | null;
  created_at: string | null;
}

interface ProjectDocumentsManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  canEdit: boolean;
}

const DEFAULT_DOCUMENT_TYPES = [
  'Certificado',
  'Contrato',
  'Enlace web',
  'Factura',
  'Fotografía',
  'Informe',
  'Licencia',
  'Memoria',
  'Otro',
  'Plano',
  'Presupuesto'
];

export function ProjectDocumentsManager({ 
  open, 
  onOpenChange, 
  projectId, 
  projectName,
  canEdit 
}: ProjectDocumentsManagerProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  
  // Form state for new document
  const [docName, setDocName] = useState('');
  const [selectedType, setSelectedType] = useState('Otro');
  const [description, setDescription] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Custom document type
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const [isAddingCustomType, setIsAddingCustomType] = useState(false);
  const [newCustomType, setNewCustomType] = useState('');
  
  // Edit mode
  const [editingDoc, setEditingDoc] = useState<ProjectDocument | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // View mode state
  const [viewMode, setViewMode] = useState<'alphabetical' | 'grouped'>('alphabetical');
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  // Combine default and custom types, sorted alphabetically
  const allDocumentTypes = useMemo(() => {
    const combined = [...DEFAULT_DOCUMENT_TYPES, ...customTypes.filter(t => !DEFAULT_DOCUMENT_TYPES.includes(t))];
    return combined.sort((a, b) => a.localeCompare(b, 'es'));
  }, [customTypes]);

  // Documents sorted alphabetically
  const sortedDocuments = useMemo(() => {
    return [...documents].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [documents]);

  // Documents grouped by type
  const groupedDocuments = useMemo(() => {
    const groups: Record<string, ProjectDocument[]> = {};
    
    documents.forEach(doc => {
      const type = doc.document_type || 'Sin tipo';
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(doc);
    });
    
    // Sort documents within each group alphabetically
    Object.keys(groups).forEach(type => {
      groups[type].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    });
    
    // Return sorted by type name
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, 'es'));
  }, [documents]);

  const toggleTypeExpanded = (type: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const expandAllTypes = () => {
    setExpandedTypes(new Set(groupedDocuments.map(([type]) => type)));
  };

  const collapseAllTypes = () => {
    setExpandedTypes(new Set());
  };

  const fetchDocuments = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('project_documents')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setDocuments(data);
      
      // Extract custom types from existing documents
      const existingTypes = data
        .map(d => d.document_type)
        .filter((t): t is string => !!t && !DEFAULT_DOCUMENT_TYPES.includes(t));
      setCustomTypes([...new Set(existingTypes)]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (open && projectId) {
      fetchDocuments();
    }
  }, [open, projectId]);

  const resetForm = () => {
    setDocName('');
    setSelectedType('Otro');
    setDescription('');
    setDocumentUrl('');
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast({ title: 'Error', description: 'El archivo no puede superar los 50MB', variant: 'destructive' });
      return;
    }

    setSelectedFile(file);
    // Auto-fill name if empty
    if (!docName) {
      setDocName(file.name);
    }
  };

  const handleSaveDocument = async () => {
    // Validate: need at least a name
    if (!docName.trim()) {
      toast({ title: 'Error', description: 'El nombre del documento es obligatorio', variant: 'destructive' });
      return;
    }

    // Validate URL if provided
    if (documentUrl && !isValidUrl(documentUrl)) {
      toast({ title: 'Error', description: 'La URL no es válida', variant: 'destructive' });
      return;
    }

    setIsUploading(true);

    try {
      let filePath: string | null = null;
      let fileType: string | null = null;
      let fileSize: number | null = null;

      // Upload file if selected
      if (selectedFile) {
        const fileName = `${projectId}/${Date.now()}-${selectedFile.name}`;
        
        const { error: uploadError } = await supabase.storage
          .from('project-documents')
          .upload(fileName, selectedFile);

        if (uploadError) throw uploadError;

        filePath = fileName;
        fileType = selectedFile.type;
        fileSize = selectedFile.size;
      }

      // Create document record (with or without file)
      const { error: dbError } = await supabase
        .from('project_documents')
        .insert({
          project_id: projectId,
          name: docName.trim(),
          description: description.trim() || null,
          file_path: filePath,
          file_type: fileType,
          file_size: fileSize,
          document_type: selectedType,
          document_url: documentUrl.trim() || null
        });

      if (dbError) throw dbError;

      toast({ title: 'Documento guardado correctamente' });
      resetForm();
      fetchDocuments();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddCustomType = () => {
    if (!newCustomType.trim()) return;
    
    const trimmed = newCustomType.trim();
    if (!allDocumentTypes.includes(trimmed)) {
      setCustomTypes([...customTypes, trimmed]);
      setSelectedType(trimmed);
    } else {
      setSelectedType(trimmed);
    }
    setNewCustomType('');
    setIsAddingCustomType(false);
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
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleOpenUrl = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = async (doc: ProjectDocument) => {
    try {
      // Delete from storage if has file
      if (doc.file_path) {
        const { error: storageError } = await supabase.storage
          .from('project-documents')
          .remove([doc.file_path]);

        if (storageError) throw storageError;
      }

      // Delete record
      const { error: dbError } = await supabase
        .from('project_documents')
        .delete()
        .eq('id', doc.id);

      if (dbError) throw dbError;

      toast({ title: 'Documento eliminado' });
      fetchDocuments();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const startEditing = (doc: ProjectDocument) => {
    setEditingDoc(doc);
    setEditName(doc.name);
    setEditType(doc.document_type || 'Otro');
    setEditDescription(doc.description || '');
    setEditUrl(doc.document_url || '');
  };

  const cancelEditing = () => {
    setEditingDoc(null);
    setEditName('');
    setEditType('');
    setEditDescription('');
    setEditUrl('');
    setEditFile(null);
    if (editFileInputRef.current) editFileInputRef.current.value = '';
  };

  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast({ title: 'Error', description: 'El archivo no puede superar los 50MB', variant: 'destructive' });
      return;
    }

    setEditFile(file);
  };

  const handleSaveEdit = async () => {
    if (!editingDoc) return;
    
    if (!editName.trim()) {
      toast({ title: 'Error', description: 'El nombre es obligatorio', variant: 'destructive' });
      return;
    }

    if (editUrl && !isValidUrl(editUrl)) {
      toast({ title: 'Error', description: 'La URL no es válida', variant: 'destructive' });
      return;
    }

    setIsSaving(true);

    try {
      let newFilePath: string | null = editingDoc.file_path;
      let newFileType: string | null = editingDoc.file_type;
      let newFileSize: number | null = editingDoc.file_size;

      // If new file selected, upload it and delete old one
      if (editFile) {
        // Upload new file
        const fileName = `${projectId}/${Date.now()}-${editFile.name}`;
        
        const { error: uploadError } = await supabase.storage
          .from('project-documents')
          .upload(fileName, editFile);

        if (uploadError) throw uploadError;

        // Delete old file if exists
        if (editingDoc.file_path) {
          await supabase.storage
            .from('project-documents')
            .remove([editingDoc.file_path]);
        }

        newFilePath = fileName;
        newFileType = editFile.type;
        newFileSize = editFile.size;
      }

      const { error } = await supabase
        .from('project_documents')
        .update({
          name: editName.trim(),
          document_type: editType,
          description: editDescription.trim() || null,
          document_url: editUrl.trim() || null,
          file_path: newFilePath,
          file_type: newFileType,
          file_size: newFileSize
        })
        .eq('id', editingDoc.id);

      if (error) throw error;

      toast({ title: 'Documento actualizado' });
      cancelEditing();
      fetchDocuments();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const getFileIcon = (doc: ProjectDocument) => {
    // If has URL but no file, show link icon
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documentos del proyecto
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{projectName}</p>
        </DialogHeader>

        {/* Add/Upload Form */}
        {canEdit && !editingDoc && (
          <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
            <p className="text-sm font-medium">Añadir documento</p>
            
            {/* Document Name */}
            <div className="space-y-2">
              <Label htmlFor="doc-name">Nombre del documento *</Label>
              <Input
                id="doc-name"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="Nombre del documento..."
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Document Type with custom option */}
              <div className="space-y-2">
                <Label htmlFor="doc-type">Tipo de documento</Label>
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
                    <Select value={selectedType} onValueChange={setSelectedType}>
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
              
              {/* URL field */}
              <div className="space-y-2">
                <Label htmlFor="doc-url">URL (opcional)</Label>
                <Input
                  id="doc-url"
                  value={documentUrl}
                  onChange={(e) => setDocumentUrl(e.target.value)}
                  placeholder="https://ejemplo.com/documento"
                  type="url"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Descripción (opcional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripción del documento..."
                maxLength={500}
                rows={2}
              />
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label>Archivo (opcional)</Label>
              <div className="flex gap-2 items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.zip,.txt"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
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
              <p className="text-xs text-muted-foreground">
                Formatos: PDF, imágenes, Word, Excel, ZIP. Máximo 50MB.
              </p>
            </div>

            {/* Save Button */}
            <Button
              onClick={handleSaveDocument}
              disabled={isUploading || !docName.trim()}
              className="w-full"
            >
              <Save className="h-4 w-4 mr-2" />
              {isUploading ? 'Guardando...' : 'Guardar documento'}
            </Button>
          </div>
        )}

        {/* Edit Form */}
        {editingDoc && (
          <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Editar documento</p>
              <Button variant="ghost" size="icon" onClick={cancelEditing}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Edit Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nombre *</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Edit Type */}
              <div className="space-y-2">
                <Label htmlFor="edit-type">Tipo de documento</Label>
                <Select value={editType} onValueChange={setEditType}>
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
              
              {/* Edit URL */}
              <div className="space-y-2">
                <Label htmlFor="edit-url">URL</Label>
                <Input
                  id="edit-url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  placeholder="https://ejemplo.com/documento"
                  type="url"
                />
              </div>
            </div>

            {/* Edit Description */}
            <div className="space-y-2">
              <Label htmlFor="edit-description">Descripción</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                maxLength={500}
                rows={2}
              />
            </div>

            {/* File Upload/Replace */}
            <div className="space-y-2">
              <Label>Archivo {editingDoc.file_path ? '(reemplazar)' : '(añadir)'}</Label>
              
              {/* Current file info */}
              {editingDoc.file_path && !editFile && (
                <div className="p-2 bg-muted rounded text-sm flex items-center justify-between">
                  <div>
                    <span className="text-muted-foreground">Actual: </span>
                    <span className="font-medium">{editingDoc.file_path.split('/').pop()}</span>
                    <span className="text-muted-foreground ml-2">({formatFileSize(editingDoc.file_size)})</span>
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
                  onChange={handleEditFileChange}
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.zip,.txt"
                />
                <Button
                  variant="outline"
                  onClick={() => editFileInputRef.current?.click()}
                  disabled={isSaving}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {editFile ? 'Cambiar archivo' : editingDoc.file_path ? 'Reemplazar archivo' : 'Añadir archivo'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Formatos: PDF, imágenes, Word, Excel, ZIP. Máximo 50MB.
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={cancelEditing} className="flex-1">
                Cancelar
              </Button>
              <Button 
                onClick={handleSaveEdit} 
                disabled={isSaving || !editName.trim()}
                className="flex-1"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </div>
          </div>
        )}

        {/* Documents List with View Tabs */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Documentos ({documents.length})</p>
          </div>
          
          {isLoading ? (
            <div className="py-8 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : documents.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay documentos</p>
            </div>
          ) : (
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'alphabetical' | 'grouped')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="alphabetical" className="gap-2">
                  <List className="h-4 w-4" />
                  Alfabético
                </TabsTrigger>
                <TabsTrigger value="grouped" className="gap-2">
                  <FolderOpen className="h-4 w-4" />
                  Por Tipo
                </TabsTrigger>
              </TabsList>

              {/* Alphabetical View */}
              <TabsContent value="alphabetical" className="mt-3">
                <div className="space-y-2">
                  {sortedDocuments.map((doc) => (
                    <DocumentRow 
                      key={doc.id}
                      doc={doc}
                      canEdit={canEdit}
                      onEdit={startEditing}
                      onDelete={handleDelete}
                      onDownload={handleDownload}
                      onOpenUrl={handleOpenUrl}
                      getFileIcon={getFileIcon}
                      formatFileSize={formatFileSize}
                    />
                  ))}
                </div>
              </TabsContent>

              {/* Grouped by Type View */}
              <TabsContent value="grouped" className="mt-3">
                <div className="flex justify-end gap-2 mb-3">
                  <Button variant="ghost" size="sm" onClick={expandAllTypes}>
                    Expandir todo
                  </Button>
                  <Button variant="ghost" size="sm" onClick={collapseAllTypes}>
                    Colapsar todo
                  </Button>
                </div>
                <div className="space-y-2">
                  {groupedDocuments.map(([type, docs]) => (
                    <Collapsible
                      key={type}
                      open={expandedTypes.has(type)}
                      onOpenChange={() => toggleTypeExpanded(type)}
                    >
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors">
                          <div className="flex items-center gap-3">
                            <FolderOpen className="h-5 w-5 text-primary" />
                            <span className="font-medium">{type}</span>
                            <Badge variant="secondary" className="text-xs">
                              {docs.length}
                            </Badge>
                          </div>
                          <ChevronDown className={`h-4 w-4 transition-transform ${expandedTypes.has(type) ? 'rotate-180' : ''}`} />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="pl-4 border-l-2 border-muted ml-2 mt-2 space-y-2">
                          {docs.map((doc) => (
                            <DocumentRow 
                              key={doc.id}
                              doc={doc}
                              canEdit={canEdit}
                              onEdit={startEditing}
                              onDelete={handleDelete}
                              onDownload={handleDownload}
                              onOpenUrl={handleOpenUrl}
                              getFileIcon={getFileIcon}
                              formatFileSize={formatFileSize}
                              showType={false}
                            />
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Extracted component for document row to avoid repetition
interface DocumentRowProps {
  doc: ProjectDocument;
  canEdit: boolean;
  onEdit: (doc: ProjectDocument) => void;
  onDelete: (doc: ProjectDocument) => void;
  onDownload: (doc: ProjectDocument) => void;
  onOpenUrl: (url: string) => void;
  getFileIcon: (doc: ProjectDocument) => React.ReactNode;
  formatFileSize: (bytes: number | null) => string;
  showType?: boolean;
}

function DocumentRow({ 
  doc, 
  canEdit, 
  onEdit, 
  onDelete, 
  onDownload, 
  onOpenUrl, 
  getFileIcon, 
  formatFileSize,
  showType = true 
}: DocumentRowProps) {
  return (
    <div 
      className="flex items-center gap-3 p-3 bg-card border rounded-lg group hover:bg-muted/50 transition-colors"
    >
      <div className="p-2 bg-muted rounded">
        {getFileIcon(doc)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate text-sm">{doc.name}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {showType && (
            <Badge variant="outline" className="text-xs">
              {doc.document_type || 'Otro'}
            </Badge>
          )}
          {doc.file_path && (
            <span className="text-xs text-muted-foreground">
              {formatFileSize(doc.file_size)}
            </span>
          )}
          {doc.document_url && (
            <Badge variant="secondary" className="text-xs">
              <LinkIcon className="h-3 w-3 mr-1" />
              URL
            </Badge>
          )}
          {doc.created_at && (
            <span className="text-xs text-muted-foreground">
              {format(new Date(doc.created_at), 'd MMM yyyy', { locale: es })}
            </span>
          )}
        </div>
        {doc.description && (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {doc.description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        {doc.document_url && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onOpenUrl(doc.document_url!)}
            title="Abrir enlace"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
        {doc.file_path && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onDownload(doc)}
            title="Descargar archivo"
          >
            <Download className="h-4 w-4" />
          </Button>
        )}
        {canEdit && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onEdit(doc)}
              title="Editar documento"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onDelete(doc)}
              title="Eliminar documento"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
