import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ShoppingBag, ArrowLeft, Tag, Clock, Gift } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";

interface StoreItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  icon: string;
  category: string;
}

const storeItems: StoreItem[] = [
  { id: "1", name: "10% Off Fresh Produce", description: "Get 10% off fruits & vegetables at partner stores", cost: 50, icon: "🥬", category: "Groceries" },
  { id: "2", name: "15% Off Dairy Products", description: "Save on milk, cheese, yogurt and more", cost: 75, icon: "🥛", category: "Groceries" },
  { id: "3", name: "Free Reusable Bag", description: "Eco-friendly shopping bag from partner stores", cost: 30, icon: "🛍️", category: "Eco" },
  { id: "4", name: "20% Off Bakery", description: "Fresh bread, pastries and baked goods", cost: 100, icon: "🍞", category: "Groceries" },
  { id: "5", name: "Plant a Tree", description: "We plant a tree in your name through our partners", cost: 150, icon: "🌳", category: "Planet" },
  { id: "6", name: "Free Meal Box", description: "One free healthy meal box delivered to you", cost: 200, icon: "📦", category: "Special" },
  { id: "7", name: "5% Off Entire Cart", description: "Discount on your entire grocery cart", cost: 120, icon: "🛒", category: "Groceries" },
  { id: "8", name: "Compost Starter Kit", description: "Everything you need to start composting at home", cost: 80, icon: "🌱", category: "Eco" },
];

const Store = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tokens, setTokens] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState("All");

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    const fetchTokens = async () => {
      // Get family member IDs
      const { getFamilyUserIds } = await import('@/hooks/useFamilyData');
      const userIds = await getFamilyUserIds(user.id);
      const { data } = await supabase
        .from('user_tokens')
        .select('total_tokens')
        .in('user_id', userIds);
      const total = (data || []).reduce((sum, r) => sum + ((r as any).total_tokens || 0), 0);
      setTokens(total);
    };
    fetchTokens();
  }, [user, navigate]);

  const categories = ["All", "Groceries", "Eco", "Planet", "Special"];
  const filtered = selectedCategory === "All" ? storeItems : storeItems.filter(i => i.category === selectedCategory);

  const handleRedeem = async (item: StoreItem) => {
    if (tokens < item.cost) return;

    await supabase
      .from('user_tokens')
      .update({ total_tokens: tokens - item.cost, updated_at: new Date().toISOString() })
      .eq('user_id', user!.id);

    setTokens(prev => prev - item.cost);
  };

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden">
      <div className="absolute top-0 left-1/3 w-[500px] h-[500px] rounded-full bg-mint/5 blur-[140px] pointer-events-none" />

      <div className="relative z-10 pb-28 px-5 pt-8 lg:px-8 xl:px-16 2xl:px-24">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
                <ShoppingBag className="w-6 h-6 text-primary" /> Store
              </h1>
              <p className="text-muted-foreground text-sm mt-1">Redeem tokens for discounts & rewards</p>
            </div>
            <div className="glass-card rounded-xl px-4 py-2 text-center">
              <p className="text-lg font-bold text-token">{tokens} 🪙</p>
              <p className="text-[9px] text-muted-foreground">Your tokens</p>
            </div>
          </div>
        </motion.div>

        <div className="flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-hide">
          {categories.map(cat => (
            <motion.button
              key={cat}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat ? "bg-primary text-primary-foreground" : "glass-card text-muted-foreground"
              }`}
            >
              {cat}
            </motion.button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((item, idx) => {
            const canAfford = tokens >= item.cost;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="glass-card rounded-2xl p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="text-3xl">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{item.description}</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs font-bold text-token">{item.cost} 🪙</span>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleRedeem(item)}
                        disabled={!canAfford}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          canAfford
                            ? "bg-primary/20 text-primary hover:bg-primary/30"
                            : "bg-muted/30 text-muted-foreground cursor-not-allowed"
                        }`}
                      >
                        {canAfford ? "Redeem" : "Not enough"}
                      </motion.button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Store;
