import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Search, Users, ClipboardList, Target, Plus } from 'lucide-react';
import { ContactsTab } from '@/components/crm/ContactsTab';
import { ManagementsTab } from '@/components/crm/ManagementsTab';
import { OpportunitiesTab } from '@/components/crm/OpportunitiesTab';
import { ContactForm } from '@/components/crm/ContactForm';
import { ManagementForm } from '@/components/crm/ManagementForm';
import { OpportunityForm } from '@/components/crm/OpportunityForm';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { useToast } from '@/hooks/use-toast';
import { AppNavDropdown } from '@/components/AppNavDropdown';

export interface Contact {
  id: string;
  name: string;
  surname: string | null;
  email: string | null;
  phone: string | null;
  contact_type: string;
  status: string;
  city: string | null;
  tags: string[] | null;
  professional_activity_id: string | null;
}

export interface Management {
  id: string;
  title: string;
  description: string | null;
  management_type: string;
  status: string;
  target_date: string | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string | null;
}

export interface Opportunity {
  id: string;
  name: string;
  description: string | null;
  contact_id: string | null;
  created_at: string | null;
}

export default function CRM() {
  const navigate = useNavigate();
  const { user, loading, rolesLoading, isAdmin } = useAuth();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [managements, setManagements] = useState<Management[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('contacts');

  // Form states
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [managementFormOpen, setManagementFormOpen] = useState(false);
  const [opportunityFormOpen, setOpportunityFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editingManagement, setEditingManagement] = useState<Management | null>(null);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);

  // Delete states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; item: any } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const fetchData = async () => {
    const [contactsRes, managementsRes, opportunitiesRes] = await Promise.all([
      supabase.from('crm_contacts').select('*').order('name'),
      supabase.from('crm_managements').select('*').order('target_date', { ascending: false }),
      supabase.from('crm_opportunities').select('*').order('created_at', { ascending: false })
    ]);

    if (contactsRes.data) setContacts(contactsRes.data);
    if (managementsRes.data) setManagements(managementsRes.data);
    if (opportunitiesRes.data) setOpportunities(opportunitiesRes.data);
    setIsLoading(false);
  };

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const handleAddNew = () => {
    if (activeTab === 'contacts') {
      setEditingContact(null);
      setContactFormOpen(true);
    } else if (activeTab === 'managements') {
      setEditingManagement(null);
      setManagementFormOpen(true);
    } else {
      setEditingOpportunity(null);
      setOpportunityFormOpen(true);
    }
  };

  const handleEditContact = (contact: Contact) => {
    setEditingContact(contact);
    setContactFormOpen(true);
  };

  const handleEditManagement = (management: Management) => {
    setEditingManagement(management);
    setManagementFormOpen(true);
  };

  const handleEditOpportunity = (opportunity: Opportunity) => {
    setEditingOpportunity(opportunity);
    setOpportunityFormOpen(true);
  };

  const handleDeleteContact = (contact: Contact) => {
    setDeleteTarget({ type: 'contact', item: contact });
    setDeleteDialogOpen(true);
  };

  const handleDeleteManagement = (management: Management) => {
    setDeleteTarget({ type: 'management', item: management });
    setDeleteDialogOpen(true);
  };

  const handleDeleteOpportunity = (opportunity: Opportunity) => {
    setDeleteTarget({ type: 'opportunity', item: opportunity });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);

    try {
      let error;
      if (deleteTarget.type === 'contact') {
        ({ error } = await supabase.from('crm_contacts').delete().eq('id', deleteTarget.item.id));
      } else if (deleteTarget.type === 'management') {
        ({ error } = await supabase.from('crm_managements').delete().eq('id', deleteTarget.item.id));
      } else {
        ({ error } = await supabase.from('crm_opportunities').delete().eq('id', deleteTarget.item.id));
      }

      if (error) throw error;

      toast({ title: 'Elemento eliminado correctamente' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  const getDeleteMessage = () => {
    if (!deleteTarget) return '';
    switch (deleteTarget.type) {
      case 'contact': return `¿Eliminar el contacto "${deleteTarget.item.name}"?`;
      case 'management': return `¿Eliminar la gestión "${deleteTarget.item.title}"?`;
      case 'opportunity': return `¿Eliminar la oportunidad "${deleteTarget.item.name}"?`;
      default: return '¿Eliminar este elemento?';
    }
  };

  const canEdit = isAdmin();

  if (loading || rolesLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <AppNavDropdown />
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">CRM</h1>
              <p className="text-sm text-muted-foreground">
                Gestión de contactos y clientes
              </p>
            </div>
          </div>
          {canEdit && (
            <Button onClick={handleAddNew} className="gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">
                {activeTab === 'contacts' ? 'Nuevo Contacto' : 
                 activeTab === 'managements' ? 'Nueva Gestión' : 'Nueva Oportunidad'}
              </span>
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar en CRM..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 max-w-md"
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="contacts" className="gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Contactos</span>
              <span className="text-xs text-muted-foreground">({contacts.length})</span>
            </TabsTrigger>
            <TabsTrigger value="managements" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Gestiones</span>
              <span className="text-xs text-muted-foreground">({managements.length})</span>
            </TabsTrigger>
            <TabsTrigger value="opportunities" className="gap-2">
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">Oportunidades</span>
              <span className="text-xs text-muted-foreground">({opportunities.length})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contacts">
            <ContactsTab 
              contacts={contacts} 
              searchTerm={searchTerm}
              onEdit={handleEditContact}
              onDelete={handleDeleteContact}
            />
          </TabsContent>

          <TabsContent value="managements">
            <ManagementsTab 
              managements={managements} 
              searchTerm={searchTerm}
              onEdit={handleEditManagement}
              onDelete={handleDeleteManagement}
            />
          </TabsContent>

          <TabsContent value="opportunities">
            <OpportunitiesTab 
              opportunities={opportunities} 
              contacts={contacts}
              searchTerm={searchTerm}
              onEdit={handleEditOpportunity}
              onDelete={handleDeleteOpportunity}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* Forms */}
      <ContactForm
        open={contactFormOpen}
        onOpenChange={setContactFormOpen}
        contact={editingContact}
        onSuccess={fetchData}
      />
      <ManagementForm
        open={managementFormOpen}
        onOpenChange={setManagementFormOpen}
        management={editingManagement}
        onSuccess={fetchData}
      />
      <OpportunityForm
        open={opportunityFormOpen}
        onOpenChange={setOpportunityFormOpen}
        opportunity={editingOpportunity}
        contacts={contacts}
        onSuccess={fetchData}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Confirmar eliminación"
        description={getDeleteMessage()}
        isDeleting={isDeleting}
      />
    </div>
  );
}
