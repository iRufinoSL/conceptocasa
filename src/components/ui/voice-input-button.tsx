import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  showTooltip?: boolean;
}

export function VoiceInputButton({
  onTranscript,
  disabled = false,
  className,
  size = 'icon',
  variant = 'outline',
  showTooltip = true,
}: VoiceInputButtonProps) {
  const {
    isListening,
    transcript,
    error,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useVoiceInput({
    onFinalTranscript: (text) => {
      if (text.trim()) {
        onTranscript(text.trim());
      }
    },
  });

  const handleClick = () => {
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      startListening();
    }
  };

  if (!isSupported) {
    if (!showTooltip) return null;
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={variant}
              size={size}
              disabled
              className={cn('opacity-50', className)}
            >
              <MicOff className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Reconocimiento de voz no soportado</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const button = (
    <Button
      type="button"
      variant={isListening ? 'destructive' : variant}
      size={size}
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'relative transition-all',
        isListening && 'animate-pulse',
        className
      )}
    >
      {isListening ? (
        <Mic className="h-4 w-4" />
      ) : error ? (
        <AlertCircle className="h-4 w-4" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
      {isListening && (
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 animate-ping" />
      )}
    </Button>
  );

  if (!showTooltip) return button;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>
          <p>
            {error 
              ? error 
              : isListening 
                ? 'Escuchando... Click para parar' 
                : 'Click para dictar'}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
