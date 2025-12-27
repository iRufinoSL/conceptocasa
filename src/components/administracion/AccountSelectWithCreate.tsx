import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';

interface AccountingAccount {
  id: string;
  name: string;
  account_type: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  accounts: AccountingAccount[];
  onAccountCreated?: () => void;
  placeholder?: string;
}

const ACCOUNT_TYPES = [
  'Activo',
  'Pasivo',
  'Patrimonio',
  'Ingresos',
  'Gastos',
];

export function AccountSelectWithCreate({ 
  value, 
  onChange, 
  accounts, 
  onAccountCreated,
  placeholder = 'Cuenta...'
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newAccount, setNewAccount] = useState({
    name: '',
    account_type: 'Gastos'
  });

  const filteredAccounts = useMemo(() => {
    if (!searchQuery.trim()) return accounts;
    const query = searchQuery.toLowerCase();
    return accounts.filter(account =>
      account.name.toLowerCase().includes(query) ||
      account.account_type.toLowerCase().includes(query)
    );
  }, [accounts, searchQuery]);

  const handleCreateAccount = async () => {
    if (!newAccount.name.trim()) {
      toast.error('El nombre de la cuenta es obligatorio');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('accounting_accounts')
        .insert({
          name: newAccount.name.trim(),
          account_type: newAccount.account_type
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Cuenta contable creada');
      setShowCreateDialog(false);
      setNewAccount({ name: '', account_type: 'Gastos' });
      
      // Select the new account
      if (data) {
        onChange(data.id);
      }
      
      onAccountCreated?.();
    } catch (error) {
      console.error('Error creating account:', error);
      toast.error('Error al crear la cuenta contable');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenCreateWithSearch = () => {
    setNewAccount({
      name: searchQuery,
      account_type: 'Gastos'
    });
    setShowCreateDialog(true);
  };

  return (
    <>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cuenta..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          
          {filteredAccounts.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                No se encontraron cuentas{searchQuery && ` para "${searchQuery}"`}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenCreateWithSearch}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Crear nueva cuenta
              </Button>
            </div>
          ) : (
            <>
              {filteredAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name} ({account.account_type})
                </SelectItem>
              ))}
              <div className="p-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenCreateWithSearch}
                  className="w-full gap-2 justify-start"
                >
                  <Plus className="h-4 w-4" />
                  Crear nueva cuenta
                </Button>
              </div>
            </>
          )}
        </SelectContent>
      </Select>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Cuenta Contable</DialogTitle>
            <DialogDescription>
              Crear una nueva cuenta contable para usar en los apuntes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-account-name">Nombre de la cuenta *</Label>
              <Input
                id="new-account-name"
                value={newAccount.name}
                onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                placeholder="Ej: Gastos de oficina"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-account-type">Tipo de cuenta</Label>
              <Select
                value={newAccount.account_type}
                onValueChange={(value) => setNewAccount({ ...newAccount, account_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateAccount} disabled={saving}>
              {saving ? 'Creando...' : 'Crear cuenta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}