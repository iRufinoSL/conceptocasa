import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Download, Search, Phone, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { searchMatch } from '@/lib/search-utils';
import type { Contact } from '@/pages/CRM';

interface ExportContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
}

function getInitials(name: string, surname?: string | null): string {
  const first = name?.charAt(0) || '';
  const second = surname?.charAt(0) || name?.charAt(1) || '';
  return (first + second).toUpperCase();
}

function escapeVCardValue(value: string | null | undefined): string {
  if (!value) return '';
  // Escape special characters in vCard format
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function formatPhoneForVCard(phone: string | null | undefined): string {
  if (!phone) return '';
  // Clean phone number but keep + for international format
  return phone.replace(/[^\d+]/g, '');
}

function generateVCard(contact: Contact): string {
  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
  ];

  // Full name
  const fullName = [contact.name, contact.surname].filter(Boolean).join(' ');
  lines.push(`FN:${escapeVCardValue(fullName)}`);

  // Structured name: N:LastName;FirstName;MiddleName;Prefix;Suffix
  lines.push(`N:${escapeVCardValue(contact.surname || '')};${escapeVCardValue(contact.name)};;;`);

  // Phone
  if (contact.phone) {
    lines.push(`TEL;TYPE=CELL:${formatPhoneForVCard(contact.phone)}`);
  }

  // Email
  if (contact.email) {
    lines.push(`EMAIL;TYPE=INTERNET:${escapeVCardValue(contact.email)}`);
  }

  // Address
  if (contact.address || contact.city || contact.province || contact.postal_code || contact.country) {
    // ADR:;;Street;City;Region;PostalCode;Country
    const adr = [
      '',
      '',
      escapeVCardValue(contact.address),
      escapeVCardValue(contact.city),
      escapeVCardValue(contact.province),
      escapeVCardValue(contact.postal_code),
      escapeVCardValue(contact.country)
    ].join(';');
    lines.push(`ADR;TYPE=HOME:${adr}`);
  }

  // Website
  if (contact.website) {
    lines.push(`URL:${escapeVCardValue(contact.website)}`);
  }

  // Organization (using contact type as org for now)
  if (contact.contact_type && contact.contact_type !== 'persona') {
    lines.push(`ORG:${escapeVCardValue(contact.name)}`);
  }

  // Notes
  if (contact.observations) {
    lines.push(`NOTE:${escapeVCardValue(contact.observations)}`);
  }

  lines.push('END:VCARD');
  return lines.join('\r\n');
}

function generateMultipleVCards(contacts: Contact[]): string {
  return contacts.map(generateVCard).join('\r\n');
}

export function ExportContactsDialog({ open, onOpenChange, contacts }: ExportContactsDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [onlyWithPhone, setOnlyWithPhone] = useState(true);

  // Filter contacts based on search and phone filter
  const filteredContacts = useMemo(() => {
    let result = [...contacts];

    // Filter by phone if enabled
    if (onlyWithPhone) {
      result = result.filter(c => c.phone && c.phone.trim() !== '');
    }

    // Filter by search term
    if (searchTerm) {
      result = result.filter(c =>
        searchMatch(c.name, searchTerm) ||
        searchMatch(c.surname, searchTerm) ||
        searchMatch(c.email, searchTerm) ||
        searchMatch(c.phone, searchTerm) ||
        searchMatch(c.city, searchTerm)
      );
    }

    return result.sort((a, b) => {
      const nameA = `${a.name} ${a.surname || ''}`.toLowerCase().trim();
      const nameB = `${b.name} ${b.surname || ''}`.toLowerCase().trim();
      return nameA.localeCompare(nameB, 'es');
    });
  }, [contacts, searchTerm, onlyWithPhone]);

  const handleSelectAll = () => {
    if (selectedIds.size === filteredContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const handleToggleContact = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleExport = () => {
    const contactsToExport = selectedIds.size > 0
      ? contacts.filter(c => selectedIds.has(c.id))
      : filteredContacts;

    if (contactsToExport.length === 0) {
      toast.error('No hay contactos para exportar');
      return;
    }

    const vcfContent = generateMultipleVCards(contactsToExport);
    const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `contactos-crm-${new Date().toISOString().split('T')[0]}.vcf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`${contactsToExport.length} contactos exportados`, {
      description: 'Abre el archivo .vcf en tu iPhone para importar los contactos'
    });
    
    onOpenChange(false);
    setSelectedIds(new Set());
    setSearchTerm('');
  };

  const contactsWithPhone = contacts.filter(c => c.phone && c.phone.trim() !== '').length;
  const allSelected = filteredContacts.length > 0 && selectedIds.size === filteredContacts.length;
  const someSelected = selectedIds.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Exportar contactos a iPhone
          </DialogTitle>
          <DialogDescription>
            Exporta contactos como archivo vCard (.vcf) para importar en tu iPhone.
            {contactsWithPhone < contacts.length && (
              <span className="block mt-1 text-amber-600">
                {contacts.length - contactsWithPhone} contactos sin teléfono
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0">
          {/* Search and filter */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar contactos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Checkbox 
                id="only-phone" 
                checked={onlyWithPhone} 
                onCheckedChange={(checked) => setOnlyWithPhone(checked === true)}
              />
              <Label htmlFor="only-phone" className="text-sm cursor-pointer flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                Solo contactos con teléfono
              </Label>
            </div>
          </div>

          {/* Select all / count */}
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-primary hover:underline flex items-center gap-1.5"
            >
              <Checkbox checked={allSelected} className="pointer-events-none" />
              {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </button>
            <span className="text-muted-foreground">
              {selectedIds.size > 0 
                ? `${selectedIds.size} seleccionados` 
                : `${filteredContacts.length} contactos`
              }
            </span>
          </div>

          {/* Contact list */}
          <ScrollArea className="h-[280px] border rounded-md">
            <div className="p-2 space-y-1">
              {filteredContacts.map((contact) => {
                const isSelected = selectedIds.has(contact.id);
                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => handleToggleContact(contact.id)}
                    className={`w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors ${
                      isSelected 
                        ? 'bg-primary/10 border border-primary/30' 
                        : 'hover:bg-muted border border-transparent'
                    }`}
                  >
                    <Checkbox checked={isSelected} className="pointer-events-none" />
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {getInitials(contact.name, contact.surname)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {contact.name} {contact.surname}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {contact.phone || contact.email || 'Sin datos de contacto'}
                      </p>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </button>
                );
              })}
              {filteredContacts.length === 0 && (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  No se encontraron contactos
                </p>
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={filteredContacts.length === 0} className="gap-2">
            <Download className="h-4 w-4" />
            {someSelected 
              ? `Exportar ${selectedIds.size} contactos` 
              : `Exportar ${filteredContacts.length} contactos`
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
