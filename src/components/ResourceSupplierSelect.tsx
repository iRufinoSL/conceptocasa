import { useState, useEffect } from 'react';
import { Check, ChevronsUpDown, Plus, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { ContactForm } from '@/components/crm/ContactForm';

interface Contact {
  id: string;
  name: string;
  surname: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  contact_type: string;
  status: string;
}

interface ResourceSupplierSelectProps {
  value: string | null;
  onChange: (value: string | null, contact: Contact | null) => void;
}

export function ResourceSupplierSelect({ value, onChange }: ResourceSupplierSelectProps) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewContactDialog, setShowNewContactDialog] = useState(false);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('crm_contacts')
        .select('id, name, surname, email, phone, city, contact_type, status')
        .order('name');

      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  const selectedContact = contacts.find(c => c.id === value);

  const getContactLabel = (contact: Contact) => {
    const fullName = contact.surname 
      ? `${contact.name} ${contact.surname}` 
      : contact.name;
    return contact.city ? `${fullName} (${contact.city})` : fullName;
  };

  const handleNewContactSaved = async () => {
    await fetchContacts();
    setShowNewContactDialog(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {selectedContact ? (
              <span className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                {getContactLabel(selectedContact)}
              </span>
            ) : (
              <span className="text-muted-foreground">Seleccionar suministrador...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar contacto..." />
            <CommandList>
              <CommandEmpty>
                <div className="py-4 text-center text-sm text-muted-foreground">
                  No se encontraron contactos.
                </div>
              </CommandEmpty>
              <CommandGroup>
                {/* Option to clear selection */}
                {value && (
                  <CommandItem
                    value="__clear__"
                    onSelect={() => {
                      onChange(null, null);
                      setOpen(false);
                    }}
                    className="text-muted-foreground"
                  >
                    <span className="italic">Sin suministrador</span>
                  </CommandItem>
                )}
                {/* New contact option */}
                <CommandItem
                  value="__new__"
                  onSelect={() => {
                    setOpen(false);
                    setShowNewContactDialog(true);
                  }}
                  className="text-accent"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Crear nuevo contacto
                </CommandItem>
                {/* Contact list */}
                {contacts.map((contact) => (
                  <CommandItem
                    key={contact.id}
                    value={`${contact.name} ${contact.surname || ''} ${contact.city || ''}`}
                    onSelect={() => {
                      onChange(contact.id, contact);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === contact.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{getContactLabel(contact)}</span>
                      {contact.email && (
                        <span className="text-xs text-muted-foreground">{contact.email}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* New Contact Dialog */}
      <ContactForm
        open={showNewContactDialog}
        onOpenChange={setShowNewContactDialog}
        contact={null}
        onSuccess={handleNewContactSaved}
      />
    </>
  );
}
