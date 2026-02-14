import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Plus, ChevronRight, ChevronDown, Brain, Trash2, Edit2, Check, X,
  HelpCircle, Copy, Wrench, Users, MapPin, Clock, DollarSign,
  ExternalLink, Building, User, Truck, FileText, Link, Unlink
} from 'lucide-react';
import { toast } from 'sonner';

interface TolosItem {
  id: string;
  budget_id: string;
  parent_id: string | null;
  code: string;
  name: string;
  description: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
  address_street: string | null;
  address_city: string | null;
  address_postal_code: string | null;
  address_province: string | null;
  latitude: number | null;
  longitude: number | null;
  cadastral_reference: string | null;
  google_maps_url: string | null;
  client_contact_id: string | null;
  supplier_contact_id: string | null;
  housing_profile_id: string | null;
}

interface ContactInfo {
  id: string;
  name: string;
  surname: string | null;
  email: string | null;
  phone: string | null;
}

interface ProfileInfo {
  id: string;
  contact_name: string;
  contact_email: string;
  poblacion: string | null;
  created_at: string;
  project_id: string;
}

interface TolosaBrainstormViewProps {
  budgetId: string;
  isAdmin: boolean;
}

const DIMENSION_LINKS = [
  { key: 'como', label: 'CÓMO?', icon: Wrench, color: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950 dark:border-blue-800', hint: 'Actividades / Perfil' },
  { key: 'quien', label: 'QUIÉN?', icon: Users, color: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950 dark:border-emerald-800', hint: 'Cliente / Proveedor' },
  { key: 'donde', label: 'DÓNDE?', icon: MapPin, color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800', hint: 'Dirección / Catastro' },
  { key: 'cuando', label: 'CUÁNDO?', icon: Clock, color: 'text-purple-600 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-950 dark:border-purple-800', hint: 'Fases / Plazos' },
  { key: 'cuanto', label: 'CUÁNTO?', icon: DollarSign, color: 'text-rose-600 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-950 dark:border-rose-800', hint: 'Recursos / Costes' },
];

export function TolosaBrainstormView({ budgetId, isAdmin }: TolosaBrainstormViewProps) {
  const [items, setItems] = useState<TolosItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingParentId, setAddingParentId] = useState<string | null | 'root'>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [detailOpenIds, setDetailOpenIds] = useState<Set<string>>(new Set());
  const [activeDimension, setActiveDimension] = useState<Record<string, string>>({});
  const [contacts, setContacts] = useState<ContactInfo[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [contactCache, setContactCache] = useState<Record<string, string>>({});
  const [housingProfiles, setHousingProfiles] = useState<ProfileInfo[]>([]);
  const [profileSearch, setProfileSearch] = useState('');
  const [showProfilePicker, setShowProfilePicker] = useState<string | null>(null);
  const [dondeForm, setDondeForm] = useState<Record<string, {
    address_street: string;
    address_city: string;
    address_postal_code: string;
    address_province: string;
    latitude: string;
    longitude: string;
    google_maps_url: string;
    cadastral_reference: string;
  }>>({});

  const initDondeForm = (item: TolosItem) => {
    if (!dondeForm[item.id]) {
      setDondeForm(prev => ({
        ...prev,
        [item.id]: {
          address_street: item.address_street || '',
          address_city: item.address_city || '',
          address_postal_code: item.address_postal_code || '',
          address_province: item.address_province || '',
          latitude: item.latitude != null ? String(item.latitude) : '',
          longitude: item.longitude != null ? String(item.longitude) : '',
          google_maps_url: item.google_maps_url || '',
          cadastral_reference: item.cadastral_reference || '',
        },
      }));
    }
  };

  const updateDondeField = (itemId: string, field: string, value: string) => {
    setDondeForm(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const saveDondeForm = async (itemId: string) => {
    const f = dondeForm[itemId];
    if (!f) return;
    const fields: Record<string, unknown> = {
      address_street: f.address_street || null,
      address_city: f.address_city || null,
      address_postal_code: f.address_postal_code || null,
      address_province: f.address_province || null,
      latitude: f.latitude ? parseFloat(f.latitude) || null : null,
      longitude: f.longitude ? parseFloat(f.longitude) || null : null,
      google_maps_url: f.google_maps_url || null,
      cadastral_reference: f.cadastral_reference || null,
    };
    const { error } = await supabase.from('tolosa_items').update(fields).eq('id', itemId);
    if (error) {
      toast.error('Error al guardar ubicación');
    } else {
      toast.success('Ubicación guardada');
      fetchItems();
    }
  };

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('tolosa_items')
      .select('*')
      .eq('budget_id', budgetId)
      .order('code', { ascending: true });

    if (error) {
      console.error('Error fetching tolosa items:', error);
      toast.error('Error al cargar ítems');
    } else {
      const loadedItems = (data as TolosItem[]) || [];
      setItems(loadedItems);
      setDondeForm({});

      // Fetch linked contact names
      const contactIds = new Set<string>();
      loadedItems.forEach(i => {
        if (i.client_contact_id) contactIds.add(i.client_contact_id);
        if (i.supplier_contact_id) contactIds.add(i.supplier_contact_id);
      });
      if (contactIds.size > 0) {
        const { data: cData } = await supabase
          .from('crm_contacts')
          .select('id, name, surname')
          .in('id', Array.from(contactIds));
        if (cData) {
          const cache: Record<string, string> = {};
          cData.forEach((c: any) => {
            cache[c.id] = `${c.name}${c.surname ? ' ' + c.surname : ''}`;
          });
          setContactCache(prev => ({ ...prev, ...cache }));
        }
      }
    }
    setLoading(false);
  }, [budgetId]);

  const fetchContacts = useCallback(async (search?: string) => {
    let query = supabase.from('crm_contacts').select('id, name, surname, email, phone').order('name').limit(20);
    if (search) query = query.or(`name.ilike.%${search}%,surname.ilike.%${search}%`);
    const { data } = await query;
    setContacts((data as ContactInfo[]) || []);
  }, []);

  const fetchHousingProfiles = useCallback(async (search?: string) => {
    let query = supabase
      .from('project_profiles')
      .select('id, contact_name, contact_email, poblacion, created_at, project_id')
      .order('created_at', { ascending: false })
      .limit(20);
    if (search) query = query.or(`contact_name.ilike.%${search}%,contact_email.ilike.%${search}%,poblacion.ilike.%${search}%`);
    const { data } = await query;
    setHousingProfiles((data as ProfileInfo[]) || []);
  }, []);

  useEffect(() => { fetchItems(); fetchContacts(); fetchHousingProfiles(); }, [fetchItems, fetchContacts, fetchHousingProfiles]);

  const rootItems = items.filter(i => !i.parent_id);
  const getChildren = (parentId: string) => items.filter(i => i.parent_id === parentId);

  const getNextCode = (parentId: string | null) => {
    const siblings = parentId ? getChildren(parentId) : rootItems;
    const parentItem = parentId ? items.find(i => i.id === parentId) : null;
    const prefix = parentItem ? parentItem.code : '';
    let maxNum = 0;
    siblings.forEach(s => {
      const suffix = s.code.slice(prefix.length);
      const num = parseInt(suffix, 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    });
    return prefix + String(maxNum + 1).padStart(3, '0');
  };

  const handleAdd = async (parentId: string | null) => {
    if (!newName.trim()) return;
    const code = getNextCode(parentId);
    const siblings = parentId ? getChildren(parentId) : rootItems;
    const { error } = await supabase
      .from('tolosa_items')
      .insert({
        budget_id: budgetId,
        parent_id: parentId,
        code,
        name: newName.trim(),
        description: newDescription.trim() || null,
        order_index: siblings.length,
      });
    if (error) {
      toast.error('Error al añadir ítem');
    } else {
      toast.success('QUÉ? añadido');
      setNewName('');
      setNewDescription('');
      setAddingParentId(null);
      if (parentId) setExpandedIds(prev => new Set(prev).add(parentId));
      fetchItems();
    }
  };

  const handleDelete = async (item: TolosItem) => {
    const children = getChildren(item.id);
    if (children.length > 0) {
      toast.error('Elimina primero los sub-QUÉ?');
      return;
    }
    const { error } = await supabase.from('tolosa_items').delete().eq('id', item.id);
    if (error) {
      toast.error('Error al eliminar');
    } else {
      toast.success('Eliminado');
      fetchItems();
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    const { error } = await supabase
      .from('tolosa_items')
      .update({ name: editName.trim(), description: editDescription.trim() || null })
      .eq('id', id);
    if (error) {
      toast.error('Error al actualizar');
    } else {
      setEditingId(null);
      fetchItems();
    }
  };

  const updateItemField = async (id: string, fields: Record<string, unknown>) => {
    const { error } = await supabase.from('tolosa_items').update(fields).eq('id', id);
    if (error) {
      toast.error('Error al guardar');
    } else {
      fetchItems();
    }
  };

  const duplicateItem = async (item: TolosItem, asSub: boolean) => {
    const targetParentId = asSub ? item.id : item.parent_id;
    const code = getNextCode(targetParentId);
    const siblings = targetParentId ? getChildren(targetParentId) : rootItems;

    const { data: newItem, error } = await supabase
      .from('tolosa_items')
      .insert({
        budget_id: budgetId,
        parent_id: targetParentId,
        code,
        name: item.name + ' (copia)',
        description: item.description,
        order_index: siblings.length,
        address_street: item.address_street,
        address_city: item.address_city,
        address_postal_code: item.address_postal_code,
        address_province: item.address_province,
        latitude: item.latitude,
        longitude: item.longitude,
        cadastral_reference: item.cadastral_reference,
        google_maps_url: item.google_maps_url,
        client_contact_id: item.client_contact_id,
        supplier_contact_id: item.supplier_contact_id,
        housing_profile_id: item.housing_profile_id,
      })
      .select()
      .single();

    if (error || !newItem) {
      toast.error('Error al duplicar');
      return;
    }

    const children = getChildren(item.id);
    if (children.length > 0) {
      await duplicateChildren(children, newItem.id, newItem.code);
    }

    toast.success(asSub ? 'Duplicado como sub-QUÉ?' : 'QUÉ? duplicado');
    if (targetParentId) setExpandedIds(prev => new Set(prev).add(targetParentId));
    fetchItems();
  };

  const duplicateChildren = async (children: TolosItem[], newParentId: string, parentCode: string) => {
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childCode = parentCode + String(i + 1).padStart(3, '0');
      const { data: newChild, error } = await supabase
        .from('tolosa_items')
        .insert({
          budget_id: budgetId,
          parent_id: newParentId,
          code: childCode,
          name: child.name,
          description: child.description,
          order_index: i,
           address_street: child.address_street,
           address_city: child.address_city,
           address_postal_code: child.address_postal_code,
          address_province: child.address_province,
          latitude: child.latitude,
          longitude: child.longitude,
          cadastral_reference: child.cadastral_reference,
          google_maps_url: child.google_maps_url,
          client_contact_id: child.client_contact_id,
          supplier_contact_id: child.supplier_contact_id,
          housing_profile_id: child.housing_profile_id,
        })
        .select()
        .single();

      if (!error && newChild) {
        const grandChildren = getChildren(child.id);
        if (grandChildren.length > 0) {
          await duplicateChildren(grandChildren, newChild.id, newChild.code);
        }
      }
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleDetail = (id: string) => {
    setDetailOpenIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const setDimension = (itemId: string, dim: string) => {
    setActiveDimension(prev => ({
      ...prev,
      [itemId]: prev[itemId] === dim ? '' : dim,
    }));
  };

  const getDepthColor = (depth: number) => {
    const colors = [
      'border-l-primary',
      'border-l-blue-500',
      'border-l-emerald-500',
      'border-l-amber-500',
      'border-l-purple-500',
      'border-l-rose-500',
    ];
    return colors[depth % colors.length];
  };

  const getGoogleMapsUrl = (item: TolosItem) => {
    // Priority: manual URL > coordinates > address-based
    if (item.google_maps_url) return item.google_maps_url;
    if (item.latitude && item.longitude) {
      return `https://www.google.com/maps?q=${item.latitude},${item.longitude}`;
    }
    const addr = [item.address_street, item.address_city, item.address_postal_code, item.address_province].filter(Boolean).join(', ');
    if (addr) return `https://www.google.com/maps/search/${encodeURIComponent(addr)}`;
    return null;
  };

  const getCatastroUrl = (ref: string) => {
    return `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCConCiworking.aspx?RefC=${encodeURIComponent(ref)}`;
  };

  const getCatastroDescriptivaUrl = (ref: string) => {
    return `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCBusqueda.aspx?pest=rc&RCCompleta=${encodeURIComponent(ref)}&final=&DenijaBusworking=S`;
  };

  const getCatastroMapaUrl = (ref: string) => {
    return `https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx?refcat=${encodeURIComponent(ref)}`;
  };

  const getContactName = (contactId: string | null) => {
    if (!contactId) return null;
    if (contactCache[contactId]) return contactCache[contactId];
    const c = contacts.find(c => c.id === contactId);
    return c ? `${c.name}${c.surname ? ' ' + c.surname : ''}` : contactId.slice(0, 8) + '...';
  };

  // DÓNDE? panel
  const renderDondePanel = (item: TolosItem) => {
    initDondeForm(item);
    const f = dondeForm[item.id];
    if (!f) return null;

    const mapsUrl = f.google_maps_url || (() => {
      if (f.latitude && f.longitude) return `https://www.google.com/maps?q=${f.latitude},${f.longitude}`;
      const addr = [f.address_street, f.address_city, f.address_postal_code, f.address_province].filter(Boolean).join(', ');
      if (addr) return `https://www.google.com/maps/search/${encodeURIComponent(addr)}`;
      return null;
    })();

    return (
      <div className="space-y-3 p-3 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30">
        <h4 className="text-sm font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <MapPin className="h-4 w-4" /> DÓNDE? — Ubicación
        </h4>

        {/* 1. Dirección completa */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">1. Dirección completa</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Calle / Dirección</label>
              <input
                type="text"
                value={f.address_street}
                placeholder="Calle, número..."
                onChange={e => updateDondeField(item.id, 'address_street', e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Población</label>
              <input
                type="text"
                value={f.address_city}
                placeholder="Madrid, Barcelona..."
                onChange={e => updateDondeField(item.id, 'address_city', e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Código Postal</label>
                <input
                  type="text"
                  value={f.address_postal_code}
                  placeholder="28001"
                  onChange={e => updateDondeField(item.id, 'address_postal_code', e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Provincia</label>
                <input
                  type="text"
                  value={f.address_province}
                  placeholder="Madrid"
                  onChange={e => updateDondeField(item.id, 'address_province', e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 2. Coordenadas Google Maps */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">2. Coordenadas Google Maps</p>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-muted-foreground">URL de Google Maps (pega aquí la dirección)</label>
              <input
                type="text"
                value={f.google_maps_url}
                placeholder="https://www.google.com/maps/place/..."
                onChange={e => updateDondeField(item.id, 'google_maps_url', e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={f.latitude}
                placeholder="Latitud"
                onChange={e => updateDondeField(item.id, 'latitude', e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <input
                type="text"
                inputMode="decimal"
                value={f.longitude}
                placeholder="Longitud"
                onChange={e => updateDondeField(item.id, 'longitude', e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          </div>
          {mapsUrl && (
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink className="h-3 w-3 mr-1" /> Ir a dirección
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(mapsUrl);
                  toast.success('URL copiada al portapapeles');
                }}
              >
                <Copy className="h-3 w-3 mr-1" /> Copiar dirección
              </Button>
            </div>
          )}
        </div>

        {/* 3. Referencia Catastral */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">3. Referencia Catastral</p>
          <input
            type="text"
            value={f.cadastral_reference}
            placeholder="0000000AA0000A0001AA"
            onChange={e => updateDondeField(item.id, 'cadastral_reference', e.target.value)}
            className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          {f.cadastral_reference && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <a
                  href={getCatastroUrl(f.cadastral_reference)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Building className="h-3 w-3" /> Ficha catastral
                </a>
                <a
                  href={getCatastroMapaUrl(f.cadastral_reference)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <MapPin className="h-3 w-3" /> Mapa catastral
                </a>
              </div>
              <div className="rounded-lg border overflow-hidden bg-background">
                <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b">
                  <span className="text-xs font-semibold text-muted-foreground">Consulta descriptiva y gráfica</span>
                  <a
                    href={getCatastroDescriptivaUrl(f.cadastral_reference)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" /> Abrir en nueva pestaña
                  </a>
                </div>
                <iframe
                  src={getCatastroDescriptivaUrl(f.cadastral_reference)}
                  className="w-full border-0"
                  style={{ height: '500px' }}
                  title="Consulta descriptiva y gráfica - Catastro"
                  sandbox="allow-scripts allow-same-origin allow-popups"
                />
              </div>
            </div>
          )}
        </div>

        {/* Botón Guardar */}
        <div className="flex justify-end pt-2 border-t border-amber-200 dark:border-amber-800">
          <Button size="sm" onClick={() => saveDondeForm(item.id)}>
            <Check className="h-3 w-3 mr-1" /> Guardar ubicación
          </Button>
        </div>
      </div>
    );
  };

  // QUIÉN? panel
  const renderQuienPanel = (item: TolosItem) => (
    <div className="space-y-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30">
      <h4 className="text-sm font-semibold flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
        <Users className="h-4 w-4" /> QUIÉN? — Personas
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Client */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            <User className="h-3 w-3" /> Cliente
          </label>
          {item.client_contact_id ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">{getContactName(item.client_contact_id)}</Badge>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateItemField(item.id, { client_contact_id: null })}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              <Input
                placeholder="Buscar contacto..."
                className="h-8 text-sm"
                value={contactSearch}
                onChange={e => { setContactSearch(e.target.value); fetchContacts(e.target.value); }}
              />
              {contactSearch && contacts.length > 0 && (
                <div className="max-h-32 overflow-y-auto border rounded bg-background">
                  {contacts.map(c => (
                    <button
                      key={c.id}
                      className="w-full text-left px-2 py-1 text-sm hover:bg-accent truncate"
                      onClick={() => { updateItemField(item.id, { client_contact_id: c.id }); setContactSearch(''); }}
                    >
                      {c.name} {c.surname || ''} {c.email ? `· ${c.email}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Supplier */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            <Truck className="h-3 w-3" /> Proveedor principal
          </label>
          {item.supplier_contact_id ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">{getContactName(item.supplier_contact_id)}</Badge>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateItemField(item.id, { supplier_contact_id: null })}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              <Input
                placeholder="Buscar proveedor..."
                className="h-8 text-sm"
                value={contactSearch}
                onChange={e => { setContactSearch(e.target.value); fetchContacts(e.target.value); }}
              />
              {contactSearch && contacts.length > 0 && (
                <div className="max-h-32 overflow-y-auto border rounded bg-background">
                  {contacts.map(c => (
                    <button
                      key={c.id}
                      className="w-full text-left px-2 py-1 text-sm hover:bg-accent truncate"
                      onClick={() => { updateItemField(item.id, { supplier_contact_id: c.id }); setContactSearch(''); }}
                    >
                      {c.name} {c.surname || ''} {c.phone ? `· ${c.phone}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // CÓMO? panel
  const getProfileName = (profileId: string | null) => {
    if (!profileId) return null;
    const p = housingProfiles.find(p => p.id === profileId);
    return p ? `${p.contact_name} — ${p.poblacion || p.contact_email}` : profileId.slice(0, 8) + '...';
  };

  const renderComoPanel = (item: TolosItem) => {
    const isPickerOpen = showProfilePicker === item.id;

    return (
      <div className="space-y-3 p-3 rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30">
        <h4 className="text-sm font-semibold flex items-center gap-2 text-blue-700 dark:text-blue-400">
          <Wrench className="h-4 w-4" /> CÓMO? — Actividades / Perfil
        </h4>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Perfil de vivienda</p>

          {item.housing_profile_id ? (
            <div className="flex items-center gap-2 p-2 rounded border border-blue-300 bg-blue-100/50 dark:border-blue-700 dark:bg-blue-900/30">
              <Link className="h-4 w-4 text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{getProfileName(item.housing_profile_id)}</p>
                <p className="text-xs text-muted-foreground">Perfil vinculado</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-xs shrink-0"
                onClick={() => updateItemField(item.id, { housing_profile_id: null })}
              >
                <Unlink className="h-3 w-3 mr-1" /> Desvincular
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2 rounded border border-dashed border-blue-300 dark:border-blue-700">
                <FileText className="h-4 w-4 text-blue-500" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Sin perfil vinculado</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => {
                    setShowProfilePicker(isPickerOpen ? null : item.id);
                    if (!isPickerOpen) fetchHousingProfiles();
                  }}
                >
                  <Link className="h-3 w-3 mr-1" /> Vincular perfil
                </Button>
              </div>

              {isPickerOpen && (
                <div className="space-y-2 p-2 rounded border border-blue-200 bg-background dark:border-blue-800">
                  <input
                    type="text"
                    value={profileSearch}
                    placeholder="Buscar perfil por nombre, email o población..."
                    onChange={e => {
                      setProfileSearch(e.target.value);
                      fetchHousingProfiles(e.target.value);
                    }}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                  {housingProfiles.length > 0 ? (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {housingProfiles.map(p => (
                        <button
                          key={p.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded flex items-center justify-between gap-2"
                          onClick={() => {
                            updateItemField(item.id, { housing_profile_id: p.id });
                            setShowProfilePicker(null);
                            setProfileSearch('');
                          }}
                        >
                          <div className="min-w-0">
                            <span className="font-medium">{p.contact_name}</span>
                            {p.poblacion && <span className="text-muted-foreground"> — {p.poblacion}</span>}
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">{p.contact_email}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-2">No se encontraron perfiles</p>
                  )}
                  <div className="pt-1 border-t">
                    <p className="text-xs text-muted-foreground">
                      ¿No existe el perfil?{' '}
                      <button
                        className="text-primary hover:underline font-medium"
                        onClick={() => {
                          toast.info('Para crear un nuevo perfil, ve a la pestaña "Perfil" del presupuesto o recíbelo desde el formulario web.');
                          setShowProfilePicker(null);
                        }}
                      >
                        Crear nuevo perfil desde la pestaña Perfil
                      </button>
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Vincula aquí las actividades (CÓMO se ejecuta cada QUÉ?)
          </p>
        </div>
      </div>
    );
  };

  const renderDimensionPanel = (item: TolosItem, dim: string) => {
    switch (dim) {
      case 'donde': return renderDondePanel(item);
      case 'quien': return renderQuienPanel(item);
      case 'como': return renderComoPanel(item);
      case 'cuando': return (
        <div className="p-3 rounded-lg border border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-950/30">
          <h4 className="text-sm font-semibold flex items-center gap-2 text-purple-700 dark:text-purple-400">
            <Clock className="h-4 w-4" /> CUÁNDO? — Plazos y fases
          </h4>
          <p className="text-xs text-muted-foreground mt-1">Vinculación a fases y cronograma — próximamente</p>
        </div>
      );
      case 'cuanto': return (
        <div className="p-3 rounded-lg border border-rose-200 bg-rose-50/50 dark:border-rose-800 dark:bg-rose-950/30">
          <h4 className="text-sm font-semibold flex items-center gap-2 text-rose-700 dark:text-rose-400">
            <DollarSign className="h-4 w-4" /> CUÁNTO? — Costes
          </h4>
          <p className="text-xs text-muted-foreground mt-1">Vinculación a recursos y costes — próximamente</p>
        </div>
      );
      default: return null;
    }
  };

  const renderItem = (item: TolosItem, depth: number = 0) => {
    const children = getChildren(item.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(item.id);
    const isEditing = editingId === item.id;
    const isAddingSub = addingParentId === item.id;
    const isDetailOpen = detailOpenIds.has(item.id);
    const queId = `${item.code} ${item.name}`;
    const openDim = activeDimension[item.id];

    return (
      <div key={item.id} className="group/item">
        <div
          className={`flex items-start gap-2 p-3 rounded-lg border-l-4 ${getDepthColor(depth)} bg-card hover:bg-accent/30 transition-colors`}
          style={{ marginLeft: depth * 24 }}
        >
          <button
            onClick={() => hasChildren && toggleExpanded(item.id)}
            className={`mt-1 p-0.5 rounded ${hasChildren ? 'hover:bg-accent cursor-pointer' : 'invisible'}`}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="space-y-2">
                <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nombre" autoFocus />
                <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Descripción" rows={2} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleUpdate(item.id)}><Check className="h-3 w-3 mr-1" /> Guardar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-3 w-3 mr-1" /> Cancelar</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs shrink-0">{item.code}</Badge>
                  <button
                    onClick={() => toggleDetail(item.id)}
                    className="font-medium text-foreground truncate hover:underline text-left"
                  >
                    {item.name}
                  </button>
                  {hasChildren && (
                    <Badge variant="secondary" className="text-xs">{children.length}</Badge>
                  )}
                </div>
                {item.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                )}

                {/* Dimension links panel */}
                {isDetailOpen && (
                  <div className="mt-3 space-y-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      QUÉ?id: {queId}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {DIMENSION_LINKS.map(dim => {
                        const Icon = dim.icon;
                        const isActive = openDim === dim.key;
                        return (
                          <button
                            key={dim.key}
                            className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-center transition-all hover:shadow-md hover:scale-[1.02] ${dim.color} ${isActive ? 'ring-2 ring-primary shadow-md' : ''}`}
                            onClick={() => setDimension(item.id, dim.key)}
                          >
                            <Icon className="h-5 w-5" />
                            <span className="text-xs font-bold">{dim.label}</span>
                            <span className="text-[10px] opacity-70">{dim.hint}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Active dimension panel */}
                    {openDim && renderDimensionPanel(item, openDim)}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          {!isEditing && (
            <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0">
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Añadir sub-QUÉ?"
                onClick={() => { setAddingParentId(item.id); setNewName(''); setNewDescription(''); }}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Duplicar como QUÉ?"
                onClick={() => duplicateItem(item, false)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Duplicar como sub-QUÉ?"
                onClick={() => duplicateItem(item, true)}>
                <Plus className="h-3 w-3" /><Copy className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7"
                onClick={() => { setEditingId(item.id); setEditName(item.name); setEditDescription(item.description || ''); }}>
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => handleDelete(item)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Inline add sub-item form */}
        {isAddingSub && (
          <div className="mt-2 p-3 border rounded-lg bg-muted/30 space-y-2" style={{ marginLeft: (depth + 1) * 24 }}>
            <p className="text-xs font-medium text-muted-foreground">
              Nuevo sub-QUÉ? de <span className="text-foreground">{item.code} {item.name}</span>
              {' → '}<Badge variant="outline" className="font-mono text-xs">{getNextCode(item.id)}</Badge>
            </p>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre del QUÉ?" autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAdd(item.id)} />
            <Textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Descripción (opcional)" rows={2} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleAdd(item.id)}><Plus className="h-3 w-3 mr-1" /> Añadir</Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingParentId(null)}>Cancelar</Button>
            </div>
          </div>
        )}

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1">
            {children.map(child => renderItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">TO.LO.SA.system 2.0</h2>
            <p className="text-sm text-muted-foreground">Brainstorming — ¿QUÉ hay que hacer?</p>
          </div>
        </div>
        <Button onClick={() => { setAddingParentId('root'); setNewName(''); setNewDescription(''); }} className="gap-2">
          <Plus className="h-4 w-4" /> Nuevo QUÉ?
        </Button>
      </div>

      {/* Dimension legend */}
      <div className="flex flex-wrap gap-2">
        {DIMENSION_LINKS.map(dim => {
          const Icon = dim.icon;
          return (
            <Badge key={dim.key} variant="outline" className={`gap-1 ${dim.color}`}>
              <Icon className="h-3 w-3" /> {dim.label}
            </Badge>
          );
        })}
      </div>

      {/* Root add form */}
      {addingParentId === 'root' && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">
              Nuevo QUÉ? raíz → <Badge variant="outline" className="font-mono text-xs">{getNextCode(null)}</Badge>
            </p>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="¿QUÉ hay que hacer?" autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAdd(null)} />
            <Textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Descripción (opcional)" rows={2} />
            <div className="flex gap-2">
              <Button onClick={() => handleAdd(null)}><Plus className="h-4 w-4 mr-1" /> Añadir</Button>
              <Button variant="ghost" onClick={() => setAddingParentId(null)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items tree */}
      {rootItems.length === 0 && addingParentId !== 'root' ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <HelpCircle className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">¿QUÉ hay que hacer?</h3>
            <p className="text-muted-foreground mb-4">Empieza tu tormenta de ideas añadiendo el primer QUÉ?</p>
            <Button onClick={() => { setAddingParentId('root'); setNewName(''); setNewDescription(''); }} className="gap-2">
              <Plus className="h-4 w-4" /> Crear primer QUÉ?
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {rootItems.map(item => renderItem(item, 0))}
        </div>
      )}

      {/* Summary */}
      {items.length > 0 && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground border-t pt-4">
          <span>{items.length} ítems totales</span>
          <span>{rootItems.length} QUÉ? raíz</span>
          <span>{items.length - rootItems.length} sub-QUÉ?</span>
        </div>
      )}
    </div>
  );
}