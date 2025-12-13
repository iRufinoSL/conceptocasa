import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Search, Users, ClipboardList, Target } from 'lucide-react';
import { ContactsTab } from '@/components/crm/ContactsTab';
import { ManagementsTab } from '@/components/crm/ManagementsTab';
import { OpportunitiesTab } from '@/components/crm/OpportunitiesTab';

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
  const { user, loading, rolesLoading } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [managements, setManagements] = useState<Management[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('contacts');

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
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

    if (user) {
      fetchData();
    }
  }, [user]);

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
            <ContactsTab contacts={contacts} searchTerm={searchTerm} />
          </TabsContent>

          <TabsContent value="managements">
            <ManagementsTab managements={managements} searchTerm={searchTerm} />
          </TabsContent>

          <TabsContent value="opportunities">
            <OpportunitiesTab 
              opportunities={opportunities} 
              contacts={contacts}
              searchTerm={searchTerm} 
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
