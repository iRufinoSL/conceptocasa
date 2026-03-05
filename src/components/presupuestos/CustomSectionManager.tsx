import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Trash2, ChevronDown, ChevronRight, Pencil, MapPin, Pentagon } from 'lucide-react';

export interface SectionPolygon {
  id: string;
  name: string;
  /** Ordered vertex coordinates as "X,Y,Z" strings */
  vertices: Array<{ x: number; y: number; z: number; label?: string }>;
}

export interface CustomSection {
  id: string;
  name: string;
  /** 'vertical' | 'longitudinal' | 'transversal' */
  sectionType: 'vertical' | 'longitudinal' | 'transversal';
  /** The axis this section is based on */
  axis: 'X' | 'Y' | 'Z';
  /** The value on that axis */
  axisValue: number;
  /** Polygons defined within this section */
  polygons: SectionPolygon[];
}

interface CustomSectionManagerProps {
  sectionType: 'vertical' | 'longitudinal' | 'transversal';
  sections: CustomSection[];
  onSectionsChange: (sections: CustomSection[]) => void;
}

const AXIS_MAP: Record<string, { axis: 'X' | 'Y' | 'Z'; label: string; placeholder: string }[]> = {
  vertical: [{ axis: 'Z', label: 'Eje Z', placeholder: 'Ej: 0 (Nivel 1)' }],
  longitudinal: [{ axis: 'Y', label: 'Eje Y', placeholder: 'Ej: 0 (Cara Superior)' }],
  transversal: [{ axis: 'X', label: 'Eje X', placeholder: 'Ej: 0 (Cara Izquierda)' }],
};

const TYPE_LABELS: Record<string, string> = {
  vertical: 'Vertical',
  longitudinal: 'Longitudinal',
  transversal: 'Transversal',
};

function generateId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CustomSectionManager({ sectionType, sections, onSectionsChange }: CustomSectionManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAxisValue, setNewAxisValue] = useState('0');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [editingPolygonOf, setEditingPolygonOf] = useState<string | null>(null);
  const [polygonName, setPolygonName] = useState('');
  const [polygonVertices, setPolygonVertices] = useState('');
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const axisConfig = AXIS_MAP[sectionType][0];
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
    onSectionsChange(sections.map(s => s.id === id ? { ...s, name: editName.trim() } : s));
    setEditingSectionId(null);
  };

  const toggleExpand = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const parseVertices = (text: string): Array<{ x: number; y: number; z: number }> => {
    // Format: "x1,y1,z1; x2,y2,z2; ..."
    return text.split(';').map(v => {
      const parts = v.trim().split(',').map(Number);
      return { x: parts[0] || 0, y: parts[1] || 0, z: parts[2] || 0 };
    }).filter(v => !isNaN(v.x));
  };

  const addPolygon = (sectionId: string) => {
    if (!polygonName.trim() || !polygonVertices.trim()) return;
    const vertices = parseVertices(polygonVertices);
    if (vertices.length < 2) return;
    const polygon: SectionPolygon = {
      id: generateId(),
      name: polygonName.trim(),
      vertices,
    };
    onSectionsChange(sections.map(s =>
      s.id === sectionId ? { ...s, polygons: [...s.polygons, polygon] } : s
    ));
    setPolygonName('');
    setPolygonVertices('');
    setEditingPolygonOf(null);
  };

  const deletePolygon = (sectionId: string, polygonId: string) => {
    onSectionsChange(sections.map(s =>
      s.id === sectionId
        ? { ...s, polygons: s.polygons.filter(p => p.id !== polygonId) }
        : s
    ));
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

      {/* Add form */}
      {showAddForm && (
        <Card className="border-dashed border-primary/30">
          <CardContent className="pt-3 pb-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Nombre de la Sección</Label>
                <Input
                  className="h-7 text-xs"
                  placeholder="Ej: Cara Superior"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
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

      {/* List of sections */}
      {filtered.length === 0 && !showAddForm && (
        <p className="text-[10px] text-muted-foreground italic py-2">No hay secciones definidas. Pulse "Nueva Sección" para crear una.</p>
      )}

      {filtered.map(section => {
        const isExpanded = expandedSections.has(section.id);
        return (
          <Collapsible key={section.id} open={isExpanded} onOpenChange={() => toggleExpand(section.id)}>
            <Card className="border-muted">
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted/50 rounded-t-lg">
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                    {editingSectionId === section.id ? (
                      <Input
                        className="h-6 text-xs w-40"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRename(section.id); if (e.key === 'Escape') setEditingSectionId(null); }}
                        onBlur={() => handleRename(section.id)}
                        autoFocus
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span className="text-xs font-medium">{section.name}</span>
                    )}
                    <Badge variant="secondary" className="text-[9px] h-4">
                      {section.axis}{section.axisValue}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] h-4">
                      <Pentagon className="h-2.5 w-2.5 mr-0.5" />{section.polygons.length}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => { setEditingSectionId(section.id); setEditName(section.name); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive" onClick={() => handleDelete(section.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-1 pb-2 space-y-2">
                  {/* Polygons list */}
                  {section.polygons.length === 0 && (
                    <p className="text-[10px] text-muted-foreground italic">Sin polígonos definidos.</p>
                  )}
                  {section.polygons.map(poly => (
                    <div key={poly.id} className="flex items-center justify-between bg-muted/30 rounded px-2 py-1">
                      <div className="flex items-center gap-2">
                        <Pentagon className="h-3 w-3 text-primary" />
                        <span className="text-[11px] font-medium">{poly.name}</span>
                        <span className="text-[9px] text-muted-foreground">
                          {poly.vertices.length} vértices: {poly.vertices.map(v => `(${v.x},${v.y},${v.z})`).join(' → ')}
                        </span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive" onClick={() => deletePolygon(section.id, poly.id)}>
                        <Trash2 className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  ))}

                  {/* Add polygon form */}
                  {editingPolygonOf === section.id ? (
                    <div className="border border-dashed border-primary/30 rounded p-2 space-y-1.5">
                      <div>
                        <Label className="text-[10px]">Nombre del polígono</Label>
                        <Input className="h-6 text-xs" placeholder="Ej: Muro principal" value={polygonName} onChange={e => setPolygonName(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-[10px]">Vértices (X,Y,Z separados por ;)</Label>
                        <Input className="h-6 text-xs" placeholder="0,0,0; 5,0,0; 5,0,10; 0,0,10" value={polygonVertices} onChange={e => setPolygonVertices(e.target.value)} />
                      </div>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => setEditingPolygonOf(null)}>Cancelar</Button>
                        <Button size="sm" className="h-5 text-[10px]" onClick={() => addPolygon(section.id)} disabled={!polygonName.trim() || !polygonVertices.trim()}>Añadir</Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="h-6 text-[10px] w-full" onClick={() => setEditingPolygonOf(section.id)}>
                      <Plus className="h-3 w-3 mr-1" /> Añadir Polígono
                    </Button>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}
