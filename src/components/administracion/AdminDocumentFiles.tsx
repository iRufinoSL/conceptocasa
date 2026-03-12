import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, Download, Trash2, FileText, File, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface DocFile {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  file_type: string | null;
  is_generated_pdf: boolean;
  created_at: string;
}

interface Props {
  documentType: 'invoice' | 'purchase_order';
  documentId: string;
}

export function AdminDocumentFiles({ documentType, documentId }: Props) {
  const [files, setFiles] = useState<DocFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<DocFile | null>(null);

  useEffect(() => {
    fetchFiles();
  }, [documentId]);

  const fetchFiles = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_document_files')
        .select('*')
        .eq('document_type', documentType)
        .eq('document_id', documentId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFiles(data || []);
    } catch (error) {
      console.error('Error fetching document files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ext = file.name.split('.').pop();
      const filePath = `${documentType}/${documentId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('admin-document-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('admin_document_files')
        .insert({
          document_type: documentType,
          document_id: documentId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
          is_generated_pdf: false,
          uploaded_by: user?.id || null,
        });

      if (dbError) throw dbError;
      toast.success('Archivo subido');
      fetchFiles();
    } catch (error) {
      console.error('Error uploading:', error);
      toast.error('Error al subir archivo');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDownload = async (file: DocFile) => {
    try {
      const { data, error } = await supabase.storage
        .from('admin-document-files')
        .createSignedUrl(file.file_path, 300);

      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Error downloading:', error);
      toast.error('Error al descargar');
    }
  };

  const handleDelete = async () => {
    if (!fileToDelete) return;
    try {
      await supabase.storage.from('admin-document-files').remove([fileToDelete.file_path]);
      const { error } = await supabase.from('admin_document_files').delete().eq('id', fileToDelete.id);
      if (error) throw error;
      toast.success('Archivo eliminado');
      setFileToDelete(null);
      fetchFiles();
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Error al eliminar');
    }
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando documentos...</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Documentos</span>
          {files.length > 0 && <Badge variant="outline" className="text-xs">{files.length}</Badge>}
        </div>
        <label>
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          <Button variant="outline" size="sm" className="gap-1 cursor-pointer" asChild disabled={uploading}>
            <span>
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              Subir
            </span>
          </Button>
        </label>
      </div>

      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((file) => (
            <div key={file.id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 group">
              <div className="flex items-center gap-2 min-w-0">
                <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">{file.file_name}</span>
                {file.is_generated_pdf && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">PDF generado</Badge>
                )}
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatSize(file.file_size)}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {format(new Date(file.created_at), 'dd/MM/yy', { locale: es })}
                </span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDownload(file)}>
                  <Download className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFileToDelete(file)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <DeleteConfirmDialog
        open={!!fileToDelete}
        onOpenChange={(open) => !open && setFileToDelete(null)}
        onConfirm={handleDelete}
        title="¿Eliminar archivo?"
        description={`Se eliminará "${fileToDelete?.file_name}".`}
      />
    </div>
  );
}
