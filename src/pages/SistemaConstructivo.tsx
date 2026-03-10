import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Layers, Shield, Zap, Clock, Leaf, Hammer, ThermometerSun, Weight } from "lucide-react";

import sistemaMasSeccion from "@/assets/sistema-mas-seccion.jpg";
import casaSip from "@/assets/casa-sip.jpg";
import casaLsf from "@/assets/casa-lsf.jpg";
import casaAsgard from "@/assets/casa-asgard.jpg";
import casaSystem3e from "@/assets/casa-system3e.jpg";
import casaHormigonCelular from "@/assets/casa-hormigon-celular.jpg";
import detalleSip from "@/assets/detalle-sip.jpg";
import detalleLsf from "@/assets/detalle-lsf.jpg";
import detalleHormigonCelular from "@/assets/detalle-hormigon-celular.jpg";
import bloqueSystem3e from "@/assets/bloque-system3e.jpg";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

interface ConstructionSystem {
  id: string;
  name: string;
  fullName: string;
  description: string;
  features: string[];
  houseImage: string;
  detailImages: string[];
  highlight: string;
}

const systems: ConstructionSystem[] = [
  {
    id: "sip",
    name: "SIP",
    fullName: "Structural Insulated Panel",
    description: "Paneles estructurales aislantes compuestos por un núcleo de espuma rígida (EPS o PUR) entre dos tableros OSB. Sistema de alto rendimiento térmico con montaje rápido y mínimos puentes térmicos.",
    features: [
      "Aislamiento continuo sin puentes térmicos",
      "Montaje rápido: estructura en 3-5 días",
      "Alta resistencia estructural",
      "Valores U desde 0.10 W/m²K",
      "Excelente estanqueidad al aire",
      "Reducción de residuos en obra (prefabricado)"
    ],
    houseImage: casaSip,
    detailImages: [detalleSip],
    highlight: "U ≤ 0.10 W/m²K"
  },
  {
    id: "lsf",
    name: "LSF",
    fullName: "Light Steel Frame",
    description: "Estructura de perfiles de acero galvanizado conformados en frío de espesor reducido (0.8-2.5 mm). Sistema ligero, reciclable y de gran precisión dimensional que permite altos niveles de aislamiento.",
    features: [
      "Perfiles galvanizados 100% reciclables",
      "Peso un 60% menor que construcción tradicional",
      "Gran precisión dimensional (fabricación CNC)",
      "Resistente a termitas e insectos",
      "No se deforma ni contrae con humedad",
      "Compatible con cualquier acabado exterior"
    ],
    houseImage: casaLsf,
    detailImages: [detalleLsf],
    highlight: "60% más ligero"
  },
  {
    id: "asgard",
    name: "Sistema Asgard",
    fullName: "Panel de acero con aislamiento de alta densidad",
    description: "Sistema basado en paneles de estructura de acero galvanizado con aislamiento integrado de alta densidad. Paneles completamente herméticos, de grandes dimensiones (hasta 10 m²), ligeros (10-30 kg/m²) y con alta capacidad de carga estructural. Fabricación industrializada con procesos sofisticados que integran canalizaciones eléctricas, fontanería y comunicaciones.",
    features: [
      "Estructura de acero galvanizado reciclable",
      "Panel hermético con aislamiento integrado",
      "Ligero: 10-30 kg/m² con alta capacidad de carga",
      "Grandes dimensiones: hasta 10 m² por panel",
      "Integra canalizaciones eléctricas y fontanería",
      "Protección contra radiación electromagnética (jaula de Faraday)",
      "Construcción rápida, limpia y sin residuos",
      "Flexible: se adapta a cualquier estilo, hasta 5 plantas"
    ],
    houseImage: casaAsgard,
    detailImages: [],
    highlight: "Panel acero hermético"
  },
  {
    id: "system3e",
    name: "System3E",
    fullName: "Muros monocapa de perlita",
    description: "Tecnología innovadora basada en elementos de perlita natural expandida que encajan sin adhesivos. Paredes monocapa que combinan estructura, aislamiento y acabado en una sola capa, las más delgadas y eficientes de Europa.",
    features: [
      "Pared monocapa: estructura + aislamiento + acabado",
      "Sin adhesivos ni morteros de unión",
      "λ = 0.060 W/mK (perlita natural)",
      "100% mineral, incombustible (Euroclase A1)",
      "Montaje sin herramientas especiales",
      "Muro de 38 cm = U de 0.15 W/m²K"
    ],
    houseImage: casaSystem3e,
    detailImages: [bloqueSystem3e],
    highlight: "Monocapa 38 cm"
  },
  {
    id: "hormigon-celular",
    name: "Hormigón Celular",
    fullName: "Hormigón Celular Curado en Autoclave (HCCA)",
    description: "Bloques de hormigón aligerado mediante millones de microburbujas de aire, curados en autoclave a alta presión. Material mineral, ligero, aislante y de fácil manipulación con herramientas manuales.",
    features: [
      "Densidad 300-600 kg/m³ (5× más ligero que hormigón)",
      "λ = 0.09-0.12 W/mK según densidad",
      "Incombustible (Euroclase A1)",
      "Cortable con sierra manual",
      "Excelente regulación de humedad",
      "Resistencia a compresión 2-6 N/mm²"
    ],
    houseImage: casaHormigonCelular,
    detailImages: [detalleHormigonCelular],
    highlight: "5× más ligero"
  }
];

const SistemaConstructivo = () => {
  return (
    <div className="min-h-screen bg-background font-body">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <ArrowLeft className="w-5 h-5 text-primary" />
            <span className="text-lg font-bold">
              <span className="text-foreground">Concepto.Casa</span>
              <span className="text-primary font-display italic"> To.Lo.Sa.systems</span>
            </span>
          </Link>
          <Link to="/#contacto">
            <Button className="bg-orange text-white hover:bg-orange/90">Contactar</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative py-20 lg:py-28 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-orange/5" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <motion.div initial="hidden" animate="visible" variants={fadeUp} className="text-center max-w-4xl mx-auto">
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight mb-6">
              Sistema Constructivo
            </h1>
            <p className="text-2xl sm:text-3xl text-primary font-display italic mb-4">
              Diseño, Ingeniería, Salud y Arquitectura
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              No hay un único sistema constructivo ideal. Cada proyecto, cada clima y cada familia requiere la solución técnica que mejor se adapte a sus necesidades. Nosotros los conocemos todos y elegimos el óptimo para ti.
            </p>
          </motion.div>
        </div>
      </section>

      {/* MA'S System - Featured */}
      <section className="py-16 bg-primary/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 bg-orange/10 text-orange px-4 py-2 rounded-full text-sm font-semibold mb-4">
                <Hammer className="w-4 h-4" />
                Sistema propio
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
                Sistema MA'S
              </h2>
              <p className="text-xl text-primary font-display italic">
                Mortero Armado Aligerado y Aislamiento
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <div className="space-y-6">
                <p className="text-muted-foreground text-lg leading-relaxed">
                  Nuestro sistema propietario combina las ventajas del mortero armado con agregados ultraligeros termoaislantes, logrando cerramientos de alto rendimiento térmico con la robustez de la construcción tradicional.
                </p>
                <Card className="p-6 bg-background border-orange/20">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-orange/10 flex items-center justify-center shrink-0">
                      <Layers className="w-6 h-6 text-orange" />
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-bold text-foreground mb-2">
                        Politerm Blu por Edilteco
                      </h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        Agregado superligero de perlas de EPS virgen de celda cerrada (Ø 3-6 mm) preaditivado para morteros ligeros termoaislantes. Conductividad térmica ultrabaja, excelente trabajabilidad y compatible con bomba de hormigón. Una tecnología probada por Edilteco con presencia internacional.
                      </p>
                    </div>
                  </div>
                </Card>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { icon: ThermometerSun, label: "Aislamiento térmico continuo" },
                    { icon: Weight, label: "Hasta 70% más ligero" },
                    { icon: Shield, label: "Resistencia mecánica" },
                    { icon: Leaf, label: "Baja huella ambiental" }
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border/30">
                      <item.icon className="w-5 h-5 text-orange shrink-0" />
                      <span className="text-sm text-foreground">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative">
                <img
                  src={sistemaMasPoliterm}
                  alt="Detalle del sistema MA'S con Politerm Blu"
                  className="rounded-2xl shadow-xl w-full object-cover"
                  loading="lazy"
                />
                <div className="absolute bottom-4 left-4 bg-background/90 backdrop-blur-sm rounded-xl px-4 py-2 border border-orange/20">
                  <span className="text-sm font-semibold text-orange">Sección técnica MA'S</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Other Systems */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center mb-16">
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Sistemas constructivos experimentados
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Conocemos y hemos trabajado con los principales sistemas constructivos del mercado. Cada uno tiene sus fortalezas.
            </p>
          </motion.div>

          <div className="space-y-24">
            {systems.map((system, index) => (
              <motion.div
                key={system.id}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                variants={fadeUp}
              >
                <div className={`grid lg:grid-cols-2 gap-10 items-start ${index % 2 === 1 ? 'lg:grid-flow-dense' : ''}`}>
                  {/* Text Content */}
                  <div className={`space-y-6 ${index % 2 === 1 ? 'lg:col-start-2' : ''}`}>
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-5xl font-display font-bold text-orange/30">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <h3 className="font-display text-2xl font-bold text-foreground">{system.name}</h3>
                          <p className="text-sm text-muted-foreground italic">{system.fullName}</p>
                        </div>
                      </div>
                      <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-semibold mt-2">
                        <Zap className="w-3 h-3" />
                        {system.highlight}
                      </div>
                    </div>

                    <p className="text-muted-foreground leading-relaxed">{system.description}</p>

                    <ul className="space-y-2">
                      {system.features.map((feature, fi) => (
                        <li key={fi} className="flex items-start gap-2 text-sm">
                          <ArrowRight className="w-4 h-4 text-orange mt-0.5 shrink-0" />
                          <span className="text-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Images */}
                  <div className={`space-y-4 ${index % 2 === 1 ? 'lg:col-start-1 lg:row-start-1' : ''}`}>
                    <img
                      src={system.houseImage}
                      alt={`Casa construida con sistema ${system.name}`}
                      className="rounded-2xl shadow-lg w-full h-64 sm:h-80 object-cover"
                      loading="lazy"
                    />
                    {system.detailImages.length > 0 && (
                      <div className="grid grid-cols-2 gap-4">
                        {system.detailImages.map((img, di) => (
                          <img
                            key={di}
                            src={img}
                            alt={`Detalle constructivo ${system.name}`}
                            className="rounded-xl shadow-md w-full h-40 object-cover"
                            loading="lazy"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-primary/5">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-4">
            ¿Cuál es el sistema ideal para tu proyecto?
          </h2>
          <p className="text-muted-foreground mb-8">
            Analizamos tu parcela, tu clima y tus necesidades para recomendarte el sistema constructivo óptimo.
          </p>
          <Link to="/#contacto">
            <Button size="lg" className="bg-orange text-white hover:bg-orange/90 gap-2">
              Consúltanos <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border/30">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Concepto.Casa To.Lo.Sa.systems — Viviendas que cuidan de ti.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default SistemaConstructivo;
