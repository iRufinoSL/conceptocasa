import { ExternalResource } from '@/types/resource';
import { Card, CardContent } from '@/components/ui/card';
import { Package, TrendingUp, Layers, Euro } from 'lucide-react';

interface StatsCardsProps {
  resources: ExternalResource[];
}

export function StatsCards({ resources }: StatsCardsProps) {
  const totalResources = resources.length;
  const totalTypes = new Set(resources.map((r) => r.resourceType)).size;
  const avgCost =
    resources.length > 0
      ? resources.reduce((acc, r) => acc + r.unitCost, 0) / resources.length
      : 0;
  const maxCost = resources.length > 0 ? Math.max(...resources.map((r) => r.unitCost)) : 0;

  const stats = [
    {
      label: 'Total Recursos',
      value: totalResources,
      icon: Package,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
    },
    {
      label: 'Tipos Diferentes',
      value: totalTypes,
      icon: Layers,
      color: 'text-purple-600',
      bg: 'bg-purple-100',
    },
    {
      label: 'Coste Medio',
      value: avgCost.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }),
      icon: TrendingUp,
      color: 'text-emerald-600',
      bg: 'bg-emerald-100',
    },
    {
      label: 'Coste Máximo',
      value: maxCost.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }),
      icon: Euro,
      color: 'text-amber-600',
      bg: 'bg-amber-100',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground truncate">{stat.label}</p>
                <p className="text-lg font-bold text-foreground truncate">{stat.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
