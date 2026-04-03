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
  // Počinjemo sa loading=true i ne menjamo dok auth ne završi
  const [loading, setLoading] = useState(true);

  const fetchPremium = async () => {
    // Ako auth još učitava, ne radimo ništa — čekamo
    if (authLoading) return;

    if (!user) {
      setIsPremium(false);
      setLoading(false);
      return;
    }

    const { data } = await supabase.from("profiles").select("is_premium").eq("user_id", user.id).maybeSingle();

    setIsPremium(data?.is_premium ?? false);
    setLoading(false);
  };

  useEffect(() => {
    // Resetuj loading na true svaki put kad se auth menja
    // da bismo izbegli trenutak kada isPremium=false ali auth još nije gotov
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
