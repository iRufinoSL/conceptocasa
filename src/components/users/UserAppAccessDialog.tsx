import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';
import { Monitor, Layout, FileText } from 'lucide-react';
import { SYSTEM_APPS, APP_TABS, SENSITIVE_FIELDS } from '@/hooks/useAppAccess';

interface UserAppAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  userRole: string;
}

interface AppAccessState {
  [appName: string]: boolean;
}

interface TabAccessState {
  [key: string]: { can_view: boolean; can_edit: boolean };
}

interface FieldAccessState {
  [key: string]: { can_view: boolean; can_edit: boolean };
}

export function UserAppAccessDialog({
  open,
  onOpenChange,
  userId,
  userName,
  userRole
}: UserAppAccessDialogProps) {
  const [appAccess, setAppAccess] = useState<AppAccessState>({});
  const [tabAccess, setTabAccess] = useState<TabAccessState>({});
  const [fieldAccess, setFieldAccess] = useState<FieldAccessState>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('apps');

  useEffect(() => {
    if (open) {
      fetchCurrentAccess();
    }
  }, [open, userId]);

  const fetchCurrentAccess = async () => {
    setIsLoading(true);
    try {
      const [appRes, tabRes, fieldRes] = await Promise.all([
        supabase.from('user_app_access').select('*').eq('user_id', userId),
        supabase.from('user_tab_access').select('*').eq('user_id', userId),
        supabase.from('user_field_access').select('*').eq('user_id', userId),
      ]);

      // Initialize app access
      const apps: AppAccessState = {};
      SYSTEM_APPS.forEach(app => {
        const existing = appRes.data?.find(a => a.app_name === app.name);
        apps[app.name] = existing?.can_access ?? false;
      });
      setAppAccess(apps);

      // Initialize tab access
      const tabs: TabAccessState = {};
      Object.entries(APP_TABS).forEach(([appName, appTabs]) => {
        appTabs.forEach(tab => {
          const key = `${appName}:${tab.name}`;
          const existing = tabRes.data?.find(t => t.app_name === appName && t.tab_name === tab.name);
          tabs[key] = {
            can_view: existing?.can_view ?? false,
            can_edit: existing?.can_edit ?? false,
          };
        });
      });
      setTabAccess(tabs);

      // Initialize field access
      const fields: FieldAccessState = {};
      Object.entries(SENSITIVE_FIELDS).forEach(([tableName, tableFields]) => {
        tableFields.forEach(field => {
          const key = `${tableName}:${field.name}`;
          const existing = fieldRes.data?.find(f => f.table_name === tableName && f.field_name === field.name);
          fields[key] = {
            can_view: existing?.can_view ?? false,
            can_edit: existing?.can_edit ?? false,
          };
        });
      });
      setFieldAccess(fields);
    } catch (error) {
      console.error('Error fetching access:', error);
      toast.error('Error al cargar permisos');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAppAccess = (appName: string) => {
    setAppAccess(prev => ({ ...prev, [appName]: !prev[appName] }));
  };

  const toggleTabAccess = (key: string, field: 'can_view' | 'can_edit') => {
    setTabAccess(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: !prev[key][field],
        // Si se activa can_edit, activar también can_view
        ...(field === 'can_edit' && !prev[key].can_edit ? { can_view: true } : {}),
        // Si se desactiva can_view, desactivar también can_edit
        ...(field === 'can_view' && prev[key].can_view ? { can_edit: false } : {}),
      },
    }));
  };

  const toggleFieldAccess = (key: string, field: 'can_view' | 'can_edit') => {
    setFieldAccess(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: !prev[key][field],
        ...(field === 'can_edit' && !prev[key].can_edit ? { can_view: true } : {}),
        ...(field === 'can_view' && prev[key].can_view ? { can_edit: false } : {}),
      },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Delete all existing access first
      await Promise.all([
        supabase.from('user_app_access').delete().eq('user_id', userId),
        supabase.from('user_tab_access').delete().eq('user_id', userId),
        supabase.from('user_field_access').delete().eq('user_id', userId),
      ]);

      // Insert app access
      const appInserts = Object.entries(appAccess)
        .filter(([_, canAccess]) => canAccess)
        .map(([appName]) => ({
          user_id: userId,
          app_name: appName,
          can_access: true,
        }));
      
      if (appInserts.length > 0) {
        const { error } = await supabase.from('user_app_access').insert(appInserts);
        if (error) throw error;
      }

      // Insert tab access
      const tabInserts = Object.entries(tabAccess)
        .filter(([_, access]) => access.can_view || access.can_edit)
        .map(([key, access]) => {
          const [appName, tabName] = key.split(':');
          return {
            user_id: userId,
            app_name: appName,
            tab_name: tabName,
            can_view: access.can_view,
            can_edit: access.can_edit,
          };
        });

      if (tabInserts.length > 0) {
        const { error } = await supabase.from('user_tab_access').insert(tabInserts);
        if (error) throw error;
      }

      // Insert field access
      const fieldInserts = Object.entries(fieldAccess)
        .filter(([_, access]) => access.can_view || access.can_edit)
        .map(([key, access]) => {
          const [tableName, fieldName] = key.split(':');
          return {
            user_id: userId,
            table_name: tableName,
            field_name: fieldName,
            can_view: access.can_view,
            can_edit: access.can_edit,
          };
        });

      if (fieldInserts.length > 0) {
        const { error } = await supabase.from('user_field_access').insert(fieldInserts);
        if (error) throw error;
      }

      toast.success('Permisos actualizados correctamente');
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving access:', error);
      toast.error(error.message || 'Error al guardar permisos');
    } finally {
      setIsSaving(false);
    }
  };

  const enabledAppsCount = Object.values(appAccess).filter(Boolean).length;
  const enabledTabsCount = Object.values(tabAccess).filter(t => t.can_view).length;
  const enabledFieldsCount = Object.values(fieldAccess).filter(f => f.can_view).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Permisos de Aplicaciones
          </DialogTitle>
          <DialogDescription>
            Configura qué aplicaciones, pestañas y campos puede ver/editar <strong>{userName}</strong> ({userRole}).
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="apps" className="flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              Aplicaciones
              <Badge variant="outline" className="ml-1">{enabledAppsCount}/{SYSTEM_APPS.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="tabs" className="flex items-center gap-2">
              <Layout className="h-4 w-4" />
              Pestañas
              <Badge variant="outline" className="ml-1">{enabledTabsCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="fields" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Campos
              <Badge variant="outline" className="ml-1">{enabledFieldsCount}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="apps" className="flex-1 mt-4">
            <ScrollArea className="h-[350px] border rounded-md">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Acceso</TableHead>
                      <TableHead>Aplicación</TableHead>
                      <TableHead>Tipo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {SYSTEM_APPS.map(app => (
                      <TableRow key={app.name}>
                        <TableCell>
                          <Checkbox
                            checked={appAccess[app.name] ?? false}
                            onCheckedChange={() => toggleAppAccess(app.name)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{app.label}</TableCell>
                        <TableCell>
                          {app.adminOnly ? (
                            <Badge variant="secondary">Solo Admin</Badge>
                          ) : (
                            <Badge variant="outline">General</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="tabs" className="flex-1 mt-4">
            <ScrollArea className="h-[350px] border rounded-md p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : (
                <Accordion type="multiple" className="w-full">
                  {Object.entries(APP_TABS).map(([appName, tabs]) => {
                    const appLabel = SYSTEM_APPS.find(a => a.name === appName)?.label || appName;
                    const enabledCount = tabs.filter(t => tabAccess[`${appName}:${t.name}`]?.can_view).length;
                    
                    return (
                      <AccordionItem key={appName} value={appName}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{appLabel}</span>
                            <Badge variant="outline">{enabledCount}/{tabs.length}</Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Pestaña</TableHead>
                                <TableHead className="w-24 text-center">Ver</TableHead>
                                <TableHead className="w-24 text-center">Editar</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {tabs.map(tab => {
                                const key = `${appName}:${tab.name}`;
                                return (
                                  <TableRow key={key}>
                                    <TableCell>{tab.label}</TableCell>
                                    <TableCell className="text-center">
                                      <Checkbox
                                        checked={tabAccess[key]?.can_view ?? false}
                                        onCheckedChange={() => toggleTabAccess(key, 'can_view')}
                                      />
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Checkbox
                                        checked={tabAccess[key]?.can_edit ?? false}
                                        onCheckedChange={() => toggleTabAccess(key, 'can_edit')}
                                        disabled={!tabAccess[key]?.can_view}
                                      />
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="fields" className="flex-1 mt-4">
            <ScrollArea className="h-[350px] border rounded-md p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : (
                <Accordion type="multiple" className="w-full">
                  {Object.entries(SENSITIVE_FIELDS).map(([tableName, fields]) => {
                    const enabledCount = fields.filter(f => fieldAccess[`${tableName}:${f.name}`]?.can_view).length;
                    
                    return (
                      <AccordionItem key={tableName} value={tableName}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{tableName}</span>
                            <Badge variant="outline">{enabledCount}/{fields.length}</Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Campo</TableHead>
                                <TableHead className="w-24 text-center">Ver</TableHead>
                                <TableHead className="w-24 text-center">Editar</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {fields.map(field => {
                                const key = `${tableName}:${field.name}`;
                                return (
                                  <TableRow key={key}>
                                    <TableCell>{field.label}</TableCell>
                                    <TableCell className="text-center">
                                      <Checkbox
                                        checked={fieldAccess[key]?.can_view ?? false}
                                        onCheckedChange={() => toggleFieldAccess(key, 'can_view')}
                                      />
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Checkbox
                                        checked={fieldAccess[key]?.can_edit ?? false}
                                        onCheckedChange={() => toggleFieldAccess(key, 'can_edit')}
                                        disabled={!fieldAccess[key]?.can_view}
                                      />
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Guardando...' : 'Guardar Permisos'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
