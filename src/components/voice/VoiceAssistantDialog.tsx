import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Mic, MicOff, Send, Loader2, Volume2, VolumeX, Trash2 } from 'lucide-react';
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
  type: 'create_management' | 'create_entry' | 'search_contact' | 'general';
  data?: Record<string, any>;
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

  const {
    isListening,
    transcript,
    finalTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useVoiceInput({
    continuous: true,
    onFinalTranscript: (text) => {
      if (text.trim() && !isProcessing) {
        handleSendMessage(text.trim());
      }
    },
  });

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      stopListening();
      stopSpeaking();
      resetTranscript();
    }
  }, [open, stopListening, resetTranscript]);

  const stopSpeaking = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (!speechEnabled || !window.speechSynthesis) return;

    stopSpeaking();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    speechSynthRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [speechEnabled, stopSpeaking]);

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
      const contextPrompt = getContextPrompt(context, systemPrompt);
      
      const { data, error } = await supabase.functions.invoke('voice-assistant', {
        body: {
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          systemPrompt: contextPrompt,
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
      }

      // Auto-restart listening after response
      setTimeout(() => {
        if (open && !isSpeaking) {
          startListening();
        }
      }, 500);

    } catch (err: any) {
      console.error('Voice assistant error:', err);
      toast.error('Error al procesar tu mensaje');
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Lo siento, hubo un error al procesar tu solicitud. Por favor, intenta de nuevo.',
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearConversation = () => {
    setMessages([]);
    resetTranscript();
    stopSpeaking();
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
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
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4 max-h-[400px]" ref={scrollRef}>
          <div className="space-y-4 pb-4">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <Mic className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>Pulsa el micrófono y habla para empezar</p>
                <p className="text-sm mt-2">
                  Puedo ayudarte a crear gestiones, registrar asientos contables y más.
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
                <div className="bg-muted rounded-lg px-4 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
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

        {error && (
          <div className="text-sm text-destructive text-center py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-center gap-4 pt-4 border-t">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSpeechEnabled(!speechEnabled)}
            className="shrink-0"
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
              'h-16 w-16 rounded-full relative',
              isListening && 'animate-pulse'
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
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          {isListening 
            ? 'Escuchando... Habla ahora' 
            : isProcessing 
              ? 'Procesando...' 
              : 'Pulsa el micrófono para hablar'}
        </p>
      </DialogContent>
    </Dialog>
  );
}

function getContextPrompt(context: string, customPrompt?: string): string {
  if (customPrompt) return customPrompt;

  const prompts: Record<string, string> = {
    crm: `Eres un asistente de voz para un CRM de construcción. Ayudas a:
- Crear y gestionar contactos (clientes, proveedores)
- Registrar gestiones (tareas, reuniones, llamadas, visitas)
- Buscar información de contactos y oportunidades

Cuando el usuario quiera crear una gestión, extrae: título, tipo (Tarea/Reunión/Llamada/Visita), fecha si la menciona, y descripción.
Responde de forma concisa y en español.`,
    
    accounting: `Eres un asistente de voz para contabilidad de proyectos de construcción. Ayudas a:
- Registrar asientos contables (compras, ventas, pagos, cobros)
- Consultar el estado de cuentas
- Crear facturas

Cuando el usuario quiera crear un asiento, extrae: tipo de operación, importe, proveedor/cliente si lo menciona, y concepto.
Responde de forma concisa y en español.`,
    
    general: `Eres un asistente de voz para una aplicación de gestión de proyectos de construcción. 
Puedes ayudar con tareas generales, responder preguntas y guiar al usuario.
Responde de forma concisa y en español.`,
  };

  return prompts[context] || prompts.general;
}
