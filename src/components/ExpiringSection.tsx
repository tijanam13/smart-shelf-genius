import { motion } from "framer-motion";
import { AlertTriangle, Clock } from "lucide-react";

const expiringItems = [
  { emoji: "🥛", name: "Milk", days: 1, urgency: "urgent" as const },
  { emoji: "🫙", name: "Yogurt", days: 2, urgency: "warning" as const },
  { emoji: "🍅", name: "Tomato", days: 3, urgency: "warning" as const },
];

const urgencyStyles = {
  urgent: "border-urgent/30 glow-urgent",
  warning: "border-warning/20 glow-warning",
  safe: "border-safe/20",
};

const urgencyBadgeStyles = {
  urgent: "bg-urgent/15 text-urgent",
  warning: "bg-warning/15 text-warning",
  safe: "bg-safe/15 text-safe",
};

const ExpiringSection = () => {
  return (
    <div className="px-5 mt-6 lg:px-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-urgent" />
          <h3 className="font-display text-sm font-semibold text-foreground">
            Expiring Soon
          </h3>
        </div>
        <span className="text-[10px] text-muted-foreground">{expiringItems.length} items</span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
        {expiringItems.map((item, idx) => (
          <motion.div
            key={item.name}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.08 }}
            whileHover={{ scale: 1.03, y: -2 }}
            className={`glass-card rounded-2xl p-4 min-w-[130px] flex-shrink-0 cursor-pointer border ${urgencyStyles[item.urgency]}`}
          >
            <span className="text-3xl block mb-2">{item.emoji}</span>
            <p className="text-sm font-medium text-foreground">{item.name}</p>
            <div className="flex items-center gap-1 mt-1.5">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${urgencyBadgeStyles[item.urgency]}`}>
                {item.days === 1 ? "1 day" : `${item.days} days`}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default ExpiringSection;
