import { useState, useCallback, useRef, useEffect } from 'react';

interface UseVoiceInputOptions {
  onTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  continuous?: boolean;
  language?: string;
}

interface UseVoiceInputReturn {
  isListening: boolean;
  transcript: string;
  finalTranscript: string;
  error: string | null;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const {
    onTranscript,
    onFinalTranscript,
    continuous = true,
    language = 'es-ES',
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // Check if Web Speech API is supported
  const isSupported = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setError(getErrorMessage(event.error));
      setIsListening(false);
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (finalText) {
        setFinalTranscript(prev => {
          const newTranscript = prev ? `${prev} ${finalText}` : finalText;
          onFinalTranscript?.(newTranscript);
          return newTranscript;
        });
      }

      const currentTranscript = finalTranscript + (finalText ? ' ' + finalText : '') + interimTranscript;
      setTranscript(currentTranscript);
      onTranscript?.(currentTranscript);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
    };
  }, [isSupported, continuous, language, onTranscript, onFinalTranscript, finalTranscript]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('El reconocimiento de voz no está soportado en este navegador');
      return;
    }

    setError(null);
    try {
      recognitionRef.current?.start();
    } catch (e) {
      // Recognition might already be started
      console.warn('Recognition start error:', e);
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setFinalTranscript('');
  }, []);

  return {
    isListening,
    transcript,
    finalTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  };
}

function getErrorMessage(error: string): string {
  switch (error) {
    case 'no-speech':
      return 'No se detectó voz. Intente de nuevo.';
    case 'audio-capture':
      return 'No se pudo acceder al micrófono.';
    case 'not-allowed':
      return 'Permiso de micrófono denegado.';
    case 'network':
      return 'Error de red. Verifique su conexión.';
    case 'aborted':
      return 'Reconocimiento cancelado.';
    case 'service-not-allowed':
      return 'Servicio de reconocimiento no disponible.';
    default:
      return `Error: ${error}`;
  }
}

// Type declarations for Web Speech API
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}
