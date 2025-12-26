import { useState, useRef } from 'react';
import { ResourceFile } from '@/types/resource';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Upload, 
  Trash2, 
  FileText, 
  Image as ImageIcon, 
  File, 
  Download,
  Eye,
  X,
  Loader2
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatBytes } from '@/lib/format-utils';

interface ResourceFileManagerProps {
  resourceId: string;
  files: ResourceFile[];
  onUpload: (resourceId: string, file: File) => Promise<boolean>;
  onDelete: (fileId: string, filePath: string) => Promise<boolean>;
  getFileUrl: (filePath: string) => string;
  readOnly?: boolean;
}

interface UploadingFile {
  name: string;
  progress: number;
  size: number;
}

export function ResourceFileManager({ 
  resourceId, 
  files, 
  onUpload, 
  onDelete, 
  getFileUrl,
  readOnly = false 
}: ResourceFileManagerProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [previewFile, setPreviewFile] = useState<ResourceFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const filesArray = Array.from(selectedFiles);
    
    // Initialize uploading state for all files
    setUploadingFiles(filesArray.map(f => ({ 
      name: f.name, 
      progress: 0, 
      size: f.size 
    })));
    setUploading(true);

    for (let i = 0; i < filesArray.length; i++) {
      const file = filesArray[i];
      
      // Update progress to show we're starting this file
      setUploadingFiles(prev => prev.map((f, idx) => 
        idx === i ? { ...f, progress: 10 } : f
      ));

      // Simulate progress while uploading
      const progressInterval = setInterval(() => {
        setUploadingFiles(prev => prev.map((f, idx) => 
          idx === i && f.progress < 90 
            ? { ...f, progress: f.progress + Math.random() * 15 } 
            : f
        ));
      }, 200);

      await onUpload(resourceId, file);

      // Mark as complete
      clearInterval(progressInterval);
      setUploadingFiles(prev => prev.map((f, idx) => 
        idx === i ? { ...f, progress: 100 } : f
      ));
    }

    // Small delay to show completion
    await new Promise(resolve => setTimeout(resolve, 500));
    
    setUploading(false);
    setUploadingFiles([]);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getFileIcon = (fileType: string | null) => {
    if (!fileType) return <File className="h-5 w-5" />;
    
    if (fileType.startsWith('image/')) {
      return <ImageIcon className="h-5 w-5 text-green-500" />;
    }
    if (fileType === 'application/pdf') {
      return <FileText className="h-5 w-5 text-red-500" />;
    }
    return <File className="h-5 w-5 text-blue-500" />;
  };

  const isPreviewable = (fileType: string | null) => {
    if (!fileType) return false;
    return fileType.startsWith('image/') || fileType === 'application/pdf';
  };

  const handlePreview = (file: ResourceFile) => {
    if (isPreviewable(file.file_type)) {
      setPreviewFile(file);
    } else {
      // Download if not previewable
      window.open(getFileUrl(file.file_path), '_blank');
    }
  };

  return (
    <div className="space-y-3">
      {/* Upload Progress */}
      {uploading && uploadingFiles.length > 0 && (
        <div className="space-y-2 p-3 border border-primary/20 rounded-lg bg-primary/5 animate-fade-in">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Subiendo archivos...</span>
          </div>
          {uploadingFiles.map((file, index) => (
            <div key={index} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate max-w-[200px] text-foreground">{file.name}</span>
                <span className="text-muted-foreground">
                  {Math.min(Math.round(file.progress), 100)}%
                </span>
              </div>
              <Progress 
                value={Math.min(file.progress, 100)} 
                className="h-2"
              />
            </div>
          ))}
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
            >
              {/* Thumbnail for images */}
              {file.file_type?.startsWith('image/') ? (
                <img
                  src={getFileUrl(file.file_path)}
                  alt={file.file_name}
                  className="h-10 w-10 rounded object-cover cursor-pointer"
                  onClick={() => handlePreview(file)}
                />
              ) : (
                <div className="h-10 w-10 rounded bg-background flex items-center justify-center">
                  {getFileIcon(file.file_type)}
                </div>
              )}

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {file.file_size ? formatBytes(file.file_size) : 'Tamaño desconocido'}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                {isPreviewable(file.file_type) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handlePreview(file)}
                    title="Vista previa"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => window.open(getFileUrl(file.file_path), '_blank')}
                  title="Descargar"
                >
                  <Download className="h-4 w-4" />
                </Button>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => onDelete(file.id, file.file_path)}
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {!readOnly && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            disabled={uploading}
            className="w-full"
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? 'Subiendo...' : 'Añadir archivo'}
          </Button>
        </div>
      )}

      {files.length === 0 && readOnly && (
        <p className="text-sm text-muted-foreground text-center py-2">
          Sin archivos adjuntos
        </p>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="truncate pr-4">{previewFile?.file_name}</span>
            </DialogTitle>
          </DialogHeader>
          {previewFile && (
            <div className="flex items-center justify-center overflow-auto max-h-[calc(90vh-100px)]">
              {previewFile.file_type?.startsWith('image/') ? (
                <img
                  src={getFileUrl(previewFile.file_path)}
                  alt={previewFile.file_name}
                  className="max-w-full max-h-full object-contain"
                />
              ) : previewFile.file_type === 'application/pdf' ? (
                <iframe
                  src={getFileUrl(previewFile.file_path)}
                  className="w-full h-[70vh]"
                  title={previewFile.file_name}
                />
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
