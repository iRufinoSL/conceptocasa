import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, LogIn, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

import homeModern from '@/assets/home-modern.jpg';
import homeClassic from '@/assets/home-classic.jpg';
import homeRustic from '@/assets/home-rustic.jpg';
import homeWood from '@/assets/home-wood.jpg';
import homeEco from '@/assets/home-eco.jpg';

const slides = [
  { image: homeModern, alt: 'Casa moderna minimalista' },
  { image: homeClassic, alt: 'Casa clásica mediterránea' },
  { image: homeRustic, alt: 'Casa rústica de piedra' },
  { image: homeWood, alt: 'Casa de madera sostenible' },
  { image: homeEco, alt: 'Casa ecológica' },
];

export default function Landing() {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const goToSlide = (index: number) => setCurrentSlide(index);
  const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % slides.length);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">
                <span className="text-primary">Terra</span>
                <span className="text-muted-foreground">.</span>
                <span className="text-foreground">Idea</span>
                <span className="text-muted-foreground">.</span>
                <span className="text-accent-foreground">Concepto</span>
              </h1>
              <div className="hidden md:flex items-center gap-4 text-sm text-muted-foreground">
                <a href="mailto:organiza@concepto.casa" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                  <Mail className="h-4 w-4" />
                  organiza@concepto.casa
                </a>
                <a href="tel:+34690123533" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                  <Phone className="h-4 w-4" />
                  +34 690 123 533
                </a>
              </div>
            </div>
            <Button asChild variant="default" size="sm">
              <Link to="/auth" className="flex items-center gap-2">
                <LogIn className="h-4 w-4" />
                Acceder
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Carousel */}
      <section className="relative h-screen w-full overflow-hidden">
        {/* Slides */}
        {slides.map((slide, index) => (
          <div
            key={index}
            className={`absolute inset-0 transition-opacity duration-1000 ${
              index === currentSlide ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <img
              src={slide.image}
              alt={slide.alt}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/40 to-background/80" />
          </div>
        ))}

        {/* Content Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <div className="max-w-4xl mx-auto space-y-8">
            <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold text-foreground leading-tight animate-fade-in">
              Construimos tu Futuro
              <span className="block text-primary">Ahora</span>
            </h2>
            
            <p className="text-lg md:text-xl lg:text-2xl text-foreground/90 font-medium max-w-3xl mx-auto leading-relaxed animate-fade-in" style={{ animationDelay: '0.2s' }}>
              Diseño y construcción industrializada basada en tres pilares
            </p>
            
            <div className="flex flex-wrap justify-center gap-4 md:gap-8 animate-fade-in" style={{ animationDelay: '0.4s' }}>
              <div className="px-6 py-3 bg-primary/20 backdrop-blur-sm rounded-lg border border-primary/30">
                <span className="text-lg md:text-xl font-semibold text-primary">Eficiencia</span>
              </div>
              <div className="px-6 py-3 bg-success/20 backdrop-blur-sm rounded-lg border border-success/30">
                <span className="text-lg md:text-xl font-semibold text-success">Economía</span>
              </div>
              <div className="px-6 py-3 bg-accent/20 backdrop-blur-sm rounded-lg border border-accent/30">
                <span className="text-lg md:text-xl font-semibold text-accent-foreground">Ecología/Salud</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Arrows */}
        <button
          onClick={prevSlide}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/50 backdrop-blur-sm border border-border/50 text-foreground hover:bg-background/80 transition-colors"
          aria-label="Imagen anterior"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button
          onClick={nextSlide}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/50 backdrop-blur-sm border border-border/50 text-foreground hover:bg-background/80 transition-colors"
          aria-label="Imagen siguiente"
        >
          <ChevronRight className="h-6 w-6" />
        </button>

        {/* Dots Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`w-3 h-3 rounded-full transition-all ${
                index === currentSlide
                  ? 'bg-primary w-8'
                  : 'bg-foreground/30 hover:bg-foreground/50'
              }`}
              aria-label={`Ir a imagen ${index + 1}`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
