import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ChevronRight, ChevronLeft, Clock, Loader2, X, Trash2, Plus, Minus, Edit2, Check, Gift, Send, MessageCircle } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import DonationModal from "@/components/DonationModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useFridgeItems, getUrgency, getDaysLeft, getCategoryEmoji, formatQtyUnit, getConsumeStep } from "@/hooks/useFridgeItems";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";

interface Recipe {
  title: string;
  sub?: string;
  ingredients?: string[];
  instructions?: string[];
  time: string;
  difficulty?: string;
  tokens: number;
  used?: boolean;
}

const defaultRecipes: Recipe[] = [
  {
    title: "🥞 Milk Pancakes",
    sub: "Use Milk + Eggs + Butter",
    ingredients: ["1 cup Milk", "2 Eggs", "1 tbsp Butter (melted)", "1 cup Flour", "1 tbsp Sugar", "Pinch of salt"],
    instructions: ["Mix flour, sugar, and salt.", "Whisk eggs and milk, combine with dry ingredients.", "Add melted butter, stir until smooth.", "Heat pan, pour 1/4 cup batter per pancake.", "Cook until bubbles form, flip and cook 1-2 min.", "Serve with syrup or fruit."],
    time: "15 min",
    difficulty: "Easy",
    tokens: 10,
  },
  {
    title: "🍲 Tomato Soup",
    sub: "Use Tomato + Carrot + Cabbage",
    ingredients: ["3 Tomatoes", "1 Carrot", "1/4 Cabbage", "1 Onion", "2 cloves Garlic", "2 cups Water"],
    instructions: ["Sauté onion and garlic.", "Add diced tomatoes, cook 5 min.", "Add carrot, cabbage, water.", "Simmer 15 min.", "Season and serve."],
    time: "25 min",
    difficulty: "Medium",
    tokens: 15,
  },
];

type Tab = "overview" | "list" | "recipes";

type Urgency = "safe" | "warning" | "urgent";

const urgencyColor: Record<Urgency, string> = { safe: "bg-safe", warning: "bg-warning", urgent: "bg-urgent" };
const urgencyText: Record<Urgency, string> = { safe: "text-safe", warning: "text-warning", urgent: "text-urgent" };
const urgencyBadge: Record<Urgency, string> = { safe: "bg-safe/15 text-safe", warning: "bg-warning/15 text-warning", urgent: "bg-urgent/15 text-urgent" };
const urgencyGlow: Record<Urgency, string> = { safe: "", warning: "glow-warning", urgent: "glow-urgent" };

// Product images mapping
const productImages: Record<string, string> = {
  "apple": "🍎",
  "cucumber": "🥒",
  "milk": "🥛",
  "eggs": "🥚",
  "butter": "🧈",
  "cheese": "🧀",
  "bread": "🍞",
  "tomato": "🍅",
  "lettuce": "🥬",
  "carrot": "🥕",
  "chicken": "🍗",
  "beef": "🥩",
  "fish": "🐟",
  "yogurt": "🥛",
  "juice": "🧃",
  "ice cream": "🍦",
};

const getProductImage = (name: string): string => {
  const key = name.toLowerCase();
  for (const [k, v] of Object.entries(productImages)) {
    if (key.includes(k)) return v;
  }
  return "📦"; // default
};

const FridgePage = () => {
  const [fridgeOpen, setFridgeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [tooltip, setTooltip] = useState<{ name: string; detail: string } | null>(null);
  const [selectedItem, setSelectedItem] = useState<typeof enrichedItems[0] | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>(defaultRecipes);
  const [generatingRecipes, setGeneratingRecipes] = useState(false);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editLocation, setEditLocation] = useState("fridge");
  const [editExpiryDate, setEditExpiryDate] = useState<Date | undefined>();
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [donationItem, setDonationItem] = useState<typeof enrichedItems[0] | null>(null);
  const [usedRecipeTitles, setUsedRecipeTitles] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: dbItems = [], isLoading } = useFridgeItems();

  // Load used recipes from DB
  useEffect(() => {
    if (!user) return;
    const loadUsedRecipes = async () => {
      const { data } = await supabase
        .from('used_recipes')
        .select('recipe_title')
        .eq('user_id', user.id);
      if (data) {
        setUsedRecipeTitles(new Set(data.map((r: any) => r.recipe_title)));
      }
    };
    loadUsedRecipes();
  }, [user]);

  // Realtime subscription for fridge_items
  useEffect(() => {
    const channel = supabase
      .channel('fridge-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fridge_items' },
        () => {
          queryClient.invalidateQueries({ queryKey: ["fridge_items"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const enrichedItems = dbItems.map((item) => {
    const days = getDaysLeft(item.expiry_date);
    const urgency = getUrgency(item.expiry_date);
    const emoji = getCategoryEmoji(item.category);
    const freshness = Math.max(0, Math.min(100, Math.round((days / 30) * 100)));
    const daysLabel = item.expiry_date ? (days <= 0 ? "Today!" : `${days}d`) : "N/A";
    return { ...item, days, urgency, emoji, freshness, daysLabel };
  });

  const urgentItems = enrichedItems.filter((i) => i.urgency === "urgent");
  const warnItems = enrichedItems.filter((i) => i.urgency === "warning");
  const safeItems = enrichedItems.filter((i) => i.urgency === "safe");

  const showTooltip = (item: typeof enrichedItems[0]) => {
    setSelectedItem(item);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("fridge_items").delete().eq("id", id);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ["fridge_items"] });
      toast({ title: "Item removed" });
    }
  };

  const handleQuantity = async (id: string, delta: number, current: number, unit: string) => {
    const step = getConsumeStep(unit);
    const newQty = +(current + delta * step).toFixed(1);
    if (newQty <= 0) {
      await handleDelete(id);
      return;
    }
    const { error } = await supabase.from("fridge_items").update({ quantity: newQty }).eq("id", id);
    if (!error) queryClient.invalidateQueries({ queryKey: ["fridge_items"] });
  };

  const handleUpdateItem = async () => {
    if (!selectedItem) return;
    const { error } = await supabase
      .from("fridge_items")
      .update({
        status: editLocation,
        expiry_date: editExpiryDate ? format(editExpiryDate, "yyyy-MM-dd") : null,
      })
      .eq("id", selectedItem.id);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ["fridge_items"] });
      toast({ title: "Updated!", description: "Item updated successfully" });
      setEditingItem(null);
      setSelectedItem(null); // Close modal after update
    }
  };

  const handleUseRecipe = async (recipe: Recipe) => {
    if (!user) {
      toast({ title: "Error", description: "You must be logged in", variant: "destructive" });
      return;
    }

    if (usedRecipeTitles.has(recipe.title)) {
      toast({ title: "Already used", description: "You already used this recipe.", variant: "destructive" });
      return;
    }

    try {
      // Record used recipe
      const { error: recipeError } = await supabase
        .from('used_recipes')
        .insert({ user_id: user.id, recipe_title: recipe.title, tokens_earned: recipe.tokens });

      if (recipeError) throw recipeError;

      // Update tokens - upsert
      const { data: existing } = await supabase
        .from('user_tokens')
        .select('total_tokens')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('user_tokens')
          .update({ total_tokens: existing.total_tokens + recipe.tokens, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('user_tokens')
          .insert({ user_id: user.id, total_tokens: recipe.tokens });
      }

      setUsedRecipeTitles(prev => new Set([...prev, recipe.title]));

      toast({
        title: "Recipe Used! 🎉",
        description: `You earned +${recipe.tokens} 🪙 tokens!`,
      });

      queryClient.invalidateQueries({ queryKey: ["fridge_items"] });
      setSelectedRecipe(null);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to use recipe",
        variant: "destructive",
      });
    }
  };

  const handleGenerateRecipes = async () => {
    setGeneratingRecipes(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-recipes", {
        body: { fridgeItems: enrichedItems.map((i) => ({ name: i.name, days: i.days, frozen: false })) },
      });
      if (error) throw error;
      if (data?.recipes?.length > 0) {
        const formatted: Recipe[] = data.recipes.map((r: any) => ({
          title: r.title || "Untitled Recipe",
          ingredients: r.ingredients || [],
          instructions: r.instructions || [],
          time: r.time || "? min",
          difficulty: r.difficulty || "Medium",
          tokens: r.tokens || 10,
        }));
        setRecipes((prev) => [...prev, ...formatted]);
        toast({ title: "Recipes Generated!", description: `${formatted.length} new recipes added.` });
      } else {
        toast({ title: "No recipes", description: "AI couldn't generate recipes.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to generate recipes.", variant: "destructive" });
    } finally {
      setGeneratingRecipes(false);
    }
  };
  const handleSendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    const newMessages = [...chatMessages, { role: "user" as const, content: userMsg }];
    setChatMessages(newMessages);
    setChatLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("recipe-chat", {
        body: {
          recipe: selectedRecipe,
          userMessage: userMsg,
          fridgeItems: dbItems.map(i => ({ name: i.name, category: i.category })),
          chatHistory: chatMessages,
        },
      });
      if (error) throw error;
      setChatMessages([...newMessages, { role: "assistant", content: data.reply }]);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Chat failed", variant: "destructive" });
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Reset chat when recipe changes
  useEffect(() => {
    setChatMessages([]);
    setShowChat(false);
    setChatInput("");
  }, [selectedRecipe?.title]);


  const fridgeDisplayItems = enrichedItems.filter((i) => i.status === "fridge" || i.status === "in_fridge").slice(0, 10);
  const freezerDisplayItems = enrichedItems.filter((i) => i.status === "freezer").slice(0, 5);

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden">
      <div className="absolute top-20 left-1/4 w-[400px] h-[400px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />

      <div className="relative z-10 pb-24 pt-10 px-4 lg:px-8 xl:px-16">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 text-center">
          <h1 className="font-display text-2xl font-bold text-foreground">My Fridge</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isLoading ? "Loading..." : `${enrichedItems.length} items tracked`}
          </p>
        </motion.div>

        <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center lg:gap-8">
          {/* === FRIDGE 3D === */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} className="flex-shrink-0">
            <div className="relative mx-auto" style={{ perspective: "1200px" }}>
              <div
                className="w-[280px] sm:w-[320px] rounded-2xl border border-mint/20 overflow-hidden cursor-pointer select-none"
                style={{ boxShadow: "inset -4px 0 8px rgba(0,0,0,0.15), 2px 4px 24px rgba(0,0,0,0.35)" }}
                onClick={() => setFridgeOpen(!fridgeOpen)}
              >
                {/* Freezer */}
                <div className="h-[180px] sm:h-[200px] relative overflow-hidden" style={{ background: "linear-gradient(160deg, hsl(155 25% 28%) 0%, hsl(155 30% 20%) 100%)", borderBottom: "2px solid hsl(155 20% 30%)" }}>
                  <div className="text-[10px] text-muted-foreground px-3 pt-2 tracking-wider font-medium">❄️ FREEZER</div>
                  
                  {/* Freezer items - display first */}
                  <div className="absolute inset-0 p-2 pt-6 flex items-end gap-2 z-[5]">
                    {freezerDisplayItems.map((item) => (
                      <motion.div key={item.id} whileHover={{ y: -2, scale: 1.1 }} className="flex flex-col items-center cursor-pointer flex-1 justify-center" onClick={(e) => { e.stopPropagation(); showTooltip(item); }}>
                        <div className="w-12 h-12 flex items-center justify-center text-3xl bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
                          {getProductImage(item.name)}
                        </div>
                        <span className={`text-[9px] font-bold ${urgencyText[item.urgency]} mt-1`}>{item.daysLabel}</span>
                      </motion.div>
                    ))}
                  </div>

                  {/* Door overlay */}
                  <div
                    className="absolute inset-0 z-[20] transition-transform duration-700 ease-[cubic-bezier(.25,.46,.45,.94)] rounded-r-2xl cursor-pointer"
                    style={{
                      background: "linear-gradient(160deg, hsl(155 18% 26%) 0%, hsl(155 22% 18%) 100%)",
                      transformOrigin: "left center",
                      transform: fridgeOpen ? "perspective(1200px) rotateY(90deg)" : "perspective(1200px) rotateY(0deg)",
                      borderLeft: "1.5px solid hsl(155 20% 30%)",
                    }}
                    onClick={() => setFridgeOpen(false)}
                  >
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-[5px] h-10 rounded-sm" style={{ background: "hsl(155 15% 40%)" }} />
                    <div className="absolute left-3 top-2 text-sm">❄</div>
                  </div>
                  <div className="absolute inset-x-0 top-0 h-5 z-[1] transition-opacity duration-300 pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(180,255,200,0.4) 0%, transparent 100%)", opacity: fridgeOpen ? 1 : 0 }} />
                </div>

                {/* Main compartment */}
                <div className="h-[280px] sm:h-[320px] relative overflow-hidden" style={{ background: "linear-gradient(160deg, hsl(155 22% 24%) 0%, hsl(155 26% 17%) 100%)" }}>
                  {/* Shelves with items - display first */}
                  <div className="absolute inset-0 p-2 flex flex-col gap-1 z-[5]">
                    {[fridgeDisplayItems.slice(0, 3), fridgeDisplayItems.slice(3, 6), fridgeDisplayItems.slice(6)].map((shelf, si) => (
                      <div key={si} className="flex gap-2 items-end px-1 py-1 rounded-sm flex-1 overflow-hidden" style={{ background: "rgba(120,190,160,0.12)", borderBottom: "1.5px solid rgba(120,190,160,0.3)" }}>
                        {shelf.map((item) => (
                          <motion.div key={item.id} whileHover={{ y: -3, scale: 1.1 }} className="flex flex-col items-center cursor-pointer flex-1 justify-end" onClick={(e) => { e.stopPropagation(); showTooltip(item); }}>
                            <div className="w-12 h-12 flex items-center justify-center text-3xl bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
                              {getProductImage(item.name)}
                            </div>
                            <span className={`text-[8px] font-bold ${urgencyText[item.urgency]} ${item.urgency === "urgent" ? "animate-pulse" : ""} mt-1`}>{item.daysLabel}</span>
                          </motion.div>
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Door overlay */}
                  <div
                    className="absolute inset-0 z-[20] transition-transform duration-700 ease-[cubic-bezier(.25,.46,.45,.94)] cursor-pointer"
                    style={{
                      background: "linear-gradient(160deg, hsl(155 18% 23%) 0%, hsl(155 22% 16%) 100%)",
                      transformOrigin: "left center",
                      transform: fridgeOpen ? "perspective(1200px) rotateY(90deg)" : "perspective(1200px) rotateY(0deg)",
                      borderLeft: "1.5px solid hsl(155 20% 30%)",
                    }}
                    onClick={() => setFridgeOpen(false)}
                  >
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-[5px] h-10 rounded-sm" style={{ background: "hsl(155 15% 40%)" }} />
                    <div className="absolute left-3 top-3 text-[11px] font-medium tracking-wider text-muted-foreground font-display">EatSmart</div>
                  </div>
                  <div className="absolute inset-x-0 top-0 h-5 z-[1] transition-opacity duration-300 pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(180,255,200,0.4) 0%, transparent 100%)", opacity: fridgeOpen ? 1 : 0 }} />
                </div>
              </div>

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => setFridgeOpen(!fridgeOpen)} className="mt-3 w-full py-2.5 glass-card rounded-xl text-xs font-medium text-foreground">
                🚪 {fridgeOpen ? "Close" : "Open"} Fridge
              </motion.button>

              <AnimatePresence>
                {selectedItem && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => { setSelectedItem(null); setEditingItem(null); }}
                      className="fixed inset-0 bg-black/50 z-[9998] backdrop-blur-md"
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8, y: 60 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.8, y: 60 }}
                      transition={{ type: "spring", damping: 20, stiffness: 300 }}
                      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none"
                    >
                      <div className="w-full max-w-[500px] glass-card-strong rounded-3xl p-7 shadow-2xl pointer-events-auto overflow-y-auto max-h-[85vh]">
                        <div className="flex items-start justify-between mb-5">
                          <div className="flex items-center gap-3">
                            <span className="text-3xl">{selectedItem.emoji}</span>
                            <div>
                              <p className="text-lg font-bold text-foreground">{selectedItem.name}</p>
                              <p className="text-sm text-muted-foreground mt-0.5">{selectedItem.category}</p>
                            </div>
                          </div>
                          <motion.button 
                            whileTap={{ scale: 0.9 }}
                            onClick={() => { setSelectedItem(null); setEditingItem(null); }} 
                            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                          >
                            <X className="w-6 h-6" />
                          </motion.button>
                        </div>

                        <div className="space-y-3">
                          <div className="flex justify-between py-3 px-3 rounded-lg bg-background/30 border border-border/30">
                            <span className="text-sm text-muted-foreground">Amount</span>
                            <span className="text-sm font-semibold text-foreground">{formatQtyUnit(selectedItem.quantity, selectedItem.unit || 'pcs')}</span>
                          </div>
                          <div className="flex justify-between py-3 px-3 rounded-lg bg-background/30 border border-border/30">
                            <span className="text-sm text-muted-foreground">Location</span>
                            <span className="text-sm font-semibold text-foreground">{selectedItem.status === "freezer" ? "❄️ Freezer" : "🧊 Fridge"}</span>
                          </div>
                          <div className="flex justify-between py-3 px-3 rounded-lg bg-background/30 border border-border/30">
                            <span className="text-sm text-muted-foreground">Expires</span>
                            <span className={`text-sm font-semibold ${urgencyText[selectedItem.urgency]}`}>
                              {selectedItem.expiry_date || 'N/A'} ({selectedItem.daysLabel})
                            </span>
                          </div>
                          <div className="flex justify-between py-3 px-3 rounded-lg bg-background/30 border border-border/30">
                            <span className="text-sm text-muted-foreground">Freshness</span>
                            <span className="text-sm font-semibold text-foreground">{selectedItem.freshness}%</span>
                          </div>
                          <div className="pt-2 px-1">
                            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                              <motion.div className={`h-full rounded-full ${urgencyColor[selectedItem.urgency]}`} initial={{ width: 0 }} animate={{ width: `${selectedItem.freshness}%` }} transition={{ duration: 0.6 }} />
                            </div>
                          </div>
                        </div>

                    {editingItem === selectedItem.id ? (
                      <div className="space-y-4 mt-5 pt-4 border-t border-primary/10">
                        <h3 className="text-base font-bold text-foreground">Edit Item</h3>
                        
                        <div className="space-y-2">
                          <label className="text-sm text-muted-foreground font-semibold">📍 Storage Location</label>
                          <Select value={editLocation} onValueChange={setEditLocation}>
                            <SelectTrigger className="h-10 text-sm bg-background/50 border-border/50 rounded-lg">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fridge">🧊 Fridge</SelectItem>
                              <SelectItem value="freezer">❄️ Freezer</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm text-muted-foreground font-semibold">📅 Expiry Date</label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className={cn("w-full justify-start text-left text-sm font-normal bg-background/50 border-border/50 rounded-lg h-10 px-3", !editExpiryDate && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {editExpiryDate ? format(editExpiryDate, "MMM d, yyyy") : "Pick a date"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar mode="single" selected={editExpiryDate} onSelect={setEditExpiryDate} initialFocus className="p-2 pointer-events-auto" disabled={(date) => date < new Date()} />
                            </PopoverContent>
                          </Popover>
                        </div>

                        <div className="flex gap-3 pt-2">
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={handleUpdateItem}
                            className="flex-1 py-2.5 rounded-lg bg-primary/15 text-primary text-sm font-bold hover:bg-primary/25 transition-colors flex items-center justify-center gap-2"
                          >
                            <Check className="w-4 h-4" /> Save
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => { setEditingItem(null); setEditLocation(selectedItem.status === "in_fridge" ? "fridge" : selectedItem.status); setEditExpiryDate(selectedItem.expiry_date ? new Date(selectedItem.expiry_date) : undefined); }}
                            className="flex-1 py-2.5 rounded-lg bg-muted/30 text-muted-foreground text-sm font-bold hover:bg-muted/50 transition-colors"
                          >
                            Cancel
                          </motion.button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3 mt-6 pt-4 border-t border-border/30 flex-wrap">
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => { 
                            setEditingItem(selectedItem.id); 
                            setEditLocation(selectedItem.status === "in_fridge" ? "fridge" : selectedItem.status); 
                            setEditExpiryDate(selectedItem.expiry_date ? new Date(selectedItem.expiry_date) : undefined);
                          }}
                          className="flex-1 min-w-[100px] py-3 rounded-lg bg-primary/20 text-primary text-sm font-bold hover:bg-primary/30 transition-colors flex items-center justify-center gap-2"
                        >
                          <Edit2 className="w-4 h-4" /> Edit
                        </motion.button>
                        {selectedItem.days >= 0 ? (
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setShowDonationModal(true)}
                            className={`flex-1 min-w-[100px] py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                              selectedItem.days <= 5
                                ? "bg-warning/30 text-warning hover:bg-warning/40"
                                : "bg-safe/20 text-safe hover:bg-safe/30"
                            }`}
                          >
                            <Gift className="w-4 h-4" /> Donate
                          </motion.button>
                        ) : (
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => { handleDelete(selectedItem.id); setSelectedItem(null); }}
                            className="flex-1 min-w-[100px] py-3 rounded-lg bg-muted/30 text-muted-foreground text-sm font-bold hover:bg-muted/50 transition-colors flex items-center justify-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" /> Expired
                          </motion.button>
                        )}
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => { handleDelete(selectedItem.id); setSelectedItem(null); }}
                          className="flex-1 min-w-[100px] py-3 rounded-lg bg-urgent/20 text-urgent text-sm font-bold hover:bg-urgent/30 transition-colors flex items-center justify-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" /> Remove
                        </motion.button>
                      </div>
                    )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* === PANEL === */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="w-full max-w-lg min-w-0">
            <div className="flex gap-2 mb-5 justify-center lg:justify-start">
              {(["overview", "list", "recipes"] as Tab[]).map((tab) => (
                <motion.button key={tab} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => { setActiveTab(tab); setSelectedRecipe(null); }} className={`px-4 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${activeTab === tab ? "bg-primary text-primary-foreground" : "glass-card text-muted-foreground"}`}>
                  {tab}
                </motion.button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {/* Overview */}
              {activeTab === "overview" && (
                <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className="glass-card rounded-xl p-3 text-center">
                      <div className="text-xl font-semibold text-urgent">{urgentItems.length}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Urgent</div>
                    </div>
                    <div className="glass-card rounded-xl p-3 text-center">
                      <div className="text-xl font-semibold text-warning">{warnItems.length}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Warning</div>
                    </div>
                    <div className="glass-card rounded-xl p-3 text-center">
                      <div className="text-xl font-semibold text-safe">{safeItems.length}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">OK</div>
                    </div>
                  </div>

                  {enrichedItems.length === 0 && !isLoading && (
                    <div className="glass-card rounded-xl p-6 text-center">
                      <p className="text-sm text-muted-foreground">No items in your fridge yet.</p>
                      <p className="text-[11px] text-muted-foreground mt-1">Scan a receipt or barcode to add items!</p>
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-3">Alerts</p>
                  {enrichedItems.filter((i) => i.urgency !== "safe").slice(0, 4).map((item, idx) => (
                    <motion.div key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className={`glass-card rounded-xl p-3 mb-2 flex items-center gap-3 ${urgencyGlow[item.urgency]}`}>
                      <span className="text-2xl flex-shrink-0">{item.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        <p className="text-[11px] text-muted-foreground">Qty: {formatQtyUnit(item.quantity, item.unit || 'pcs')}</p>
                        <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
                          <motion.div className={`h-full rounded-full ${urgencyColor[item.urgency]}`} initial={{ width: 0 }} animate={{ width: `${item.freshness}%` }} transition={{ duration: 0.8, delay: 0.2 + idx * 0.05 }} />
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${urgencyBadge[item.urgency]}`}>{item.daysLabel}</span>
                    </motion.div>
                  ))}
                  {enrichedItems.length > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-4 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Click on items in the fridge for details
                    </p>
                  )}
                </motion.div>
              )}

              {/* List */}
              {activeTab === "list" && (
                <motion.div key="list" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-3">All Items ({enrichedItems.length})</p>
                  {enrichedItems.length === 0 && !isLoading && (
                    <div className="glass-card rounded-xl p-6 text-center">
                      <p className="text-sm text-muted-foreground">Your fridge is empty.</p>
                    </div>
                  )}
                  {enrichedItems.map((item, idx) => (
                    <motion.div key={item.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.03 }} className="glass-card rounded-xl p-3 mb-2 flex items-center gap-3">
                      <div className="w-12 h-12 flex items-center justify-center text-2xl bg-white/10 rounded-lg hover:bg-white/20 transition-colors flex-shrink-0">
                        {getProductImage(item.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground">{item.category}</p>
                        <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                          <motion.div className={`h-full rounded-full ${urgencyColor[item.urgency]}`} initial={{ width: 0 }} animate={{ width: `${item.freshness}%` }} transition={{ duration: 0.6, delay: idx * 0.03 }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => handleQuantity(item.id, -1, item.quantity, item.unit || 'pcs')} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-medium text-foreground min-w-[40px] text-center">{formatQtyUnit(item.quantity, item.unit || 'pcs')}</span>
                        <button onClick={() => handleQuantity(item.id, 1, item.quantity, item.unit || 'pcs')} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${urgencyBadge[item.urgency]}`}>{item.daysLabel}</span>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => { setDonationItem(item); setShowDonationModal(true); }}
                        className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                          item.days < 0
                            ? 'text-muted-foreground hover:text-muted-foreground'
                            : item.days <= 5
                            ? 'text-warning hover:bg-warning/20'
                            : 'text-safe hover:bg-safe/20'
                        }`}
                        title={item.days < 0 ? 'Item expired' : 'Donate item'}
                      >
                        <Gift className="w-4 h-4" />
                      </motion.button>
                      <button onClick={() => handleDelete(item.id)} className="p-1 text-muted-foreground hover:text-urgent transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {/* Recipes */}
              {activeTab === "recipes" && !selectedRecipe && (
                <motion.div key="recipes" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-3">AI Suggestions — use before they expire</p>
                  {recipes.map((r, idx) => {
                    const isUsed = usedRecipeTitles.has(r.title);
                    return (
                    <motion.div key={`${r.title}-${idx}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.08 }} whileHover={{ scale: 1.01 }} className={`glass-card rounded-xl p-4 mb-3 cursor-pointer ${isUsed ? 'opacity-60' : ''}`} onClick={() => setSelectedRecipe(r)}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-foreground">{r.title}</p>
                        {isUsed && <span className="text-[10px] font-semibold text-safe bg-safe/15 px-2 py-0.5 rounded-full">✅ Used</span>}
                      </div>
                      {r.sub && <p className="text-[11px] text-muted-foreground mt-1">{r.sub}</p>}
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {r.time}
                          {r.difficulty && <span className="ml-2">· {r.difficulty}</span>}
                        </span>
                        <span className="text-[11px] font-semibold text-token bg-token/10 px-2 py-0.5 rounded-full">{isUsed ? 'Earned' : '+'}{r.tokens} 🪙</span>
                      </div>
                    </motion.div>
                    );
                  })}
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={handleGenerateRecipes} disabled={generatingRecipes} className="w-full glass-card rounded-xl py-2.5 text-xs font-medium text-foreground flex items-center justify-center gap-1.5 mt-1 disabled:opacity-50">
                    {generatingRecipes ? (<><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating recipes...</>) : (<><Sparkles className="h-3.5 w-3.5" /> Generate more recipes <ChevronRight className="h-3.5 w-3.5" /></>)}
                  </motion.button>
                </motion.div>
              )}

              {/* Recipe Detail */}
              {activeTab === "recipes" && selectedRecipe && (
                <motion.div key="recipe-detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <button onClick={() => setSelectedRecipe(null)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4">
                    <ChevronLeft className="w-4 h-4" /> Back to recipes
                  </button>
                  <div className="glass-card rounded-2xl p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h2 className="font-display text-lg font-bold text-foreground">{selectedRecipe.title}</h2>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> {selectedRecipe.time}</span>
                          {selectedRecipe.difficulty && <span className="text-[11px] text-muted-foreground">· {selectedRecipe.difficulty}</span>}
                          <span className="text-[11px] font-semibold text-token bg-token/10 px-2 py-0.5 rounded-full">+{selectedRecipe.tokens} 🪙</span>
                        </div>
                      </div>
                      <button onClick={() => setSelectedRecipe(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                    </div>
                    {selectedRecipe.ingredients && selectedRecipe.ingredients.length > 0 && (
                      <div className="mb-5">
                        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">🧾 Ingredients</h3>
                        <ul className="space-y-1.5">
                          {selectedRecipe.ingredients.map((ing, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-2"><span className="text-primary mt-0.5">•</span>{ing}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selectedRecipe.instructions && selectedRecipe.instructions.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">📋 Instructions</h3>
                        <ol className="space-y-3">
                          {selectedRecipe.instructions.map((step, i) => (
                            <li key={i} className="flex gap-3">
                              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">{i + 1}</span>
                              <p className="text-sm text-muted-foreground pt-0.5">{step}</p>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {(!selectedRecipe.ingredients || selectedRecipe.ingredients.length === 0) && (!selectedRecipe.instructions || selectedRecipe.instructions.length === 0) && (
                      <p className="text-sm text-muted-foreground">{selectedRecipe.sub || "No detailed instructions available."}</p>
                    )}
                    <div className="mt-6 pt-4 border-t border-primary/10 flex gap-3">
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleUseRecipe(selectedRecipe)}
                        className="flex-1 py-3 rounded-lg bg-primary/20 text-primary text-sm font-bold hover:bg-primary/30 transition-colors flex items-center justify-center gap-2"
                      >
                        <Check className="w-4 h-4" /> Use Recipe
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowChat(!showChat)}
                        className={`flex-1 py-3 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 ${
                          showChat ? 'bg-primary text-primary-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                        }`}
                      >
                        <MessageCircle className="w-4 h-4" /> {showChat ? "Hide Chat" : "Ask AI"}
                      </motion.button>
                    </div>

                    {/* Recipe Chat */}
                    <AnimatePresence>
                      {showChat && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-4 overflow-hidden"
                        >
                          <div className="glass-card rounded-xl p-3">
                            <p className="text-[10px] text-muted-foreground mb-2">💬 Ask about this recipe — e.g. "I don't have flour, what can I use instead?"</p>
                            
                            {chatMessages.length > 0 && (
                              <div className="max-h-60 overflow-y-auto space-y-2 mb-3 pr-1">
                                {chatMessages.map((msg, i) => (
                                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                    <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs whitespace-pre-wrap ${
                                      msg.role === "user"
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-foreground"
                                    }`}>
                                      {msg.content}
                                    </div>
                                  </div>
                                ))}
                                {chatLoading && (
                                  <div className="flex justify-start">
                                    <div className="bg-muted rounded-xl px-3 py-2 text-xs flex items-center gap-1.5">
                                      <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
                                    </div>
                                  </div>
                                )}
                                <div ref={chatEndRef} />
                              </div>
                            )}

                            <div className="flex gap-2">
                              <input
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                                placeholder="e.g. I don't have flour..."
                                className="flex-1 bg-background/50 border border-primary/10 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                              />
                              <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={handleSendChat}
                                disabled={chatLoading || !chatInput.trim()}
                                className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-50"
                              >
                                <Send className="w-3.5 h-3.5" />
                              </motion.button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>

      {(selectedItem || donationItem) && (
        <DonationModal
          isOpen={showDonationModal}
          onClose={() => { setShowDonationModal(false); setDonationItem(null); }}
          itemId={(donationItem || selectedItem)?.id || ""}
          itemName={(donationItem || selectedItem)?.name || ""}
          daysLeft={(donationItem || selectedItem)?.days || 0}
          userWalletAddress={user?.id || "unknown"}
        />
      )}

      <BottomNav />
    </div>
  );
};

export default FridgePage;
