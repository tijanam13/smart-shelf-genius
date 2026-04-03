import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface PremiumContextType {
  isPremium: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const PremiumContext = createContext<PremiumContextType>({
  isPremium: false,
  loading: true,
  refresh: async () => {},
});

export const usePremium = () => useContext(PremiumContext);

export const PremiumProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchPremium = async () => {
    if (authLoading) return;

    if (!user) {
      setIsPremium(false);
      setLoading(false);
      return;
    }

    const { data, error } = await (supabase.rpc as any)("get_my_premium");

    if (error) {
      console.error("get_my_premium error:", error);
      setIsPremium(false);
    } else {
      setIsPremium(data === true);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }
    fetchPremium();
  }, [user, authLoading]);

  return (
    <PremiumContext.Provider value={{ isPremium, loading, refresh: fetchPremium }}>{children}</PremiumContext.Provider>
  );
};
