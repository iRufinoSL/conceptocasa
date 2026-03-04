import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import homeModern from "@/assets/home-modern.jpg";
import homeClassic from "@/assets/home-classic.jpg";
import homeRustic from "@/assets/home-rustic.jpg";
import homeMediterranean from "@/assets/home-mediterranean.jpg";
import homeEco from "@/assets/home-eco.jpg";
import homeWood from "@/assets/home-wood.jpg";

const houses = [
  { src: homeModern, label: "Moderna Cúbica", desc: "Líneas puras y grandes ventanales" },
  { src: homeClassic, label: "Clásica", desc: "Elegancia atemporal con confort pasivo" },
  { src: homeRustic, label: "Rústica", desc: "Piedra y madera con tecnología invisible" },
  { src: homeMediterranean, label: "Mediterránea", desc: "Carácter local, eficiencia global" },
  { src: homeEco, label: "Eco Compacta", desc: "Una altura, máximo aprovechamiento" },
  { src: homeWood, label: "Madera y Naturaleza", desc: "Construcción biohabitable en dos alturas" },
];

const HousesCarousel = () => {
  const [current, setCurrent] = useState(0);

  const next = useCallback(() => {
    setCurrent((prev) => (prev + 1) % houses.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [next]);

  return (
    <section className="relative w-full h-[60vh] md:h-[70vh] overflow-hidden bg-foreground/95">
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="absolute inset-0"
        >
          <img
            src={houses[current].src}
            alt={houses[current].label}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/20 to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* Caption */}
      <div className="absolute bottom-12 left-0 right-0 z-10">
        <div className="container mx-auto px-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.6 }}
              className="max-w-xl"
            >
              <h3 className="text-2xl md:text-3xl font-bold text-background mb-1 text-overlay-dark">
                {houses[current].label}
              </h3>
              <p className="text-background/80 text-lg text-overlay-dark">
                {houses[current].desc}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2">
        {houses.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              i === current ? "bg-primary w-8" : "bg-background/50 hover:bg-background/80"
            }`}
            aria-label={`Ver casa ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
};

export default HousesCarousel;
