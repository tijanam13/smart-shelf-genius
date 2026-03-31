import { motion } from "framer-motion";
import { Sparkles, ChevronRight, Clock } from "lucide-react";

interface Recipe {
  title: string;
  sub?: string;
  ingredients?: string[];
  instructions?: string[];
  time: string;
  difficulty?: string;
  tokens: number;
}

interface AIInsightCardProps {
  onRecipeClick?: (recipe: Recipe) => void;
}

const AIInsightCard = ({ onRecipeClick }: AIInsightCardProps) => {
  // Default recipe - can be replaced with dynamic data later
  const suggestedRecipe: Recipe = {
    title: "🥞 Milk Pancakes",
    sub: "Use Milk + Eggs + Butter",
    ingredients: ["1 cup Milk", "2 Eggs", "1 tbsp Butter (melted)", "1 cup Flour", "1 tbsp Sugar", "Pinch of salt"],
    instructions: ["Mix flour, sugar, and salt.", "Whisk eggs and milk, combine with dry ingredients.", "Add melted butter, stir until smooth.", "Heat pan, pour 1/4 cup batter per pancake.", "Cook until bubbles form, flip and cook 1-2 min.", "Serve with syrup or fruit."],
    time: "15 min",
    difficulty: "Easy",
    tokens: 10,
  };

  return (
    <div className="px-5 mt-5 lg:px-0">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        whileHover={{ scale: 1.01 }}
        onClick={() => onRecipeClick?.(suggestedRecipe)}
        className="relative glass-card-strong rounded-2xl p-5 overflow-hidden cursor-pointer"
      >
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <div className="flex items-start gap-3 relative z-10">
          <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-primary font-semibold uppercase tracking-wider">AI Suggestion</p>
            <p className="text-sm font-medium text-foreground mt-1">
              {suggestedRecipe.title}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {suggestedRecipe.sub}
            </p>
            <div className="flex items-center gap-2 mt-3">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> {suggestedRecipe.time}
              </span>
              <span className="text-[10px] text-muted-foreground">·</span>
              <span className="text-[10px] font-semibold text-token">+{suggestedRecipe.tokens} 🪙</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
        </div>
      </motion.div>
    </div>
  );
};

export default AIInsightCard;
