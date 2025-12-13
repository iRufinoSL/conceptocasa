import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Trash2, Users } from 'lucide-react';

interface Contact {
  id: string;
  name: string;
  surname: string | null;
  contact_type: string;
  email: string | null;
  phone: string | null;
}

interface ProjectContact {
  id: string;
  contact_id: string;
  contact_role: string | null;
  contact?: Contact;
}

interface ProjectContactsManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}

const CONTACT_ROLES = [
  'Cliente',
  'Arquitecto',
  'Aparejador',
  'Constructor',
  'Proveedor',
  'Subcontratista',
  'Asesor',
  'Contacto'
];

export function ProjectContactsManager({ open, onOpenChange, projectId, projectName }: ProjectContactsManagerProps) {
  const { toast } = useToast();
  const [projectContacts, setProjectContacts] = useState<ProjectContact[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [selectedRole, setSelectedRole] = useState('Contacto');
  const [isAdding, setIsAdding] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    
    // Fetch project contacts with contact details
    const { data: pcData } = await supabase
      .from('project_contacts')
      .select('id, contact_id, contact_role')
      .eq('project_id', projectId);

    // Fetch all contacts
    const { data: contactsData } = await supabase
      .from('crm_contacts')
      .select('id, name, surname, contact_type, email, phone')
      .order('name');

    if (contactsData) {
      setAllContacts(contactsData);
    }

    if (pcData && contactsData) {
      const enrichedContacts = pcData.map(pc => ({
        ...pc,
        contact: contactsData.find(c => c.id === pc.contact_id)
      }));
      setProjectContacts(enrichedContacts);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    if (open && projectId) {
      fetchData();
    }
  }, [open, projectId]);

  const handleAddContact = async () => {
    if (!selectedContactId) {
      toast({ title: 'Error', description: 'Selecciona un contacto', variant: 'destructive' });
      return;
    }

    // Check if already linked
    if (projectContacts.some(pc => pc.contact_id === selectedContactId)) {
      toast({ title: 'Error', description: 'Este contacto ya está vinculado al proyecto', variant: 'destructive' });
      return;
    }

    setIsAdding(true);

    try {
      const { error } = await supabase
        .from('project_contacts')
        .insert({
          project_id: projectId,
          contact_id: selectedContactId,
          contact_role: selectedRole
        });

      if (error) throw error;

      toast({ title: 'Contacto vinculado correctamente' });
      setSelectedContactId('');
      setSelectedRole('Contacto');
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveContact = async (projectContactId: string) => {
    try {
      const { error } = await supabase
        .from('project_contacts')
        .delete()
        .eq('id', projectContactId);

      if (error) throw error;

      toast({ title: 'Contacto desvinculado' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const getInitials = (name: string, surname?: string | null) => {
    const first = name.charAt(0).toUpperCase();
    const second = surname ? surname.charAt(0).toUpperCase() : name.charAt(1)?.toUpperCase() || '';
    return first + second;
  };

  const getRoleColor = (role: string | null) => {
    switch (role) {
      case 'Cliente': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'Arquitecto': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'Aparejador': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'Constructor': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'Proveedor': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // Available contacts (not already linked)
  const availableContacts = allContacts.filter(
    c => !projectContacts.some(pc => pc.contact_id === c.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Contactos del proyecto
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{projectName}</p>
        </DialogHeader>

        {/* Add Contact Form */}
        <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
          <p className="text-sm font-medium">Añadir contacto</p>
          <div className="flex gap-2">
            <Select value={selectedContactId} onValueChange={setSelectedContactId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Seleccionar contacto..." />
              </SelectTrigger>
              <SelectContent>
                {availableContacts.length === 0 ? (
                  <SelectItem value="" disabled>No hay contactos disponibles</SelectItem>
                ) : (
                  availableContacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.name} {contact.surname} ({contact.contact_type})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>{role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAddContact} disabled={isAdding || !selectedContactId}>
              <Plus className="h-4 w-4 mr-1" />
              Añadir
            </Button>
          </div>
        </div>

        {/* Linked Contacts List */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Contactos vinculados ({projectContacts.length})</p>
          
          {isLoading ? (
            <div className="py-8 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : projectContacts.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay contactos vinculados</p>
            </div>
          ) : (
            <div className="space-y-2">
              {projectContacts.map((pc) => (
                <div 
                  key={pc.id}
                  className="flex items-center gap-3 p-3 bg-card border rounded-lg group"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {pc.contact ? getInitials(pc.contact.name, pc.contact.surname) : '??'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {pc.contact ? `${pc.contact.name} ${pc.contact.surname || ''}` : 'Contacto no encontrado'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={`text-xs ${getRoleColor(pc.contact_role)}`}>
                        {pc.contact_role || 'Contacto'}
                      </Badge>
                      {pc.contact?.contact_type && (
                        <span className="text-xs text-muted-foreground">
                          {pc.contact.contact_type}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                    onClick={() => handleRemoveContact(pc.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
