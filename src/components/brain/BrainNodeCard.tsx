import { cn } from '@/lib/utils';
import { BrainNode } from '@/hooks/useBrainNodes';
import {
  Building2, FolderKanban, Calculator, Users, Calendar, FileText,
  Package, Wallet, UserCog, Settings, Brain, StickyNote, FileSpreadsheet,
  Layers, MessageSquare, BarChart3
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Building2, FolderKanban, Calculator, Users, Calendar, FileText,
  Package, Wallet, UserCog, Settings, Brain, StickyNote, FileSpreadsheet,
  Layers, MessageSquare, BarChart3,
};

interface BrainNodeCardProps {
  node: BrainNode;
  size: 'xs' | 'sm' | 'lg';
  isActive?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export function BrainNodeCard({ node, size, isActive, onClick, onDoubleClick }: BrainNodeCardProps) {
  const Icon = ICON_MAP[node.icon || ''] || (node.node_type === 'note' ? StickyNote : Brain);

  const sizeClasses = {
    xs: 'px-3 py-2 min-w-[100px] max-w-[140px]',
    sm: 'px-4 py-3 min-w-[120px] max-w-[180px]',
    lg: 'px-6 py-5 min-w-[200px] max-w-[280px]',
  };

  const iconSizes = {
    xs: 'h-4 w-4',
    sm: 'h-5 w-5',
    lg: 'h-7 w-7',
  };

  const textSizes = {
    xs: 'text-xs',
    sm: 'text-sm',
    lg: 'text-base font-semibold',
  };

  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        'rounded-xl border bg-card text-card-foreground shadow-sm transition-all duration-200',
        'flex flex-col items-center gap-1.5 text-center cursor-pointer select-none',
        'hover:shadow-md hover:border-primary/40 hover:scale-105',
        'active:scale-95',
        sizeClasses[size],
        isActive && 'ring-2 ring-primary shadow-lg border-primary/50 bg-primary/5',
        node.node_type === 'note' && 'border-dashed border-muted-foreground/30',
      )}
      style={{
        borderColor: isActive && node.color ? node.color + '60' : undefined,
        boxShadow: isActive && node.color ? `0 4px 20px ${node.color}20` : undefined,
      }}
    >
      <div
        className={cn('rounded-lg p-1.5', size === 'lg' ? 'p-2' : '')}
        style={{ backgroundColor: node.color ? node.color + '15' : undefined }}
      >
        <Icon
          className={cn(iconSizes[size])}
          style={{ color: node.color || undefined }}
        />
      </div>
      <span className={cn(textSizes[size], 'leading-tight line-clamp-2')}>
        {node.name}
      </span>
      {size === 'lg' && node.description && (
        <span className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
          {node.description}
        </span>
      )}
    </button>
  );
}
