import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Inbox, Send, Users, Mail } from 'lucide-react';
import { BudgetEmailInbox } from './BudgetEmailInbox';
import { BudgetComposeEmail } from './BudgetComposeEmail';
import { BudgetContactsManager } from './BudgetContactsManager';

interface BudgetCommunicationsTabProps {
  budgetId: string;
  isAdmin: boolean;
}

export function BudgetCommunicationsTab({ budgetId, isAdmin }: BudgetCommunicationsTabProps) {
  const [activeSubTab, setActiveSubTab] = useState('contacts');
  const [replyToEmail, setReplyToEmail] = useState<any>(null);

  // Fetch budget contacts for the contact selector
  const { data: budgetContacts = [] } = useQuery({
    queryKey: ['budget-contacts-for-email', budgetId],
    queryFn: async () => {
      const { data } = await supabase
        .from('budget_contacts')
        .select(`
          id,
          contact_id,
          contact_role,
          crm_contacts (
            id,
            name,
            surname,
            email,
            phone,
            contact_type
          )
        `)
        .eq('budget_id', budgetId);
      
      return (data || []).map(bc => ({
        ...bc,
        contact: bc.crm_contacts
      }));
    },
  });

  // Get unique contacts with emails
  const contactsWithEmail = useMemo(() => {
    const seen = new Set<string>();
    return budgetContacts
      .filter(bc => bc.contact?.email && !seen.has(bc.contact.id) && seen.add(bc.contact.id))
      .map(bc => bc.contact!);
  }, [budgetContacts]);

  const handleComposeReply = (email: any) => {
    setReplyToEmail({
      email: email.direction === 'inbound' ? email.from_email : email.to_emails?.[0],
      subject: email.subject,
      contactId: email.contact_id,
      ticketId: email.ticket_id,
    });
    setActiveSubTab('compose');
  };

  const handleComposeForward = (email: any) => {
    setReplyToEmail({
      email: '',
      subject: email.subject ? `Fwd: ${email.subject}` : 'Fwd:',
      contactId: email.contact_id,
      ticketId: email.ticket_id,
      forwardEmailId: email.id,
      originalBody: email.body_html || email.body_text,
    });
    setActiveSubTab('compose');
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid w-full max-w-lg grid-cols-4">
          <TabsTrigger value="contacts" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Contactos</span>
          </TabsTrigger>
          <TabsTrigger value="inbox" className="gap-2">
            <Inbox className="h-4 w-4" />
            <span className="hidden sm:inline">Bandeja</span>
          </TabsTrigger>
          <TabsTrigger value="compose" className="gap-2">
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Redactar</span>
          </TabsTrigger>
          <TabsTrigger value="quick-send" className="gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Enviar a...</span>
          </TabsTrigger>
        </TabsList>

        {/* Contacts Tab - Full BudgetContactsManager */}
        <TabsContent value="contacts" className="mt-4">
          <BudgetContactsManager budgetId={budgetId} isAdmin={isAdmin} />
        </TabsContent>

        {/* Inbox Tab - Shows emails related to this budget */}
        <TabsContent value="inbox" className="mt-4">
          <BudgetEmailInbox 
            budgetId={budgetId}
            onComposeReply={handleComposeReply} 
            onComposeForward={handleComposeForward} 
          />
        </TabsContent>

        {/* Compose Tab */}
        <TabsContent value="compose" className="mt-4">
          <BudgetComposeEmail 
            budgetId={budgetId}
            budgetContacts={contactsWithEmail}
            replyTo={replyToEmail} 
            onSent={() => {
              setReplyToEmail(null);
              setActiveSubTab('inbox');
            }} 
          />
        </TabsContent>

        {/* Quick Send Tab - Contact list with quick email action */}
        <TabsContent value="quick-send" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4" />
                Enviar email a contacto del Presupuesto
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contactsWithEmail.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No hay contactos con email vinculados a este presupuesto.
                  Añade contactos en la pestaña "Contactos" para poder enviarles emails.
                </p>
              ) : (
                <div className="space-y-2">
                  {contactsWithEmail.map((contact) => (
                    <div 
                      key={contact.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                      onClick={() => {
                        setReplyToEmail({ email: contact.email, contactId: contact.id });
                        setActiveSubTab('compose');
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">
                          {contact.name} {contact.surname || ''}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {contact.email}
                        </p>
                      </div>
                      <Send className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
