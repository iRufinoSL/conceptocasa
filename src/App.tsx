import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { InactivityHandler } from "@/components/InactivityHandler";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { FloatingVoiceNoteButton } from "@/components/voice/FloatingVoiceNoteButton";
import { useVersionCheck } from "@/hooks/useVersionCheck";
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
import Administracion from "./pages/Administracion";
import Setup from "./pages/Setup";
import Auth from "./pages/Auth";
import Install from "./pages/Install";
import SmsRedirect from "./pages/SmsRedirect";
import NotFound from "./pages/NotFound";
import FloorPlanPopout from "./pages/FloorPlanPopout";

const queryClient = new QueryClient();

const App = () => {
  // Global version check — auto-updates when a new deploy is detected
  useVersionCheck(true);
  
  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <FloatingVoiceNoteButton />
          <InactivityHandler />
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/install" element={<Install />} />
            <Route path="/r/:type/:id" element={<SmsRedirect />} />
            <Route path="/floorplan-popout" element={<ProtectedRoute appName="presupuestos"><FloorPlanPopout /></ProtectedRoute>} />
            
            {/* Protected routes - require authentication */}
            <Route path="/dashboard" element={<ProtectedRoute appName="dashboard"><Dashboard /></ProtectedRoute>} />
            <Route path="/presupuestos" element={<ProtectedRoute appName="presupuestos"><Presupuestos /></ProtectedRoute>} />
            <Route path="/presupuestos/:id" element={<ProtectedRoute appName="presupuestos"><PresupuestoDashboard /></ProtectedRoute>} />
            <Route path="/proyectos" element={<ProtectedRoute appName="presupuestos"><Proyectos /></ProtectedRoute>} />
            <Route path="/crm" element={<ProtectedRoute appName="crm"><CRM /></ProtectedRoute>} />
            <Route path="/agenda" element={<ProtectedRoute appName="agenda"><Agenda /></ProtectedRoute>} />
            <Route path="/documentos" element={<ProtectedRoute appName="documentos"><Documentos /></ProtectedRoute>} />
            
            {/* Admin-only routes */}
            <Route path="/recursos" element={<ProtectedRoute requireAdmin appName="recursos"><Recursos /></ProtectedRoute>} />
            <Route path="/usuarios" element={<ProtectedRoute requireAdmin appName="usuarios"><Usuarios /></ProtectedRoute>} />
            <Route path="/configuracion" element={<ProtectedRoute requireAdmin appName="configuracion"><Configuracion /></ProtectedRoute>} />
            <Route path="/administracion" element={<ProtectedRoute requireAdmin appName="administracion"><Administracion /></ProtectedRoute>} />
            
            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
