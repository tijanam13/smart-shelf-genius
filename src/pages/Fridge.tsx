import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ChevronRight } from "lucide-react";
import BottomNav from "@/components/BottomNav";

type Urgency = "safe" | "warning" | "urgent";

interface FoodItem {
  emoji: string;
  name: string;
  days: number;
  daysLabel: string;
  urgency: Urgency;
  freshness: number;
  detail: string;
  frozen?: boolean;
}

const allItems: FoodItem[] = [
  { emoji: "🥛", name: "Milk", days: 1, daysLabel: "1 day", urgency: "urgent", freshness: 8, detail: "Use immediately or donate" },
  { emoji: "🫙", name: "Yogurt", days: 2, daysLabel: "2 days", urgency: "warning", freshness: 18, detail: "Plan a meal for tomorrow" },
  { emoji: "🍅", name: "Tomato", days: 3, daysLabel: "3 days", urgency: "warning", freshness: 28, detail: "Great for soup or sauce" },
  { emoji: "🧃", name: "Orange Juice", days: 5, daysLabel: "5 days", urgency: "warning", freshness: 40, detail: "Mix into a smoothie" },
  { emoji: "🧀", name: "Cheese", days: 8, daysLabel: "8 days", urgency: "safe", freshness: 60, detail: "Still fresh" },
  { emoji: "🥬", name: "Cabbage", days: 10, daysLabel: "10 days", urgency: "safe", freshness: 70, detail: "Good condition" },
  { emoji: "🥕", name: "Carrot", days: 12, daysLabel: "12 days", urgency: "safe", freshness: 80, detail: "Plenty of time" },
  { emoji: "🥚", name: "Eggs", days: 14, daysLabel: "14 days", urgency: "safe", freshness: 85, detail: "Well within date" },
  { emoji: "🧈", name: "Butter", days: 20, daysLabel: "20 days", urgency: "safe", freshness: 90, detail: "Long shelf life" },
  { emoji: "🫙", name: "Mayonnaise", days: 30, daysLabel: "30 days", urgency: "safe", freshness: 95, detail: "No rush" },
  { emoji: "🍗", name: "Chicken", days: 90, daysLabel: "90 days ❄", urgency: "safe", freshness: 99, detail: "Frozen — safe", frozen: true },
  { emoji: "🍦", name: "Ice Cream", days: 60, daysLabel: "60 days ❄", urgency: "safe", freshness: 99, detail: "Frozen — safe", frozen: true },
  { emoji: "🥦", name: "Green Peas", days: 45, daysLabel: "45 days ❄", urgency: "safe", freshness: 99, detail: "Frozen — safe", frozen: true },
];

const recipes = [
  { title: "🥞 Milk Pancakes", sub: "Use Milk (1d) + Eggs (14d) + Butter (20d)", time: "15 min · Easy", tokens: 10 },
  { title: "🍲 Tomato Soup", sub: "Use Tomato (3d) + Carrot (12d) + Cabbage (10d)", time: "25 min · Medium", tokens: 15 },
  { title: "🥗 Fresh Citrus Salad", sub: "Use Orange Juice (5d) + Carrot + Cabbage", time: "10 min · Easy", tokens: 8 },
];

type Tab = "overview" | "list" | "recipes";

const urgencyColor: Record<Urgency, string> = {
  safe: "bg-safe",
  warning: "bg-warning",
  urgent: "bg-urgent",
};
const urgencyText: Record<Urgency, string> = {
  safe: "text-safe",
  warning: "text-warning",
  urgent: "text-urgent",
};
const urgencyBadge: Record<Urgency, string> = {
  safe: "bg-safe/15 text-safe",
  warning: "bg-warning/15 text-warning",
  urgent: "bg-urgent/15 text-urgent",
};
const urgencyGlow: Record<Urgency, string> = {
  safe: "",
  warning: "glow-warning",
  urgent: "glow-urgent",
};

const FridgePage = () => {
  const [fridgeOpen, setFridgeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [tooltip, setTooltip] = useState<{ name: string; detail: string } | null>(null);

  const freezerItems = allItems.filter((i) => i.frozen);
  const fridgeItems = allItems.filter((i) => !i.frozen);
  const urgentItems = allItems.filter((i) => i.urgency === "urgent");
  const warnItems = allItems.filter((i) => i.urgency === "warning");
  const safeItems = allItems.filter((i) => i.urgency === "safe");

  const showTooltip = (name: string, detail: string) => {
    setTooltip({ name, detail });
    setTimeout(() => setTooltip(null), 2500);
  };

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden">
      {/* Ambient glow */}
      <div className="absolute top-20 left-1/4 w-[400px] h-[400px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />

      <div className="relative z-10 pb-24 pt-10 px-4 lg:px-8 xl:px-16">
        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="font-display text-2xl font-bold text-foreground">My Fridge</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Digital twin of your fridge</p>
        </motion.div>

        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
          {/* === FRIDGE 3D === */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="flex-shrink-0 self-center lg:self-start"
          >
            <div className="relative" style={{ perspective: "1200px" }}>
              {/* Fridge body */}
              <div
                className="w-[240px] rounded-2xl border border-mint/20 overflow-visible cursor-pointer select-none"
                style={{ boxShadow: "inset -4px 0 8px rgba(0,0,0,0.15), 2px 4px 24px rgba(0,0,0,0.35)" }}
                onClick={() => setFridgeOpen(!fridgeOpen)}
              >
                {/* Freezer compartment */}
                <div className="h-[160px] relative overflow-visible" style={{ background: "linear-gradient(160deg, hsl(155 25% 28%) 0%, hsl(155 30% 20%) 100%)", borderBottom: "2px solid hsl(155 20% 30%)" }}>
                  <div className="text-[10px] text-muted-foreground px-3 pt-2 tracking-wider font-medium">FREEZER</div>

                  {/* Door */}
                  <div
                    className="absolute inset-0 z-10 transition-transform duration-700 ease-[cubic-bezier(.25,.46,.45,.94)] rounded-l-2xl"
                    style={{
                      background: "linear-gradient(160deg, hsl(155 18% 26%) 0%, hsl(155 22% 18%) 100%)",
                      transformOrigin: "left center",
                      transform: fridgeOpen ? "perspective(1200px) rotateY(-110deg)" : "perspective(1200px) rotateY(0deg)",
                      borderRight: "1.5px solid hsl(155 20% 30%)",
                    }}
                  >
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-[5px] h-10 rounded-sm" style={{ background: "hsl(155 15% 40%)" }} />
                    <div className="absolute left-3 top-2 text-sm">❄</div>
                  </div>

                  {/* Interior light */}
                  <div
                    className="absolute inset-x-0 top-0 h-5 z-[1] transition-opacity duration-300 pointer-events-none"
                    style={{
                      background: "linear-gradient(180deg, rgba(180,255,200,0.4) 0%, transparent 100%)",
                      opacity: fridgeOpen ? 1 : 0,
                    }}
                  />

                  {/* Freezer items */}
                  <div className="absolute inset-0 p-2 pt-6 flex items-end gap-2">
                    {freezerItems.map((item) => (
                      <motion.div
                        key={item.name}
                        whileHover={{ y: -2 }}
                        className="flex flex-col items-center cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); showTooltip(item.name, item.detail); }}
                      >
                        <span className="text-2xl">{item.emoji}</span>
                        <span className={`text-[9px] font-bold ${urgencyText[item.urgency]}`}>{item.days}d</span>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Main fridge compartment */}
                <div className="h-[240px] relative overflow-visible" style={{ background: "linear-gradient(160deg, hsl(155 22% 24%) 0%, hsl(155 26% 17%) 100%)" }}>
                  {/* Door */}
                  <div
                    className="absolute inset-0 z-10 transition-transform duration-700 ease-[cubic-bezier(.25,.46,.45,.94)]"
                    style={{
                      background: "linear-gradient(160deg, hsl(155 18% 23%) 0%, hsl(155 22% 16%) 100%)",
                      transformOrigin: "left center",
                      transform: fridgeOpen ? "perspective(1200px) rotateY(-110deg)" : "perspective(1200px) rotateY(0deg)",
                      borderRight: "1.5px solid hsl(155 20% 30%)",
                    }}
                  >
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-[5px] h-10 rounded-sm" style={{ background: "hsl(155 15% 40%)" }} />
                    <div className="absolute left-3 top-3 text-[11px] font-medium tracking-wider text-muted-foreground font-display">EatSmart</div>
                    <div className="absolute left-3 right-3 bottom-10 h-[2px] rounded bg-border/30" />
                    <div className="absolute left-3 right-3 bottom-20 h-[2px] rounded bg-border/30" />
                  </div>

                  {/* Interior light */}
                  <div
                    className="absolute inset-x-0 top-0 h-5 z-[1] transition-opacity duration-300 pointer-events-none"
                    style={{
                      background: "linear-gradient(180deg, rgba(180,255,200,0.4) 0%, transparent 100%)",
                      opacity: fridgeOpen ? 1 : 0,
                    }}
                  />

                  {/* Shelves */}
                  <div className="absolute inset-0 p-2 flex flex-col gap-1">
                    {[
                      fridgeItems.slice(0, 3),
                      fridgeItems.slice(3, 7),
                      fridgeItems.slice(7),
                    ].map((shelf, si) => (
                      <div
                        key={si}
                        className="flex gap-2 items-end px-1 py-1 rounded-sm min-h-[55px]"
                        style={{ background: "rgba(120,190,160,0.12)", borderBottom: "1.5px solid rgba(120,190,160,0.3)" }}
                      >
                        {shelf.map((item) => (
                          <motion.div
                            key={item.name}
                            whileHover={{ y: -2 }}
                            className="flex flex-col items-center cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); showTooltip(item.name, item.detail); }}
                          >
                            <span className="text-xl">{item.emoji}</span>
                            <span className={`text-[8px] font-bold ${urgencyText[item.urgency]} ${item.urgency === "urgent" ? "animate-pulse" : ""}`}>
                              {item.days}d{item.urgency === "urgent" ? "!" : ""}
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Open/close button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setFridgeOpen(!fridgeOpen)}
                className="mt-3 w-[220px] py-2.5 glass-card rounded-xl text-xs font-medium text-foreground"
              >
                🚪 {fridgeOpen ? "Close" : "Open"} Fridge
              </motion.button>

              {/* Tooltip */}
              <AnimatePresence>
                {tooltip && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute -bottom-16 left-1/2 -translate-x-1/2 glass-card-strong rounded-xl px-4 py-2.5 z-30 whitespace-nowrap"
                  >
                    <p className="text-xs font-semibold text-foreground">{tooltip.name}</p>
                    <p className="text-[11px] text-muted-foreground">{tooltip.detail}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* === PANEL === */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex-1 w-full min-w-0"
          >
            {/* Tabs */}
            <div className="flex gap-2 mb-5">
              {(["overview", "list", "recipes"] as Tab[]).map((tab) => (
                <motion.button
                  key={tab}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                    activeTab === tab
                      ? "bg-primary text-primary-foreground"
                      : "glass-card text-muted-foreground"
                  }`}
                >
                  {tab}
                </motion.button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {/* Overview */}
              {activeTab === "overview" && (
                <motion.div
                  key="overview"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  {/* Stats */}
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

                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-3">Alerts</p>
                  {allItems
                    .filter((i) => i.urgency !== "safe")
                    .slice(0, 4)
                    .map((item, idx) => (
                      <motion.div
                        key={item.name}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className={`glass-card rounded-xl p-3 mb-2 flex items-center gap-3 ${urgencyGlow[item.urgency]}`}
                      >
                        <span className="text-2xl flex-shrink-0">{item.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{item.name}</p>
                          <p className="text-[11px] text-muted-foreground">{item.detail}</p>
                          <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
                            <motion.div
                              className={`h-full rounded-full ${urgencyColor[item.urgency]}`}
                              initial={{ width: 0 }}
                              animate={{ width: `${item.freshness}%` }}
                              transition={{ duration: 0.8, delay: 0.2 + idx * 0.05 }}
                            />
                          </div>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${urgencyBadge[item.urgency]}`}>
                          {item.daysLabel}
                        </span>
                      </motion.div>
                    ))}

                  <p className="text-[11px] text-muted-foreground mt-4 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Click on items in the fridge for details
                  </p>
                </motion.div>
              )}

              {/* List */}
              {activeTab === "list" && (
                <motion.div
                  key="list"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-3">All Items</p>
                  {allItems.map((item, idx) => (
                    <motion.div
                      key={item.name}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className="glass-card rounded-xl p-3 mb-2 flex items-center gap-3"
                    >
                      <span className="text-xl flex-shrink-0">{item.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full ${urgencyColor[item.urgency]}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${item.freshness}%` }}
                            transition={{ duration: 0.6, delay: idx * 0.03 }}
                          />
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${urgencyBadge[item.urgency]}`}>
                        {item.daysLabel}
                      </span>
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {/* Recipes */}
              {activeTab === "recipes" && (
                <motion.div
                  key="recipes"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-3">
                    AI Suggestions — use before they expire
                  </p>
                  {recipes.map((r, idx) => (
                    <motion.div
                      key={r.title}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.08 }}
                      whileHover={{ scale: 1.01 }}
                      className="glass-card rounded-xl p-4 mb-3 cursor-pointer"
                    >
                      <p className="text-sm font-medium text-foreground">{r.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">{r.sub}</p>
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-[11px] text-muted-foreground">⏱ {r.time}</span>
                        <span className="text-[11px] font-semibold text-token bg-token/10 px-2 py-0.5 rounded-full">
                          +{r.tokens} 🪙
                        </span>
                      </div>
                    </motion.div>
                  ))}

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className="w-full glass-card rounded-xl py-2.5 text-xs font-medium text-foreground flex items-center justify-center gap-1.5 mt-1"
                  >
                    Generate more recipes
                    <ChevronRight className="h-3.5 w-3.5" />
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default FridgePage;
