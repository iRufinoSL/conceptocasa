import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  FileText, 
  Upload, 
  Trash2, 
  Download, 
  Eye,
  File,
  Image,
  FileSpreadsheet,
  FileArchive
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
  created_at: string | null;
}

interface ProjectDocumentsManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  canEdit: boolean;
}

const DOCUMENT_TYPES = [
  'Plano',
  'Presupuesto',
  'Contrato',
  'Factura',
  'Informe',
  'Fotografía',
  'Certificado',
  'Licencia',
  'Memoria',
  'Otro'
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
  const [selectedType, setSelectedType] = useState('Otro');
  const [description, setDescription] = useState('');

  const fetchDocuments = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('project_documents')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setDocuments(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (open && projectId) {
      fetchDocuments();
    }
  }, [open, projectId]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast({ title: 'Error', description: 'El archivo no puede superar los 50MB', variant: 'destructive' });
      return;
    }

    setIsUploading(true);

    try {
      // Upload to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${projectId}/${Date.now()}-${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Create document record
      const { error: dbError } = await supabase
        .from('project_documents')
        .insert({
          project_id: projectId,
          name: file.name,
          description: description || null,
          file_path: fileName,
          file_type: file.type,
          file_size: file.size,
          document_type: selectedType
        });

      if (dbError) throw dbError;

      toast({ title: 'Documento subido correctamente' });
      setDescription('');
      setSelectedType('Otro');
      fetchDocuments();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (doc: ProjectDocument) => {
    try {
      // Delete from storage
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

  const getFileIcon = (fileType: string | null) => {
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
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

        {/* Upload Form */}
        {canEdit && (
          <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
            <p className="text-sm font-medium">Subir documento</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="doc-type">Tipo de documento</Label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descripción (opcional)</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descripción breve..."
                  maxLength={200}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.zip,.txt"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                {isUploading ? 'Subiendo...' : 'Seleccionar archivo'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Formatos: PDF, imágenes, Word, Excel, ZIP. Máximo 50MB.
            </p>
          </div>
        )}

        {/* Documents List */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Documentos ({documents.length})</p>
          
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
            <div className="space-y-2">
              {documents.map((doc) => (
                <div 
                  key={doc.id}
                  className="flex items-center gap-3 p-3 bg-card border rounded-lg group hover:bg-muted/50 transition-colors"
                >
                  <div className="p-2 bg-muted rounded">
                    {getFileIcon(doc.file_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{doc.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {doc.document_type || 'Otro'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(doc.file_size)}
                      </span>
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDownload(doc)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDelete(doc)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
