import { motion } from "framer-motion";
import { Award, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const RewardSection = () => {
  const { user } = useAuth();
  const [tokens, setTokens] = useState(0);
  const goal = 150;
  const progress = (tokens / goal) * 100;

  useEffect(() => {
    const fetchTokens = async () => {
      if (!user) return;
      
      try {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (data) {
          const userTokens = ((data as any).tokens ?? 0) as number;
          setTokens(userTokens);
        }
      } catch (error) {
        console.error('Error fetching tokens:', error);
      }
    };

    fetchTokens();
  }, [user]);

  return (
    <div className="px-5 mt-5 lg:px-0">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="glass-card rounded-2xl p-5"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-token" />
            <h3 className="font-display text-sm font-semibold text-foreground">
              Rewards
            </h3>
          </div>
          <motion.button
            whileHover={{ x: 3 }}
            className="text-[11px] text-primary font-medium flex items-center gap-0.5"
          >
            Store <ArrowRight className="w-3 h-3" />
          </motion.button>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold font-display text-token">
            {tokens} 🪙
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>Until next discount</span>
              <span>{goal - tokens} tokens</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-token"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, delay: 0.5 }}
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <div className="glass-card rounded-xl px-3 py-2 flex-1 text-center">
            <p className="text-lg font-bold font-display text-safe">3</p>
            <p className="text-[9px] text-muted-foreground">Saved</p>
          </div>
          <div className="glass-card rounded-xl px-3 py-2 flex-1 text-center">
            <p className="text-lg font-bold font-display text-primary">1</p>
            <p className="text-[9px] text-muted-foreground">Donated</p>
          </div>
          <div className="glass-card rounded-xl px-3 py-2 flex-1 text-center">
            <p className="text-lg font-bold font-display text-coral">0.8kg</p>
            <p className="text-[9px] text-muted-foreground">Less waste</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default RewardSection;
