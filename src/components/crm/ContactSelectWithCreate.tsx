import { useState, useEffect } from 'react';
import { Check, ChevronsUpDown, Plus, User, X } from 'lucide-react';
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
import { normalizeSearchText } from '@/lib/search-utils';

interface Contact {
  id: string;
  name: string;
  surname: string | null;
  email: string | null;
  city: string | null;
}

interface ContactSelectWithCreateProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  clearLabel?: string;
}

export function ContactSelectWithCreate({ 
  value, 
  onChange, 
  placeholder = "Seleccionar contacto...",
  allowClear = true,
  clearLabel = "Sin contacto"
}: ContactSelectWithCreateProps) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewContactDialog, setShowNewContactDialog] = useState(false);
  const [relatedNamesMap, setRelatedNamesMap] = useState<Record<string, string>>({});

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('crm_contacts')
        .select('id, name, surname, email, city')
        .order('name');

      if (error) throw error;
      setContacts(data || []);

      // Fetch related contacts for search
      if (data && data.length > 0) {
        const { data: relations } = await supabase
          .from('crm_contact_relations')
          .select('contact_id_a, contact_id_b');
        if (relations && relations.length > 0) {
          const nameMap: Record<string, string> = {};
          data.forEach(c => { nameMap[c.id] = `${c.name} ${c.surname || ''}`.trim(); });

          const relMap: Record<string, string[]> = {};
          relations.forEach(rel => {
            const nameB = nameMap[rel.contact_id_b];
            const nameA = nameMap[rel.contact_id_a];
            if (nameB) {
              if (!relMap[rel.contact_id_a]) relMap[rel.contact_id_a] = [];
              relMap[rel.contact_id_a].push(nameB);
            }
            if (nameA) {
              if (!relMap[rel.contact_id_b]) relMap[rel.contact_id_b] = [];
              relMap[rel.contact_id_b].push(nameA);
            }
          });
          const flatMap: Record<string, string> = {};
          Object.entries(relMap).forEach(([id, names]) => { flatMap[id] = names.join(' '); });
          setRelatedNamesMap(flatMap);
        }
      }
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

  const handleNewContactSaved = async (newContactId?: string) => {
    await fetchContacts();
    setShowNewContactDialog(false);
    // Select the newly created contact using the passed ID
    if (newContactId) {
      onChange(newContactId);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-10 font-normal"
          >
            {selectedContact ? (
              <span className="flex items-center gap-2 truncate">
                <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="truncate">{getContactLabel(selectedContact)}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[350px] p-0 bg-popover z-50" align="start">
          <Command 
            className="bg-popover"
            filter={(value, search) => {
              const normalizedValue = normalizeSearchText(value);
              const normalizedSearch = normalizeSearchText(search);
              return normalizedValue.includes(normalizedSearch) ? 1 : 0;
            }}
          >
            <CommandInput placeholder="Buscar contacto..." />
            <CommandList className="max-h-[300px]">
              <CommandEmpty>
                <div className="py-4 text-center">
                  <p className="text-sm text-muted-foreground mb-3">
                    No se encontraron contactos.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setOpen(false);
                      setShowNewContactDialog(true);
                    }}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Crear nuevo contacto
                  </Button>
                </div>
              </CommandEmpty>
              <CommandGroup>
                {/* New contact option - always visible at top */}
                <CommandItem
                  value="__new_contact__"
                  onSelect={() => {
                    setOpen(false);
                    setShowNewContactDialog(true);
                  }}
                  className="text-primary font-medium border-b border-border mb-1 rounded-none"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Crear nuevo contacto
                </CommandItem>
                {/* Option to clear selection */}
                {allowClear && (
                  <CommandItem
                    value="__clear__"
                    onSelect={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                    className="text-muted-foreground italic"
                  >
                    <X className="mr-2 h-4 w-4 opacity-50" />
                    {clearLabel}
                  </CommandItem>
                )}
                {/* Contact list */}
                {contacts.map((contact) => (
                  <CommandItem
                    key={contact.id}
                    value={`${contact.name} ${contact.surname || ''} ${contact.city || ''} ${contact.email || ''} ${relatedNamesMap[contact.id] || ''}`}
                    onSelect={() => {
                      onChange(contact.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 flex-shrink-0",
                        value === contact.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{getContactLabel(contact)}</span>
                      {contact.email && (
                        <span className="text-xs text-muted-foreground truncate">{contact.email}</span>
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
