import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, FileText, Edit, Trash2, Eye } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import type { Tables } from '@/integrations/supabase/types';

type EmailTemplate = Tables<'email_templates'>;

const categories = [
  { value: 'general', label: 'General' },
  { value: 'presupuesto', label: 'Presupuesto' },
  { value: 'proyecto', label: 'Proyecto' },
  { value: 'factura', label: 'Factura' },
  { value: 'recordatorio', label: 'Recordatorio' },
];

interface TemplateFormData {
  name: string;
  subject: string;
  content: string;
  category: string;
  variables: string;
  is_active: boolean;
}

const defaultFormData: TemplateFormData = {
  name: '',
  subject: '',
  content: '',
  category: 'general',
  variables: '',
  is_active: true,
};

export function EmailTemplatesTab() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>(defaultFormData);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<EmailTemplate | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['email-templates-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as EmailTemplate[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const variablesArray = formData.variables
        .split(',')
        .map(v => v.trim())
        .filter(v => v);

      const payload = {
        name: formData.name,
        subject: formData.subject,
        content: formData.content,
        category: formData.category,
        variables: variablesArray,
        is_active: formData.is_active,
        created_by: user?.id,
      };

      if (selectedTemplate) {
        const { error } = await supabase
          .from('email_templates')
          .update(payload)
          .eq('id', selectedTemplate.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('email_templates')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(selectedTemplate ? 'Plantilla actualizada' : 'Plantilla creada');
      queryClient.invalidateQueries({ queryKey: ['email-templates-all'] });
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      setFormOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al guardar plantilla');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Plantilla eliminada');
      queryClient.invalidateQueries({ queryKey: ['email-templates-all'] });
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al eliminar plantilla');
    },
  });

  const resetForm = () => {
    setFormData(defaultFormData);
    setSelectedTemplate(null);
  };

  const handleEdit = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    const varsArray = template.variables as string[] || [];
    setFormData({
      name: template.name,
      subject: template.subject,
      content: template.content,
      category: template.category || 'general',
      variables: varsArray.join(', '),
      is_active: template.is_active ?? true,
    });
    setFormOpen(true);
  };

  const handlePreview = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setPreviewOpen(true);
  };

  const handleDelete = (template: EmailTemplate) => {
    setTemplateToDelete(template);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Plantillas de Email</h3>
        <Button onClick={() => { resetForm(); setFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Plantilla
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Cargando...</div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No hay plantillas. Crea una para empezar.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className={!template.is_active ? 'opacity-60' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{template.name}</CardTitle>
                  </div>
                  <Badge variant="outline">
                    {categories.find(c => c.value === template.category)?.label || template.category}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2 line-clamp-1">
                  {template.subject}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                  {template.content.replace(/<[^>]*>/g, '')}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handlePreview(template)}>
                    <Eye className="h-3 w-3 mr-1" />
                    Ver
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleEdit(template)}>
                    <Edit className="h-3 w-3 mr-1" />
                    Editar
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(template)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedTemplate ? 'Editar Plantilla' : 'Nueva Plantilla'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Nombre de la plantilla"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Categoría</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Asunto *</Label>
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Asunto del email (puede incluir {{variables}})"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Contenido *</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                placeholder="Contenido HTML del email..."
                className="min-h-[200px] font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="variables">Variables (separadas por coma)</Label>
              <Input
                id="variables"
                value={formData.variables}
                onChange={(e) => setFormData(prev => ({ ...prev, variables: e.target.value }))}
                placeholder="nombre, presupuesto_nombre, fecha"
              />
              <p className="text-xs text-muted-foreground">
                Las variables se usan como {'{{nombre_variable}}'} en el contenido
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
              <Label htmlFor="is_active">Plantilla activa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedTemplate?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">Asunto</Label>
              <p className="font-medium">{selectedTemplate?.subject}</p>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Contenido</Label>
              <div 
                className="mt-2 p-4 border rounded-lg bg-white prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedTemplate?.content || '') }}
              />
            </div>
            {selectedTemplate?.variables && (
              <div>
                <Label className="text-sm text-muted-foreground">Variables disponibles</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(selectedTemplate.variables as string[]).map(v => (
                    <Badge key={v} variant="secondary">{'{{' + v + '}}'}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={() => templateToDelete && deleteMutation.mutate(templateToDelete.id)}
        title="Eliminar Plantilla"
        description={`¿Estás seguro de que quieres eliminar la plantilla "${templateToDelete?.name}"?`}
      />
    </div>
  );
}
