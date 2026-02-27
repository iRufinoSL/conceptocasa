import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Home,
  Mail,
  Menu,
  X,
  Lock,
  Search,
  ClipboardList,
  Users,
  BookOpen,
  Link2,
  FileSearch,
  Map,
  Landmark,
  PenTool,
  Wrench,
  TreePine,
  Paintbrush,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

const PASSWORD = "soluciones2025";

/* ────────────────────── DATA ────────────────────── */

const serviceCategories = [
  {
    title: "Surveys, preliminary studies, expertise and evaluations",
    icon: FileSearch,
    color: "bg-blue-500/10 text-blue-600",
    subcategories: [
      {
        heading: "Geodetic studies, measurements and land management",
        items: [
          "Preparation of geodetic base plans",
          "Cadastral works / land management operations",
          "Construction geodetic surveys",
          "As-built measurements of buildings",
          "As-built measurements of utility networks",
          "As-built measurements of roads and structures",
          "Laser scanning / 3D models / BIM and CAD",
          "Laser scanning / Point cloud",
          "Marking works for buildings, roads and structures",
          "Drone measurements",
          "Aerial surveying",
          "Hydrographic surveys",
          "Post-construction control measurements",
        ],
      },
      {
        heading: "Environmental expertise and preliminary studies",
        items: [
          "Environmental consultation",
          "Environmental study",
          "Environmental expert assessment",
          "Environmental analyses",
          "Radon survey",
          "Noise assessment and modelling",
          "Air pollution assessment and modelling",
          "Mobility study / mobility analysis",
          "Preparation of traffic safety audits",
          "Application for environmental permits",
          "Environmental monitoring",
          "Preparation of environmental audits",
          "Preliminary environmental impact assessment",
          "Environmental impact assessment / EIA",
          "Strategic environmental impact assessment / SEA",
          "Natura assessment",
          "Preparation of risk assessments",
          "Development of environmental plans",
          "Solving environmental issues in planning",
          "Landscape analysis",
          "Landscape architectural expert assessment",
        ],
      },
      {
        heading: "Construction-related expertise and preliminary studies",
        items: [
          "Construction consultation",
          "Construction expertise",
          "Architectural expertise",
          "Construction technical expertise",
          "Expertise of construction structures",
          "Expertise of technical systems",
          "Expertise of construction projects",
          "Audit of construction works",
          "Energy audit of construction works",
          "Determination of energy performance certificate",
          "Underpressure test",
          "Thermography",
          "Pre-purchase and pre-sale real estate inspection",
          "Technical supervision by the customer",
          "Construction supervision",
        ],
      },
      {
        heading: "Heritage conservation / restoration / reconstruction",
        items: [
          "Heritage conservation consultation",
          "Heritage conservation expert assessment",
          "Compilation of heritage conservation special conditions",
          "Heritage conservation supervision",
          "Restoration consultation",
          "Restoration expert assessment",
          "Reconstruction consultation",
          "Reconstruction expert assessment",
        ],
      },
      {
        heading: "Legal assistance",
        items: [
          "Consultation",
          "Property law",
          "Environmental law",
          "Planning law",
          "Construction law",
          "Real estate law",
          "Apartment association law",
        ],
      },
    ],
  },
  {
    title: "Preparation of spatial plans",
    icon: Map,
    color: "bg-emerald-500/10 text-emerald-600",
    subcategories: [
      {
        heading: "Detailed spatial plans",
        items: [
          "Consultation",
          "Preparation of detailed spatial plans",
          "Analysis of planning area",
          "Analysis of spatial environment",
          "Organisation of preliminary studies",
          "Project management of planning",
          "Main contracting for design",
          "2D drawings / diagrams",
          "Visualisation / 3D models",
          "Vertical planning",
          "Dendrological inventory",
          "Calculation of replacement planting",
        ],
      },
      {
        heading: "Comprehensive and designated spatial plans",
        items: [
          "Consultation",
          "Preparation of comprehensive spatial plans",
          "Preparation of thematic spatial plans",
          "Preparation of designated spatial plans",
        ],
      },
    ],
  },
  {
    title: "Architectural and construction design",
    icon: Landmark,
    color: "bg-purple-500/10 text-purple-600",
    subcategories: [
      {
        heading: "Architectural design",
        items: [
          "Consultation",
          "Organisation of preliminary studies",
          "Architectural design",
          "Architectural and construction design",
          "Architectural sketch",
          "Architectural preliminary design",
          "Architectural detailed design",
          "Architectural operational building project",
          "Restoration project",
          "Reconstruction project",
          "Renovation project",
          "2D drawings / diagrams",
          "Visualisation / 3D models",
          "BIM design",
          "Digitalisation of construction drawings",
          "Project management of design",
          "Main contracting for design",
        ],
      },
      {
        heading: "Construction Design / Engineering",
        items: [
          "Consultation",
          "Organisation of preliminary studies",
          "Design / engineering of construction structures",
          "2D drawings / diagrams",
          "Visualisation / 3D models",
          "BIM design",
          "Digitalisation of construction drawings",
          "Project management of design",
          "Main contracting for design",
        ],
      },
      {
        heading: "Application for permits and conditions",
        items: [
          "Application for design conditions",
          "Application for a building permit",
          "Application for a construction notice",
          "Submission of a construction notice",
          "Application for an occupancy permit",
          "Legalization of buildings",
        ],
      },
    ],
  },
  {
    title: "Engineering, specialised design planning",
    icon: Wrench,
    color: "bg-orange-500/10 text-orange-600",
    subcategories: [
      {
        heading: "Design of internal special parts of buildings",
        items: [
          "Consultation",
          "Water supply and sewerage",
          "Ventilation systems",
          "Heating systems",
          "Cooling systems",
          "Electrical systems",
          "Automation",
          "Gas supply",
          "Project management of design",
          "Main contracting for design",
        ],
      },
      {
        heading: "Design of external utility networks",
        items: [
          "Consultation",
          "Water supply and sewerage",
          "Public water supply and sewerage",
          "Heat supply",
          "Stormwater and drainage",
          "Electrical supply",
          "Telecommunications supply",
          "Gas supply",
          "Project management of design",
          "Main contracting for design",
        ],
      },
      {
        heading: "Design works in other fields",
        items: [
          "Roads, streets and squares",
          "Traffic and parking management",
          "Street lighting",
          "Ponds, ditches and canals",
          "External fire water supply",
          "Renewable energy solutions / solar power stations",
          "Renewable energy solutions / wind power stations",
        ],
      },
    ],
  },
  {
    title: "Garden design and landscape architecture",
    icon: TreePine,
    color: "bg-green-500/10 text-green-600",
    subcategories: [
      {
        heading: "Garden design",
        items: [
          "Consultation",
          "Analysis of land area",
          "Landscaping assessment",
          "Garden design sketch",
          "Garden design project",
          "2D drawings / diagrams",
          "Visualisation / 3D model",
          "Digitalisation of maps / drawings",
        ],
      },
      {
        heading: "Landscape architecture",
        items: [
          "Consultation",
          "Analysis of spatial environment",
          "Landscape analysis",
          "Landscape architectural expert assessment",
          "Landscaping assessment",
          "Dendrological inventory",
          "Calculation of replacement planting",
          "Landscape architectural sketch",
          "Landscape architectural design project",
          "Urban space design",
          "Landscaping part of construction projects",
          "Landscape architectural part of construction projects",
          "Design of streets / roads",
          "Vertical planning",
          "2D drawings / diagrams",
          "Visualisation / 3D model",
          "Digitalisation of maps / drawings",
          "Project management of design",
          "Organisation of preliminary studies",
        ],
      },
    ],
  },
  {
    title: "Interior architecture, space design and design",
    icon: Paintbrush,
    color: "bg-pink-500/10 text-pink-600",
    subcategories: [
      {
        heading: "General interior design services",
        items: [
          "Consultation",
          "Complete interior design solution",
          "Interior design project",
          "Interior design project for apartments",
          "Interior design project for houses",
          "Interior design project for commercial spaces",
          "Room-specific design project",
          "Project management",
          "Author supervision",
          "2D drawings / illustrations",
          "3D visualisation",
        ],
      },
      {
        heading: "Additional interior design services",
        items: [
          "Space planning modification",
          "Interior design solution modification",
          "Pre-construction basic plan compilation",
          "Creation of general concept",
          "Creation of color solution",
          "Interior finishing plan compilation",
          "Selection of interior finishing materials",
          "Preparation of furniture plans",
          "Furniture selection",
          "Selection of decor elements",
          "Furnishing of rooms",
          "Lighting solution with fixtures",
          "Scheme for lights, wall sockets and switch lines",
          "Selection of finishing materials for sanitary rooms",
          "Selection of sanitary ware",
          "Tiling drawings",
          "Planning of special constructions",
          "Design of custom-made furniture",
        ],
      },
      {
        heading: "Kitchen design",
        items: [
          "Consultation",
          "Planning and designing of kitchens",
          "Design of custom kitchen furniture",
        ],
      },
      {
        heading: "Designing of model and rental apartments",
        items: [
          "Consultation",
          "Interior design and furnishing of model apartments",
          "Interior design and furnishing of rental apartments",
          "Pre-sale design of properties",
        ],
      },
    ],
  },
];

const professionalTypes = [
  { label: "Experts", icon: FileSearch },
  { label: "Planners", icon: Map },
  { label: "Architects", icon: Landmark },
  { label: "Engineers", icon: Wrench },
  { label: "Landscape architects", icon: TreePine },
  { label: "Interior architects", icon: Paintbrush },
];

const opportunities = [
  { title: "Post a request for free", description: "Describe your project and receive offers from professionals", icon: ClipboardList },
  { title: "Browse profiles and communicate directly", description: "Find the right specialist for your needs", icon: Users },
  { title: "Construction guide", description: "Step-by-step guide for your construction project", icon: BookOpen },
  { title: "Regulatory references", description: "Legislation, standards and useful links", icon: Link2 },
];

const trustMarks = [
  "Professional certificate",
  "Activity licence",
  "Certificate",
  "Certificate of competency",
  "Member of a professional association",
];

const howItWorks = [
  { step: 1, title: "Post a request for free", description: "Describe your project and its goals" },
  { step: 2, title: "View interested companies", description: "Browse profiles and look for trust marks" },
  { step: 3, title: "Request quotes from 3 companies", description: "Specify project details; meet in person if needed" },
  { step: 4, title: "Choose a contractor", description: "Make your final choice and confirm the order" },
  { step: 5, title: "Leave feedback", description: "Rate the company in their profile" },
];

/* ────────────────────── COMPONENT ────────────────────── */

const Soluciones = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === PASSWORD) {
      setIsAuthenticated(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  const toggleCategory = (index: number) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileMenuOpen(false);
  };

  /* ── Password gate ── */
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Soluciones</h1>
            <p className="text-sm text-muted-foreground">
              Esta sección está en desarrollo. Introduce la contraseña para acceder.
            </p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError(false);
              }}
              className={passwordError ? "border-destructive" : ""}
            />
            {passwordError && (
              <p className="text-sm text-destructive">Contraseña incorrecta</p>
            )}
            <Button type="submit" className="w-full">
              Acceder
            </Button>
          </form>
          <div className="text-center">
            <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              ← Volver a Concepto.Casa
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  /* ── Main content ── */
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border/50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Home className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">
                <span className="text-foreground">Concepto</span>
                <span className="text-primary">.</span>
                <span className="text-primary">Casa</span>
              </span>
            </Link>

            <div className="hidden lg:flex items-center gap-6">
              <button onClick={() => scrollToSection("sol-hero")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Home</button>
              <button onClick={() => scrollToSection("sol-services")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">All Services</button>
              <button onClick={() => scrollToSection("sol-categories")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Categories</button>
              <button onClick={() => scrollToSection("sol-how")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">How does it work?</button>
            </div>

            <div className="hidden lg:flex items-center gap-3">
              <Link to="/">
                <Button variant="outline" size="sm">← Concepto.Casa</Button>
              </Link>
            </div>

            <button className="lg:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="lg:hidden py-4 border-t border-border space-y-3">
              <button onClick={() => scrollToSection("sol-hero")} className="block text-sm text-muted-foreground">Home</button>
              <button onClick={() => scrollToSection("sol-services")} className="block text-sm text-muted-foreground">All Services</button>
              <button onClick={() => scrollToSection("sol-categories")} className="block text-sm text-muted-foreground">Categories</button>
              <button onClick={() => scrollToSection("sol-how")} className="block text-sm text-muted-foreground">How does it work?</button>
              <Link to="/"><Button variant="outline" size="sm" className="w-full">← Concepto.Casa</Button></Link>
            </div>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section id="sol-hero" className="pt-24 pb-20 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto px-4 text-center space-y-8">
          <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-tight">
            Your partner for planning, design and architecture projects
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            We connect you with qualified professionals, using the platform is <strong>free</strong>!
          </p>

          {/* Professional types */}
          <div className="flex flex-wrap justify-center gap-6 mt-12">
            {professionalTypes.map((p) => (
              <div key={p.label} className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-full bg-card border border-border shadow-sm flex items-center justify-center hover:shadow-md transition-shadow">
                  <p.icon className="w-7 h-7 text-primary" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Opportunities */}
      <section id="sol-services" className="py-16 bg-secondary/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-foreground text-center mb-12">
            BeforeBuilding offers the following opportunities
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {opportunities.map((o) => (
              <Card key={o.title} className="p-6 text-center hover:shadow-lg transition-shadow group cursor-pointer">
                <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                  <o.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{o.title}</h3>
                <p className="text-sm text-muted-foreground">{o.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Service categories */}
      <section id="sol-categories" className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground">Choose a service and find the right specialist</h2>
            <p className="text-muted-foreground mt-2">Browse all service categories and subcategories</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {serviceCategories.map((cat, idx) => (
              <Card
                key={cat.title}
                className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => toggleCategory(idx)}
              >
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${cat.color}`}>
                      <cat.icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground text-sm leading-tight">{cat.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {cat.subcategories.length} subcategories · {cat.subcategories.reduce((a, s) => a + s.items.length, 0)} services
                      </p>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform ${expandedCategories.has(idx) ? "rotate-180" : ""}`} />
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Expanded category details */}
          {serviceCategories.map((cat, idx) =>
            expandedCategories.has(idx) ? (
              <Card key={`detail-${idx}`} className="mb-6 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cat.color}`}>
                    <cat.icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">{cat.title}</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {cat.subcategories.map((sub) => (
                    <div key={sub.heading}>
                      <h4 className="font-semibold text-foreground text-sm mb-3 border-b border-border pb-2">{sub.heading}</h4>
                      <ul className="space-y-1.5">
                        {sub.items.map((item) => (
                          <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                            <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary/60" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null
          )}
        </div>
      </section>

      {/* Trust marks */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-foreground text-center mb-4">
              Choose a qualified and reliable service provider
            </h2>
            <p className="text-muted-foreground text-center mb-8">
              When viewing a company profile, look for trust marks:
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              {trustMarks.map((mark) => (
                <div key={mark} className="flex items-center gap-2 bg-card border border-border rounded-full px-4 py-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">{mark}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="sol-how" className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-foreground text-center mb-12">How does it work?</h2>
          <div className="max-w-3xl mx-auto space-y-0">
            {howItWorks.map((step, idx) => (
              <div key={step.step} className="flex gap-4 items-start">
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
                    {step.step}
                  </div>
                  {idx < howItWorks.length - 1 && <div className="w-0.5 h-12 bg-border" />}
                </div>
                <div className="pb-8">
                  <h3 className="font-semibold text-foreground">{step.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            Contenido basado en{" "}
            <a href="https://www.beforebuilding.ee/en" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
              BeforeBuilding.ee <ExternalLink className="w-3 h-3" />
            </a>
            {" "}— Adaptado para Concepto.Casa
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Soluciones;
