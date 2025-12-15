import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { X, Plus, Briefcase } from 'lucide-react';
import type { Contact } from '@/pages/CRM';

interface ProfessionalActivity {
  id: string;
  name: string;
}

interface ContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
  onSuccess: () => void;
}

export function ContactForm({ open, onOpenChange, contact, onSuccess }: ContactFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [activities, setActivities] = useState<ProfessionalActivity[]>([]);
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [newActivityName, setNewActivityName] = useState('');
  const [showNewActivity, setShowNewActivity] = useState(false);
  
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
    observations: '',
    tags: [] as string[]
  });

  useEffect(() => {
    const fetchActivities = async () => {
      const { data } = await supabase
        .from('crm_professional_activities')
        .select('*')
        .order('name');
      if (data) setActivities(data);
    };
    if (open) fetchActivities();
  }, [open]);

  useEffect(() => {
    if (contact && open) {
      // Fetch full contact data and activities
      const fetchContactData = async () => {
        const { data: fullContact } = await supabase
          .from('crm_contacts')
          .select('*')
          .eq('id', contact.id)
          .single();
        
        if (fullContact) {
          setFormData({
            name: fullContact.name || '',
            surname: fullContact.surname || '',
            email: fullContact.email || '',
            phone: fullContact.phone || '',
            contact_type: fullContact.contact_type || 'Persona',
            status: fullContact.status || 'Prospecto',
            address: fullContact.address || '',
            city: fullContact.city || '',
            province: fullContact.province || '',
            postal_code: fullContact.postal_code || '',
            country: fullContact.country || 'España',
            nif_dni: fullContact.nif_dni || '',
            website: fullContact.website || '',
            observations: fullContact.observations || '',
            tags: fullContact.tags || []
          });
        }

        // Fetch contact's professional activities
        const { data: contactActivities } = await supabase
          .from('crm_contact_professional_activities')
          .select('professional_activity_id')
          .eq('contact_id', contact.id);
        
        if (contactActivities) {
          setSelectedActivityIds(contactActivities.map(ca => ca.professional_activity_id));
        }
      };
      fetchContactData();
    } else if (!contact && open) {
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
        observations: '',
        tags: []
      });
      setSelectedActivityIds([]);
    }
  }, [contact, open]);

  const toggleActivity = (activityId: string) => {
    setSelectedActivityIds(prev => 
      prev.includes(activityId)
        ? prev.filter(id => id !== activityId)
        : [...prev, activityId]
    );
  };

  const handleAddTag = () => {
    const tag = newTag.trim();
    if (tag && !formData.tags.includes(tag)) {
      setFormData({ ...formData, tags: [...formData.tags, tag] });
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tagToRemove) });
  };

  const handleAddNewActivity = async () => {
    const name = newActivityName.trim();
    if (!name) return;

    try {
      const { data, error } = await supabase
        .from('crm_professional_activities')
        .insert({ name })
        .select()
        .single();

      if (error) throw error;

      setActivities([...activities, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedActivityIds([...selectedActivityIds, data.id]);
      setNewActivityName('');
      setShowNewActivity(false);
      toast({ title: 'Actividad profesional creada' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'El nombre es obligatorio', variant: 'destructive' });
      return;
    }

    setIsLoading(true);

    try {
      const dataToSave = {
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
        observations: formData.observations.trim() || null,
        tags: formData.tags.length > 0 ? formData.tags : null
      };

      let contactId = contact?.id;

      if (contact) {
        const { error } = await supabase
          .from('crm_contacts')
          .update(dataToSave)
          .eq('id', contact.id);

        if (error) throw error;
      } else {
        const { data: newContact, error } = await supabase
          .from('crm_contacts')
          .insert(dataToSave)
          .select()
          .single();

        if (error) throw error;
        contactId = newContact.id;
      }

      // Update professional activities (many-to-many)
      if (contactId) {
        // Delete existing activity links
        await supabase
          .from('crm_contact_professional_activities')
          .delete()
          .eq('contact_id', contactId);

        // Insert new activity links
        if (selectedActivityIds.length > 0) {
          const activityLinks = selectedActivityIds.map(activityId => ({
            contact_id: contactId,
            professional_activity_id: activityId
          }));

          const { error: linkError } = await supabase
            .from('crm_contact_professional_activities')
            .insert(activityLinks);

          if (linkError) throw linkError;
        }
      }

      toast({ title: contact ? 'Contacto actualizado correctamente' : 'Contacto creado correctamente' });
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

          {/* Professional Activities (Multiple) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Actividades Profesionales
            </Label>
            {!showNewActivity ? (
              <div className="space-y-2">
                <ScrollArea className="h-32 rounded-md border p-2">
                  {activities.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-2">No hay actividades definidas</p>
                  ) : (
                    <div className="space-y-2">
                      {activities.map(activity => (
                        <div key={activity.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`activity-${activity.id}`}
                            checked={selectedActivityIds.includes(activity.id)}
                            onCheckedChange={() => toggleActivity(activity.id)}
                          />
                          <label
                            htmlFor={`activity-${activity.id}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {activity.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                {selectedActivityIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedActivityIds.map(id => {
                      const activity = activities.find(a => a.id === id);
                      return activity ? (
                        <Badge key={id} variant="secondary" className="gap-1">
                          {activity.name}
                          <button
                            type="button"
                            onClick={() => toggleActivity(id)}
                            className="ml-1 hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ) : null;
                    })}
                  </div>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => setShowNewActivity(true)} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Actividad
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={newActivityName}
                  onChange={(e) => setNewActivityName(e.target.value)}
                  placeholder="Nueva actividad (ej: Arquitecto, Almacén...)"
                  maxLength={100}
                />
                <Button type="button" variant="default" onClick={handleAddNewActivity}>
                  Añadir
                </Button>
                <Button type="button" variant="outline" onClick={() => { setShowNewActivity(false); setNewActivityName(''); }}>
                  Cancelar
                </Button>
              </div>
            )}
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Etiquetas</Label>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Nueva etiqueta..."
                maxLength={50}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={handleAddTag}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {formData.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
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
