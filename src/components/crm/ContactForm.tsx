import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Contact } from '@/pages/CRM';

interface ContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
  onSuccess: () => void;
}

export function ContactForm({ open, onOpenChange, contact, onSuccess }: ContactFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    surname: '',
    email: '',
    phone: '',
    contact_type: 'Persona',
    status: 'Prospecto',
    address: '',
    city: '',
    province: '',
    postal_code: '',
    country: 'España',
    nif_dni: '',
    website: '',
    observations: ''
  });

  useEffect(() => {
    if (contact) {
      setFormData({
        name: contact.name || '',
        surname: contact.surname || '',
        email: contact.email || '',
        phone: contact.phone || '',
        contact_type: contact.contact_type || 'Persona',
        status: contact.status || 'Prospecto',
        address: '',
        city: contact.city || '',
        province: '',
        postal_code: '',
        country: 'España',
        nif_dni: '',
        website: '',
        observations: ''
      });
    } else {
      setFormData({
        name: '',
        surname: '',
        email: '',
        phone: '',
        contact_type: 'Persona',
        status: 'Prospecto',
        address: '',
        city: '',
        province: '',
        postal_code: '',
        country: 'España',
        nif_dni: '',
        website: '',
        observations: ''
      });
    }
  }, [contact, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'El nombre es obligatorio', variant: 'destructive' });
      return;
    }

    setIsLoading(true);

    try {
      if (contact) {
        const { error } = await supabase
          .from('crm_contacts')
          .update({
            name: formData.name.trim(),
            surname: formData.surname.trim() || null,
            email: formData.email.trim() || null,
            phone: formData.phone.trim() || null,
            contact_type: formData.contact_type,
            status: formData.status,
            address: formData.address.trim() || null,
            city: formData.city.trim() || null,
            province: formData.province.trim() || null,
            postal_code: formData.postal_code.trim() || null,
            country: formData.country.trim() || null,
            nif_dni: formData.nif_dni.trim() || null,
            website: formData.website.trim() || null,
            observations: formData.observations.trim() || null
          })
          .eq('id', contact.id);

        if (error) throw error;
        toast({ title: 'Contacto actualizado correctamente' });
      } else {
        const { error } = await supabase
          .from('crm_contacts')
          .insert({
            name: formData.name.trim(),
            surname: formData.surname.trim() || null,
            email: formData.email.trim() || null,
            phone: formData.phone.trim() || null,
            contact_type: formData.contact_type,
            status: formData.status,
            address: formData.address.trim() || null,
            city: formData.city.trim() || null,
            province: formData.province.trim() || null,
            postal_code: formData.postal_code.trim() || null,
            country: formData.country.trim() || null,
            nif_dni: formData.nif_dni.trim() || null,
            website: formData.website.trim() || null,
            observations: formData.observations.trim() || null
          });

        if (error) throw error;
        toast({ title: 'Contacto creado correctamente' });
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contact ? 'Editar Contacto' : 'Nuevo Contacto'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nombre"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="surname">Apellidos</Label>
              <Input
                id="surname"
                value={formData.surname}
                onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                placeholder="Apellidos"
                maxLength={100}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact_type">Tipo</Label>
              <Select value={formData.contact_type} onValueChange={(v) => setFormData({ ...formData, contact_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Persona">Persona</SelectItem>
                  <SelectItem value="Empresa">Empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Prospecto">Prospecto</SelectItem>
                  <SelectItem value="Cliente">Cliente</SelectItem>
                  <SelectItem value="Inactivo">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@ejemplo.com"
                maxLength={255}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+34 600 000 000"
                maxLength={20}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Dirección</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Calle, número, piso..."
              maxLength={255}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">Ciudad</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="Ciudad"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="province">Provincia</Label>
              <Input
                id="province"
                value={formData.province}
                onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                placeholder="Provincia"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postal_code">C.P.</Label>
              <Input
                id="postal_code"
                value={formData.postal_code}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                placeholder="28001"
                maxLength={10}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nif_dni">NIF/DNI</Label>
              <Input
                id="nif_dni"
                value={formData.nif_dni}
                onChange={(e) => setFormData({ ...formData, nif_dni: e.target.value })}
                placeholder="12345678A"
                maxLength={20}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Web</Label>
              <Input
                id="website"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="https://..."
                maxLength={255}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observations">Observaciones</Label>
            <Textarea
              id="observations"
              value={formData.observations}
              onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
              placeholder="Notas adicionales..."
              rows={3}
              maxLength={1000}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Guardando...' : contact ? 'Actualizar' : 'Crear'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
