import { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Mic,
  MicOff,
  Volume2,
  Loader2,
  Check,
  X,
  Calendar,
  User,
  FileText,
  MessageSquare,
  Save,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVoiceNoteFlow, type VoiceNoteStep } from '@/hooks/useVoiceNoteFlow';

interface VoiceNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const stepLabels: Record<VoiceNoteStep, string> = {
  idle: 'Listo para grabar',
  asking_message: 'Preparando...',
  recording_message: '🎤 Dictando mensaje...',
  asking_date: 'Procesando...',
  recording_date: '🎤 Dictando fecha...',
  asking_contact: 'Procesando...',
  recording_contact: '🎤 Dictando contacto...',
  disambiguating_contact: 'Eligiendo contacto...',
  recording_contact_choice: '🎤 ¿Cuál contacto?',
  asking_budget: 'Procesando...',
  recording_budget: '🎤 Dictando presupuesto...',
  disambiguating_budget: 'Eligiendo presupuesto...',
  recording_budget_choice: '🎤 ¿Cuál presupuesto?',
  processing: 'Procesando...',
  summary: 'Resumen de la nota',
  saving: 'Guardando...',
  done: '¡Nota guardada!',
  error: 'Error',
};

export function VoiceNoteDialog({ open, onOpenChange }: VoiceNoteDialogProps) {
  const {
    step,
    data,
    isSpeaking,
    isProcessing,
    isListening,
    transcript,
    isSupported,
    startFlow,
    saveNote,
    cancel,
    reset,
  } = useVoiceNoteFlow();

  // Auto-start when dialog opens
  useEffect(() => {
    if (open && step === 'idle') {
      const timer = setTimeout(() => startFlow(), 300);
      return () => clearTimeout(timer);
    }
  }, [open, step, startFlow]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open && step !== 'idle') {
      cancel();
    }
  }, [open, cancel, step]);

  const handleClose = () => {
    cancel();
    onOpenChange(false);
  };

  const handleDone = () => {
    reset();
    onOpenChange(false);
  };

  const isRecording = step.startsWith('recording_');
  const isAsking = step.startsWith('asking_') || step.startsWith('disambiguating_');
  const showPulse = isListening || isSpeaking;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            Nota de Voz
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status indicator */}
          <div className="flex items-center justify-center">
            <div className={cn(
              'flex items-center justify-center h-20 w-20 rounded-full transition-all duration-500',
              isSpeaking && 'bg-blue-100 dark:bg-blue-900/30',
              isListening && 'bg-red-100 dark:bg-red-900/30 animate-pulse',
              isProcessing && 'bg-amber-100 dark:bg-amber-900/30',
              step === 'done' && 'bg-green-100 dark:bg-green-900/30',
              step === 'error' && 'bg-destructive/10',
              step === 'summary' && 'bg-primary/10',
              !showPulse && !isProcessing && step !== 'done' && step !== 'error' && step !== 'summary' && 'bg-muted',
            )}>
              {isSpeaking && <Volume2 className="h-8 w-8 text-blue-600 dark:text-blue-400 animate-pulse" />}
              {isListening && <Mic className="h-8 w-8 text-red-600 dark:text-red-400" />}
              {isProcessing && <Loader2 className="h-8 w-8 text-amber-600 dark:text-amber-400 animate-spin" />}
              {step === 'done' && <Check className="h-8 w-8 text-green-600 dark:text-green-400" />}
              {step === 'error' && <AlertCircle className="h-8 w-8 text-destructive" />}
              {step === 'summary' && <MessageSquare className="h-8 w-8 text-primary" />}
              {step === 'saving' && <Loader2 className="h-8 w-8 text-primary animate-spin" />}
              {step === 'idle' && <MicOff className="h-8 w-8 text-muted-foreground" />}
            </div>
          </div>

          {/* Step label */}
          <p className="text-center text-sm font-medium text-muted-foreground">
            {stepLabels[step]}
          </p>

          {/* Live transcript */}
          {isRecording && transcript && (
            <div className="rounded-lg bg-muted/50 p-3 min-h-[60px]">
              <p className="text-sm italic text-foreground">{transcript}</p>
            </div>
          )}

          {/* Not supported warning */}
          {!isSupported && (
            <div className="rounded-lg bg-destructive/10 p-3 text-center">
              <p className="text-sm text-destructive">
                Tu navegador no soporta reconocimiento de voz. Usa Chrome, Edge o Safari.
              </p>
            </div>
          )}

          {/* Summary view */}
          {step === 'summary' && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start gap-2">
                <MessageSquare className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Mensaje</p>
                  <p className="text-sm">{data.message}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Recordatorio</p>
                  <p className="text-sm">
                    {data.reminderDescription || 'Sin recordatorio'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <User className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Contacto</p>
                  <p className="text-sm">
                    {data.contactName || 'Sin contacto'}
                    {data.contactId && <Badge variant="outline" className="ml-2 text-xs">Vinculado</Badge>}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Presupuesto</p>
                  <p className="text-sm">
                    {data.budgetName || 'Sin presupuesto'}
                    {data.budgetId && <Badge variant="outline" className="ml-2 text-xs">Vinculado</Badge>}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-2">
            {step === 'summary' && (
              <>
                <Button variant="outline" onClick={handleClose} size="sm">
                  <X className="h-4 w-4 mr-1" />
                  Cancelar
                </Button>
                <Button variant="outline" onClick={() => { reset(); startFlow(); }} size="sm">
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Repetir
                </Button>
                <Button onClick={saveNote} size="sm">
                  <Save className="h-4 w-4 mr-1" />
                  Guardar
                </Button>
              </>
            )}

            {step === 'done' && (
              <Button onClick={handleDone} size="sm">
                <Check className="h-4 w-4 mr-1" />
                Cerrar
              </Button>
            )}

            {step === 'error' && (
              <>
                <Button variant="outline" onClick={handleClose} size="sm">
                  Cerrar
                </Button>
                <Button onClick={() => { reset(); startFlow(); }} size="sm">
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reintentar
                </Button>
              </>
            )}

            {(isRecording || isAsking || isProcessing || isSpeaking) && (
              <Button variant="outline" onClick={handleClose} size="sm">
                <X className="h-4 w-4 mr-1" />
                Cancelar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
