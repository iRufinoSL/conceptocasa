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
import { motion } from "framer-motion";
import { FloatingTOC } from "@/components/landing/FloatingTOC";
import { 
  Mail, 
  Phone, 
  Menu, 
  X, 
  ChevronDown, 
  Wind,
  Thermometer,
  Droplets,
  Sun,
  Heart,
  Shield,
  ArrowRight,
  Loader2,
  Paperclip,
  File,
  Home,
  Lock,
  Sparkles,
  Users,
  Eye
} from "lucide-react";
import heroPassivhaus from "@/assets/hero-passivhaus.jpg";
import healthyInterior from "@/assets/healthy-home-interior.jpg";
import hokusaiHero from "@/assets/hokusai-houses-hero.jpg";
import HousesCarousel from "@/components/landing/HousesCarousel";


const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const pillars = [
  {
    icon: Wind,
    title: "Aire Puro",
    description: "Ventilación mecánica con recuperación de calor. Aire filtrado 24/7 sin corrientes ni ruido exterior.",
    stat: "99.5%",
    statLabel: "partículas filtradas"
  },
  {
    icon: Thermometer,
    title: "Confort Térmico",
    description: "Temperatura estable todo el año sin radiadores ni aire acondicionado. Tu cuerpo lo nota, tu factura también.",
    stat: "21°C",
    statLabel: "constantes todo el año"
  },
  {
    icon: Droplets,
    title: "Humedad Controlada",
    description: "Ni sequedad ni condensaciones. El nivel óptimo de humedad que protege tu salud respiratoria y tu hogar.",
    stat: "40-60%",
    statLabel: "humedad relativa ideal"
  },
  {
    icon: Sun,
    title: "Eficiencia Energética",
    description: "Hasta un 90% menos de consumo energético. La casa aprovecha el sol, el aislamiento hace el resto.",
    stat: "90%",
    statLabel: "ahorro energético"
  },
  {
    icon: Heart,
    title: "Salud Integral",
    description: "Sin humedades, sin moho, sin alérgenos. Un hogar que reduce alergias, asma y problemas respiratorios.",
    stat: "0",
    statLabel: "puentes térmicos"
  },
  {
    icon: Shield,
    title: "Certificación Casa Pasiva",
    description: "Test de estanqueidad (Blower Door), termografías infrarrojas para detectar puentes térmicos, y si lo necesitas, Certificación Oficial ante el Passivhaus Institut.",
    stat: "A+++",
    statLabel: "calificación energética"
  }
];

const Landing = () => {
  const { toast } = useToast();
  const { honeypotProps, validateSubmission, recordSubmission, isBlocked } = useBotProtection();
  const { trackButtonClick, trackFormStart, trackFormSubmit } = useWebsiteTracking();
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
    const maxSize = 10 * 1024 * 1024;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const validFiles = newFiles.filter(file => {
      if (file.size > maxSize) {
        toast({ title: "Archivo demasiado grande", description: `${file.name} excede el límite de 10MB`, variant: "destructive" });
        return false;
      }
      if (!allowedTypes.includes(file.type)) {
        toast({ title: "Tipo no permitido", description: `${file.name} no es un tipo válido`, variant: "destructive" });
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
        const filePath = `contact/${timestamp}_${sanitizedName}`;
        const { error } = await supabase.storage.from('contact-attachments').upload(filePath, file);
        if (error) throw error;
        uploadedPaths.push(filePath);
      }
      return uploadedPaths;
    } finally {
      setIsUploadingFiles(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateSubmission();
    if (!validation.isValid) {
      toast({ title: "Error", description: validation.error || "Inténtalo de nuevo.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const attachmentPaths = await uploadAttachments();
      const utmParams = getStoredUtmParams();
      const { error } = await supabase.functions.invoke('send-contact-email', {
        body: {
          ...formData,
          attachmentPaths: attachmentPaths.length > 0 ? attachmentPaths : undefined,
          attachmentNames: attachments.length > 0 ? attachments.map(f => f.name) : undefined,
          utm_source: utmParams.utm_source,
          utm_medium: utmParams.utm_medium,
          utm_campaign: utmParams.utm_campaign,
        }
      });
      if (error) throw error;
      trackFormSubmit('contact_form');
      recordSubmission();
      toast({ title: "¡Mensaje enviado!", description: "Te contactaremos pronto." });
      setFormData({ name: "", email: "", phone: "", subject: "", message: "" });
      setAttachments([]);
    } catch (error: any) {
      toast({ title: "Error al enviar", description: error.message || "Inténtalo de nuevo.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: (i: number = 0) => ({
      opacity: 1, y: 0,
      transition: { delay: i * 0.1, duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const }
    })
  };


  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border/30">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 gradient-primary rounded-xl flex items-center justify-center">
                <Home className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold">
                <span className="text-foreground">Concepto.Casa</span>
                <span className="text-primary font-display italic"> To.Lo.Sa.systems</span>
              </span>
            </div>

            <div className="hidden lg:flex items-center gap-6">
              <button onClick={() => scrollToSection('inicio')} className="text-sm text-muted-foreground hover:text-primary transition-colors">Inicio</button>
              <button onClick={() => scrollToSection('filosofia')} className="text-sm text-muted-foreground hover:text-primary transition-colors">Filosofía</button>
              <button onClick={() => scrollToSection('pilares')} className="text-sm text-muted-foreground hover:text-primary transition-colors">Salud y Hogar</button>
              <Link to="/sistema-constructivo" className="text-sm text-muted-foreground hover:text-primary transition-colors">Sistema Constructivo</Link>
              <button onClick={() => scrollToSection('compromiso')} className="text-sm text-muted-foreground hover:text-primary transition-colors">Tu Proyecto</button>
              <button onClick={() => scrollToSection('proceso')} className="text-sm text-muted-foreground hover:text-primary transition-colors">Proceso</button>
              <button onClick={() => scrollToSection('contacto')} className="text-sm text-muted-foreground hover:text-primary transition-colors">Contacto</button>
            </div>

            <div className="hidden lg:flex items-center gap-4">
              <Link to="/auth">
                <Button variant="outline" className="gap-2 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground">
                  Acceso
                </Button>
              </Link>
            </div>

            <button className="lg:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="lg:hidden py-4 border-t border-border/30">
              <div className="flex flex-col gap-4">
                <button onClick={() => scrollToSection('inicio')} className="text-left text-sm text-muted-foreground hover:text-primary">Inicio</button>
                <button onClick={() => scrollToSection('filosofia')} className="text-left text-sm text-muted-foreground hover:text-primary">Filosofía</button>
                <button onClick={() => scrollToSection('pilares')} className="text-left text-sm text-muted-foreground hover:text-primary">Salud y Hogar</button>
                <Link to="/sistema-constructivo" className="text-left text-sm text-muted-foreground hover:text-primary">Sistema Constructivo</Link>
                <button onClick={() => scrollToSection('compromiso')} className="text-left text-sm text-muted-foreground hover:text-primary">Tu Proyecto</button>
                <button onClick={() => scrollToSection('proceso')} className="text-left text-sm text-muted-foreground hover:text-primary">Proceso</button>
                <button onClick={() => scrollToSection('contacto')} className="text-left text-sm text-muted-foreground hover:text-primary">Contacto</button>
                <Link to="/auth"><Button className="w-full border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground gap-2" variant="outline">Acceso</Button></Link>
              </div>
            </div>
          )}
        </div>
      </nav>

      <FloatingTOC />

      {/* Hero Section */}
      <section id="inicio" className="relative min-h-screen flex items-center overflow-hidden pt-16">
        <div className="absolute inset-0">
          <img src={heroPassivhaus} alt="Casa pasiva rodeada de naturaleza" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-foreground/75 via-foreground/50 to-foreground/20" />
        </div>

        <div className="relative z-10 container mx-auto px-4">
          <div className="max-w-2xl space-y-8">
            <motion.span
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-background/20 backdrop-blur-sm text-background rounded-full text-sm font-medium border border-background/30"
            >
              <Sparkles className="w-4 h-4" />
              Casas Pasivas · Casas Activas · Construcción Biohabitable · Construcción Industrializada
            </motion.span>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.7 }}
              className="text-4xl md:text-6xl lg:text-7xl font-bold text-background leading-[1.1] text-overlay-dark"
            >
              Tu hogar{" "}
              <span className="font-display italic text-accent-foreground">cuida de ti</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="text-lg md:text-xl text-background/90 leading-relaxed text-overlay-dark"
            >
               Diseñamos y construimos viviendas unifamiliares con estándar de Casa Pasiva: 
               ventilación mecánica con recuperación de calor, envolvente térmica continua 
               y demanda energética inferior a 15 kWh/m²·año.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <Button 
                size="lg" 
                className="bg-orange hover:bg-orange/90 text-orange-foreground px-8 gap-2"
                onClick={() => scrollToSection('contacto')}
              >
                Solicita información técnica
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-background/40 text-foreground bg-background/80 hover:bg-background/90 backdrop-blur-sm"
                onClick={() => scrollToSection('filosofia')}
              >
                Descubre nuestra filosofía
              </Button>
            </motion.div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown className="w-8 h-8 text-background/50" />
        </div>
      </section>

      {/* Houses Carousel */}
      <HousesCarousel />

      {/* Philosophy Section */}
      <section id="filosofia" className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={fadeUp}
              className="space-y-6"
            >
              <span className="text-sm text-primary font-semibold uppercase tracking-widest">Nuestra filosofía</span>
              <h2 className="text-3xl md:text-5xl font-bold text-foreground leading-tight">
                No construimos casas.{" "}
                <span className="font-display italic text-primary">Aplicamos ciencia constructiva.</span>
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Cada vivienda que ejecutamos integra un sistema completo de gestión del confort: 
                aislamiento térmico continuo sin puentes térmicos, carpinterías de doble o triple vidrio, 
                y un sistema de ventilación con filtros F7 que renueva el aire interior cada 2 horas 
                manteniendo la temperatura estable.
              </p>
              <p className="text-muted-foreground text-lg leading-relaxed">
                El estándar <strong className="text-foreground">Casa Pasiva</strong> no es una etiqueta comercial: 
                es un protocolo de diseño y construcción verificado con ensayos Blower Door (n50 ≤ 0,6 h⁻¹), 
                termografía infrarroja y monitorización energética real. Más de 15 años de experiencia 
                respaldan cada proyecto.
              </p>
              <div className="flex items-center gap-6 pt-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange">15+</div>
                  <div className="text-sm text-muted-foreground">Años de experiencia</div>
                </div>
                <div className="w-px h-12 bg-border" />
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange">A+++</div>
                  <div className="text-sm text-muted-foreground">Calificación energética</div>
                </div>
                <div className="w-px h-12 bg-border" />
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange">90%</div>
                  <div className="text-sm text-muted-foreground">Menos consumo</div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={fadeUp}
              custom={2}
              className="relative"
            >
              <div className="rounded-2xl overflow-hidden shadow-2xl">
                <img src={healthyInterior} alt="Interior saludable con luz natural y aire puro" className="w-full h-[500px] object-cover" />
              </div>
              <div className="absolute -bottom-6 -left-6 bg-card border border-border rounded-xl p-5 shadow-lg max-w-[260px]">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center">
                    <Wind className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div>
                    <div className="font-semibold text-foreground text-sm">Aire renovado</div>
                    <div className="text-xs text-muted-foreground">cada 2-3 horas</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Sin abrir ventanas. Sin ruido. Sin pérdida de temperatura.</p>
              </div>
            </motion.div>
          </div>

          <div className="text-center mt-12">
            <Button 
              size="lg" 
              className="bg-orange hover:bg-orange/90 text-orange-foreground gap-2"
              onClick={() => scrollToSection('contacto')}
            >
              Contacto
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Pillars Section */}
      <section id="pilares" className="py-24 gradient-warm">
        <div className="container mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="text-center mb-16"
          >
            <span className="text-sm text-primary font-semibold uppercase tracking-widest">Salud y hogar</span>
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mt-3">
              Los 6 pilares de tu{" "}
              <span className="font-display italic text-primary">hogar saludable</span>
            </h2>
            <p className="text-muted-foreground mt-4 max-w-2xl mx-auto text-lg">
              Cada decisión constructiva está pensada para que tu casa no solo sea eficiente, 
              sino que activamente cuide de la salud de quienes la habitan.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pillars.map((pillar, i) => (
              <motion.div
                key={pillar.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={i}
              >
                <Card className="p-6 h-full hover:shadow-lg transition-all duration-300 group border-border/50 hover:border-primary/30">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <pillar.icon className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-semibold text-foreground text-lg">{pillar.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{pillar.description}</p>
                      <div className="pt-2 border-t border-border/50">
                        <span className="text-2xl font-bold text-orange">{pillar.stat}</span>
                        <span className="text-xs text-muted-foreground ml-2">{pillar.statLabel}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Button 
              size="lg" 
              className="bg-orange hover:bg-orange/90 text-orange-foreground gap-2"
              onClick={() => scrollToSection('contacto')}
            >
              Contacto
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* YOUR PROJECT - Two worlds section */}
      <section id="compromiso" className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="text-center mb-16"
          >
            <span className="text-sm text-primary font-semibold uppercase tracking-widest">Tu proyecto, tu participación</span>
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mt-3">
              Más que un cliente,{" "}
              <span className="font-display italic text-primary">eres protagonista</span>
            </h2>
            <p className="text-muted-foreground mt-4 max-w-2xl mx-auto text-lg">
               Tu casa se construye contigo. No solo pones la idea y la inversión: 
               participas activamente en cada decisión de diseño, materiales y acabados.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Public side */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={0}
            >
              <Card className="p-8 h-full border-primary/20 hover:shadow-lg transition-all">
                <div className="space-y-5">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Eye className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">Conocimiento abierto</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Compartimos todo lo que sabemos: materiales, técnicas, estándares, costes reales. 
                    Queremos que entiendas por qué cada decisión importa. La transparencia es nuestra 
                    forma de generar confianza.
                  </p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Idea y visión de futuro</li>
                    <li className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Experiencia demostrada</li>
                    <li className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Conocimiento sin reservas</li>
                  </ul>
                </div>
              </Card>
            </motion.div>

            {/* Private side */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={1}
            >
              <Card className="p-8 h-full border-accent/20 hover:shadow-lg transition-all">
                <div className="space-y-5">
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">Tu espacio privado</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Cada proyecto es único y confidencial. En tu área personal tendrás acceso 
                    exclusivo a presupuestos detallados, evolución de obra, documentación y 
                    herramientas de diseño participativo.
                  </p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2"><Lock className="w-4 h-4 text-accent" /> Presupuesto personalizado</li>
                    <li className="flex items-center gap-2"><Lock className="w-4 h-4 text-accent" /> Seguimiento en tiempo real</li>
                    <li className="flex items-center gap-2"><Lock className="w-4 h-4 text-accent" /> Participa en cada decisión</li>
                  </ul>
                </div>
              </Card>
            </motion.div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
            <Button 
              size="lg" 
              className="bg-orange hover:bg-orange/90 text-orange-foreground gap-2"
              onClick={() => scrollToSection('contacto')}
            >
              Contacto
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="border-orange/30 text-orange hover:bg-orange/10 gap-2"
              onClick={() => {
                toast({
                  title: "Estamos desarrollando tu acceso",
                  description: "Pronto tendrás acceso a To.Lo.Sa.systems. Te redirigimos a Contacto.",
                });
                setTimeout(() => scrollToSection('contacto'), 1500);
              }}
            >
              <Lock className="w-4 h-4" />
              Acceso a To.Lo.Sa.systems
            </Button>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section id="proceso" className="py-24 gradient-warm">
        <div className="container mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="text-center mb-16"
          >
            <span className="text-sm text-primary font-semibold uppercase tracking-widest">Nuestro proceso</span>
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mt-3">
               Del análisis inicial al{" "}
              <span className="font-display italic text-primary">certificado final</span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: "01", title: "Análisis", desc: "Estudio del terreno, orientación solar, normativa urbanística y programa de necesidades del cliente." },
              { step: "02", title: "Diseño PHPP", desc: "Modelado energético con PHPP (Paquete de Planificación de Casa Pasiva). Simulación de demanda, ganancias solares y ventilación." },
              { step: "03", title: "Ejecución", desc: "Construcción con control de estanqueidad, continuidad de aislamiento y supervisión técnica en cada fase." },
              { step: "04", title: "Certificación", desc: "Ensayo Blower Door, termografía y trámite de certificación de Casa Pasiva ante el PHI (Instituto de Casa Pasiva)." }
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={i}
                className="text-center space-y-4"
              >
                <div className="text-5xl font-bold text-orange/30 font-display">{item.step}</div>
                <h3 className="text-xl font-semibold text-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-16 gradient-primary">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="space-y-6"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground">
              ¿Listo para un proyecto con garantías técnicas reales?
            </h2>
            <p className="text-primary-foreground/80 max-w-xl mx-auto text-lg">
              Analizamos tu caso sin compromiso. Estudio de viabilidad, estimación energética y presupuesto orientativo.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                variant="secondary"
                className="gap-2"
                onClick={() => scrollToSection('contacto')}
              >
                <Mail className="w-4 h-4" />
                Escríbenos
              </Button>
              <Button
                size="lg"
                className="bg-orange hover:bg-orange/90 text-orange-foreground gap-2"
                onClick={() => {
                  trackButtonClick('housing_profile_cta');
                  setShowHousingForm(true);
                }}
              >
                <Home className="w-4 h-4" />
                Perfil de la vivienda
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contacto" className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-16">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="space-y-6"
            >
              <span className="text-sm text-primary font-semibold uppercase tracking-widest">Contacto</span>
               <h2 className="text-3xl md:text-4xl font-bold text-foreground">
                Hablemos de tu{" "}
                <span className="font-display italic text-primary">idea</span>
              </h2>
              <p className="text-muted-foreground text-lg">
                Cada casa que construimos empieza con una conversación. Cuéntanos tu idea y visión 
                y te ayudaremos a convertirlo en un hogar saludable, eficiente y hecho solo para ti.
              </p>

              <div className="space-y-4 pt-4">
                <a href="mailto:organiza@concepto.casa" className="flex items-center gap-3 text-foreground hover:text-primary transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Email</div>
                    <div className="font-medium">organiza@concepto.casa</div>
                  </div>
                </a>
                <a href="tel:+34690123533" className="flex items-center gap-3 text-foreground hover:text-primary transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Phone className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Teléfono</div>
                    <div className="font-medium">+34 690 123 533</div>
                  </div>
                </a>
              </div>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={2}
            >
              <Card className="p-8 border-border/50">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div style={{ display: 'none' }}><input {...honeypotProps} /></div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">Nombre</label>
                      <Input name="name" value={formData.name} onChange={handleInputChange} placeholder="Tu nombre" required onFocus={() => trackFormStart('contact_form')} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
                      <Input name="email" type="email" value={formData.email} onChange={handleInputChange} placeholder="tu@email.com" required />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">Teléfono</label>
                      <Input name="phone" value={formData.phone} onChange={handleInputChange} placeholder="+34 600 000 000" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">Asunto</label>
                      <Input name="subject" value={formData.subject} onChange={handleInputChange} placeholder="¿Sobre qué quieres hablar?" />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Mensaje</label>
                    <Textarea name="message" value={formData.message} onChange={handleInputChange} placeholder="Describe tu proyecto: ubicación, superficie, necesidades específicas..." rows={4} required />
                  </div>

                  <div>
                    <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" accept="image/*,.pdf,.doc,.docx" />
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-2">
                      <Paperclip className="w-4 h-4" /> Adjuntar archivos
                    </Button>
                    {attachments.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {attachments.map((file, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <File className="w-3 h-3" />
                            <span>{file.name} ({formatFileSize(file.size)})</span>
                            <button type="button" onClick={() => removeAttachment(i)} className="text-destructive hover:text-destructive/80">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button type="submit" disabled={isSubmitting || isBlocked} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
                    {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <>Enviar mensaje <ArrowRight className="w-4 h-4" /></>}
                  </Button>
                </form>

                <div className="mt-6 pt-6 border-t border-border/50 text-center">
                  <p className="text-sm text-muted-foreground mb-3">¿Ya sabes lo que necesitas? Cuéntanos los detalles de tu vivienda ideal.</p>
                  <Button 
                    className="bg-orange hover:bg-orange/90 text-orange-foreground gap-2 w-full"
                    onClick={() => {
                      trackButtonClick('housing_profile_contact');
                      setShowHousingForm(true);
                    }}
                  >
                    <Home className="w-4 h-4" />
                    Perfil de la vivienda
                  </Button>
                </div>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border/30 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center">
                <Home className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground">
                Concepto.Casa <span className="text-primary">To.Lo.Sa.systems</span>
              </span>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              © {new Date().getFullYear()} Concepto.Casa To.Lo.Sa.systems — Viviendas que cuidan de ti.
            </p>
            <Link to="/auth" className="text-sm text-primary hover:text-primary/80 transition-colors cursor-pointer">
              Acceso →
            </Link>
          </div>
        </div>
      </footer>

      <HousingProfileForm open={showHousingForm} onOpenChange={setShowHousingForm} />
    </div>
  );
};

export default Landing;