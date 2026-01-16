import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
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

export function LargeDocumentUploader({
  budgetId,
  municipality,
  landClass,
  onProcessingComplete,
}: LargeDocumentUploaderProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  
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

      if (selectedFile) {
        sourceType = 'storage';
        
        // Generate unique path
        const timestamp = Date.now();
        storagePath = `${budgetId}/${timestamp}_${selectedFile.name}`;

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

        if (uploadError) throw uploadError;

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

      // Call edge function to process
      const { data: processResult, error: processError } = await supabase.functions.invoke('process-large-document', {
        body: {
          uploadId,
          sourceType,
          storagePath,
          externalUrl: sourceType === 'url' ? externalUrl : undefined,
          municipality,
          landClass: landClass || 'Urbano',
          budgetId,
        },
      });

      if (processError) throw processError;

      if (processResult?.success) {
        setUploadProgress(100);
        setProcessingResult({
          status: 'success',
          message: `Documento procesado correctamente`,
          valuesFound: processResult.data?.valuesFound || 0,
        });

        toast({
          title: '¡Documento procesado!',
          description: `Se encontraron ${processResult.data?.valuesFound || 0} parámetros urbanísticos`,
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
    <Card className="border-amber-500/30 bg-amber-50/20 dark:bg-amber-950/10">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-600" />
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
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
              }`}>
                {processingResult.status === 'success' ? (
                  <CheckCircle2 className="h-5 w-5 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 mt-0.5" />
                )}
                <div>
                  <p className="font-medium">
                    {processingResult.status === 'success' ? 'Procesado correctamente' : 'Error'}
                  </p>
                  <p className="text-sm">
                    {processingResult.message}
                    {processingResult.valuesFound !== undefined && processingResult.valuesFound > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {processingResult.valuesFound} valores encontrados
                      </Badge>
                    )}
                  </p>
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
