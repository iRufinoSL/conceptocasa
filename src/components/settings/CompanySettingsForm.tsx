import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Building2, Mail, Phone, MapPin, Globe, Save, Loader2, Upload, X, Image } from 'lucide-react';
import { useSignedUrl, extractFilePath } from '@/hooks/useSignedUrl';

interface CompanySettings {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  logo_url: string | null;
}

export function CompanySettingsForm() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [logoPath, setLogoPath] = useState<string | null>(null);
  
  // Get signed URL for logo display
  const { signedUrl: logoDisplayUrl } = useSignedUrl(logoPath, { bucket: 'company-logos' });

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
        setSettings(data);
        setName(data.name || '');
        setEmail(data.email || '');
        setPhone(data.phone || '');
        setAddress(data.address || '');
        setWebsite(data.website || '');
        // Extract file path from stored URL or use as-is if already a path
        setLogoPath(extractFilePath(data.logo_url));
      }
    } catch (error) {
      console.error('Error fetching company settings:', error);
      toast.error('Error al cargar la configuración de la empresa');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona una imagen válida');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('La imagen no puede superar 2MB');
      return;
    }

    setUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `company-logo-${Date.now()}.${fileExt}`;

      // Delete old logo if exists
      if (logoPath) {
        await supabase.storage.from('company-logos').remove([logoPath]);
      }

      // Upload new logo
      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Store the file path (not URL)
      setLogoPath(fileName);
      toast.success('Logotipo subido correctamente');
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Error al subir el logotipo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!logoPath) return;

    try {
      await supabase.storage.from('company-logos').remove([logoPath]);
      setLogoPath(null);
      toast.success('Logotipo eliminado');
    } catch (error) {
      console.error('Error removing logo:', error);
      toast.error('Error al eliminar el logotipo');
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('El nombre de la empresa es obligatorio');
      return;
    }

    setSaving(true);
    try {
      const updatedSettings = {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        website: website.trim() || null,
        logo_url: logoPath || null, // Store file path, not URL
      };

      if (settings?.id) {
        const { error } = await supabase
          .from('company_settings')
          .update(updatedSettings)
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('company_settings')
          .insert(updatedSettings);

        if (error) throw error;
      }

      toast.success('Configuración de empresa guardada correctamente');
      fetchSettings();
    } catch (error) {
      console.error('Error saving company settings:', error);
      toast.error('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Datos de la Empresa
        </CardTitle>
        <CardDescription>
          Configura los datos de la empresa que aparecerán en los documentos PDF exportados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Logo Upload Section */}
        <div className="space-y-3">
          <Label>Logotipo de la Empresa</Label>
          <div className="flex items-start gap-4">
            <div className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center overflow-hidden bg-muted/30">
              {logoDisplayUrl ? (
                <img 
                  src={logoDisplayUrl} 
                  alt="Logo de la empresa" 
                  className="w-full h-full object-contain"
                />
              ) : (
                <Image className="h-8 w-8 text-muted-foreground/50" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingLogo}
                className="gap-2"
              >
                {uploadingLogo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {logoPath ? 'Cambiar logotipo' : 'Subir logotipo'}
              </Button>
              {logoPath && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveLogo}
                  className="gap-2 text-destructive hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                  Eliminar
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Formato JPG o PNG. Máximo 2MB.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="company-name">Nombre de la Empresa *</Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="company-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mi Empresa S.L."
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company-email">Email de Contacto</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="company-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contacto@empresa.com"
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company-phone">Teléfono</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="company-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+34 600 000 000"
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company-website">Sitio Web</Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="company-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="www.empresa.com"
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="company-address">Dirección</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="company-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Calle Principal 123, Ciudad, País"
                className="pl-10"
              />
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-lg border p-4 bg-muted/30">
          <p className="text-sm font-medium mb-3 text-muted-foreground">Vista previa del encabezado PDF:</p>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center overflow-hidden">
              {logoDisplayUrl ? (
                <img src={logoDisplayUrl} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <span className="text-primary-foreground font-bold text-lg">
                  {name ? name.substring(0, 2).toUpperCase() : 'CC'}
                </span>
              )}
            </div>
            <div>
              <p className="font-semibold text-primary">{name || 'Nombre de la Empresa'}</p>
              <p className="text-xs text-muted-foreground">
                {[email, phone, website].filter(Boolean).join('  |  ') || 'email@empresa.com  |  +34 600 000 000  |  www.empresa.com'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar Cambios
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
