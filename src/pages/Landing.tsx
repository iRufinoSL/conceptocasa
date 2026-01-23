import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useBotProtection } from "@/hooks/useBotProtection";
import { supabase } from "@/integrations/supabase/client";
import HousingProfileForm from "@/components/landing/HousingProfileForm";
import { useWebsiteTracking, getStoredUtmParams } from "@/hooks/useWebsiteTracking";
import { 
  Mail, 
  Phone, 
  Menu, 
  X, 
  ChevronDown, 
  Building2, 
  Home, 
  Briefcase, 
  Hammer, 
  ClipboardList,
  Leaf,
  TrendingDown,
  Zap,
  MapPin,
  Clock,
  Play,
  FileText,
  Paperclip,
  File,
  Loader2
} from "lucide-react";
import homeModern from "@/assets/home-modern.jpg";
import homeClassic from "@/assets/home-classic.jpg";
import homeRustic from "@/assets/home-rustic.jpg";
import homeWood from "@/assets/home-wood.jpg";
import homeEco from "@/assets/home-eco.jpg";
import homeMediterranean from "@/assets/home-mediterranean.jpg";

const heroImages = [homeModern, homeClassic, homeRustic, homeWood, homeEco, homeMediterranean];

// Helper to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const Landing = () => {
  const { toast } = useToast();
  const { honeypotProps, validateSubmission, recordSubmission, isBlocked, blockReason } = useBotProtection();
  const { trackButtonClick, trackFormStart, trackFormSubmit } = useWebsiteTracking();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showHousingForm, setShowHousingForm] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: ""
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    const newFiles = Array.from(files);
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    
    const validFiles = newFiles.filter(file => {
      if (file.size > maxSize) {
        toast({
          title: "Archivo demasiado grande",
          description: `${file.name} excede el límite de 10MB`,
          variant: "destructive",
        });
        return false;
      }
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Tipo de archivo no permitido",
          description: `${file.name} no es un tipo de archivo válido`,
          variant: "destructive",
        });
        return false;
      }
      return true;
    });
    
    setAttachments(prev => [...prev, ...validFiles]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
        const filePath = `contact/${timestamp}_${sanitizedName}`;
        
        const { error } = await supabase.storage
          .from('contact-attachments')
          .upload(filePath, file);
        
        if (error) {
          console.error('Error uploading file:', error);
          throw error;
        }
        
        uploadedPaths.push(filePath);
      }
      return uploadedPaths;
    } finally {
      setIsUploadingFiles(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Bot protection validation
    const validation = validateSubmission();
    if (!validation.isValid) {
      toast({
        title: "Error de validación",
        description: validation.error || "Por favor, inténtalo de nuevo.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload attachments first
      const attachmentPaths = await uploadAttachments();
      
      // Get UTM params for tracking
      const utmParams = getStoredUtmParams();
      
      const { data, error } = await supabase.functions.invoke('send-contact-email', {
        body: {
          ...formData,
          attachmentPaths: attachmentPaths.length > 0 ? attachmentPaths : undefined,
          attachmentNames: attachments.length > 0 ? attachments.map(f => f.name) : undefined,
          // Include UTM params for CRM tracking
          utm_source: utmParams.utm_source,
          utm_medium: utmParams.utm_medium,
          utm_campaign: utmParams.utm_campaign,
        }
      });

      if (error) throw error;

      // Track form submission
      trackFormSubmit('contact_form');

      // Record successful submission for rate limiting
      recordSubmission();

      toast({
        title: "¡Mensaje enviado!",
        description: "Hemos recibido tu mensaje. Te contactaremos pronto.",
      });

      setFormData({ name: "", email: "", phone: "", subject: "", message: "" });
      setAttachments([]);
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast({
        title: "Error al enviar",
        description: error.message || "Hubo un problema al enviar tu mensaje. Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % heroImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border/50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Home className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">
                <span className="text-foreground">Concepto</span>
                <span className="text-primary">.</span>
                <span className="text-primary">Casa</span>
              </span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-6">
              <button onClick={() => scrollToSection('inicio')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Inicio
              </button>
              <button onClick={() => scrollToSection('servicios')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Servicios
              </button>
              <button onClick={() => scrollToSection('sistemas')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Sistemas Constructivos
              </button>
              <button onClick={() => scrollToSection('proyectos')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Proyectos
              </button>
              <button onClick={() => scrollToSection('contacto')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Contacto
              </button>
            </div>

            {/* Right Side */}
            <div className="hidden lg:flex items-center gap-4">
              <a href="mailto:organiza@concepto.casa" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                <Mail className="w-4 h-4" />
                <span>Enviar email a organiza@concepto.casa</span>
              </a>
              <Link to="/auth">
                <Button className="bg-primary hover:bg-primary/90">
                  Acceso
                </Button>
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button 
              className="lg:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="lg:hidden py-4 border-t border-border">
              <div className="flex flex-col gap-4">
                <button onClick={() => scrollToSection('inicio')} className="text-left text-sm text-muted-foreground hover:text-foreground">Inicio</button>
                <button onClick={() => scrollToSection('servicios')} className="text-left text-sm text-muted-foreground hover:text-foreground">Servicios</button>
                <button onClick={() => scrollToSection('sistemas')} className="text-left text-sm text-muted-foreground hover:text-foreground">Sistemas Constructivos</button>
                <button onClick={() => scrollToSection('proyectos')} className="text-left text-sm text-muted-foreground hover:text-foreground">Proyectos</button>
                <button onClick={() => scrollToSection('contacto')} className="text-left text-sm text-muted-foreground hover:text-foreground">Contacto</button>
                <a href="mailto:organiza@concepto.casa" className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="w-4 h-4" />
                  organiza@concepto.casa
                </a>
                <Link to="/auth">
                  <Button className="w-full bg-primary hover:bg-primary/90">Acceso</Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section id="inicio" className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        {/* Background Images */}
        {heroImages.map((image, index) => (
          <div
            key={index}
            className="absolute inset-0 transition-opacity duration-1000"
            style={{
              opacity: currentImageIndex === index ? 1 : 0,
            }}
          >
            <img
              src={image}
              alt={`Casa ${index + 1}`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-background/40" />
          </div>
        ))}

        {/* Content */}
        <div className="relative z-10 container mx-auto px-4 text-center">
          <div className="max-w-4xl mx-auto space-y-8">
            <span className="inline-block px-4 py-2 bg-primary/20 text-primary rounded-full text-sm font-medium">
              +15 años construyendo futuros
            </span>
            
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-foreground leading-tight">
              Construimos tu{" "}
              <span className="font-playfair italic text-primary">Futuro Ahora</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Diseño y construcción industrializada en tres pilares: Eficiencia, Economía y Ecología/Salud.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-8"
                onClick={() => scrollToSection('contacto')}
              >
                Solicitar Consulta
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-foreground/20 hover:bg-foreground/10"
                onClick={() => scrollToSection('proyectos')}
              >
                Ver Proyectos
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
              <Card className="bg-card/60 backdrop-blur-md border-border/50 p-6 text-center">
                <div className="text-3xl md:text-4xl font-playfair font-bold text-primary">Decenas</div>
                <div className="text-sm text-muted-foreground mt-1">Proyectos Completados</div>
              </Card>
              <Card className="bg-card/60 backdrop-blur-md border-border/50 p-6 text-center">
                <div className="text-3xl md:text-4xl font-playfair font-bold text-primary">15+</div>
                <div className="text-sm text-muted-foreground mt-1">Años de Experiencia</div>
              </Card>
              <Card className="bg-card/60 backdrop-blur-md border-border/50 p-6 text-center">
                <div className="text-3xl md:text-4xl font-playfair font-bold text-primary">Muy cerca de ti</div>
                <div className="text-sm text-muted-foreground mt-1">Profesionales</div>
              </Card>
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown className="w-8 h-8 text-foreground/50" />
        </div>
      </section>

      {/* Services Section */}
      <section id="servicios" className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <span className="text-sm text-primary font-medium uppercase tracking-wide">Servicios</span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2">Soluciones Integrales</h2>
            <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
              Ofrecemos una gama completa de servicios para satisfacer todas tus necesidades en construcción y bienes raíces.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="p-6 hover:shadow-lg transition-shadow group">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Diseño y Construcción Industrializada</h3>
              <p className="text-sm text-muted-foreground">
                Proyectos de construcción desde cero con los más altos estándares de calidad y seguridad.
              </p>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-shadow group">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <Home className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Viviendas Residenciales</h3>
              <p className="text-sm text-muted-foreground">
                Construcción de casas y departamentos con diseños personalizados y acabados premium.
              </p>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-shadow group">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <Briefcase className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Gestión Inmobiliaria</h3>
              <p className="text-sm text-muted-foreground">
                Red de inmobiliarias colaboradoras en toda España para la compra, venta y alquiler de propiedades.
              </p>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-shadow group">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <Hammer className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Remodelación</h3>
              <p className="text-sm text-muted-foreground">
                Renovamos y mejoramos espacios existentes con diseños contemporáneos.
              </p>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-shadow group">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <ClipboardList className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Gestión de Proyectos</h3>
              <p className="text-sm text-muted-foreground">
                Administración integral de proyectos desde la planificación hasta la entrega.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Construction Systems Section */}
      <section id="sistemas" className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <span className="text-sm text-primary font-medium uppercase tracking-wide">Innovación en Construcción</span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2">SISTEMAS CONSTRUCTIVOS</h2>
            <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
              Descubre los sistemas constructivos más innovadores y eficientes para tu proyecto
            </p>
            <p className="text-primary font-semibold mt-4 text-lg">
              Tenemos experiencia con estos Sistemas constructivos
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div>
              <div className="relative w-full aspect-video rounded-xl shadow-lg overflow-hidden">
                <iframe
                  src="https://www.youtube.com/embed/jekNJ7-Ij-0"
                  title="Sistema constructivo - Bloque sólido"
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="mt-4">
                <h3 className="text-xl font-semibold text-foreground">Ejemplo de construcción con bloque sólido: de hormigón celular o perlita</h3>
              </div>
            </div>

            <div className="space-y-6">
              <Card className="p-6 border-l-4 border-l-primary">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-foreground">Eficiencia Energética</h4>
                    <p className="text-sm text-muted-foreground mt-1">Sistemas que optimizan el consumo energético</p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 border-l-4 border-l-primary">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <TrendingDown className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-foreground">Economía</h4>
                    <p className="text-sm text-muted-foreground mt-1">Construcción industrializada reduce costes</p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 border-l-4 border-l-primary">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Leaf className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-foreground">Ecología y Salud</h4>
                    <p className="text-sm text-muted-foreground mt-1">Materiales sostenibles y saludables</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* LSF Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center mt-16">
            <div>
              <div className="relative w-full aspect-video rounded-xl shadow-lg overflow-hidden">
                <iframe
                  src="https://www.youtube.com/embed/fIE6vP2w51A?start=1"
                  title="Sistema LSF - Light Steel Frame"
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="mt-4">
                <h3 className="text-xl font-semibold text-foreground">Ejemplo de construcción con LSF</h3>
              </div>
            </div>

            <div className="space-y-6">
              <Card className="p-6 border-l-4 border-l-primary">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-foreground">Rapidez de Montaje</h4>
                    <p className="text-sm text-muted-foreground mt-1">Construcción en seco con tiempos reducidos</p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 border-l-4 border-l-primary">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <TrendingDown className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-foreground">Ligereza Estructural</h4>
                    <p className="text-sm text-muted-foreground mt-1">Menor carga sobre cimentación</p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 border-l-4 border-l-primary">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Leaf className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-foreground">Precisión Industrial</h4>
                    <p className="text-sm text-muted-foreground mt-1">Perfiles fabricados con alta exactitud</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* SIP Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center mt-16">
            <div>
              <div className="relative w-full aspect-video rounded-xl shadow-lg overflow-hidden">
                <iframe
                  src="https://www.youtube.com/embed/YOUR_SIP_VIDEO_ID"
                  title="Sistema SIP - Structural Insulation Panel"
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="mt-4">
                <h3 className="text-xl font-semibold text-foreground">Ejemplo de construcción con SIP</h3>
              </div>
            </div>

            <div className="space-y-6">
              <Card className="p-6 border-l-4 border-l-primary">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-foreground">Aislamiento Superior</h4>
                    <p className="text-sm text-muted-foreground mt-1">Paneles con núcleo aislante de alta eficiencia térmica</p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 border-l-4 border-l-primary">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <TrendingDown className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-foreground">Construcción Rápida</h4>
                    <p className="text-sm text-muted-foreground mt-1">Montaje acelerado con paneles prefabricados</p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 border-l-4 border-l-primary">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Leaf className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-foreground">Resistencia Estructural</h4>
                    <p className="text-sm text-muted-foreground mt-1">Alta capacidad portante con mínimo espesor</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Projects Section */}
      <section id="proyectos" className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <span className="text-sm text-primary font-medium uppercase tracking-wide">Portafolio</span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2">Proyectos Factibles</h2>
            <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
              Todos los proyectos son distintos, te ayudamos personalizando el tuyo, dinos qué estilo te gusta y lo hacemos posible.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { 
                image: homeModern, 
                tag: "Moderno", 
                title: "Estilo Moderno", 
                desc: "Diseño contemporáneo con líneas limpias, amplios ventanales y espacios minimalistas." 
              },
              { 
                image: homeClassic, 
                tag: "Convencional", 
                title: "Casa Tradicional", 
                desc: "Arquitectura clásica con elementos tradicionales y acabados atemporales." 
              },
              { 
                image: homeRustic, 
                tag: "Rústico", 
                title: "Estilo rústico montañés", 
                desc: "Vivienda rústica montañesa con piedra natural y madera autóctona." 
              },
              { 
                image: homeMediterranean, 
                tag: "Mediterráneo", 
                title: "Estilo Mediterráneo", 
                desc: "Materiales locales con terrazas amplias y vistas al mar." 
              },
              { 
                image: homeWood, 
                tag: "Madera", 
                title: "Viviendas de madera", 
                desc: "Vivienda escandinava de madera natural con diseño funcional y sostenible." 
              },
              { 
                image: homeEco, 
                tag: "Ecológica", 
                title: "Casa Ecológica", 
                desc: "Construcción sostenible con materiales naturales y bajo impacto ambiental." 
              },
            ].map((project, index) => (
              <Card key={index} className="overflow-hidden group hover:shadow-xl transition-shadow">
                <div className="relative h-48 overflow-hidden">
                  <img 
                    src={project.image} 
                    alt={project.title} 
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                  />
                  <span className="absolute top-4 left-4 px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                    {project.tag}
                  </span>
                </div>
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-foreground">{project.title}</h3>
                  <p className="text-sm text-muted-foreground mt-2">{project.desc}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contacto" className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <span className="text-sm text-primary font-medium uppercase tracking-wide">Contacto</span>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2">Comencemos tu Proyecto</h2>
            <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
              Estamos listos para escucharte y ayudarte a hacer realidad tu visión. Contáctanos hoy.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Contact Info */}
            <div className="space-y-6">
              <a href="tel:+34690123533" className="flex items-start gap-4 p-4 bg-secondary/50 rounded-xl hover:bg-secondary transition-colors">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Phone className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Teléfono</h4>
                  <p className="text-primary">+34 690 123 533</p>
                </div>
              </a>

              <a href="mailto:organiza@concepto.casa" className="flex items-start gap-4 p-4 bg-secondary/50 rounded-xl hover:bg-secondary transition-colors">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Email</h4>
                  <p className="text-primary">organiza@concepto.casa</p>
                </div>
              </a>

              <div className="flex items-start gap-4 p-4 bg-secondary/50 rounded-xl">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Estamos cerca de ti en toda España</h4>
                  <p className="text-muted-foreground">Cantabria: Zoco Gran Santander, of. 201 Santander 39011</p>
                  <p className="text-muted-foreground">Asturias: González Abarca, 8 bajo Avilés 33401</p>
                </div>
              </div>

              <Card className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Clock className="w-5 h-5 text-primary" />
                  <h4 className="font-semibold text-foreground">Horario de Atención</h4>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Lunes - Viernes:</span>
                    <span className="text-foreground">8:00 - 18:00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sábados:</span>
                    <span className="text-foreground">9:00 - 13:00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Domingos:</span>
                    <span className="text-foreground">Cerrado</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Contact Form */}
            <Card className="p-6 md:p-8">
              {isBlocked ? (
                <div className="text-center py-8">
                  <p className="text-destructive font-medium">{blockReason}</p>
                </div>
              ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Honeypot field for bot protection - hidden from users */}
                <input {...honeypotProps} type="text" />
                
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <div>
                  <label className="text-sm font-medium text-foreground">Asunto</label>
                  <Input 
                    name="subject"
                    value={formData.subject}
                    onChange={handleInputChange}
                    className="mt-1" 
                    placeholder="¿En qué podemos ayudarte?" 
                    maxLength={200}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Mensaje *</label>
                  <Textarea 
                    name="message"
                    value={formData.message}
                    onChange={handleInputChange}
                    className="mt-1 min-h-[120px]" 
                    placeholder="Cuéntanos sobre tu proyecto..." 
                    required 
                    maxLength={2000}
                  />
                </div>
                
                {/* File Attachments Section */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Archivos adjuntos (opcional)</label>
                  <div className="border-2 border-dashed border-primary/30 rounded-lg p-4 bg-primary/5">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    
                    {attachments.length === 0 ? (
                      <div 
                        className="flex flex-col items-center justify-center py-4 cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip className="h-8 w-8 text-primary/60 mb-2" />
                        <p className="text-sm text-muted-foreground text-center">
                          Haz clic para adjuntar documentos
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          PDF, imágenes, Word, Excel (máx. 10MB por archivo)
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {attachments.map((file, index) => (
                          <div key={index} className="flex items-center gap-2 bg-background p-2 rounded">
                            <File className="h-4 w-4 text-primary flex-shrink-0" />
                            <span className="text-sm truncate flex-1">{file.name}</span>
                            <span className="text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeAttachment(index)}
                              className="h-6 w-6 p-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full mt-2"
                        >
                          <Paperclip className="h-4 w-4 mr-2" />
                          Añadir más archivos
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-primary hover:bg-primary/90"
                  disabled={isSubmitting || isUploadingFiles}
                >
                  {isSubmitting || isUploadingFiles ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {isUploadingFiles ? "Subiendo archivos..." : "Enviando..."}
                    </>
                  ) : "Enviar Mensaje"}
                </Button>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">o bien</span>
                  </div>
                </div>

                <Button 
                  type="button"
                  className="w-full bg-primary hover:bg-primary/90 text-sm py-6 h-auto"
                  onClick={() => setShowHousingForm(true)}
                >
                  <FileText className="w-5 h-5 mr-2 flex-shrink-0" />
                  <span className="text-left flex flex-col leading-tight">
                    <span>Si tienes definido el perfil de tu vivienda,</span>
                    <span>envía esta información y te lo preparamos</span>
                  </span>
                </Button>
              </form>
              )}
            </Card>
          </div>
        </div>
      </section>

      {/* Housing Profile Form Dialog */}
      <HousingProfileForm 
        open={showHousingForm} 
        onOpenChange={setShowHousingForm} 
      />

      {/* Footer */}
      <footer className="bg-foreground text-background py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Home className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">
                Concepto<span className="text-primary">.</span>Casa
              </span>
            </div>
            <p className="text-sm text-background/70">
              organiza@concepto.casa © {new Date().getFullYear()} Terra.Idea.Concepto. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
