/**
 * src/App.tsx
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { PremiumProvider } from "@/contexts/PremiumContext";
import { AdminProvider } from "@/contexts/AdminContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Index from "./pages/Index.tsx";
import Fridge from "./pages/Fridge.tsx";
import ShoppingList from "./pages/ShoppingList.tsx";
import Login from "./pages/Login.tsx";
import Register from "./pages/Register.tsx";
import ForgotPassword from "./pages/ForgotPassword.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import Profile from "./pages/Profile.tsx";
import Family from "./pages/Family.tsx";
import BarcodeScanner from "./pages/BarcodeScanner.tsx";
import ReceiptScanner from "./pages/ReceiptScanner.tsx";
import ManualEntry from "./pages/ManualEntry.tsx";
import Planet from "./pages/Planet.tsx";
import Store from "./pages/Store.tsx";
import AdminScan from "./pages/AdminScan.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

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
                  <Route path="/" element={<Index />} />
                  <Route path="/fridge" element={<Fridge />} />
                  <Route path="/shopping-list" element={<ShoppingList />} />
                  <Route path="/planet" element={<Planet />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/family" element={<Family />} />
                  <Route path="/barcode-scanner" element={<BarcodeScanner />} />
                  <Route path="/scan" element={<ReceiptScanner />} />
                  <Route path="/manual-entry" element={<ManualEntry />} />
                  <Route path="/store" element={<Store />} />
                  <Route path="/admin-scan" element={<AdminScan />} />
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
