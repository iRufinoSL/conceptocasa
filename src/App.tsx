import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { InactivityHandler } from "@/components/InactivityHandler";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <InactivityHandler />
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/install" element={<Install />} />
            
            {/* Protected routes - require authentication */}
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/presupuestos" element={<ProtectedRoute><Presupuestos /></ProtectedRoute>} />
            <Route path="/presupuestos/:id" element={<ProtectedRoute><PresupuestoDashboard /></ProtectedRoute>} />
            <Route path="/proyectos" element={<ProtectedRoute><Proyectos /></ProtectedRoute>} />
            <Route path="/crm" element={<ProtectedRoute><CRM /></ProtectedRoute>} />
            <Route path="/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />
            <Route path="/documentos" element={<ProtectedRoute><Documentos /></ProtectedRoute>} />
            
            {/* Admin-only routes */}
            <Route path="/recursos" element={<ProtectedRoute requireAdmin><Recursos /></ProtectedRoute>} />
            <Route path="/usuarios" element={<ProtectedRoute requireAdmin><Usuarios /></ProtectedRoute>} />
            <Route path="/configuracion" element={<ProtectedRoute requireAdmin><Configuracion /></ProtectedRoute>} />
            <Route path="/administracion" element={<ProtectedRoute requireAdmin><Administracion /></ProtectedRoute>} />
            
            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
