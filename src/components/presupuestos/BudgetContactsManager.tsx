import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Trash2, Users, Building2 } from 'lucide-react';

interface Contact {
  id: string;
  name: string;
  surname: string | null;
  contact_type: string;
  email: string | null;
  phone: string | null;
  city: string | null;
}

interface BudgetContact {
  id: string;
  contact_id: string;
  contact_role: 'cliente' | 'proveedor';
  contact?: Contact;
}

interface BudgetContactsManagerProps {
  budgetId: string;
  isAdmin: boolean;
}

export function BudgetContactsManager({ budgetId, isAdmin }: BudgetContactsManagerProps) {
  const { toast } = useToast();
  const [budgetContacts, setBudgetContacts] = useState<BudgetContact[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [isAddingProvider, setIsAddingProvider] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    
    // Fetch budget contacts
    const { data: bcData } = await supabase
      .from('budget_contacts')
      .select('id, contact_id, contact_role')
      .eq('budget_id', budgetId);

    // Fetch all contacts
    const { data: contactsData } = await supabase
      .from('crm_contacts')
      .select('id, name, surname, contact_type, email, phone, city')
      .order('name');

    if (contactsData) {
      setAllContacts(contactsData);
    }

    if (bcData && contactsData) {
      const enrichedContacts = bcData.map(bc => ({
        ...bc,
        contact_role: bc.contact_role as 'cliente' | 'proveedor',
        contact: contactsData.find(c => c.id === bc.contact_id)
      }));
      setBudgetContacts(enrichedContacts);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    if (budgetId) {
      fetchData();
    }
  }, [budgetId]);

  const handleAddContact = async (role: 'cliente' | 'proveedor') => {
    const contactId = role === 'cliente' ? selectedClientId : selectedProviderId;
    const setIsAdding = role === 'cliente' ? setIsAddingClient : setIsAddingProvider;
    const setSelectedId = role === 'cliente' ? setSelectedClientId : setSelectedProviderId;
    
    if (!contactId) {
      toast({ title: 'Error', description: 'Selecciona un contacto', variant: 'destructive' });
      return;
    }

    // Check if already linked with same role
    if (budgetContacts.some(bc => bc.contact_id === contactId && bc.contact_role === role)) {
      toast({ title: 'Error', description: `Este contacto ya está vinculado como ${role}`, variant: 'destructive' });
      return;
    }

    setIsAdding(true);

    try {
      const { error } = await supabase
        .from('budget_contacts')
        .insert({
          budget_id: budgetId,
          contact_id: contactId,
          contact_role: role
        });

      if (error) throw error;

      toast({ title: `${role === 'cliente' ? 'Cliente' : 'Proveedor'} añadido correctamente` });
      setSelectedId('');
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveContact = async (budgetContactId: string, role: string) => {
    try {
      const { error } = await supabase
        .from('budget_contacts')
        .delete()
        .eq('id', budgetContactId);

      if (error) throw error;

      toast({ title: `${role === 'cliente' ? 'Cliente' : 'Proveedor'} eliminado` });
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

  const clients = budgetContacts.filter(bc => bc.contact_role === 'cliente');
  const providers = budgetContacts.filter(bc => bc.contact_role === 'proveedor');

  // Available contacts (not already linked as client/provider respectively)
  const availableClients = allContacts.filter(
    c => !clients.some(bc => bc.contact_id === c.id)
  );
  const availableProviders = allContacts.filter(
    c => !providers.some(bc => bc.contact_id === c.id)
  );

  const ContactList = ({ contacts, role }: { contacts: BudgetContact[], role: 'cliente' | 'proveedor' }) => (
    <div className="space-y-2">
      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No hay {role === 'cliente' ? 'clientes' : 'proveedores'} asignados
        </p>
      ) : (
        contacts.map((bc) => (
          <div 
            key={bc.id}
            className="flex items-center gap-3 p-3 bg-card border rounded-lg group"
          >
            <Avatar className="h-9 w-9">
              <AvatarFallback className={`text-xs ${role === 'cliente' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'}`}>
                {bc.contact ? getInitials(bc.contact.name, bc.contact.surname) : '??'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">
                {bc.contact ? `${bc.contact.name} ${bc.contact.surname || ''}` : 'Contacto no encontrado'}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {bc.contact?.email && <span>{bc.contact.email}</span>}
                {bc.contact?.city && <span>• {bc.contact.city}</span>}
              </div>
            </div>
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                onClick={() => handleRemoveContact(bc.id, role)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))
      )}
    </div>
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cliente y Proveedor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Cliente y Proveedor
        </CardTitle>
        <CardDescription>
          Vincula contactos del CRM como cliente o proveedor de este presupuesto
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Clients Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-800">
              <Users className="h-3 w-3 mr-1" />
              Clientes ({clients.length})
            </Badge>
          </div>
          
          {isAdmin && (
            <div className="flex gap-2">
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Seleccionar cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {availableClients.length === 0 ? (
                    <SelectItem value="none" disabled>No hay contactos disponibles</SelectItem>
                  ) : (
                    availableClients.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.name} {contact.surname} ({contact.contact_type})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button 
                onClick={() => handleAddContact('cliente')} 
                disabled={isAddingClient || !selectedClientId}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                Añadir
              </Button>
            </div>
          )}
          
          <ContactList contacts={clients} role="cliente" />
        </div>

        <Separator />

        {/* Providers Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800">
              <Building2 className="h-3 w-3 mr-1" />
              Proveedores ({providers.length})
            </Badge>
          </div>
          
          {isAdmin && (
            <div className="flex gap-2">
              <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Seleccionar proveedor..." />
                </SelectTrigger>
                <SelectContent>
                  {availableProviders.length === 0 ? (
                    <SelectItem value="none" disabled>No hay contactos disponibles</SelectItem>
                  ) : (
                    availableProviders.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.name} {contact.surname} ({contact.contact_type})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button 
                onClick={() => handleAddContact('proveedor')} 
                disabled={isAddingProvider || !selectedProviderId}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                Añadir
              </Button>
            </div>
          )}
          
          <ContactList contacts={providers} role="proveedor" />
        </div>
      </CardContent>
    </Card>
  );
}
