import { useState } from 'react';
import { useTrades, Trade } from '@/hooks/useTrades';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Check, ChevronsUpDown, Plus, HardHat, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResourceTradeSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

export function ResourceTradeSelect({ value, onChange }: ResourceTradeSelectProps) {
  const { trades, loading, createTrade } = useTrades();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTradeName, setNewTradeName] = useState('');
  const [creating, setCreating] = useState(false);

  const selectedTrade = trades.find(t => t.id === value);

  const handleCreate = async () => {
    if (!newTradeName.trim()) return;
    
    setCreating(true);
    const created = await createTrade(newTradeName);
    setCreating(false);
    
    if (created) {
      onChange(created.id);
      setNewTradeName('');
      setShowCreate(false);
      setOpen(false);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={loading}
        >
          <div className="flex items-center gap-2 truncate">
            <HardHat className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className={cn(!selectedTrade && "text-muted-foreground", "truncate")}>
              {selectedTrade ? selectedTrade.name : "Seleccionar oficio/sector..."}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {selectedTrade && (
              <X
                className="h-4 w-4 text-muted-foreground hover:text-foreground"
                onClick={handleClear}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        {showCreate ? (
          <div className="p-3 space-y-3">
            <p className="text-sm font-medium">Crear nuevo oficio/sector</p>
            <Input
              placeholder="Ej: Soldadura, Telecomunicaciones..."
              value={newTradeName}
              onChange={(e) => setNewTradeName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setShowCreate(false);
                  setNewTradeName('');
                }}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={handleCreate}
                disabled={!newTradeName.trim() || creating}
              >
                {creating ? 'Creando...' : 'Crear'}
              </Button>
            </div>
          </div>
        ) : (
          <Command>
            <CommandInput placeholder="Buscar oficio/sector..." />
            <CommandList>
              <CommandEmpty>No se encontraron oficios/sectores.</CommandEmpty>
              <CommandGroup>
                {trades.map((trade) => (
                  <CommandItem
                    key={trade.id}
                    value={trade.name}
                    onSelect={() => {
                      onChange(trade.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === trade.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {trade.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup forceMount>
                <CommandItem
                  onSelect={() => setShowCreate(true)}
                  className="text-primary cursor-pointer"
                  forceMount
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Crear nuevo oficio/sector
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
