import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  FolderOpen, 
  FileText, 
  FileImage, 
  File, 
  Search, 
  Check,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ProjectDocument {
  id: string;
  name: string;
  file_path: string | null;
  file_type: string | null;
  file_size: number | null;
  document_type: string | null;
  created_at: string | null;
}

interface SelectedDocument {
  id: string;
  name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
}

interface DocumentAttachmentPickerProps {
  projectId: string | null;
  onSelectDocuments: (documents: SelectedDocument[]) => void;
  disabled?: boolean;
}

export function DocumentAttachmentPicker({ 
  projectId, 
  onSelectDocuments,
  disabled = false 
}: DocumentAttachmentPickerProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Fetch project documents
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['project-documents-picker', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      
      const { data, error } = await supabase
        .from('project_documents')
        .select('id, name, file_path, file_type, file_size, document_type, created_at')
        .eq('project_id', projectId)
        .not('file_path', 'is', null)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as ProjectDocument[];
    },
    enabled: !!projectId && open,
  });

  // Filter documents by search
  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const query = searchQuery.toLowerCase();
    return documents.filter(doc => 
      doc.name.toLowerCase().includes(query) ||
      doc.document_type?.toLowerCase().includes(query)
    );
  }, [documents, searchQuery]);

  const toggleDocument = (docId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (fileType: string | null) => {
    if (!fileType) return <File className="h-4 w-4 text-muted-foreground" />;
    if (fileType.startsWith('image/')) return <FileImage className="h-4 w-4 text-blue-500" />;
    if (fileType.includes('pdf')) return <FileText className="h-4 w-4 text-red-500" />;
    return <File className="h-4 w-4 text-muted-foreground" />;
  };

  const handleConfirm = async () => {
    if (selectedIds.size === 0) {
      setOpen(false);
      return;
    }

    setLoading(true);
    try {
      const selectedDocs = documents.filter(doc => selectedIds.has(doc.id) && doc.file_path);
      const documentsToAdd: SelectedDocument[] = selectedDocs.map(doc => ({
        id: doc.id,
        name: doc.name,
        file_path: doc.file_path!,
        file_type: doc.file_type,
        file_size: doc.file_size,
      }));

      onSelectDocuments(documentsToAdd);
      setSelectedIds(new Set());
      setSearchQuery('');
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  if (!projectId) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-2"
        >
          <FolderOpen className="h-4 w-4" />
          Desde Documentos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Seleccionar Documentos del Proyecto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar documentos..."
              className="pl-9"
            />
          </div>

          {/* Document List */}
          <ScrollArea className="h-[300px] border rounded-md">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <FileText className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">
                  {searchQuery ? 'No se encontraron documentos' : 'No hay documentos disponibles'}
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredDocuments.map((doc) => {
                  const isSelected = selectedIds.has(doc.id);
                  return (
                    <div
                      key={doc.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-primary/10 border border-primary/30' 
                          : 'hover:bg-accent border border-transparent'
                      }`}
                      onClick={() => toggleDocument(doc.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleDocument(doc.id)}
                        className="flex-shrink-0"
                      />
                      {getFileIcon(doc.file_type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {doc.document_type && (
                            <Badge variant="secondary" className="text-xs px-1.5 py-0">
                              {doc.document_type}
                            </Badge>
                          )}
                          {doc.file_size && (
                            <span>{formatFileSize(doc.file_size)}</span>
                          )}
                          {doc.created_at && (
                            <span>
                              {format(new Date(doc.created_at), 'd MMM yyyy', { locale: es })}
                            </span>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Selection count */}
          {selectedIds.size > 0 && (
            <p className="text-sm text-muted-foreground text-center">
              {selectedIds.size} documento(s) seleccionado(s)
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={selectedIds.size === 0 || loading}
            className="gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Añadir {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
