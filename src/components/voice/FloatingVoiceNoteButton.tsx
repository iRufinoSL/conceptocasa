import { useState } from 'react';
import { Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { VoiceNoteDialog } from './VoiceNoteDialog';

export function FloatingVoiceNoteButton() {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Only show for authenticated users
  if (!user) return null;

  return (
    <>
      <Button
        onClick={() => setDialogOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg',
          'bg-primary hover:bg-primary/90 text-primary-foreground',
          'transition-all duration-300 hover:scale-110',
          'flex items-center justify-center',
          'ring-2 ring-primary/20 ring-offset-2 ring-offset-background'
        )}
        size="icon"
        aria-label="Grabar nota de voz"
      >
        <Mic className="h-6 w-6" />
      </Button>

      <VoiceNoteDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
