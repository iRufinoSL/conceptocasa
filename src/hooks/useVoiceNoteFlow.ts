import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { toast } from '@/hooks/use-toast';

export type VoiceNoteStep = 'idle' | 'asking_message' | 'recording_message' | 'asking_date' | 'recording_date' | 'asking_contact' | 'recording_contact' | 'asking_budget' | 'recording_budget' | 'processing' | 'summary' | 'saving' | 'done' | 'error';

interface VoiceNoteData {
  message: string;
  reminderAt: string | null;
  reminderDescription: string | null;
  contactId: string | null;
  contactName: string | null;
  budgetId: string | null;
  budgetName: string | null;
}

export function useVoiceNoteFlow() {
  const [step, setStep] = useState<VoiceNoteStep>('idle');
  const [data, setData] = useState<VoiceNoteData>({
    message: '',
    reminderAt: null,
    reminderDescription: null,
    contactId: null,
    contactName: null,
    budgetId: null,
    budgetName: null,
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentStepRef = useRef<VoiceNoteStep>('idle');

  const voiceInput = useVoiceInput({
    continuous: false,
    onFinalTranscript: (text) => {
      if (text.trim()) {
        handleVoiceResult(currentStepRef.current, text.trim());
      }
    },
  });

  const speak = useCallback(async (text: string): Promise<void> => {
    setIsSpeaking(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({ text }),
        }
      );

      if (!response.ok) {
        console.error('[VoiceNote] TTS failed:', response.status);
        setIsSpeaking(false);
        return;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      return new Promise<void>((resolve) => {
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          setIsSpeaking(false);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          setIsSpeaking(false);
          resolve();
        };
        audio.play().catch(() => {
          setIsSpeaking(false);
          resolve();
        });
      });
    } catch (error) {
      console.error('[VoiceNote] TTS error:', error);
      setIsSpeaking(false);
    }
  }, []);

  const parseAction = useCallback(async (action: string, text: string) => {
    const session = await supabase.auth.getSession();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-voice-note`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${session.data.session?.access_token}`,
        },
        body: JSON.stringify({ action, text }),
      }
    );
    if (!response.ok) throw new Error('Parse failed');
    return response.json();
  }, []);

  const handleVoiceResult = useCallback(async (currentStep: VoiceNoteStep, text: string) => {
    voiceInput.stopListening();

    switch (currentStep) {
      case 'recording_message': {
        setData(prev => ({ ...prev, message: text }));
        setStep('asking_date');
        currentStepRef.current = 'asking_date';
        await speak('¿Cuándo quieres que te recuerde este mensaje?');
        setStep('recording_date');
        currentStepRef.current = 'recording_date';
        voiceInput.resetTranscript();
        setTimeout(() => voiceInput.startListening(), 500);
        break;
      }
      case 'recording_date': {
        setIsProcessing(true);
        try {
          const result = await parseAction('parse_date', text);
          setData(prev => ({
            ...prev,
            reminderAt: result.datetime || null,
            reminderDescription: result.description || null,
          }));
        } catch (e) {
          console.error('[VoiceNote] Date parse error:', e);
        }
        setIsProcessing(false);
        setStep('asking_contact');
        currentStepRef.current = 'asking_contact';
        await speak('¿Está relacionado este mensaje con algún contacto?');
        setStep('recording_contact');
        currentStepRef.current = 'recording_contact';
        voiceInput.resetTranscript();
        setTimeout(() => voiceInput.startListening(), 500);
        break;
      }
      case 'recording_contact': {
        setIsProcessing(true);
        try {
          const result = await parseAction('match_contact', text);
          setData(prev => ({
            ...prev,
            contactId: result.contact_id || null,
            contactName: result.contact_name || null,
          }));
        } catch (e) {
          console.error('[VoiceNote] Contact match error:', e);
        }
        setIsProcessing(false);
        setStep('asking_budget');
        currentStepRef.current = 'asking_budget';
        await speak('¿Este mensaje está relacionado con algún presupuesto?');
        setStep('recording_budget');
        currentStepRef.current = 'recording_budget';
        voiceInput.resetTranscript();
        setTimeout(() => voiceInput.startListening(), 500);
        break;
      }
      case 'recording_budget': {
        setIsProcessing(true);
        try {
          const result = await parseAction('match_budget', text);
          setData(prev => ({
            ...prev,
            budgetId: result.budget_id || null,
            budgetName: result.budget_name || null,
          }));
        } catch (e) {
          console.error('[VoiceNote] Budget match error:', e);
        }
        setIsProcessing(false);
        setStep('summary');
        currentStepRef.current = 'summary';
        break;
      }
    }
  }, [voiceInput, speak, parseAction]);

  const startFlow = useCallback(async () => {
    setData({
      message: '',
      reminderAt: null,
      reminderDescription: null,
      contactId: null,
      contactName: null,
      budgetId: null,
      budgetName: null,
    });
    setStep('asking_message');
    currentStepRef.current = 'asking_message';
    
    await speak('¿Cuál es el mensaje que quieres grabar?');
    
    setStep('recording_message');
    currentStepRef.current = 'recording_message';
    voiceInput.resetTranscript();
    setTimeout(() => voiceInput.startListening(), 500);
  }, [speak, voiceInput]);

  const saveNote = useCallback(async () => {
    setStep('saving');
    try {
      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user.id;
      if (!userId) throw new Error('No user');

      const { error } = await supabase
        .from('voice_notes')
        .insert({
          created_by: userId,
          message: data.message,
          reminder_at: data.reminderAt,
          contact_id: data.contactId,
          contact_name: data.contactName,
          budget_id: data.budgetId,
          budget_name: data.budgetName,
        });

      if (error) throw error;

      await speak('Mensaje guardado correctamente.');
      setStep('done');
      currentStepRef.current = 'done';
      
      toast({
        title: 'Nota de voz guardada',
        description: data.reminderAt ? `Recordatorio: ${data.reminderDescription}` : 'Sin recordatorio programado',
      });
    } catch (error) {
      console.error('[VoiceNote] Save error:', error);
      setStep('error');
      toast({
        title: 'Error al guardar',
        description: 'No se pudo guardar la nota de voz',
        variant: 'destructive',
      });
    }
  }, [data, speak]);

  const cancel = useCallback(() => {
    voiceInput.stopListening();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setStep('idle');
    currentStepRef.current = 'idle';
    setIsSpeaking(false);
    setIsProcessing(false);
  }, [voiceInput]);

  const reset = useCallback(() => {
    cancel();
    setData({
      message: '',
      reminderAt: null,
      reminderDescription: null,
      contactId: null,
      contactName: null,
      budgetId: null,
      budgetName: null,
    });
  }, [cancel]);

  return {
    step,
    data,
    isSpeaking,
    isProcessing,
    isListening: voiceInput.isListening,
    transcript: voiceInput.transcript,
    isSupported: voiceInput.isSupported,
    startFlow,
    saveNote,
    cancel,
    reset,
  };
}
