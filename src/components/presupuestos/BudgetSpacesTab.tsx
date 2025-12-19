import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Search, Edit, Trash2, Home, Layers, Building } from 'lucide-react';
import { formatNumber } from '@/lib/format-utils';
import { searchMatch } from '@/lib/search-utils';
import { NumericInput } from '@/components/ui/numeric-input';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';

interface BudgetSpace {
  id: string;
  budget_id: string;
  name: string;
  space_type: string;
  level: string;
  m2_built: number | null;
  m2_livable: number | null;
  observations: string | null;
  created_at: string;
  updated_at: string;
}

interface BudgetSpacesTabProps {
  budgetId: string;
  isAdmin: boolean;
}

const SPACE_TYPES = [
  'Habitación',
  'Espacio abierto',
  'Espacio techado',
  'Baño',
  'Cocina',
  'Salón',
  'Comedor',
  'Terraza',
  'Garaje',
  'Trastero',
  'Pasillo',
  'Escalera',
  'Otro'
];

const LEVELS = [
  'Sótano',
  'Planta Baja',
  'Nivel 1',
  'Nivel 2',
  'Nivel 3',
  'Nivel 4',
  'Cubierta',
  'Ático'
];

export function BudgetSpacesTab({ budgetId, isAdmin }: BudgetSpacesTabProps) {
  const [spaces, setSpaces] = useState<BudgetSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'alphabetical' | 'grouped'>('alphabetical');
  
  // Form states
  const [formOpen, setFormOpen] = useState(false);
  const [editingSpace, setEditingSpace] = useState<BudgetSpace | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    space_type: 'Habitación',
    level: 'Nivel 1',
    m2_built: null as number | null,
    m2_livable: null as number | null,
    observations: ''
  });
  
  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [spaceToDelete, setSpaceToDelete] = useState<BudgetSpace | null>(null);

  const fetchSpaces = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('budget_spaces')
        .select('*')
        .eq('budget_id', budgetId)
        .order('name');

      if (error) throw error;
      setSpaces(data || []);
    } catch (error) {
      console.error('Error fetching spaces:', error);
      toast.error('Error al cargar los espacios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpaces();
  }, [budgetId]);

  // Calculate m2 construcción (m2_built - m2_livable)
  const getM2Construction = (space: BudgetSpace): number => {
    const built = space.m2_built || 0;
    const livable = space.m2_livable || 0;
    return built - livable;
  };

  // Filter and sort spaces
  const filteredSpaces = useMemo(() => {
    let result = spaces;
    
    if (searchTerm) {
      result = spaces.filter(s =>
        searchMatch(s.name, searchTerm) ||
        searchMatch(s.space_type, searchTerm) ||
        searchMatch(s.level, searchTerm)
      );
    }
    
    // Sort alphabetically by name by default
    return [...result].sort((a, b) => a.name.localeCompare(b.name));
  }, [spaces, searchTerm]);

  // Group spaces by level, then by type within each level
  const spacesByLevelAndType = useMemo(() => {
    const grouped: Record<string, Record<string, BudgetSpace[]>> = {};
    
    filteredSpaces.forEach(space => {
      if (!grouped[space.level]) {
        grouped[space.level] = {};
      }
      if (!grouped[space.level][space.space_type]) {
        grouped[space.level][space.space_type] = [];
      }
      grouped[space.level][space.space_type].push(space);
    });
    
    // Sort by LEVELS order
    const sortedGrouped: Record<string, Record<string, BudgetSpace[]>> = {};
    LEVELS.forEach(level => {
      if (grouped[level]) {
        sortedGrouped[level] = {};
        // Sort types alphabetically within each level
        Object.keys(grouped[level]).sort().forEach(type => {
          sortedGrouped[level][type] = grouped[level][type].sort((a, b) => a.name.localeCompare(b.name));
        });
      }
    });
    
    // Add any custom levels not in the predefined list
    Object.keys(grouped).forEach(level => {
      if (!sortedGrouped[level]) {
        sortedGrouped[level] = {};
        Object.keys(grouped[level]).sort().forEach(type => {
          sortedGrouped[level][type] = grouped[level][type].sort((a, b) => a.name.localeCompare(b.name));
        });
      }
    });
    
    return sortedGrouped;
  }, [filteredSpaces]);

  // Calculate level totals
  const getLevelTotals = (levelData: Record<string, BudgetSpace[]>) => {
    const allSpaces = Object.values(levelData).flat();
    return allSpaces.reduce(
      (acc, space) => ({
        m2_built: acc.m2_built + (space.m2_built || 0),
        m2_livable: acc.m2_livable + (space.m2_livable || 0),
        m2_construction: acc.m2_construction + getM2Construction(space)
      }),
      { m2_built: 0, m2_livable: 0, m2_construction: 0 }
    );
  };

  // Calculate totals
  const totals = useMemo(() => {
    return filteredSpaces.reduce(
      (acc, space) => ({
        m2_built: acc.m2_built + (space.m2_built || 0),
        m2_livable: acc.m2_livable + (space.m2_livable || 0),
        m2_construction: acc.m2_construction + getM2Construction(space)
      }),
      { m2_built: 0, m2_livable: 0, m2_construction: 0 }
    );
  }, [filteredSpaces]);

  // Calculate group totals
  const getGroupTotals = (spacesGroup: BudgetSpace[]) => {
    return spacesGroup.reduce(
      (acc, space) => ({
        m2_built: acc.m2_built + (space.m2_built || 0),
        m2_livable: acc.m2_livable + (space.m2_livable || 0),
        m2_construction: acc.m2_construction + getM2Construction(space)
      }),
      { m2_built: 0, m2_livable: 0, m2_construction: 0 }
    );
  };

  const openCreateForm = () => {
    setEditingSpace(null);
    setFormData({
      name: '',
      space_type: 'Habitación',
      level: 'Nivel 1',
      m2_built: null,
      m2_livable: null,
      observations: ''
    });
    setFormOpen(true);
  };

  const openEditForm = (space: BudgetSpace) => {
    setEditingSpace(space);
    setFormData({
      name: space.name,
      space_type: space.space_type,
      level: space.level,
      m2_built: space.m2_built,
      m2_livable: space.m2_livable,
      observations: space.observations || ''
    });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    try {
      if (editingSpace) {
        const { error } = await supabase
          .from('budget_spaces')
          .update({
            name: formData.name.trim(),
            space_type: formData.space_type,
            level: formData.level,
            m2_built: formData.m2_built,
            m2_livable: formData.m2_livable,
            observations: formData.observations || null
          })
          .eq('id', editingSpace.id);

        if (error) throw error;
        toast.success('Espacio actualizado');
      } else {
        const { error } = await supabase
          .from('budget_spaces')
          .insert({
            budget_id: budgetId,
            name: formData.name.trim(),
            space_type: formData.space_type,
            level: formData.level,
            m2_built: formData.m2_built,
            m2_livable: formData.m2_livable,
            observations: formData.observations || null
          });

        if (error) throw error;
        toast.success('Espacio creado');
      }

      setFormOpen(false);
      fetchSpaces();
    } catch (error) {
      console.error('Error saving space:', error);
      toast.error('Error al guardar el espacio');
    }
  };

  const handleDelete = async () => {
    if (!spaceToDelete) return;

    try {
      const { error } = await supabase
        .from('budget_spaces')
        .delete()
        .eq('id', spaceToDelete.id);

      if (error) throw error;

      toast.success('Espacio eliminado');
      setDeleteDialogOpen(false);
      setSpaceToDelete(null);
      fetchSpaces();
    } catch (error) {
      console.error('Error deleting space:', error);
      toast.error('Error al eliminar el espacio');
    }
  };

  const renderSpaceRow = (space: BudgetSpace) => (
    <TableRow key={space.id}>
      <TableCell className="font-medium">{space.name}</TableCell>
      <TableCell>{space.space_type}</TableCell>
      <TableCell>{space.level}</TableCell>
      <TableCell className="text-right">{formatNumber(space.m2_built || 0)}</TableCell>
      <TableCell className="text-right">{formatNumber(space.m2_livable || 0)}</TableCell>
      <TableCell className="text-right">{formatNumber(getM2Construction(space))}</TableCell>
      <TableCell className="max-w-[200px] truncate">{space.observations || '-'}</TableCell>
      {isAdmin && (
        <TableCell>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => openEditForm(space)}>
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setSpaceToDelete(space);
                setDeleteDialogOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      )}
    </TableRow>
  );

  const renderTotalsRow = (label: string, groupTotals: { m2_built: number; m2_livable: number; m2_construction: number }, isGrandTotal = false) => (
    <TableRow className={isGrandTotal ? 'bg-primary/10 font-bold' : 'bg-muted/50 font-semibold'}>
      <TableCell colSpan={3}>{label}</TableCell>
      <TableCell className="text-right">{formatNumber(groupTotals.m2_built)}</TableCell>
      <TableCell className="text-right">{formatNumber(groupTotals.m2_livable)}</TableCell>
      <TableCell className="text-right">{formatNumber(groupTotals.m2_construction)}</TableCell>
      <TableCell></TableCell>
      {isAdmin && <TableCell></TableCell>}
    </TableRow>
  );

  const renderTableHeader = () => (
    <TableHeader>
      <TableRow>
        <TableHead>Nombre</TableHead>
        <TableHead>Tipo</TableHead>
        <TableHead>Nivel</TableHead>
        <TableHead className="text-right">m² construidos</TableHead>
        <TableHead className="text-right">m² habitables</TableHead>
        <TableHead className="text-right">m² construcción</TableHead>
        <TableHead>Observaciones</TableHead>
        {isAdmin && <TableHead className="w-[100px]">Acciones</TableHead>}
      </TableRow>
    </TableHeader>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Home className="h-5 w-5" />
                Espacios del Presupuesto
              </CardTitle>
              <CardDescription>
                Gestiona los espacios y superficies del presupuesto
              </CardDescription>
            </div>
            {isAdmin && (
              <Button onClick={openCreateForm} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Nuevo Espacio
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Search and View Mode */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar espacios..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'alphabetical' | 'grouped')} className="w-auto">
              <TabsList>
                <TabsTrigger value="alphabetical" className="flex items-center gap-1">
                  <Search className="h-3 w-3" />
                  Alfabético
                </TabsTrigger>
                <TabsTrigger value="grouped" className="flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  Por Nivel/Tipo
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Total Espacios</div>
                <div className="text-2xl font-bold">{filteredSpaces.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">m² Construidos</div>
                <div className="text-2xl font-bold">{formatNumber(totals.m2_built)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">m² Habitables</div>
                <div className="text-2xl font-bold">{formatNumber(totals.m2_livable)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">m² Construcción</div>
                <div className="text-2xl font-bold">{formatNumber(totals.m2_construction)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Table Views */}
          {viewMode === 'alphabetical' && (
            <div className="rounded-md border">
              <Table>
                {renderTableHeader()}
                <TableBody>
                  {filteredSpaces.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-muted-foreground">
                        No hay espacios registrados
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {filteredSpaces.map(renderSpaceRow)}
                      {renderTotalsRow('TOTAL', totals, true)}
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {viewMode === 'grouped' && (
            <div className="rounded-md border">
              <Table>
                {renderTableHeader()}
                <TableBody>
                  {Object.keys(spacesByLevelAndType).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-muted-foreground">
                        No hay espacios registrados
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {Object.entries(spacesByLevelAndType).map(([level, typeData]) => (
                        <React.Fragment key={`level-${level}`}>
                          {/* Level Header */}
                          <TableRow className="bg-primary/10">
                            <TableCell colSpan={isAdmin ? 8 : 7} className="font-bold text-primary">
                              <Layers className="h-4 w-4 inline mr-2" />
                              {level}
                            </TableCell>
                          </TableRow>
                          
                          {/* Types within Level */}
                          {Object.entries(typeData).map(([type, typeSpaces]) => (
                            <React.Fragment key={`type-${level}-${type}`}>
                              {/* Type SubHeader */}
                              <TableRow className="bg-muted/30">
                                <TableCell colSpan={isAdmin ? 8 : 7} className="font-semibold text-muted-foreground pl-8">
                                  <Building className="h-3.5 w-3.5 inline mr-2" />
                                  {type}
                                </TableCell>
                              </TableRow>
                              {typeSpaces.map(renderSpaceRow)}
                              {renderTotalsRow(`Subtotal ${type}`, getGroupTotals(typeSpaces))}
                            </React.Fragment>
                          ))}
                          
                          {/* Level Subtotal */}
                          {renderTotalsRow(`Subtotal ${level}`, getLevelTotals(typeData))}
                        </React.Fragment>
                      ))}
                      {renderTotalsRow('TOTAL GENERAL', totals, true)}
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingSpace ? 'Editar Espacio' : 'Nuevo Espacio'}
            </DialogTitle>
            <DialogDescription>
              {editingSpace ? 'Modifica los datos del espacio' : 'Añade un nuevo espacio al presupuesto'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="space-name">Nombre del Espacio *</Label>
              <Input
                id="space-name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ej: Dormitorio Principal"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Espacio</Label>
                <Select
                  value={formData.space_type}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, space_type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPACE_TYPES.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Nivel</Label>
                <Select
                  value={formData.level}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, level: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map(level => (
                      <SelectItem key={level} value={level}>{level}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>m² Construidos</Label>
                <NumericInput
                  value={formData.m2_built}
                  onChange={(value) => setFormData(prev => ({ ...prev, m2_built: value }))}
                  placeholder="0,00"
                  decimals={2}
                />
              </div>

              <div className="space-y-2">
                <Label>m² Habitables</Label>
                <NumericInput
                  value={formData.m2_livable}
                  onChange={(value) => setFormData(prev => ({ ...prev, m2_livable: value }))}
                  placeholder="0,00"
                  decimals={2}
                />
              </div>
            </div>

            <div className="p-3 bg-muted rounded-lg">
              <div className="text-sm text-muted-foreground">m² Construcción (calculado)</div>
              <div className="text-xl font-bold">
                {formatNumber((formData.m2_built || 0) - (formData.m2_livable || 0))} m²
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observaciones</Label>
              <Textarea
                value={formData.observations}
                onChange={(e) => setFormData(prev => ({ ...prev, observations: e.target.value }))}
                placeholder="Notas adicionales sobre el espacio..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit}>
              {editingSpace ? 'Guardar Cambios' : 'Crear Espacio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Eliminar Espacio"
        description={`¿Estás seguro de que deseas eliminar el espacio "${spaceToDelete?.name}"? Esta acción no se puede deshacer.`}
      />
    </div>
  );
}
