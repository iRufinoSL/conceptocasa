import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, FileText, Trash2, Upload, X, Eye, Download, 
  AlertTriangle, CheckCircle, Clock, Loader2, FileSearch
} from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface PreliminaryReport {
  id: string;
  budget_id: string;
  title: string;
  description: string | null;
  report_type: string;
  content_text: string | null;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number;
  source: string | null;
  report_date: string | null;
  is_analyzed: boolean;
  analysis_result: {
    buildable?: string;
    classification?: string;
    summary?: string;
    conditions?: string[];
  } | null;
  created_at: string;
}

interface PreliminaryUrbanReportsManagerProps {
  budgetId: string;
  isAdmin: boolean;
  onReportsChange?: (reports: PreliminaryReport[]) => void;
}

const REPORT_TYPES = [
  'Informe Urbanístico',
  'Certificado de Compatibilidad',
  'Cédula Urbanística',
  'Consulta Previa',
  'Informe de Viabilidad',
  'Otro'
];

export function PreliminaryUrbanReportsManager({ 
  budgetId, 
  isAdmin,
  onReportsChange 
}: PreliminaryUrbanReportsManagerProps) {
  const { toast } = useToast();
  const [reports, setReports] = useState<PreliminaryReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<PreliminaryReport | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    report_type: 'Informe Urbanístico',
    content_text: '',
    source: '',
    report_date: ''
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});

  const fetchReports = async () => {
    try {
      const { data, error } = await supabase
        .from('preliminary_urban_reports')
        .select('*')
        .eq('budget_id', budgetId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const typedData = (data || []) as PreliminaryReport[];
      setReports(typedData);
      onReportsChange?.(typedData);
    } catch (error) {
      console.error('Error fetching preliminary reports:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron cargar los informes urbanísticos preliminares'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [budgetId]);

  // Generate signed URLs for files
  useEffect(() => {
    const generateSignedUrls = async () => {
      const urlMap: Record<string, string> = {};
      
      for (const report of reports) {
        if (report.file_path) {
          const { data, error } = await supabase.storage
            .from('preliminary-reports')
            .createSignedUrl(report.file_path, 3600);
          
          if (data && !error) {
            urlMap[report.file_path] = data.signedUrl;
          }
        }
      }
      
      setFileUrls(urlMap);
    };

    if (reports.length > 0) {
      generateSignedUrls();
    }
  }, [reports]);

  const handleNew = () => {
    setFormData({
      title: '',
      description: '',
      report_type: 'Informe Urbanístico',
      content_text: '',
      source: '',
      report_date: ''
    });
    setSelectedFile(null);
    setFormOpen(true);
  };

  const handleDeleteClick = (report: PreliminaryReport) => {
    setReportToDelete(report);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!reportToDelete) return;

    try {
      if (reportToDelete.file_path) {
        await supabase.storage
          .from('preliminary-reports')
          .remove([reportToDelete.file_path]);
      }

      const { error } = await supabase
        .from('preliminary_urban_reports')
        .delete()
        .eq('id', reportToDelete.id);

      if (error) throw error;

      toast({
        title: 'Eliminado',
        description: 'Informe urbanístico eliminado correctamente'
      });
      fetchReports();
    } catch (error) {
      console.error('Error deleting report:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo eliminar el informe'
      });
    } finally {
      setDeleteDialogOpen(false);
      setReportToDelete(null);
    }
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'El título es obligatorio'
      });
      return;
    }

    if (!formData.content_text.trim() && !selectedFile) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Debe proporcionar contenido de texto o un archivo PDF'
      });
      return;
    }

    setIsSaving(true);

    try {
      let filePath: string | null = null;
      let fileName: string | null = null;
      let fileType: string | null = null;
      let fileSize = 0;

      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        filePath = `${budgetId}/${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('preliminary-reports')
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        fileName = selectedFile.name;
        fileType = selectedFile.type;
        fileSize = selectedFile.size;
      }

      const payload = {
        budget_id: budgetId,
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        report_type: formData.report_type,
        content_text: formData.content_text.trim() || null,
        source: formData.source.trim() || null,
        report_date: formData.report_date || null,
        file_path: filePath,
        file_name: fileName,
        file_type: fileType,
        file_size: fileSize
      };

      const { error } = await supabase
        .from('preliminary_urban_reports')
        .insert(payload);

      if (error) throw error;

      toast({ 
        title: 'Añadido', 
        description: 'Informe urbanístico preliminar añadido correctamente' 
      });
      setFormOpen(false);
      fetchReports();
    } catch (error) {
      console.error('Error saving report:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo guardar el informe'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAnalyzeReport = async (report: PreliminaryReport) => {
    setIsAnalyzing(report.id);
    
    try {
      // For PDF files, we need to get the text content from storage
      let textContent = report.content_text || '';
      
      // If it's a PDF file and no text content, try to download and extract
      if (report.file_path && !textContent) {
        // Get signed URL for the file
        const { data: urlData, error: urlError } = await supabase.storage
          .from('preliminary-reports')
          .createSignedUrl(report.file_path, 3600);
        
        if (urlError) {
          console.error('Error getting signed URL:', urlError);
          throw new Error('No se pudo acceder al archivo PDF');
        }
        
        // For PDFs, we need to inform the user that text extraction from client is not possible
        // Instead, we'll use basic analysis with what we have
        if (report.file_type?.includes('pdf')) {
          toast({
            title: 'Procesando PDF',
            description: 'Analizando contenido del documento...'
          });
        }
      }
      
      // If still no content, throw error
      if (!textContent && !report.file_path) {
        throw new Error('No hay contenido para analizar. Añade texto o sube un archivo.');
      }

      // Create a temporary upload record to satisfy the edge function requirements
      const tempUploadId = crypto.randomUUID();
      
      // Determine source type - must be 'storage' or 'url', never 'text'
      // For text content without file, we use 'url' as placeholder but pass text via pdfText
      const hasFile = !!report.file_path;
      const sourceType = hasFile ? 'storage' : 'url';
      
      // Insert temporary record in urban_document_uploads with correct column names
      const { error: insertError } = await supabase
        .from('urban_document_uploads')
        .insert({
          id: tempUploadId,
          budget_id: budgetId,
          original_filename: report.title || 'informe_preliminar.txt',
          document_type: 'pgou', // default value accepted by the table
          source_type: sourceType,
          storage_path: hasFile ? report.file_path : null,
          external_url: !hasFile ? 'text://inline' : null, // placeholder for text-only
          file_size_bytes: report.file_size || (textContent?.length || 0),
          status: 'pending'
        });

      if (insertError) {
        console.error('Error creating temp upload record:', insertError);
        throw new Error('Error preparando el análisis');
      }

      // Call the process-large-document edge function with proper parameters
      const { data, error } = await supabase.functions.invoke('process-large-document', {
        body: {
          uploadId: tempUploadId,
          budgetId,
          pdfText: textContent || undefined,
          pdfPageCount: 1,
          sourceType: sourceType,
          storageBucket: hasFile ? 'preliminary-reports' : undefined,
          storagePath: hasFile ? report.file_path : undefined,
          municipality: null,
          landClass: 'suelo urbano'
        }
      });

      if (error) {
        // Clean up temp record on error
        await supabase.from('urban_document_uploads').delete().eq('id', tempUploadId);
        throw error;
      }

      // Parse the result - the edge function returns extractedData
      const extractedData = data?.extractedData || data;
      
      // Determine buildability status
      let buildableStatus: string | undefined;
      const isEdificable = extractedData?.isEdificable;
      if (isEdificable) {
        if (typeof isEdificable === 'object' && 'value' in isEdificable) {
          if (isEdificable.value === true) buildableStatus = 'SI_EDIFICABLE';
          else if (isEdificable.value === false) buildableStatus = 'NO_EDIFICABLE';
          else if (isEdificable.value === 'condicionado') buildableStatus = 'EDIFICABLE_CONDICIONADO';
        } else if (isEdificable === true) {
          buildableStatus = 'SI_EDIFICABLE';
        } else if (isEdificable === false) {
          buildableStatus = 'NO_EDIFICABLE';
        }
      }

      // Build analysis result
      const analysisResult = {
        buildable: buildableStatus,
        classification: extractedData?.urbanClassification?.value || extractedData?.urbanClassification,
        summary: extractedData?.documentSummary || extractedData?.additionalInfo,
        conditions: extractedData?.sectoralRestrictions?.map((r: any) => r.description) || []
      };

      // Update the preliminary report with analysis results
      const { error: updateError } = await supabase
        .from('preliminary_urban_reports')
        .update({
          is_analyzed: true,
          analysis_result: analysisResult
        })
        .eq('id', report.id);

      if (updateError) {
        console.error('Error updating report:', updateError);
      }

      // Clean up the temporary upload record
      await supabase.from('urban_document_uploads').delete().eq('id', tempUploadId);

      toast({
        title: 'Análisis completado',
        description: buildableStatus 
          ? `Resultado: ${buildableStatus === 'SI_EDIFICABLE' ? 'Edificable' : 
              buildableStatus === 'NO_EDIFICABLE' ? 'No edificable' : 'Condicionado'}`
          : 'Análisis completado sin resultado definitivo'
      });
      
      fetchReports();
    } catch (error: any) {
      console.error('Error analyzing report:', error);
      toast({
        variant: 'destructive',
        title: 'Error en el análisis',
        description: error?.message || 'No se pudo analizar el documento'
      });
    } finally {
      setIsAnalyzing(null);
    }
  };

  const getStatusBadge = (report: PreliminaryReport) => {
    if (!report.is_analyzed) {
      return (
        <Badge variant="outline" className="gap-1">
          <Clock className="h-3 w-3" />
          Pendiente de análisis
        </Badge>
      );
    }

    const result = report.analysis_result?.buildable;
    if (result === 'SI_EDIFICABLE') {
      return (
        <Badge className="gap-1 bg-green-500/10 text-green-600 border-green-500/30">
          <CheckCircle className="h-3 w-3" />
          Edificable
        </Badge>
      );
    } else if (result === 'NO_EDIFICABLE') {
      return (
        <Badge className="gap-1 bg-red-500/10 text-red-600 border-red-500/30">
          <X className="h-3 w-3" />
          No edificable
        </Badge>
      );
    } else if (result === 'EDIFICABLE_CONDICIONADO') {
      return (
        <Badge className="gap-1 bg-amber-500/10 text-amber-600 border-amber-500/30">
          <AlertTriangle className="h-3 w-3" />
          Condicionado
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="gap-1">
        <Clock className="h-3 w-3" />
        Sin resultado
      </Badge>
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <Card className="border-dashed border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/10">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <FileSearch className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-base">
                    Informes Urbanísticos Preliminares
                    {reports.length > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {reports.length}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Informes no vinculantes para análisis de edificabilidad
                  </CardDescription>
                </div>
              </div>
              {isAdmin && (
                <Button 
                  size="sm" 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNew();
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Añadir
                </Button>
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0">
            {reports.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No hay informes urbanísticos preliminares</p>
                {isAdmin && (
                  <p className="text-xs mt-1">
                    Añade informes municipales, certificados o consultas previas
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map(report => (
                  <div 
                    key={report.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-background"
                  >
                    <div className="p-2 rounded bg-muted">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-medium text-sm truncate">{report.title}</h4>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              {report.report_type}
                            </Badge>
                            {getStatusBadge(report)}
                            {report.report_date && (
                              <span className="text-xs text-muted-foreground">
                                {new Date(report.report_date).toLocaleDateString('es-ES')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {report.description && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                          {report.description}
                        </p>
                      )}

                      {report.content_text && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2 italic">
                          "{report.content_text.slice(0, 150)}..."
                        </p>
                      )}

                      {report.analysis_result?.summary && (
                        <div className="mt-2 p-2 rounded bg-muted/50 text-xs">
                          <strong>Resumen:</strong> {report.analysis_result.summary}
                        </div>
                      )}

                      {report.file_name && (
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-muted-foreground">
                            📄 {report.file_name} ({formatFileSize(report.file_size)})
                          </span>
                          {report.file_path && fileUrls[report.file_path] && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2"
                              onClick={() => window.open(fileUrls[report.file_path!], '_blank')}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Ver
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      {!report.is_analyzed && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAnalyzeReport(report)}
                          disabled={isAnalyzing === report.id}
                        >
                          {isAnalyzing === report.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <FileSearch className="h-3 w-3" />
                          )}
                          <span className="ml-1 text-xs">Analizar</span>
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(report)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      {/* Add Report Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Añadir Informe Urbanístico Preliminar</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Título del informe *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Ej: Informe urbanístico Ayto. de Siero"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="report_type">Tipo de documento</Label>
                <Select
                  value={formData.report_type}
                  onValueChange={value => setFormData(prev => ({ ...prev, report_type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_TYPES.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="report_date">Fecha del informe</Label>
                <Input
                  id="report_date"
                  type="date"
                  value={formData.report_date}
                  onChange={e => setFormData(prev => ({ ...prev, report_date: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="source">Fuente / Organismo emisor</Label>
              <Input
                id="source"
                value={formData.source}
                onChange={e => setFormData(prev => ({ ...prev, source: e.target.value }))}
                placeholder="Ej: Ayuntamiento de Siero"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Breve descripción del contenido"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content_text">Contenido de texto</Label>
              <Textarea
                id="content_text"
                value={formData.content_text}
                onChange={e => setFormData(prev => ({ ...prev, content_text: e.target.value }))}
                placeholder="Pegue aquí el contenido del informe o los datos relevantes para el análisis..."
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                Puede pegar el texto del informe aquí o adjuntar un PDF
              </p>
            </div>

            <div className="space-y-2">
              <Label>Documento PDF (opcional)</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                {selectedFile ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{selectedFile.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({formatFileSize(selectedFile.size)})
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedFile(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".pdf,.txt,.doc,.docx"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) setSelectedFile(file);
                      }}
                    />
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Upload className="h-8 w-8" />
                      <span className="text-sm">
                        Clic para seleccionar archivo
                      </span>
                      <span className="text-xs">PDF, TXT, DOC (máx. 20MB)</span>
                    </div>
                  </label>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Eliminar informe"
        description={`¿Está seguro de eliminar "${reportToDelete?.title}"? Esta acción no se puede deshacer.`}
      />
    </Card>
  );
}
