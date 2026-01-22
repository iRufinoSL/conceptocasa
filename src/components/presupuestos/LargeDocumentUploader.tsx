import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import * as pdfjsLib from 'pdfjs-dist';
import { ensurePdfjsWorker } from '@/lib/pdfjs-worker';
import {
  Upload,
  Link,
  Loader2,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  Trash2
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface LargeDocumentUploaderProps {
  budgetId: string;
  municipality?: string;
  landClass?: string;
  urbanClassification?: string;
  onProcessingComplete?: () => void;
}

const DOCUMENT_TYPES = [
  { value: 'pgou', label: 'PGOU / Plan General de Ordenación Urbanística' },
  { value: 'plan_parcial', label: 'Plan Parcial' },
  { value: 'normas_subsidiarias', label: 'Normas Subsidiarias' },
  { value: 'ordenanza', label: 'Ordenanza Municipal' },
  { value: 'normativa_autonomica', label: 'Normativa Autonómica' },
  { value: 'otro', label: 'Otro documento urbanístico' },
];

// Quick links for common municipalities
const MUNICIPALITY_LINKS: Record<string, { label: string; url: string; type: string }[]> = {
  'GOZON': [
    { label: 'PGOU Gozón (PDF 25 MB)', url: 'https://www.ayto-gozon.org/plan-general-de-ordenacion', type: 'pgou' },
    { label: 'Normas Subsidiarias 1996', url: 'https://www.ayto-gozon.org/plan-general-de-ordenacion', type: 'normas_subsidiarias' },
    { label: 'Plan Parcial SAU-5 Miramar (BOPA)', url: 'https://www.asturias.es/bopa/disposiciones/repositorio/LEGISLACION27/66/1/001U002T630001.pdf', type: 'plan_parcial' },
  ],
  'AVILES': [
    { label: 'PGOU Avilés', url: 'https://www.aviles.es/web/planificacion-urbanistica/plan-general-de-ordenacion-pgou-', type: 'pgou' },
  ],
  'GIJON': [
    { label: 'PGOU Gijón', url: 'https://www.gijon.es/es/directorio/plan-general-de-ordenacion-urbana', type: 'pgou' },
  ],
  'OVIEDO': [
    { label: 'PGOU Oviedo', url: 'https://www.oviedo.es/urbanismo/planeamiento-vigente', type: 'pgou' },
  ],
};

function sanitizeStorageFileName(name: string) {
  // Storage keys should be URL-safe; remove accents and unsafe chars.
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return normalized
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function extractPdfTextAndFirstPagePreview(file: File): Promise<{
  text: string;
  pageCount: number;
  firstPageImageDataUrl: string | null;
}> {
  // Cap to keep browser memory + backend payload under control.
  // (Large PGOUs can produce tens of millions of chars.)
  const MAX_EXTRACTED_CHARS = 600_000;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const maxPages = Math.min(pdf.numPages, 50);
  let fullText = '';

  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = (textContent.items as any[]).map((item) => item.str).join(' ');
    fullText += pageText + '\n\n';

    if (fullText.length >= MAX_EXTRACTED_CHARS) {
      fullText = fullText.slice(0, MAX_EXTRACTED_CHARS) +
        "\n\n... [TEXTO TRUNCADO EN CLIENTE POR TAMAÑO] ...\n\n";
      break;
    }
  }

  // Render first page to an image for OCR fallback (keep it small to avoid huge payloads)
  let firstPageImageDataUrl: string | null = null;
  try {
    const firstPage = await pdf.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1.25 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context) {
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await firstPage.render({ canvasContext: context as any, viewport } as any).promise;
      // JPEG is much smaller than PNG for scanned pages
      firstPageImageDataUrl = canvas.toDataURL('image/jpeg', 0.7);
    }
  } catch {
    // If rendering fails, we still continue with text only.
    firstPageImageDataUrl = null;
  }

  return { text: fullText, pageCount: pdf.numPages, firstPageImageDataUrl };
}

export function LargeDocumentUploader({
  budgetId,
  municipality,
  landClass,
  urbanClassification,
  onProcessingComplete,
}: LargeDocumentUploaderProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  // Initialize PDF.js worker
  useEffect(() => {
    ensurePdfjsWorker();
  }, []);

  const [focusSearch, setFocusSearch] = useState('');
  
  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // URL state
  const [externalUrl, setExternalUrl] = useState('');
  const [isUrlMode, setIsUrlMode] = useState(false);
  
  // Document type
  const [documentType, setDocumentType] = useState('pgou');
  
  // Processing result
  const [processingResult, setProcessingResult] = useState<{
    status: 'idle' | 'processing' | 'success' | 'error';
    message?: string;
    valuesFound?: number;
  }>({ status: 'idle' });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast({
        variant: 'destructive',
        title: 'Archivo no válido',
        description: 'Solo se admiten archivos PDF',
      });
      return;
    }

    // Check file size (max 100MB for storage)
    if (file.size > 100 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'Archivo demasiado grande',
        description: 'El archivo no puede superar los 100MB',
      });
      return;
    }

    setSelectedFile(file);
    setIsUrlMode(false);
    setExternalUrl('');
  };

  const handleUploadAndProcess = async () => {
    if (!selectedFile && !externalUrl) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Selecciona un archivo o introduce una URL',
      });
      return;
    }

    setIsUploading(true);
    setProcessingResult({ status: 'processing' });

    try {
      let uploadId: string;
      let storagePath: string | null = null;
      let sourceType: 'storage' | 'url';

      // Optional client-side PDF extraction to improve reliability (and enable OCR fallback)
      let pdfText: string | undefined;
      let pdfPageCount: number | undefined;
      let firstPageImageDataUrl: string | null | undefined;

       if (selectedFile) {
         try {
           const extracted = await extractPdfTextAndFirstPagePreview(selectedFile);
           pdfText = extracted.text;
           pdfPageCount = extracted.pageCount;

           // Only send an OCR image when text extraction is essentially empty.
           // This avoids huge payloads and timeouts in the analysis backend.
           firstPageImageDataUrl = (pdfText || '').trim().length < 200 ? extracted.firstPageImageDataUrl : null;

           if ((pdfText || '').trim().length < 200 && firstPageImageDataUrl) {
             toast({
               title: 'PDF escaneado detectado',
               description: 'No hay texto seleccionable. Usaré OCR para extraer la información.',
             });
           }
         } catch (e) {
           console.warn('PDF text extraction failed, continuing with upload:', e);
         }
       }

      if (selectedFile) {
        sourceType = 'storage';

        // Generate unique path (sanitize filename to avoid Storage "Invalid key" errors)
        const timestamp = Date.now();
        const safeName = sanitizeStorageFileName(selectedFile.name);
        storagePath = `${budgetId}/${timestamp}_${safeName}`;

        toast({
          title: 'Subiendo documento...',
          description: `${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(1)} MB)`,
        });

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('pgou-documents')
          .upload(storagePath, selectedFile, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          const msg = (uploadError as any)?.message || 'Error al subir el documento';
          throw new Error(
            msg.includes('Invalid key')
              ? `${msg}. Prueba a renombrar el PDF (solo letras/números) y vuelve a intentar.`
              : msg
          );
        }

        setUploadProgress(50);

        // Create upload record
        const { data: uploadRecord, error: recordError } = await supabase
          .from('urban_document_uploads')
          .insert({
            budget_id: budgetId,
            source_type: 'storage',
            storage_path: storagePath,
            original_filename: selectedFile.name,
            file_size_bytes: selectedFile.size,
            document_type: documentType,
            municipality,
            status: 'pending',
          })
          .select()
          .single();

        if (recordError) throw recordError;
        uploadId = uploadRecord.id;
      } else {
        sourceType = 'url';

        // Create upload record for URL
        const { data: uploadRecord, error: recordError } = await supabase
          .from('urban_document_uploads')
          .insert({
            budget_id: budgetId,
            source_type: 'url',
            external_url: externalUrl,
            document_type: documentType,
            municipality,
            status: 'pending',
          })
          .select()
          .single();

        if (recordError) throw recordError;
        uploadId = uploadRecord.id;
      }

      setUploadProgress(75);
      setIsUploading(false);
      setIsProcessing(true);

      toast({
        title: 'Procesando documento...',
        description: 'Extrayendo información urbanística con IA. Esto puede tardar unos minutos.',
      });

      // Call backend function to process
      const { data: processResult, error: processError } = await supabase.functions.invoke('process-large-document', {
        body: {
          uploadId,
          sourceType,
          storagePath,
          externalUrl: sourceType === 'url' ? externalUrl : undefined,
          municipality,
          landClass: landClass || 'Urbano',
          budgetId,
          focusSearch: focusSearch.trim() || undefined,
          // Improved extraction inputs
          pdfText,
          pdfPageCount,
          firstPageImageDataUrl,
        },
      });

      if (processError) throw processError;

      if (processResult?.success) {
        setUploadProgress(100);
        
        const summary = processResult.data?.summary;
        const valuesFound = processResult.data?.valuesFound || 0;
        
        setProcessingResult({
          status: 'success',
          message: summary?.message || `Documento procesado correctamente`,
          valuesFound,
        });

        toast({
          title: valuesFound > 0 ? '¡Parámetros encontrados!' : 'Documento analizado',
          description: summary?.message || `Se encontraron ${valuesFound} parámetros urbanísticos`,
          duration: 6000,
        });

        onProcessingComplete?.();
      } else {
        throw new Error(processResult?.error || 'Error al procesar documento');
      }
    } catch (error) {
      console.error('Error uploading/processing document:', error);
      setProcessingResult({
        status: 'error',
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo procesar el documento',
      });
    } finally {
      setIsUploading(false);
      setIsProcessing(false);
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setExternalUrl('');
    setUploadProgress(0);
    setProcessingResult({ status: 'idle' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return url.startsWith('http://') || url.startsWith('https://');
    } catch {
      return false;
    }
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Analizar Documento Grande</CardTitle>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                {isExpanded ? 'Contraer' : 'Expandir'}
              </Button>
            </CollapsibleTrigger>
          </div>
          <CardDescription>
            Sube un PDF de normativa urbanística grande (hasta 100MB) o proporciona un enlace de Dropbox/Google Drive
          </CardDescription>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Quick Links for Municipality */}
            {municipality && MUNICIPALITY_LINKS[municipality.toUpperCase()] && (
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <ExternalLink className="h-4 w-4" />
                  Enlaces rápidos para {municipality}
                </div>
                <div className="flex flex-wrap gap-2">
                  {MUNICIPALITY_LINKS[municipality.toUpperCase()].map((link, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        window.open(link.url, '_blank');
                        setDocumentType(link.type);
                        toast({
                          title: 'Descarga el PDF',
                          description: 'Una vez descargado, súbelo aquí para analizarlo',
                        });
                      }}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      {link.label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Descarga el documento y luego súbelo aquí para extraer los parámetros urbanísticos
                </p>
              </div>
            )}

            {/* Mode Toggle */}
            <div className="flex gap-2">
              <Button
                variant={!isUrlMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setIsUrlMode(false);
                  setExternalUrl('');
                }}
                className="gap-1"
              >
                <Upload className="h-4 w-4" />
                Subir archivo
              </Button>
              <Button
                variant={isUrlMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setIsUrlMode(true);
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="gap-1"
              >
                <Link className="h-4 w-4" />
                Pegar URL
              </Button>
            </div>

            {/* Document Type */}
            <div className="space-y-1">
              <Label>Tipo de documento</Label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Enfoque (opcional)</Label>
              <Input
                value={focusSearch}
                onChange={(e) => setFocusSearch(e.target.value)}
                placeholder='Ej: "Plan Parcial SAU-5 Miramar"'
              />
              <p className="text-xs text-muted-foreground">
                Útil si el PDF es muy amplio: centra la extracción en el ámbito/ordenanza que te interesa.
              </p>
            </div>

            {/* Upload Mode */}
            {!isUrlMode && (
              <div className="space-y-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                {!selectedFile ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Haz clic para seleccionar un PDF
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Máximo 100MB
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <FileText className="h-8 w-8 text-primary" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetForm}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* URL Mode */}
            {isUrlMode && (
              <div className="space-y-2">
                <Label htmlFor="external-url">URL del documento</Label>
                <Input
                  id="external-url"
                  placeholder="https://www.dropbox.com/... o https://drive.google.com/..."
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Soporta: Dropbox, Google Drive, o cualquier URL pública a un documento
                </p>
              </div>
            )}

            {/* Progress */}
            {(isUploading || isProcessing) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {isUploading ? 'Subiendo...' : 'Procesando con IA...'}
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            {/* Result */}
            {processingResult.status !== 'idle' && processingResult.status !== 'processing' && (
              <div className={`p-3 rounded-lg flex items-start gap-2 ${
                processingResult.status === 'success'
                  ? processingResult.valuesFound && processingResult.valuesFound > 0
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
              }`}>
                {processingResult.status === 'success' ? (
                  processingResult.valuesFound && processingResult.valuesFound > 0 ? (
                    <CheckCircle2 className="h-5 w-5 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 mt-0.5" />
                  )
                ) : (
                  <XCircle className="h-5 w-5 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="font-medium">
                    {processingResult.status === 'success' 
                      ? processingResult.valuesFound && processingResult.valuesFound > 0
                        ? 'Parámetros extraídos'
                        : 'Documento analizado - Sin parámetros numéricos'
                      : 'Error'}
                  </p>
                  <p className="text-sm mt-1">
                    {processingResult.message}
                  </p>
                  {processingResult.valuesFound !== undefined && processingResult.valuesFound > 0 && (
                    <Badge variant="secondary" className="mt-2">
                      {processingResult.valuesFound} valores numéricos
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                onClick={handleUploadAndProcess}
                disabled={
                  isUploading || 
                  isProcessing || 
                  (!selectedFile && !externalUrl) ||
                  (isUrlMode && !isValidUrl(externalUrl))
                }
                className="flex-1"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Subiendo...
                  </>
                ) : isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Analizando...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Analizar Documento
                  </>
                )}
              </Button>
              {processingResult.status !== 'idle' && (
                <Button variant="outline" onClick={resetForm}>
                  Nuevo
                </Button>
              )}
            </div>

            {/* Help */}
            <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg space-y-1">
              <div className="flex items-center gap-1 font-medium">
                <AlertCircle className="h-3 w-3" />
                Consejos para mejores resultados:
              </div>
              <ul className="list-disc list-inside space-y-0.5 ml-4">
                <li>Usa PDFs con texto seleccionable (no escaneados)</li>
                <li>Para Dropbox: usa el enlace de "Compartir"</li>
                <li>Para Google Drive: asegúrate de que sea acceso público</li>
                <li>El procesamiento puede tardar varios minutos</li>
              </ul>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
