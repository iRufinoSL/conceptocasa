import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useBotProtection } from "@/hooks/useBotProtection";
import { supabase } from "@/integrations/supabase/client";
import { useWebsiteTracking, getStoredUtmParams } from "@/hooks/useWebsiteTracking";
import { X, Check, Paperclip, File, Loader2 } from "lucide-react";
import homeModern from "@/assets/home-modern.jpg";
import homeClassic from "@/assets/home-classic.jpg";
import homeRustic from "@/assets/home-rustic.jpg";
import homeWood from "@/assets/home-wood.jpg";
import homeEco from "@/assets/home-eco.jpg";
import homeMediterranean from "@/assets/home-mediterranean.jpg";

const projectStyles = [
  { id: "moderno", label: "Moderno", image: homeModern },
  { id: "convencional", label: "Convencional", image: homeClassic },
  { id: "rustico", label: "Rústico", image: homeRustic },
  { id: "mediterraneo", label: "Mediterráneo", image: homeMediterranean },
  { id: "madera", label: "Madera", image: homeWood },
  { id: "ecologica", label: "Ecológica", image: homeEco },
  { id: "otros", label: "Otros", image: null },
];

interface HousingProfileFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface FloorData {
  m2: string;
  habPequenas: string;
  habMedianas: string;
  habGrandes: string;
  banosMedianos: string;
  banosGrandes: string;
  salonM2: string;
  cocina: string;
  despensaM2: string;
  lavanderiaM2: string;
  porcheTechadoM2: string;
  patioSinTechoM2: string;
  terrazasM2: string;
}

const emptyFloor: FloorData = {
  m2: "",
  habPequenas: "",
  habMedianas: "",
  habGrandes: "",
  banosMedianos: "",
  banosGrandes: "",
  salonM2: "",
  cocina: "",
  despensaM2: "",
  lavanderiaM2: "",
  porcheTechadoM2: "",
  patioSinTechoM2: "",
  terrazasM2: "",
};

const sectionHeaderClass = "text-lg font-semibold text-orange border-b border-orange/30 pb-2";

const HousingProfileForm = ({ open, onOpenChange }: HousingProfileFormProps) => {
  const { toast } = useToast();
  const { honeypotProps, validateSubmission, recordSubmission, isBlocked, blockReason } = useBotProtection();
  const { trackFormStart, trackFormSubmit } = useWebsiteTracking();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
    numPlantas: "",
    floors: [{ ...emptyFloor }, { ...emptyFloor }, { ...emptyFloor }] as FloorData[],
    formaGeometrica: "",
    tipoTejado: "",
    usoBajoCubierta: "",
    garaje: "",
    tieneTerreno: "",
    inclinacionTerreno: "",
    poblacionProvincia: "",
    coordenadasGoogleMaps: "",
    googleMapsUrl: "",
    presupuestoGlobal: "",
    estiloConstructivo: [] as string[],
    fechaIdealFinalizacion: "",
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFloorChange = (floorIndex: number, field: keyof FloorData, value: string) => {
    setFormData(prev => {
      const newFloors = [...prev.floors];
      newFloors[floorIndex] = { ...newFloors[floorIndex], [field]: value };
      return { ...prev, floors: newFloors };
    });
  };

  const handleFloorSelectChange = (floorIndex: number, field: keyof FloorData, value: string) => {
    handleFloorChange(floorIndex, field, value);
  };

  const toggleStyle = (styleId: string) => {
    setFormData(prev => ({
      ...prev,
      estiloConstructivo: prev.estiloConstructivo.includes(styleId)
        ? prev.estiloConstructivo.filter(s => s !== styleId)
        : [...prev.estiloConstructivo, styleId]
    }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles = Array.from(files);
    const maxSize = 10 * 1024 * 1024;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const validFiles = newFiles.filter(file => {
      if (file.size > maxSize) {
        toast({ title: "Archivo demasiado grande", description: `${file.name} excede el límite de 10MB`, variant: "destructive" });
        return false;
      }
      if (!allowedTypes.includes(file.type)) {
        toast({ title: "Tipo de archivo no permitido", description: `${file.name} no es un tipo de archivo válido`, variant: "destructive" });
        return false;
      }
      return true;
    });
    setAttachments(prev => [...prev, ...validFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const uploadAttachments = async (): Promise<string[]> => {
    if (attachments.length === 0) return [];
    setIsUploadingFiles(true);
    const uploadedPaths: string[] = [];
    try {
      for (const file of attachments) {
        const timestamp = Date.now();
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `housing-profile/${timestamp}_${sanitizedName}`;
        const { error } = await supabase.storage.from('contact-attachments').upload(filePath, file);
        if (error) throw error;
        uploadedPaths.push(filePath);
      }
      return uploadedPaths;
    } finally {
      setIsUploadingFiles(false);
    }
  };

  const numPlantas = parseInt(formData.numPlantas) || 0;

  const buildFloorSummary = (floor: FloorData, index: number): string => {
    const lines: string[] = [`PLANTA ${index + 1}:`];
    if (floor.m2) lines.push(`- M² por planta: ${floor.m2}`);
    lines.push(`- Habitaciones: ${floor.habPequenas || 0} pequeñas, ${floor.habMedianas || 0} medianas, ${floor.habGrandes || 0} grandes`);
    lines.push(`- Baños: ${floor.banosMedianos || 0} medianos, ${floor.banosGrandes || 0} grandes`);
    if (floor.salonM2) lines.push(`- Salón: ${floor.salonM2} m²`);
    if (floor.cocina) lines.push(`- Cocina: ${floor.cocina === 'separada' ? 'Separada' : 'Junto a salón'}`);
    if (floor.despensaM2) lines.push(`- Despensa: ${floor.despensaM2} m²`);
    if (floor.lavanderiaM2) lines.push(`- Lavandería: ${floor.lavanderiaM2} m²`);
    if (floor.porcheTechadoM2) lines.push(`- Porche techado: ${floor.porcheTechadoM2} m²`);
    if (floor.patioSinTechoM2) lines.push(`- Patio sin techo: ${floor.patioSinTechoM2} m²`);
    if (floor.terrazasM2) lines.push(`- Terrazas: ${floor.terrazasM2} m²`);
    return lines.join('\n');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateSubmission();
    if (!validation.isValid) {
      toast({ title: "Error de validación", description: validation.error || "Por favor, inténtalo de nuevo.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    const estilosSeleccionados = formData.estiloConstructivo
      .map(id => projectStyles.find(s => s.id === id)?.label)
      .filter(Boolean)
      .join(", ");

    const floorSummaries = [];
    for (let i = 0; i < numPlantas && i < 3; i++) {
      floorSummaries.push(buildFloorSummary(formData.floors[i], i));
    }

    const messageBody = `
PERFIL DE VIVIENDA - SOLICITUD DETALLADA

DATOS DE CONTACTO:
- Nombre: ${formData.name}
- Email: ${formData.email}
- Teléfono: ${formData.phone}

CARACTERÍSTICAS DE LA VIVIENDA:
- Número de plantas: ${formData.numPlantas || "No especificado"}
- Forma geométrica de la planta: ${formData.formaGeometrica || "No especificado"}
- Tipo de tejado: ${formData.tipoTejado || "No especificado"}
${(formData.tipoTejado === '2-caidas' || formData.tipoTejado === '4-caidas') ? `- Uso bajo cubierta: ${formData.usoBajoCubierta || "No especificado"}` : ''}

${floorSummaries.join('\n\n')}

OTROS ESPACIOS:
- Garaje: ${formData.garaje || "No especificado"}
- Tiene terreno: ${formData.tieneTerreno || "No especificado"}

PLANEIDAD DEL TERRENO:
- Inclinación del terreno: ${formData.inclinacionTerreno || "No especificado"}

UBICACIÓN Y PRESUPUESTO:
- Población/Provincia: ${formData.poblacionProvincia || "No especificado"}
- Coordenadas Google Maps: ${formData.coordenadasGoogleMaps || "No especificado"}
- URL Google Maps: ${formData.googleMapsUrl || "No especificado"}
- Presupuesto global (incl. impuestos, licencias y proyecto): ${formData.presupuestoGlobal || "No especificado"}
- Fecha ideal de finalización: ${formData.fechaIdealFinalizacion || "No especificado"}

ESTILO CONSTRUCTIVO PREFERIDO:
${estilosSeleccionados || "No especificado"}

MENSAJE ADICIONAL:
${formData.message || "Sin mensaje adicional"}
    `.trim();

    try {
      trackFormStart('housing_profile');
      const attachmentPaths = await uploadAttachments();
      const phoneWithPrefix = formData.phone.startsWith('+') ? formData.phone : `+34${formData.phone.replace(/\s/g, '')}`;
      const utmParams = getStoredUtmParams();

      // Build flat fields for backward compat + new per-floor data
      const floorsData = formData.floors.slice(0, numPlantas).map((f, i) => ({
        planta: i + 1,
        ...f
      }));

      const { error } = await supabase.functions.invoke('send-contact-email', {
        body: {
          name: formData.name,
          email: formData.email,
          phone: phoneWithPrefix,
          subject: "Perfil de Vivienda",
          message: messageBody,
          isHousingProfile: true,
          attachmentPaths: attachmentPaths.length > 0 ? attachmentPaths : undefined,
          attachmentNames: attachments.length > 0 ? attachments.map(f => f.name) : undefined,
          utm_source: utmParams.utm_source,
          utm_medium: utmParams.utm_medium,
          utm_campaign: utmParams.utm_campaign,
          // Legacy flat fields for backward compat
          numPlantas: formData.numPlantas,
          m2Planta1: formData.floors[0]?.m2 || "",
          m2Planta2: formData.floors[1]?.m2 || "",
          m2Planta3: formData.floors[2]?.m2 || "",
          formaGeometrica: formData.formaGeometrica,
          tipoTejado: formData.tipoTejado,
          usoBajoCubierta: formData.usoBajoCubierta,
          planta1HabPequenas: formData.floors[0]?.habPequenas || "",
          planta1HabMedianas: formData.floors[0]?.habMedianas || "",
          planta1HabGrandes: formData.floors[0]?.habGrandes || "",
          planta2HabPequenas: formData.floors[1]?.habPequenas || "",
          planta2HabMedianas: formData.floors[1]?.habMedianas || "",
          planta2HabGrandes: formData.floors[1]?.habGrandes || "",
          planta3HabPequenas: formData.floors[2]?.habPequenas || "",
          planta3HabMedianas: formData.floors[2]?.habMedianas || "",
          planta3HabGrandes: formData.floors[2]?.habGrandes || "",
          // New per-floor fields
          floorsData: floorsData,
          // Global fields that remain
          garaje: formData.garaje,
          tieneTerreno: formData.tieneTerreno,
          inclinacionTerreno: formData.inclinacionTerreno,
          poblacionProvincia: formData.poblacionProvincia,
          coordenadasGoogleMaps: formData.coordenadasGoogleMaps,
          googleMapsUrl: formData.googleMapsUrl,
          presupuestoGlobal: formData.presupuestoGlobal,
          estiloConstructivo: formData.estiloConstructivo,
          fechaIdealFinalizacion: formData.fechaIdealFinalizacion,
          // Remove old global fields - keep them empty for compat
          numHabitacionesTotal: "",
          numHabitacionesConBano: "",
          numBanosTotal: "",
          numHabitacionesConVestidor: "",
          tipoSalon: "",
          tipoCocina: "",
          lavanderia: "",
          despensa: "",
          porcheCubierto: "",
          patioDescubierto: "",
        }
      });

      if (error) throw error;
      trackFormSubmit('housing_profile');
      recordSubmission();

      toast({ title: "¡Gracias por su información!", description: "Estaremos en contacto pronto." });

      setFormData({
        name: "", email: "", phone: "", message: "",
        numPlantas: "",
        floors: [{ ...emptyFloor }, { ...emptyFloor }, { ...emptyFloor }],
        formaGeometrica: "", tipoTejado: "", usoBajoCubierta: "",
        garaje: "", tieneTerreno: "", inclinacionTerreno: "",
        poblacionProvincia: "", coordenadasGoogleMaps: "", googleMapsUrl: "",
        presupuestoGlobal: "", estiloConstructivo: [], fechaIdealFinalizacion: "",
      });
      setAttachments([]);
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error sending housing profile:", error);
      toast({ title: "Error al enviar", description: error.message || "Hubo un problema al enviar su solicitud.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderFloorSection = (floorIndex: number) => {
    const floor = formData.floors[floorIndex];
    return (
      <div key={floorIndex} className="p-4 rounded-lg border border-orange/20 bg-orange/5 space-y-4">
        <p className="font-semibold text-orange">Planta {floorIndex + 1}</p>

        {/* M² */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground">M² por planta</label>
            <Input
              value={floor.m2}
              onChange={(e) => handleFloorChange(floorIndex, 'm2', e.target.value)}
              className="mt-1 h-8 text-sm"
              placeholder="Ej: 80"
              type="number"
              min="0"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Salón m²</label>
            <Input
              value={floor.salonM2}
              onChange={(e) => handleFloorChange(floorIndex, 'salonM2', e.target.value)}
              className="mt-1 h-8 text-sm"
              placeholder="Ej: 30"
              type="number"
              min="0"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Cocina</label>
            <Select value={floor.cocina} onValueChange={(v) => handleFloorSelectChange(floorIndex, 'cocina', v)}>
              <SelectTrigger className="mt-1 h-8 text-sm">
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="separada">Separada</SelectItem>
                <SelectItem value="junto-salon">Junto a salón</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Habitaciones */}
        <div>
          <label className="text-xs font-medium text-orange">Habitaciones</label>
          <div className="grid grid-cols-3 gap-3 mt-1">
            <div>
              <label className="text-xs text-muted-foreground">Grandes</label>
              <Input value={floor.habGrandes} onChange={(e) => handleFloorChange(floorIndex, 'habGrandes', e.target.value)} className="mt-1 h-8 text-sm" placeholder="0" type="number" min="0" max="20" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Medianas</label>
              <Input value={floor.habMedianas} onChange={(e) => handleFloorChange(floorIndex, 'habMedianas', e.target.value)} className="mt-1 h-8 text-sm" placeholder="0" type="number" min="0" max="20" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Pequeñas</label>
              <Input value={floor.habPequenas} onChange={(e) => handleFloorChange(floorIndex, 'habPequenas', e.target.value)} className="mt-1 h-8 text-sm" placeholder="0" type="number" min="0" max="20" />
            </div>
          </div>
        </div>

        {/* Baños */}
        <div>
          <label className="text-xs font-medium text-orange">Baños</label>
          <div className="grid grid-cols-2 gap-3 mt-1">
            <div>
              <label className="text-xs text-muted-foreground">Baño mediano</label>
              <Input value={floor.banosMedianos} onChange={(e) => handleFloorChange(floorIndex, 'banosMedianos', e.target.value)} className="mt-1 h-8 text-sm" placeholder="0" type="number" min="0" max="10" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Baño grande</label>
              <Input value={floor.banosGrandes} onChange={(e) => handleFloorChange(floorIndex, 'banosGrandes', e.target.value)} className="mt-1 h-8 text-sm" placeholder="0" type="number" min="0" max="10" />
            </div>
          </div>
        </div>

        {/* Otros espacios de la planta */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground">Despensa m²</label>
            <Input value={floor.despensaM2} onChange={(e) => handleFloorChange(floorIndex, 'despensaM2', e.target.value)} className="mt-1 h-8 text-sm" placeholder="0" type="number" min="0" />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Lavandería m²</label>
            <Input value={floor.lavanderiaM2} onChange={(e) => handleFloorChange(floorIndex, 'lavanderiaM2', e.target.value)} className="mt-1 h-8 text-sm" placeholder="0" type="number" min="0" />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Porche techado m²</label>
            <Input value={floor.porcheTechadoM2} onChange={(e) => handleFloorChange(floorIndex, 'porcheTechadoM2', e.target.value)} className="mt-1 h-8 text-sm" placeholder="0" type="number" min="0" />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Patio sin techo m²</label>
            <Input value={floor.patioSinTechoM2} onChange={(e) => handleFloorChange(floorIndex, 'patioSinTechoM2', e.target.value)} className="mt-1 h-8 text-sm" placeholder="0" type="number" min="0" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground">Terrazas m²</label>
            <Input value={floor.terrazasM2} onChange={(e) => handleFloorChange(floorIndex, 'terrazasM2', e.target.value)} className="mt-1 h-8 text-sm" placeholder="0" type="number" min="0" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl text-orange">Perfil de Vivienda</DialogTitle>
          <DialogDescription>
            Complete los datos de su vivienda ideal y le prepararemos una propuesta personalizada
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-100px)] px-6 pb-6">
          {isBlocked ? (
            <div className="text-center py-8">
              <p className="text-destructive font-medium">{blockReason}</p>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-6 pt-4">
            <input {...honeypotProps} type="text" />

            {/* Datos de contacto */}
            <div className="space-y-4">
              <h3 className={sectionHeaderClass}>Datos de Contacto</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Nombre *</label>
                  <Input name="name" value={formData.name} onChange={handleInputChange} className="mt-1" placeholder="Tu nombre completo" required maxLength={100} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Email *</label>
                  <Input type="email" name="email" value={formData.email} onChange={handleInputChange} className="mt-1" placeholder="tu@email.com" required maxLength={255} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Teléfono *</label>
                  <div className="flex mt-1">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">+34</span>
                    <Input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} className="rounded-l-none" placeholder="600 000 000" required maxLength={15} />
                  </div>
                </div>
              </div>
            </div>

            {/* Estructura */}
            <div className="space-y-4">
              <h3 className={sectionHeaderClass}>Estructura de la Vivienda</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">¿Cuántas plantas?</label>
                  <Select value={formData.numPlantas} onValueChange={(v) => handleSelectChange("numPlantas", v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 planta</SelectItem>
                      <SelectItem value="2">2 plantas</SelectItem>
                      <SelectItem value="3">3 plantas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Forma geométrica</label>
                  <Select value={formData.formaGeometrica} onValueChange={(v) => handleSelectChange("formaGeometrica", v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cuadrada">Cuadrada</SelectItem>
                      <SelectItem value="rectangular">Rectangular</SelectItem>
                      <SelectItem value="en-l">En L</SelectItem>
                      <SelectItem value="otras">Otras</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Tipo de tejado</label>
                  <Select value={formData.tipoTejado} onValueChange={(v) => handleSelectChange("tipoTejado", v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="plano">Plano</SelectItem>
                      <SelectItem value="1-caida">1 caída</SelectItem>
                      <SelectItem value="2-caidas">2 caídas</SelectItem>
                      <SelectItem value="4-caidas">4 caídas</SelectItem>
                      <SelectItem value="otros">Otros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(formData.tipoTejado === '2-caidas' || formData.tipoTejado === '4-caidas') && (
                <div>
                  <label className="text-sm font-medium text-foreground">¿Qué hacer con el espacio Bajo Cubierta?</label>
                  <Select value={formData.usoBajoCubierta} onValueChange={(v) => handleSelectChange("usoBajoCubierta", v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="habitable">Habitable</SelectItem>
                      <SelectItem value="almacenaje">Almacenaje</SelectItem>
                      <SelectItem value="nada">Nada, no hay</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Distribución por planta */}
            {numPlantas >= 1 && (
              <div className="space-y-4">
                <h3 className={sectionHeaderClass}>Distribución por Planta</h3>
                <p className="text-sm text-muted-foreground">
                  Detalle la distribución de cada planta: habitaciones, baños, cocina, salón y espacios complementarios.
                </p>
                {Array.from({ length: Math.min(numPlantas, 3) }, (_, i) => renderFloorSection(i))}
              </div>
            )}

            {/* Otros espacios */}
            <div className="space-y-4">
              <h3 className={sectionHeaderClass}>Otros Espacios</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Garaje</label>
                  <Input name="garaje" value={formData.garaje} onChange={handleInputChange} className="mt-1" placeholder="Ej: 2 plazas" maxLength={100} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">¿Tiene terreno?</label>
                  <Input name="tieneTerreno" value={formData.tieneTerreno} onChange={handleInputChange} className="mt-1" placeholder="Ej: Sí, 500m²" maxLength={100} />
                </div>
              </div>
            </div>

            {/* Planeidad del terreno */}
            <div className="space-y-4">
              <h3 className={sectionHeaderClass}>Planeidad del Terreno</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Inclinación del terreno</label>
                  <Select value={formData.inclinacionTerreno} onValueChange={(v) => handleSelectChange("inclinacionTerreno", v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="plano">Plano</SelectItem>
                      <SelectItem value="inclinado">Inclinado</SelectItem>
                      <SelectItem value="irregular">Irregular</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Ubicación y presupuesto */}
            <div className="space-y-4">
              <h3 className={sectionHeaderClass}>Ubicación, Presupuesto y Plazo</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">¿En qué población o provincia?</label>
                  <Input name="poblacionProvincia" value={formData.poblacionProvincia} onChange={handleInputChange} className="mt-1" placeholder="Ej: Santander, Cantabria" maxLength={200} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Coordenadas Google Maps</label>
                  <Input name="coordenadasGoogleMaps" value={formData.coordenadasGoogleMaps} onChange={handleInputChange} className="mt-1" placeholder="Ej: 43.4623, -3.8099" maxLength={100} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">URL Google Maps</label>
                <Input name="googleMapsUrl" value={formData.googleMapsUrl} onChange={handleInputChange} className="mt-1" placeholder="Ej: https://maps.app.goo.gl/..." maxLength={500} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Presupuesto global (incl. impuestos, licencias y proyecto)</label>
                  <Input name="presupuestoGlobal" value={formData.presupuestoGlobal} onChange={handleInputChange} className="mt-1" placeholder="Ej: 250.000€" maxLength={100} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Fecha ideal de finalización</label>
                  <Input type="date" name="fechaIdealFinalizacion" value={formData.fechaIdealFinalizacion} onChange={handleInputChange} className="mt-1" />
                </div>
              </div>
            </div>

            {/* Estilo constructivo */}
            <div className="space-y-4">
              <h3 className={sectionHeaderClass}>Estilo Constructivo Preferido</h3>
              <p className="text-sm text-muted-foreground">Seleccione los estilos que más le gusten. Puede elegir varios.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {projectStyles.map((style) => (
                  <Card
                    key={style.id}
                    className={`cursor-pointer overflow-hidden transition-all hover:shadow-lg ${
                      formData.estiloConstructivo.includes(style.id) ? "ring-2 ring-orange" : ""
                    }`}
                    onClick={() => toggleStyle(style.id)}
                  >
                    {style.image ? (
                      <div className="relative h-24">
                        <img src={style.image} alt={style.label} className="w-full h-full object-cover" />
                        {formData.estiloConstructivo.includes(style.id) && (
                          <div className="absolute inset-0 bg-orange/40 flex items-center justify-center">
                            <Check className="w-8 h-8 text-white" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className={`h-24 flex items-center justify-center ${
                        formData.estiloConstructivo.includes(style.id) ? "bg-orange/20" : "bg-muted"
                      }`}>
                        {formData.estiloConstructivo.includes(style.id) && <Check className="w-8 h-8 text-orange" />}
                      </div>
                    )}
                    <div className="p-2 text-center">
                      <span className="text-sm font-medium">{style.label}</span>
                    </div>
                  </Card>
                ))}
              </div>
              {formData.estiloConstructivo.length > 0 && (
                <p className="text-sm text-orange">
                  Seleccionados: {formData.estiloConstructivo.map(id => projectStyles.find(s => s.id === id)?.label).join(", ")}
                </p>
              )}
            </div>

            {/* Mensaje adicional */}
            <div className="space-y-4">
              <h3 className={sectionHeaderClass}>Información Adicional</h3>
              <div>
                <label className="text-sm font-medium text-foreground">Mensaje (opcional)</label>
                <Textarea name="message" value={formData.message} onChange={handleInputChange} className="mt-1 min-h-[100px]" placeholder="¿Algo más que quiera comentarnos sobre su proyecto?" maxLength={2000} />
              </div>
            </div>

            {/* Archivos adjuntos */}
            <div className="space-y-4">
              <h3 className={sectionHeaderClass}>Archivos Adjuntos (opcional)</h3>
              <div className="border-2 border-dashed border-orange/30 rounded-lg p-4 bg-orange/5">
                <input ref={fileInputRef} type="file" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx" onChange={handleFileSelect} className="hidden" />
                {attachments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip className="h-10 w-10 text-orange/60 mb-3" />
                    <p className="text-sm text-muted-foreground text-center font-medium">Haz clic para adjuntar documentos</p>
                    <p className="text-xs text-muted-foreground mt-1">Planos, fotos del terreno, referencias visuales...</p>
                    <p className="text-xs text-muted-foreground">PDF, imágenes, Word, Excel (máx. 10MB por archivo)</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {attachments.map((file, index) => (
                      <div key={index} className="flex items-center gap-2 bg-background p-2 rounded">
                        <File className="h-4 w-4 text-orange flex-shrink-0" />
                        <span className="text-sm truncate flex-1">{file.name}</span>
                        <span className="text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeAttachment(index)} className="h-6 w-6 p-0">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="w-full mt-2">
                      <Paperclip className="h-4 w-4 mr-2" /> Añadir más archivos
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <Button type="submit" className="w-full bg-orange hover:bg-orange/90 text-white text-lg py-6" disabled={isSubmitting || isUploadingFiles}>
              {isSubmitting || isUploadingFiles ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{isUploadingFiles ? "Subiendo archivos..." : "Enviando..."}</>
              ) : "Enviar Perfil de Vivienda"}
            </Button>
          </form>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default HousingProfileForm;
