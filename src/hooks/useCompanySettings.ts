import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { extractFilePath, getSignedUrl } from '@/hooks/useSignedUrl';

export interface CompanySettings {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  logo_url: string | null;
  logo_signed_url?: string | null; // Signed URL for display
}

const DEFAULT_SETTINGS: CompanySettings = {
  id: '',
  name: 'Concepto.Casa',
  email: 'organiza@concepto.casa',
  phone: '+34 690 123 533',
  address: 'Barcelona, España',
  website: 'www.concepto.casa',
  logo_url: null,
  logo_signed_url: null,
};

export function useCompanySettings() {
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        // Get signed URL for logo if it exists
        let logoSignedUrl: string | null = null;
        if (data.logo_url) {
          const logoPath = extractFilePath(data.logo_url);
          if (logoPath) {
            logoSignedUrl = await getSignedUrl('company-logos', logoPath);
          }
        }
        
        setSettings({
          ...data,
          logo_signed_url: logoSignedUrl,
        });
      }
    } catch (error) {
      console.error('Error fetching company settings:', error);
      // Keep default settings on error
    } finally {
      setLoading(false);
    }
  };

  return { settings, loading, refetch: fetchSettings };
}
