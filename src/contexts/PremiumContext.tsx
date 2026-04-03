import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PremiumContextType {
  isPremium: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  setPremium: (value: boolean) => void;
}

const PremiumContext = createContext<PremiumContextType>({
  isPremium: false,
  loading: true,
  refresh: async () => {},
  setPremium: () => {},
});

export const usePremium = () => useContext(PremiumContext);

export const PremiumProvider = ({ children }: { children: ReactNode }) => {
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchPremium = async (userId: string) => {
    const { data } = await supabase.from("profiles").select("is_premium").eq("user_id", userId).maybeSingle();

    setIsPremium(data?.is_premium ?? false);
    setLoading(false);
  };

  const refresh = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setIsPremium(false);
      setLoading(false);
      return;
    }
    await fetchPremium(user.id);
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await fetchPremium(session.user.id);
      } else {
        setIsPremium(false);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchPremium(session.user.id);
      } else {
        setIsPremium(false);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <PremiumContext.Provider value={{ isPremium, loading, refresh, setPremium: setIsPremium }}>
      {children}
    </PremiumContext.Provider>
  );
};
