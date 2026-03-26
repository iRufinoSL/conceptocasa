import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Languages, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const LANGUAGES = [
  { code: 'en', label: 'Inglés' },
  { code: 'fr', label: 'Francés' },
  { code: 'de', label: 'Alemán' },
  { code: 'pt', label: 'Portugués' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Neerlandés' },
  { code: 'pl', label: 'Polaco' },
  { code: 'ro', label: 'Rumano' },
  { code: 'ar', label: 'Árabe' },
  { code: 'zh', label: 'Chino' },
  { code: 'ja', label: 'Japonés' },
  { code: 'ko', label: 'Coreano' },
  { code: 'ru', label: 'Ruso' },
  { code: 'uk', label: 'Ucraniano' },
  { code: 'tr', label: 'Turco' },
  { code: 'hi', label: 'Hindi' },
  { code: 'sv', label: 'Sueco' },
  { code: 'da', label: 'Danés' },
  { code: 'no', label: 'Noruego' },
  { code: 'fi', label: 'Finlandés' },
  { code: 'ca', label: 'Catalán' },
  { code: 'eu', label: 'Euskera' },
  { code: 'gl', label: 'Gallego' },
];

interface EmailTranslationSectionProps {
  originalText: string;
  onTranslationReady: (translatedHtml: string | null) => void;
}

export function EmailTranslationSection({ originalText, onTranslationReady }: EmailTranslationSectionProps) {
  const [enabled, setEnabled] = useState(false);
  const [language, setLanguage] = useState('en');
  const [translating, setTranslating] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    if (!checked) {
      setTranslatedText(null);
      onTranslationReady(null);
    }
  };

  const handleTranslate = async () => {
    if (!originalText.trim()) {
      toast.error('Escribe un mensaje antes de traducir');
      return;
    }

    setTranslating(true);
    try {
      const langLabel = LANGUAGES.find(l => l.code === language)?.label || language;
      const { data, error } = await supabase.functions.invoke('translate-email', {
        body: { text: originalText, targetLanguage: langLabel },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const translated = data.translatedText;
      setTranslatedText(translated);

      // Build dual-column HTML
      const dualHtml = buildDualColumnHtml(originalText, translated, langLabel);
      onTranslationReady(dualHtml);
      toast.success(`Traducción a ${langLabel} completada`);
    } catch (err: any) {
      console.error('Translation error:', err);
      toast.error('Error al traducir: ' + (err.message || 'Error desconocido'));
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Traducción bilingüe</Label>
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>

      {enabled && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Select value={language} onValueChange={(v) => { setLanguage(v); setTranslatedText(null); onTranslationReady(null); }}>
              <SelectTrigger className="flex-1 h-8 text-sm">
                <SelectValue placeholder="Idioma destino" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map(l => (
                  <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleTranslate}
              disabled={translating || !originalText.trim()}
            >
              {translating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
              {translating ? 'Traduciendo...' : 'Traducir'}
            </Button>
          </div>

          {translatedText && (
            <div className="border rounded-lg overflow-hidden">
              <div className="grid grid-cols-2 text-xs font-medium bg-muted">
                <div className="px-3 py-1.5 border-r">Original (Español)</div>
                <div className="px-3 py-1.5">{LANGUAGES.find(l => l.code === language)?.label}</div>
              </div>
              <div className="grid grid-cols-2 text-sm max-h-[200px] overflow-y-auto">
                <div className="px-3 py-2 border-r whitespace-pre-wrap text-muted-foreground">{originalText}</div>
                <div className="px-3 py-2 whitespace-pre-wrap">{translatedText}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function buildDualColumnHtml(original: string, translated: string, langName: string): string {
  const origHtml = original.replace(/\n/g, '<br>');
  const transHtml = translated.replace(/\n/g, '<br>');

  return `
<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;margin:0 0 16px">
  <thead>
    <tr>
      <th style="width:50%;padding:8px 12px;background:#f5f5f5;border:1px solid #ddd;text-align:left;font-size:12px;color:#666">Original (Español)</th>
      <th style="width:50%;padding:8px 12px;background:#f5f5f5;border:1px solid #ddd;text-align:left;font-size:12px;color:#666">${langName}</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="width:50%;padding:12px;border:1px solid #eee;vertical-align:top;font-size:14px;line-height:1.5;color:#555">${origHtml}</td>
      <td style="width:50%;padding:12px;border:1px solid #eee;vertical-align:top;font-size:14px;line-height:1.5;color:#333">${transHtml}</td>
    </tr>
  </tbody>
</table>`;
}
