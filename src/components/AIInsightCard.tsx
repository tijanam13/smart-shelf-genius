import { motion } from "framer-motion";
import { Sparkles, ChevronRight } from "lucide-react";

const AIInsightCard = () => {
  return (
    <div className="px-5 mt-5 lg:px-0">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        whileHover={{ scale: 1.01 }}
        className="relative glass-card-strong rounded-2xl p-5 overflow-hidden cursor-pointer"
      >
        {/* Glow accent */}
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <div className="flex items-start gap-3 relative z-10">
          <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-primary font-semibold uppercase tracking-wider">AI Predlog</p>
            <p className="text-sm font-medium text-foreground mt-1">
              Napravi palačinke od mleka! 🥞
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Mleko ističe sutra. Iskoristi ga sa jajima i brašnom za ukusan doručak.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <span className="text-[10px] text-muted-foreground">⏱ 15 min</span>
              <span className="text-[10px] text-muted-foreground">·</span>
              <span className="text-[10px] font-semibold text-token">+10 🪙</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
        </div>
      </motion.div>
    </div>
  );
};

export default AIInsightCard;
