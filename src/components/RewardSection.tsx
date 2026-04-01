import { motion } from "framer-motion";
import { Award, ArrowRight, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

const RewardSection = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tokens, setTokens] = useState(0);
  const [donationsCount, setDonationsCount] = useState(0);
  const [usedRecipesCount, setUsedRecipesCount] = useState(0);
  const [lessWaste, setLessWaste] = useState("0kg");
  const goal = 500;
  const progress = Math.min((tokens / goal) * 100, 100);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        // Fetch tokens
        const { data: tokenData } = await supabase
          .from('user_tokens')
          .select('total_tokens')
          .eq('user_id', user.id)
          .maybeSingle();
        setTokens((tokenData as any)?.total_tokens ?? 0);

        // Fetch donations count
        const { data: donationData } = await supabase
          .from('donations')
          .select('id, quantity, unit')
          .eq('user_id', user.id);
        setDonationsCount(donationData?.length ?? 0);

        // Fetch used recipes count  
        const { data: recipesData } = await supabase
          .from('used_recipes')
          .select('id')
          .eq('user_id', user.id);
        setUsedRecipesCount(recipesData?.length ?? 0);

        // Calculate less waste: donations weight + used recipe items saved from expiry
        let totalKg = 0;
        if (donationData) {
          for (const d of donationData) {
            const qty = Number(d.quantity) || 0;
            const unit = (d as any).unit || 'pcs';
            if (unit === 'kg') totalKg += qty;
            else if (unit === 'g') totalKg += qty / 1000;
            else totalKg += qty * 0.2; // estimate ~200g per piece
          }
        }
        // Each used recipe saves ~0.5kg on average
        totalKg += (recipesData?.length ?? 0) * 0.5;

        if (totalKg >= 1) {
          setLessWaste(`${totalKg.toFixed(1)}kg`);
        } else {
          setLessWaste(`${Math.round(totalKg * 1000)}g`);
        }
      } catch (error) {
        console.error('Error fetching rewards:', error);
      }
    };

    fetchData();
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
            onClick={() => navigate('/store')}
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
              <span>{Math.max(0, goal - tokens)} tokens</span>
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
            <p className="text-lg font-bold font-display text-safe">{usedRecipesCount}</p>
            <p className="text-[9px] text-muted-foreground">Used</p>
          </div>
          <div className="glass-card rounded-xl px-3 py-2 flex-1 text-center">
            <p className="text-lg font-bold font-display text-primary">{donationsCount}</p>
            <p className="text-[9px] text-muted-foreground">Donated</p>
          </div>
          <div className="glass-card rounded-xl px-3 py-2 flex-1 text-center">
            <p className="text-lg font-bold font-display text-coral">{lessWaste}</p>
            <p className="text-[9px] text-muted-foreground">Less waste</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default RewardSection;
