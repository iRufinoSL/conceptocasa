import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { X, Check } from "lucide-react";
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

const HousingProfileForm = ({ open, onOpenChange }: HousingProfileFormProps) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStyleSelector, setShowStyleSelector] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
    // Campos específicos del perfil de vivienda
    numPlantas: "",
    m2PorPlanta: "",
    formaGeometrica: "",
    tipoTejado: "",
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
    garaje: "",
    tieneTerreno: "",
    poblacionProvincia: "",
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

  const toggleStyle = (styleId: string) => {
    setFormData(prev => ({
      ...prev,
      estiloConstructivo: prev.estiloConstructivo.includes(styleId)
        ? prev.estiloConstructivo.filter(s => s !== styleId)
        : [...prev.estiloConstructivo, styleId]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const estilosSeleccionados = formData.estiloConstructivo
      .map(id => projectStyles.find(s => s.id === id)?.label)
      .filter(Boolean)
      .join(", ");

    const messageBody = `
PERFIL DE VIVIENDA - SOLICITUD DETALLADA

DATOS DE CONTACTO:
- Nombre: ${formData.name}
- Email: ${formData.email}
- Teléfono: ${formData.phone}

CARACTERÍSTICAS DE LA VIVIENDA:
- Número de plantas: ${formData.numPlantas || "No especificado"}
- M² habitables por planta: ${formData.m2PorPlanta || "No especificado"}
- Forma geométrica de la planta: ${formData.formaGeometrica || "No especificado"}
- Tipo de tejado: ${formData.tipoTejado || "No especificado"}

DISTRIBUCIÓN:
- Nº habitaciones total: ${formData.numHabitacionesTotal || "No especificado"}
- Nº habitaciones con baño: ${formData.numHabitacionesConBano || "No especificado"}
- Nº baños en total: ${formData.numBanosTotal || "No especificado"}
- Nº habitaciones con vestidor: ${formData.numHabitacionesConVestidor || "No especificado"}
- Salón: ${formData.tipoSalon || "No especificado"}
- Cocina: ${formData.tipoCocina || "No especificado"}
- Lavandería: ${formData.lavanderia || "No especificado"}
- Despensa: ${formData.despensa || "No especificado"}

ESPACIOS EXTERIORES:
- Porche cubierto: ${formData.porcheCubierto || "No especificado"}
- Patio descubierto: ${formData.patioDescubierto || "No especificado"}
- Garaje: ${formData.garaje || "No especificado"}
- Tiene terreno: ${formData.tieneTerreno || "No especificado"}

UBICACIÓN Y PRESUPUESTO:
- Población/Provincia: ${formData.poblacionProvincia || "No especificado"}
- Presupuesto global (incl. impuestos, licencias y proyecto): ${formData.presupuestoGlobal || "No especificado"}
- Fecha ideal de finalización: ${formData.fechaIdealFinalizacion || "No especificado"}

ESTILO CONSTRUCTIVO PREFERIDO:
${estilosSeleccionados || "No especificado"}

MENSAJE ADICIONAL:
${formData.message || "Sin mensaje adicional"}
    `.trim();

    try {
      const { error } = await supabase.functions.invoke('send-contact-email', {
        body: {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          subject: "Perfil de Vivienda - Solicitud Detallada",
          message: messageBody,
          // Flag to indicate this is a housing profile
          isHousingProfile: true,
          // Send all form fields for database storage
          numPlantas: formData.numPlantas,
          m2PorPlanta: formData.m2PorPlanta,
          formaGeometrica: formData.formaGeometrica,
          tipoTejado: formData.tipoTejado,
          numHabitacionesTotal: formData.numHabitacionesTotal,
          numHabitacionesConBano: formData.numHabitacionesConBano,
          numBanosTotal: formData.numBanosTotal,
          numHabitacionesConVestidor: formData.numHabitacionesConVestidor,
          tipoSalon: formData.tipoSalon,
          tipoCocina: formData.tipoCocina,
          lavanderia: formData.lavanderia,
          despensa: formData.despensa,
          porcheCubierto: formData.porcheCubierto,
          patioDescubierto: formData.patioDescubierto,
          garaje: formData.garaje,
          tieneTerreno: formData.tieneTerreno,
          poblacionProvincia: formData.poblacionProvincia,
          presupuestoGlobal: formData.presupuestoGlobal,
          estiloConstructivo: formData.estiloConstructivo,
          fechaIdealFinalizacion: formData.fechaIdealFinalizacion
        }
      });

      if (error) throw error;

      toast({
        title: "¡Gracias por su información!",
        description: "Estaremos en contacto pronto.",
      });

      // Reset form
      setFormData({
        name: "",
        email: "",
        phone: "",
        message: "",
        numPlantas: "",
        m2PorPlanta: "",
        formaGeometrica: "",
        tipoTejado: "",
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
        garaje: "",
        tieneTerreno: "",
        poblacionProvincia: "",
        presupuestoGlobal: "",
        estiloConstructivo: [],
        fechaIdealFinalizacion: "",
      });
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error sending housing profile:", error);
      toast({
        title: "Error al enviar",
        description: error.message || "Hubo un problema al enviar su solicitud. Inténtelo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl">Gestión de Proyectos - Perfil de Vivienda</DialogTitle>
          <DialogDescription>
            Complete los datos de su vivienda ideal y le prepararemos una propuesta personalizada
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[calc(90vh-100px)] px-6 pb-6">
          <form onSubmit={handleSubmit} className="space-y-6 pt-4">
            {/* Datos de contacto básicos */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground border-b pb-2">Datos de Contacto</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Nombre *</label>
                  <Input 
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="mt-1" 
                    placeholder="Tu nombre completo" 
                    required 
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Email *</label>
                  <Input 
                    type="email" 
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="mt-1" 
                    placeholder="tu@email.com" 
                    required 
                    maxLength={255}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Teléfono *</label>
                  <Input 
                    type="tel" 
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="mt-1" 
                    placeholder="+34 600 000 000" 
                    required 
                    maxLength={20}
                  />
                </div>
              </div>
            </div>

            {/* Estructura de la vivienda */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground border-b pb-2">Estructura de la Vivienda</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">¿Cuántas plantas?</label>
                  <Input 
                    name="numPlantas"
                    value={formData.numPlantas}
                    onChange={handleInputChange}
                    className="mt-1" 
                    placeholder="Ej: 2" 
                    maxLength={50}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">M² habitables por planta</label>
                  <Input 
                    name="m2PorPlanta"
                    value={formData.m2PorPlanta}
                    onChange={handleInputChange}
                    className="mt-1" 
                    placeholder="Ej: 80" 
                    maxLength={50}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Forma geométrica</label>
                  <Select value={formData.formaGeometrica} onValueChange={(v) => handleSelectChange("formaGeometrica", v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
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
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
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
            </div>

            {/* Distribución */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground border-b pb-2">Distribución</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Nº habitaciones total</label>
                  <Input 
                    name="numHabitacionesTotal"
                    value={formData.numHabitacionesTotal}
                    onChange={handleInputChange}
                    className="mt-1" 
                    placeholder="Ej: 4" 
                    maxLength={50}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Nº habitaciones con baño</label>
                  <Input 
                    name="numHabitacionesConBano"
                    value={formData.numHabitacionesConBano}
                    onChange={handleInputChange}
                    className="mt-1" 
                    placeholder="Ej: 2" 
                    maxLength={50}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">¿Cuántos baños en total?</label>
                  <Input 
                    name="numBanosTotal"
                    value={formData.numBanosTotal}
                    onChange={handleInputChange}
                    className="mt-1" 
                    placeholder="Ej: 3" 
                    maxLength={50}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Habitaciones con vestidor</label>
                  <Input 
                    name="numHabitacionesConVestidor"
                    value={formData.numHabitacionesConVestidor}
                    onChange={handleInputChange}
                    className="mt-1" 
                    placeholder="Ej: 1" 
                    maxLength={50}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Salón</label>
                  <Select value={formData.tipoSalon} onValueChange={(v) => handleSelectChange("tipoSalon", v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="con-cocina">Con cocina</SelectItem>
                      <SelectItem value="separado-cocina">Separado de cocina</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Cocina</label>
                  <Select value={formData.tipoCocina} onValueChange={(v) => handleSelectChange("tipoCocina", v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aislada">Aislada</SelectItem>
                      <SelectItem value="comedor-independiente">Comedor independiente</SelectItem>
                      <SelectItem value="con-comedor">Con comedor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Lavandería</label>
                  <Input 
                    name="lavanderia"
                    value={formData.lavanderia}
                    onChange={handleInputChange}
                    className="mt-1" 
                    placeholder="Ej: Sí, 6m²" 
                    maxLength={100}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Despensa</label>
                  <Input 
                    name="despensa"
                    value={formData.despensa}
                    onChange={handleInputChange}
                    className="mt-1" 
                    placeholder="Ej: Sí, pequeña" 
                    maxLength={100}
                  />
                </div>
              </div>
            </div>

            {/* Espacios exteriores */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground border-b pb-2">Espacios Exteriores</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Porche cubierto</label>
                  <Input 
                    name="porcheCubierto"
                    value={formData.porcheCubierto}
                    onChange={handleInputChange}
                    className="mt-1" 
                    placeholder="Ej: Sí, 20m²" 
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Patio descubierto</label>
                  <Input 
                    name="patioDescubierto"
                    value={formData.patioDescubierto}
                    onChange={handleInputChange}
                    className="mt-1" 
                    placeholder="Ej: Sí, 30m²" 
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Garaje</label>
                  <Input 
                    name="garaje"
                    value={formData.garaje}
                    onChange={handleInputChange}
                    className="mt-1" 
                    placeholder="Ej: 2 plazas" 
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">¿Tiene terreno?</label>
                  <Input 
                    name="tieneTerreno"
                    value={formData.tieneTerreno}
                    onChange={handleInputChange}
                    className="mt-1" 
                    placeholder="Ej: Sí, 500m²" 
                    maxLength={100}
                  />
                </div>
              </div>
            </div>

            {/* Ubicación y presupuesto */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground border-b pb-2">Ubicación, Presupuesto y Plazo</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground">¿En qué población o provincia?</label>
                  <Input 
                    name="poblacionProvincia"
                    value={formData.poblacionProvincia}
                    onChange={handleInputChange}
                    className="mt-1" 
                    placeholder="Ej: Santander, Cantabria" 
                    maxLength={200}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Presupuesto global (incl. impuestos, licencias y proyecto)</label>
                  <Input 
                    name="presupuestoGlobal"
                    value={formData.presupuestoGlobal}
                    onChange={handleInputChange}
                    className="mt-1" 
                    placeholder="Ej: 250.000€" 
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Fecha ideal de finalización</label>
                  <Input 
                    type="date"
                    name="fechaIdealFinalizacion"
                    value={formData.fechaIdealFinalizacion}
                    onChange={handleInputChange}
                    className="mt-1" 
                  />
                </div>
              </div>
            </div>

            {/* Estilo constructivo */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground border-b pb-2">Estilo Constructivo Preferido</h3>
              <p className="text-sm text-muted-foreground">Seleccione los estilos que más le gusten. Puede elegir varios.</p>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {projectStyles.map((style) => (
                  <Card 
                    key={style.id}
                    className={`cursor-pointer overflow-hidden transition-all hover:shadow-lg ${
                      formData.estiloConstructivo.includes(style.id) 
                        ? "ring-2 ring-primary" 
                        : ""
                    }`}
                    onClick={() => toggleStyle(style.id)}
                  >
                    {style.image ? (
                      <div className="relative h-24">
                        <img 
                          src={style.image} 
                          alt={style.label} 
                          className="w-full h-full object-cover" 
                        />
                        {formData.estiloConstructivo.includes(style.id) && (
                          <div className="absolute inset-0 bg-primary/40 flex items-center justify-center">
                            <Check className="w-8 h-8 text-primary-foreground" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className={`h-24 flex items-center justify-center ${
                        formData.estiloConstructivo.includes(style.id) 
                          ? "bg-primary/20" 
                          : "bg-muted"
                      }`}>
                        {formData.estiloConstructivo.includes(style.id) && (
                          <Check className="w-8 h-8 text-primary" />
                        )}
                      </div>
                    )}
                    <div className="p-2 text-center">
                      <span className="text-sm font-medium">{style.label}</span>
                    </div>
                  </Card>
                ))}
              </div>
              
              {formData.estiloConstructivo.length > 0 && (
                <p className="text-sm text-primary">
                  Seleccionados: {formData.estiloConstructivo
                    .map(id => projectStyles.find(s => s.id === id)?.label)
                    .join(", ")}
                </p>
              )}
            </div>

            {/* Mensaje adicional */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground border-b pb-2">Información Adicional</h3>
              <div>
                <label className="text-sm font-medium text-foreground">Mensaje (opcional)</label>
                <Textarea 
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  className="mt-1 min-h-[100px]" 
                  placeholder="¿Algo más que quiera comentarnos sobre su proyecto?" 
                  maxLength={2000}
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-primary hover:bg-primary/90 text-lg py-6"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Enviando..." : "Enviar"}
            </Button>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default HousingProfileForm;
