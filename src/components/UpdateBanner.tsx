import { useVersionCheck } from "@/hooks/useVersionCheck";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function UpdateBanner() {
  const { hasUpdate, updateApp } = useVersionCheck();

  if (!hasUpdate) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] animate-in slide-in-from-bottom-4 fade-in duration-500">
      <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-background/95 backdrop-blur-md shadow-lg px-4 py-3">
        <RefreshCw className="h-4 w-4 text-primary animate-spin" />
        <span className="text-sm font-medium text-foreground">
          Hay una nueva versión disponible
        </span>
        <Button size="sm" onClick={updateApp} className="ml-2">
          Reiniciar
        </Button>
      </div>
    </div>
  );
}
