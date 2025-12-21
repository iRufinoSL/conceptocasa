import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { InactivityHandler } from "@/components/InactivityHandler";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Recursos from "./pages/Recursos";
import Presupuestos from "./pages/Presupuestos";
import PresupuestoDashboard from "./pages/PresupuestoDashboard";
import Proyectos from "./pages/Proyectos";
import CRM from "./pages/CRM";
import Agenda from "./pages/Agenda";
import Documentos from "./pages/Documentos";
import Usuarios from "./pages/Usuarios";
import Configuracion from "./pages/Configuracion";
import Setup from "./pages/Setup";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <InactivityHandler />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/recursos" element={<Recursos />} />
          <Route path="/presupuestos" element={<Presupuestos />} />
          <Route path="/presupuestos/:id" element={<PresupuestoDashboard />} />
          <Route path="/proyectos" element={<Proyectos />} />
          <Route path="/crm" element={<CRM />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/documentos" element={<Documentos />} />
          <Route path="/usuarios" element={<Usuarios />} />
          <Route path="/configuracion" element={<Configuracion />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/auth" element={<Auth />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
