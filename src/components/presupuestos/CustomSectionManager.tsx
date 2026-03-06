import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ChevronDown, ChevronRight, Pencil, MapPin } from 'lucide-react';

export interface SectionPolygon {
  id: string;
  name: string;
  vertices: Array<{ x: number; y: number; z: number; label?: string }>;
  zBase?: number;
  zTop?: number;
}

export interface CustomSection {
  id: string;
  name: string;
  sectionType: 'vertical' | 'longitudinal' | 'transversal';
  axis: 'X' | 'Y' | 'Z';
  axisValue: number;
  polygons: SectionPolygon[];
}

export interface ScaleConfig {
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  gridRange?: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
}

export interface SectionWallProjection {
  workspaceId: string;
  workspaceName: string;
  hStart: number;
  hEnd: number;
  zBase: number;
  zTop: number;
}

interface CustomSectionManagerProps {
  sectionType: 'vertical' | 'longitudinal' | 'transversal';
  sections: CustomSection[];
  onSectionsChange: (sections: CustomSection[]) => void;
  scaleConfig?: ScaleConfig;
  workspacesBySection?: Map<string, any[]>;
  wallProjectionsBySection?: Map<string, SectionWallProjection[]>;
}

const AXIS_MAP: Record<string, { axis: 'X' | 'Y' | 'Z'; label: string; placeholder: string }> = {
  vertical: { axis: 'Z', label: 'Eje Z', placeholder: 'Ej: 0 (Nivel 1)' },
  longitudinal: { axis: 'Y', label: 'Eje Y', placeholder: 'Ej: 0 (Cara Superior)' },
  transversal: { axis: 'X', label: 'Eje X', placeholder: 'Ej: 0 (Cara Izquierda)' },
};

const TYPE_LABELS: Record<string, string> = {
  vertical: 'Vertical',
  longitudinal: 'Longitudinal',
  transversal: 'Transversal',
};

const AXIS_DESCRIPTION: Record<string, string> = {
  vertical: 'Plano a nivel Z — define la cota de altura',
  longitudinal: 'Corte en Y — sección longitudinal del edificio',
  transversal: 'Corte en X — sección transversal del edificio',
};

function generateId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CustomSectionManager({ sectionType, sections, onSectionsChange }: CustomSectionManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAxisValue, setNewAxisValue] = useState('0');
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAxisValue, setEditAxisValue] = useState('0');

  const axisConfig = AXIS_MAP[sectionType];
  const filtered = sections.filter(s => s.sectionType === sectionType);

  const handleAdd = () => {
    if (!newName.trim()) return;
    const val = parseFloat(newAxisValue) || 0;
    const section: CustomSection = {
      id: generateId(),
      name: newName.trim(),
      sectionType,
      axis: axisConfig.axis,
      axisValue: val,
      polygons: [],
    };
    onSectionsChange([...sections, section]);
    setNewName('');
    setNewAxisValue('0');
    setShowAddForm(false);
  };

  const handleDelete = (id: string) => {
    onSectionsChange(sections.filter(s => s.id !== id));
  };

  const handleRename = (id: string) => {
    if (!editName.trim()) return;
    const val = parseFloat(editAxisValue) || 0;
    onSectionsChange(sections.map(s =>
      s.id === id ? { ...s, name: editName.trim(), axisValue: val } : s
    ));
    setEditingSectionId(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          Secciones {TYPE_LABELS[sectionType]}
          <Badge variant="outline" className="text-[9px] h-4">{filtered.length}</Badge>
        </h4>
        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="h-3 w-3 mr-1" /> Nueva Sección
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground italic">{AXIS_DESCRIPTION[sectionType]}</p>

      {showAddForm && (
        <Card className="border-dashed border-primary/30">
          <CardContent className="pt-3 pb-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Nombre de la Sección</Label>
                <Input
                  className="h-7 text-xs"
                  placeholder="Ej: Nivel 0"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-[10px]">{axisConfig.label} (valor)</Label>
                <Input
                  className="h-7 text-xs"
                  type="number"
                  placeholder={axisConfig.placeholder}
                  value={newAxisValue}
                  onChange={e => setNewAxisValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
            </div>
            <div className="flex gap-1 justify-end">
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowAddForm(false)}>Cancelar</Button>
              <Button size="sm" className="h-6 text-[10px]" onClick={handleAdd} disabled={!newName.trim()}>Crear</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 && !showAddForm && (
        <p className="text-[10px] text-muted-foreground italic py-2">No hay secciones definidas. Pulse "Nueva Sección" para crear una.</p>
      )}

      {filtered.map(section => {
        const isEditing = editingSectionId === section.id;

        return (
          <div key={section.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {isEditing ? (
                <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
                  <Input
                    className="h-7 text-xs w-36"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename(section.id);
                      if (e.key === 'Escape') setEditingSectionId(null);
                    }}
                    autoFocus
                    placeholder="Nombre"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">{axisConfig.label}=</span>
                    <Input
                      className="h-7 text-xs w-16"
                      type="number"
                      value={editAxisValue}
                      onChange={e => setEditAxisValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(section.id);
                        if (e.key === 'Escape') setEditingSectionId(null);
                      }}
                    />
                  </div>
                  <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => handleRename(section.id)}>Guardar</Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setEditingSectionId(null)}>Cancelar</Button>
                </div>
              ) : (
                <>
                  <span className="text-xs font-semibold truncate">{section.name}</span>
                  <Badge variant="secondary" className="text-[9px] h-4 shrink-0">
                    {section.axis}={section.axisValue}
                  </Badge>
                </>
              )}
            </div>
            {!isEditing && (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost" size="sm" className="h-7 w-7 p-0"
                  onClick={() => {
                    setEditingSectionId(section.id);
                    setEditName(section.name);
                    setEditAxisValue(String(section.axisValue));
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(section.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
