import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wallet, ArrowLeft, BookOpen, FileSpreadsheet, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppNavDropdown } from '@/components/AppNavDropdown';
import { AccountingEntriesTab } from '@/components/administracion/AccountingEntriesTab';
import { AccountingAccountsTab } from '@/components/administracion/AccountingAccountsTab';

export default function Administracion() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate('/auth');
        return;
      }

      // Check if user is admin
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      const hasAdminRole = roles?.some(r => r.role === 'administrador');
      
      if (!hasAdminRole) {
        navigate('/dashboard');
        return;
      }

      setIsAdmin(true);
    } catch (error) {
      console.error('Error checking auth:', error);
      navigate('/auth');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <AppNavDropdown />
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Wallet className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Administración</h1>
              <p className="text-sm text-muted-foreground">
                Contabilidad y facturación
              </p>
            </div>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="entries" className="space-y-6">
          <TabsList>
            <TabsTrigger value="entries" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Asientos
            </TabsTrigger>
            <TabsTrigger value="accounts" className="gap-2">
              <Calculator className="h-4 w-4" />
              Cuentas Contables
            </TabsTrigger>
          </TabsList>

          <TabsContent value="entries">
            <AccountingEntriesTab />
          </TabsContent>

          <TabsContent value="accounts">
            <AccountingAccountsTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
