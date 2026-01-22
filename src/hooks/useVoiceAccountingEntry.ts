import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface VoiceEntryData {
  entry_type: 'pago' | 'cobro' | 'compra' | 'venta';
  entry_date: string;
  amount: number;
  recipient_name: string;
  treasury_account: string;
  description: string;
  budget_name?: string;
}

const PROVISIONAL_ACCOUNT_NAME = 'Cuenta Pendiente de Asignarse';

export function useVoiceAccountingEntry() {
  
  const findOrCreateProvisionalAccount = useCallback(async () => {
    // First try to find existing provisional account
    const { data: existing } = await supabase
      .from('accounting_accounts')
      .select('id, name')
      .eq('name', PROVISIONAL_ACCOUNT_NAME)
      .single();
    
    if (existing) return existing.id;
    
    // Create if not exists
    const { data: created, error } = await supabase
      .from('accounting_accounts')
      .insert({ name: PROVISIONAL_ACCOUNT_NAME, account_type: 'Compras y gastos' })
      .select('id')
      .single();
    
    if (error) throw error;
    return created.id;
  }, []);
  
  const findAccountByName = useCallback(async (name: string, accountType?: string) => {
    // Try exact match first
    let query = supabase
      .from('accounting_accounts')
      .select('id, name, account_type')
      .ilike('name', name);
    
    if (accountType) {
      query = query.eq('account_type', accountType);
    }
    
    const { data: exactMatch } = await query.maybeSingle();
    if (exactMatch) return exactMatch.id;
    
    // Try partial match
    const { data: partialMatches } = await supabase
      .from('accounting_accounts')
      .select('id, name, account_type')
      .ilike('name', `%${name}%`);
    
    if (partialMatches && partialMatches.length > 0) {
      // If looking for treasury, prioritize Tesorería type
      if (accountType === 'Tesorería') {
        const treasuryMatch = partialMatches.find(a => a.account_type === 'Tesorería');
        if (treasuryMatch) return treasuryMatch.id;
      }
      return partialMatches[0].id;
    }
    
    return null;
  }, []);
  
  const createEntryFromVoice = useCallback(async (voiceData: VoiceEntryData) => {
    try {
      // Find or create accounts
      const treasuryAccountId = await findAccountByName(voiceData.treasury_account, 'Tesorería');
      const recipientAccountId = await findAccountByName(voiceData.recipient_name);
      
      let usedProvisionalAccount = false;
      let finalTreasuryId = treasuryAccountId;
      let finalRecipientId = recipientAccountId;
      
      // If accounts not found, use provisional
      if (!treasuryAccountId) {
        finalTreasuryId = await findOrCreateProvisionalAccount();
        usedProvisionalAccount = true;
        toast.warning(`Cuenta de tesorería "${voiceData.treasury_account}" no encontrada, se usará cuenta provisional`);
      }
      
      if (!recipientAccountId) {
        finalRecipientId = await findOrCreateProvisionalAccount();
        usedProvisionalAccount = true;
        toast.warning(`Cuenta "${voiceData.recipient_name}" no encontrada, se usará cuenta provisional`);
      }
      
      // Find budget (use first available if not specified)
      let budgetId: string | null = null;
      if (voiceData.budget_name) {
        const { data: budget } = await supabase
          .from('presupuestos')
          .select('id')
          .ilike('nombre', `%${voiceData.budget_name}%`)
          .eq('archived', false)
          .limit(1)
          .single();
        
        if (budget) budgetId = budget.id;
      }
      
      if (!budgetId) {
        const { data: defaultBudget } = await supabase
          .from('presupuestos')
          .select('id')
          .eq('archived', false)
          .limit(1)
          .single();
        
        if (defaultBudget) budgetId = defaultBudget.id;
      }
      
      if (!budgetId) {
        throw new Error('No hay presupuestos disponibles');
      }
      
      // Generate entry code
      const entryYear = new Date(voiceData.entry_date).getFullYear();
      const { data: entryCode, error: codeError } = await supabase
        .rpc('generate_entry_code', { entry_year: entryYear });
      
      if (codeError) throw codeError;
      
      // Create accounting entry
      const { data: entry, error: entryError } = await supabase
        .from('accounting_entries')
        .insert({
          code: entryCode,
          description: voiceData.description,
          entry_date: voiceData.entry_date,
          budget_id: budgetId,
          total_amount: voiceData.amount,
          entry_type: voiceData.entry_type,
          has_provisional_account: usedProvisionalAccount
        })
        .select('id')
        .single();
      
      if (entryError) throw entryError;
      
      // Create entry lines based on entry type
      const lines = [];
      
      if (voiceData.entry_type === 'pago') {
        // Pago: Debe = Proveedor/Gasto, Haber = Tesorería
        lines.push({
          entry_id: entry.id,
          account_id: finalRecipientId,
          description: `Pago a ${voiceData.recipient_name}`,
          debit_amount: voiceData.amount,
          credit_amount: 0
        });
        lines.push({
          entry_id: entry.id,
          account_id: finalTreasuryId,
          description: `Salida de ${voiceData.treasury_account}`,
          debit_amount: 0,
          credit_amount: voiceData.amount
        });
      } else if (voiceData.entry_type === 'cobro') {
        // Cobro: Debe = Tesorería, Haber = Cliente/Ingreso
        lines.push({
          entry_id: entry.id,
          account_id: finalTreasuryId,
          description: `Entrada a ${voiceData.treasury_account}`,
          debit_amount: voiceData.amount,
          credit_amount: 0
        });
        lines.push({
          entry_id: entry.id,
          account_id: finalRecipientId,
          description: `Cobro de ${voiceData.recipient_name}`,
          debit_amount: 0,
          credit_amount: voiceData.amount
        });
      }
      
      if (lines.length > 0) {
        const { error: linesError } = await supabase
          .from('accounting_entry_lines')
          .insert(lines);
        
        if (linesError) throw linesError;
      }
      
      toast.success(`Asiento ${entryCode} creado correctamente`);
      
      return { 
        success: true, 
        entryCode, 
        hasProvisionalAccount: usedProvisionalAccount 
      };
      
    } catch (error) {
      console.error('Error creating voice entry:', error);
      const message = error instanceof Error ? error.message : 'Error desconocido';
      toast.error(`Error al crear asiento: ${message}`);
      return { success: false, error: message };
    }
  }, [findAccountByName, findOrCreateProvisionalAccount]);
  
  return { createEntryFromVoice };
}
