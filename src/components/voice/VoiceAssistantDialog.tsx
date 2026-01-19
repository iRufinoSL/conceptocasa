import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Mic, MicOff, Loader2, Volume2, VolumeX, Trash2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface VoiceAssistantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: string;
  systemPrompt?: string;
  onActionDetected?: (action: VoiceAction) => void;
}

export interface VoiceAction {
  type: 'create_management' | 'create_entry' | 'create_payment_entry' | 'search_contact' | 'general';
  data?: Record<string, unknown>;
  rawText: string;
}

export function VoiceAssistantDialog({
  open,
  onOpenChange,
  context = 'general',
  systemPrompt,
  onActionDetected,
}: VoiceAssistantDialogProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const lastProcessedRef = useRef<string>('');

  const {
    isListening,
    transcript,
    error: voiceError,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useVoiceInput({
    continuous: true,
    onFinalTranscript: (text) => {
      // Debounce: avoid processing the same text twice
      const trimmedText = text.trim();
      if (trimmedText && trimmedText !== lastProcessedRef.current && !isProcessing) {
        lastProcessedRef.current = trimmedText;
        handleSendMessage(trimmedText);
      }
    },
  });

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, transcript]);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      stopListening();
      stopSpeaking();
      resetTranscript();
      lastProcessedRef.current = '';
    }
  }, [open, stopListening, resetTranscript]);

  // Show welcome message on open
  useEffect(() => {
    if (open && messages.length === 0) {
      const welcomeMessage = getWelcomeMessage(context);
      if (welcomeMessage) {
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: welcomeMessage,
        }]);
        if (speechEnabled) {
          setTimeout(() => speak(welcomeMessage), 500);
        }
      }
    }
  }, [open, context, speechEnabled]);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (!speechEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;

    stopSpeaking();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Try to find a Spanish voice
    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(v => v.lang.startsWith('es'));
    if (spanishVoice) {
      utterance.voice = spanishVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      // Auto-restart listening after speaking
      if (open && !isProcessing) {
        setTimeout(() => {
          startListening();
        }, 300);
      }
    };
    utterance.onerror = () => setIsSpeaking(false);

    speechSynthRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [speechEnabled, stopSpeaking, open, isProcessing, startListening]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isProcessing) return;

    stopListening();
    stopSpeaking();

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    };

    setMessages(prev => [...prev, userMessage]);
    resetTranscript();
    setIsProcessing(true);

    try {
      const { data, error } = await supabase.functions.invoke('voice-assistant', {
        body: {
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          systemPrompt,
          context,
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || 'No pude procesar tu solicitud.',
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // Speak the response
      speak(assistantMessage.content);

      // Check for detected actions
      if (data.action && onActionDetected) {
        onActionDetected({
          type: data.action.type,
          data: data.action.data,
          rawText: text,
        });
        toast.success('Acción detectada: ' + data.action.type);
      }

    } catch (err: unknown) {
      console.error('Voice assistant error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Error: ' + errorMessage);
      
      const errorResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Lo siento, hubo un error al procesar tu solicitud. Por favor, intenta de nuevo.',
      };
      setMessages(prev => [...prev, errorResponse]);
      speak(errorResponse.content);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearConversation = () => {
    setMessages([]);
    resetTranscript();
    stopSpeaking();
    lastProcessedRef.current = '';
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      lastProcessedRef.current = '';
      startListening();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Asistente de Voz
            {context === 'accounting' && <span className="text-sm font-normal text-muted-foreground">- Contabilidad</span>}
            {context === 'crm' && <span className="text-sm font-normal text-muted-foreground">- CRM</span>}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4 max-h-[400px]" ref={scrollRef}>
          <div className="space-y-4 pb-4">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <Mic className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>Pulsa el micrófono y habla para empezar</p>
                <p className="text-sm mt-2">
                  {context === 'accounting' 
                    ? 'Di "Quiero abrir un asiento de pago" para empezar'
                    : 'Puedo ayudarte a crear gestiones, registrar asientos y más.'}
                </p>
              </div>
            )}
            
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-4 py-2',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}

            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-2 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Procesando...</span>
                </div>
              </div>
            )}

            {transcript && isListening && (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-lg px-4 py-2 bg-primary/50 text-primary-foreground">
                  <p className="text-sm italic">{transcript}</p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {voiceError && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{voiceError}</span>
          </div>
        )}

        {!isSupported && (
          <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Tu navegador no soporta reconocimiento de voz. Prueba con Chrome o Edge.</span>
          </div>
        )}

        <div className="flex items-center justify-center gap-4 pt-4 border-t">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSpeechEnabled(!speechEnabled)}
            className="shrink-0"
            title={speechEnabled ? 'Desactivar respuestas de voz' : 'Activar respuestas de voz'}
          >
            {speechEnabled ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </Button>

          <Button
            size="lg"
            variant={isListening ? 'destructive' : 'default'}
            onClick={toggleListening}
            disabled={!isSupported || isProcessing}
            className={cn(
              'h-16 w-16 rounded-full relative transition-all',
              isListening && 'animate-pulse shadow-lg shadow-destructive/50'
            )}
          >
            {isListening ? (
              <MicOff className="h-6 w-6" />
            ) : (
              <Mic className="h-6 w-6" />
            )}
            {isListening && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 animate-ping" />
            )}
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={clearConversation}
            disabled={messages.length === 0}
            className="shrink-0"
            title="Limpiar conversación"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          {isListening 
            ? '🔴 Escuchando... Habla ahora' 
            : isProcessing 
              ? '⏳ Procesando...' 
              : isSpeaking
                ? '🔊 Reproduciendo respuesta...'
                : '🎤 Pulsa el micrófono para hablar'}
        </p>
      </DialogContent>
    </Dialog>
  );
}

function getWelcomeMessage(context: string): string {
  switch (context) {
    case 'accounting':
      return '¡Hola! Soy tu asistente de contabilidad. Puedo ayudarte a registrar asientos de pago, cobro, compra o venta. ¿Qué necesitas?';
    case 'crm':
      return '¡Hola! Soy tu asistente de CRM. Puedo ayudarte a crear gestiones, contactos y más. ¿Qué necesitas?';
    default:
      return '';
  }
}
