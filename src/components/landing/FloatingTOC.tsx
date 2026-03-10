import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { List, Home, X, MessageSquare } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

const sections = [
  { id: "inicio", label: "Inicio", icon: Home },
  { id: "filosofia", label: "Filosofía" },
  { id: "pilares", label: "Salud y Hogar" },
  { id: "compromiso", label: "Tu Proyecto" },
  { id: "proceso", label: "Proceso" },
  { id: "contacto", label: "Contacto", icon: MessageSquare },
];

export function FloatingTOC() {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState("inicio");
  const isMobile = useIsMobile();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 }
    );

    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setOpen(false);
  };

  return (
    <div className="fixed right-4 bottom-6 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="mb-2 rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-lg overflow-hidden"
          >
            <ul className="py-1">
              {sections.map(({ id, label, icon: Icon }) => {
                const isActive = activeId === id;
                const isHighlight = id === "inicio" || id === "contacto";
                return (
                  <li key={id}>
                    <button
                      onClick={() => scrollTo(id)}
                      className={`
                        w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors
                        ${isActive
                          ? "bg-primary/10 text-primary font-semibold"
                          : isHighlight
                            ? "text-primary hover:bg-primary/5 font-medium"
                            : "text-foreground/70 hover:bg-muted hover:text-foreground"
                        }
                      `}
                    >
                      {Icon && <Icon className="h-4 w-4 shrink-0" />}
                      {!Icon && (
                        <span
                          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                            isActive ? "bg-primary" : "bg-muted-foreground/40"
                          }`}
                        />
                      )}
                      <span className="whitespace-nowrap">{label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
        aria-label="Índice de contenidos"
      >
        {open ? <X className="h-5 w-5" /> : <List className="h-5 w-5" />}
      </button>
    </div>
  );
}
