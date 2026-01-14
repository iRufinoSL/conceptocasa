import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Opportunity, Contact } from '@/pages/CRM';

interface OpportunityFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity?: Opportunity | null;
  contacts: Contact[];
  onSuccess: () => void;
}

export function OpportunityForm({ open, onOpenChange, opportunity, contacts, onSuccess }: OpportunityFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    contact_id: ''
  });

  useEffect(() => {
    if (opportunity) {
      setFormData({
        name: opportunity.name || '',
        description: opportunity.description || '',
        contact_id: opportunity.contact_id || ''
      });
    } else {
      setFormData({
        name: '',
        description: '',
        contact_id: ''
      });
    }
  }, [opportunity, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'El nombre es obligatorio', variant: 'destructive' });
      return;
    }

    setIsLoading(true);

    try {
      const data = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        contact_id: formData.contact_id || null
      };

      if (opportunity) {
        const { error } = await supabase
          .from('crm_opportunities')
          .update(data)
          .eq('id', opportunity.id);

        if (error) throw error;
        toast({ title: 'Oportunidad actualizada correctamente' });
      } else {
        const { error } = await supabase
          .from('crm_opportunities')
          .insert(data);

        if (error) throw error;
        toast({ title: 'Oportunidad creada correctamente' });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{opportunity ? 'Editar Oportunidad' : 'Nueva Oportunidad'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Nombre de la oportunidad"
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact_id">Contacto asociado</Label>
            <Select value={formData.contact_id || "none"} onValueChange={(v) => setFormData({ ...formData, contact_id: v === "none" ? "" : v })}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar contacto..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin contacto</SelectItem>
                {contacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {contact.name} {contact.surname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descripción de la oportunidad..."
              rows={4}
              maxLength={1000}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Guardando...' : opportunity ? 'Actualizar' : 'Crear'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
