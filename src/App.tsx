/**
 * src/App.tsx
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { PremiumProvider } from "@/contexts/PremiumContext";
import { AdminProvider } from "@/contexts/AdminContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { useAdmin } from "@/contexts/AdminContext";
import Index from "./pages/Index.tsx";
import Fridge from "./pages/Fridge.tsx";
import ShoppingList from "./pages/ShoppingList.tsx";
import Login from "./pages/Login.tsx";
import Register from "./pages/Register.tsx";
import ForgotPassword from "./pages/ForgotPassword.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import Profile from "./pages/Profile.tsx";
import Family from "./pages/Family.tsx";

import ReceiptScanner from "./pages/ReceiptScanner.tsx";
import ManualEntry from "./pages/ManualEntry.tsx";
import Planet from "./pages/Planet.tsx";
import Store from "./pages/Store.tsx";
import AdminScan from "./pages/AdminScan.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

// Wrapper that redirects admins away from regular pages
const AdminGuard = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin, loading } = useAdmin();
  if (loading) return null;
  if (isAdmin) return <Navigate to="/admin-scan" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <PremiumProvider>
              <AdminProvider>
                <Routes>
                  {/* Admin-only route — accessible only to admins */}
                  <Route path="/admin-scan" element={<AdminScan />} />

                  {/* Auth routes — always accessible */}
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />

                  {/* Regular routes — admins are redirected to /admin-scan */}
                  <Route
                    path="/"
                    element={
                      <AdminGuard>
                        <Index />
                      </AdminGuard>
                    }
                  />
                  <Route
                    path="/fridge"
                    element={
                      <AdminGuard>
                        <Fridge />
                      </AdminGuard>
                    }
                  />
                  <Route
                    path="/shopping-list"
                    element={
                      <AdminGuard>
                        <ShoppingList />
                      </AdminGuard>
                    }
                  />
                  <Route
                    path="/planet"
                    element={
                      <AdminGuard>
                        <Planet />
                      </AdminGuard>
                    }
                  />
                  <Route path="/profile" element={<Profile />} />
                  <Route
                    path="/family"
                    element={
                      <AdminGuard>
                        <Family />
                      </AdminGuard>
                    }
                  />
                  <Route
                    path="/scan"
                    element={
                      <AdminGuard>
                        <ReceiptScanner />
                      </AdminGuard>
                    }
                  />
                  <Route
                    path="/manual-entry"
                    element={
                      <AdminGuard>
                        <ManualEntry />
                      </AdminGuard>
                    }
                  />
                  <Route
                    path="/store"
                    element={
                      <AdminGuard>
                        <Store />
                      </AdminGuard>
                    }
                  />

                  {/* Keep this catch-all last */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AdminProvider>
            </PremiumProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
