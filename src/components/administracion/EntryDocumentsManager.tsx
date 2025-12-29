import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { FileText, Plus, Trash2, ExternalLink, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';

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

export function EntryDocumentsManager({ entryId, onUpdate }: Props) {
  const [documents, setDocuments] = useState<AccountingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<AccountingDocument | null>(null);
  const [form, setForm] = useState<DocumentForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, [entryId]);

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
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre del documento es obligatorio');
      return;
    }

    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('accounting_documents')
        .insert({
          entry_id: entryId,
          name: form.name.trim(),
          description: form.description.trim() || null,
          document_url: form.document_url.trim() || null,
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
    }
  };

  const handleDelete = async () => {
    if (!documentToDelete) return;

    try {
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
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{doc.name}</p>
                  {doc.description && (
                    <p className="text-xs text-muted-foreground truncate">{doc.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
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
              <Textarea
                id="doc-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Descripción opcional del documento"
                rows={2}
              />
            </div>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Añadir Documento'}
            </Button>
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