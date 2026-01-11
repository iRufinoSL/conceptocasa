import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseSignedUrlOptions {
  expiresIn?: number; // seconds, default 3600 (1 hour)
  bucket: 'company-logos' | 'budget-covers' | 'budget-predesigns' | 'activity-files' | 'project-documents' | 'task-images' | 'resource-files' | 'accounting-documents' | 'email-attachments' | 'resource-images';
}

/**
 * Hook to get a signed URL for a private storage file.
 * Automatically refreshes before expiration.
 */
export function useSignedUrl(filePath: string | null, options: UseSignedUrlOptions) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const { bucket, expiresIn = 3600 } = options;

  const fetchSignedUrl = useCallback(async () => {
    if (!filePath) {
      setSignedUrl(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: signError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(filePath, expiresIn);

      if (signError) throw signError;

      setSignedUrl(data?.signedUrl || null);
    } catch (err) {
      console.error(`Error creating signed URL for ${bucket}/${filePath}:`, err);
      setError(err instanceof Error ? err : new Error('Failed to get signed URL'));
      setSignedUrl(null);
    } finally {
      setLoading(false);
    }
  }, [filePath, bucket, expiresIn]);

  useEffect(() => {
    fetchSignedUrl();

    // Set up refresh interval (refresh 5 minutes before expiration)
    const refreshInterval = Math.max((expiresIn - 300) * 1000, 60000); // at least 1 minute
    const intervalId = setInterval(fetchSignedUrl, refreshInterval);

    return () => clearInterval(intervalId);
  }, [fetchSignedUrl, expiresIn]);

  return { signedUrl, loading, error, refetch: fetchSignedUrl };
}

/**
 * Utility function to get a signed URL once (for PDF generation, etc.)
 */
export async function getSignedUrl(
  bucket: 'company-logos' | 'budget-covers' | 'budget-predesigns' | 'activity-files' | 'project-documents' | 'task-images' | 'resource-files' | 'accounting-documents' | 'email-attachments' | 'resource-images',
  filePath: string,
  expiresIn: number = 3600
): Promise<string | null> {
  if (!filePath) return null;

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, expiresIn);

    if (error) throw error;
    return data?.signedUrl || null;
  } catch (err) {
    console.error(`Error creating signed URL for ${bucket}/${filePath}:`, err);
    return null;
  }
}

/**
 * Extract file path from a storage URL (for migration purposes)
 */
export function extractFilePath(url: string | null): string | null {
  if (!url) return null;
  
  // Handle both public URLs and signed URLs
  const match = url.match(/\/storage\/v1\/(?:object\/public|object\/sign)\/[^/]+\/(.+?)(?:\?|$)/);
  if (match) return decodeURIComponent(match[1]);
  
  // If it's already a file path (no URL structure), return as-is
  if (!url.startsWith('http')) return url;
  
  // Last resort: try to get the last segment
  const segments = url.split('/');
  return segments[segments.length - 1]?.split('?')[0] || null;
}
