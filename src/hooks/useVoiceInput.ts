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
  const shouldRestartRef = useRef(true);
  const isInitializedRef = useRef(false);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check if Web Speech API is supported
  const isSupported = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        // Ignore errors on cleanup
      }
    }
  }, []);

  useEffect(() => {
    if (!isSupported || isInitializedRef.current) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      console.warn('Speech Recognition API not available');
      return;
    }

    const recognition = new SpeechRecognitionAPI();

    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('[VoiceInput] Recognition started successfully');
      setIsListening(true);
      setError(null);
    };

    recognition.onend = () => {
      console.log('[VoiceInput] Recognition ended, shouldRestart:', shouldRestartRef.current);
      setIsListening(false);
      
      // Auto-restart if in continuous mode and not manually stopped
      if (continuous && shouldRestartRef.current && recognitionRef.current) {
        restartTimeoutRef.current = setTimeout(() => {
          if (shouldRestartRef.current && recognitionRef.current) {
            try {
              console.log('[VoiceInput] Auto-restarting recognition...');
              recognitionRef.current.start();
            } catch (e) {
              console.log('[VoiceInput] Could not auto-restart:', e);
            }
          }
        }, 200);
      }
    };

    recognition.onerror = (event: any) => {
      console.log('[VoiceInput] Recognition error:', event.error, event.message);
      
      // Handle specific errors
      switch (event.error) {
        case 'aborted':
          // Intentional abort, don't show error
          break;
        case 'no-speech':
          // No speech detected - in continuous mode, just restart
          if (continuous) {
            console.log('[VoiceInput] No speech detected, will auto-restart');
          } else {
            setError('No se detectó voz. Habla más alto o acércate al micrófono.');
          }
          break;
        case 'audio-capture':
          setError('No se pudo acceder al micrófono. Verifica los permisos.');
          shouldRestartRef.current = false;
          break;
        case 'not-allowed':
          setError('Permiso de micrófono denegado. Permite el acceso en la configuración del navegador.');
          shouldRestartRef.current = false;
          break;
        case 'network':
          setError('Error de red. Verifica tu conexión a internet.');
          break;
        case 'service-not-allowed':
          setError('El servicio de reconocimiento de voz no está disponible en este navegador.');
          shouldRestartRef.current = false;
          break;
        default:
          setError(`Error de reconocimiento: ${event.error}`);
      }
      
      // Always update listening state on error
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setIsListening(false);
      }
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcriptText = result[0].transcript;
        
        if (result.isFinal) {
          finalText += transcriptText;
          console.log('[VoiceInput] Final result:', transcriptText, 'confidence:', result[0].confidence);
        } else {
          interimTranscript += transcriptText;
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
    isInitializedRef.current = true;

    return () => {
      cleanup();
      isInitializedRef.current = false;
    };
  }, [isSupported, continuous, language, onTranscript, onFinalTranscript, finalTranscript, cleanup]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('El reconocimiento de voz no está soportado en este navegador. Usa Chrome, Edge o Safari.');
      return;
    }

    // Clear any pending restart
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    shouldRestartRef.current = true;
    setError(null);
    
    // Request microphone permission first
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => {
          console.log('[VoiceInput] Microphone permission granted');
          try {
            recognitionRef.current?.start();
          } catch (e) {
            console.warn('[VoiceInput] Recognition start error:', e);
            // If already running, stop and restart
            try {
              recognitionRef.current?.stop();
              setTimeout(() => {
                try {
                  recognitionRef.current?.start();
                } catch (e2) {
                  console.error('[VoiceInput] Failed to restart:', e2);
                }
              }, 100);
            } catch (e2) {
              console.error('[VoiceInput] Failed to stop:', e2);
            }
          }
        })
        .catch((err) => {
          console.error('[VoiceInput] Microphone permission denied:', err);
          setError('Permiso de micrófono denegado. Permite el acceso para usar el asistente de voz.');
        });
    } else {
      // Fallback for browsers without getUserMedia
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.warn('[VoiceInput] Recognition start error:', e);
      }
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    console.log('[VoiceInput] Stopping listening...');
    shouldRestartRef.current = false;
    
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    
    try {
      recognitionRef.current?.stop();
    } catch (e) {
      console.warn('[VoiceInput] Stop error:', e);
    }
    
    setIsListening(false);
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

// Type declarations for Web Speech API
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}
