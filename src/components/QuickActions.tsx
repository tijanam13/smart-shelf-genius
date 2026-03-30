import { motion } from "framer-motion";
import { Camera, QrCode, Plus, ShoppingCart } from "lucide-react";

const actions = [
  { icon: Camera, label: "Skeniraj račun", color: "bg-primary/15 text-primary" },
  { icon: QrCode, label: "Bar-kod", color: "bg-coral/15 text-coral" },
  { icon: Plus, label: "Dodaj ručno", color: "bg-cream/15 text-cream" },
  { icon: ShoppingCart, label: "Lista za kupovinu", color: "bg-token/15 text-token" },
];

const QuickActions = () => {
  return (
    <div className="px-5 mt-6 lg:px-0">
      <h3 className="font-display text-sm font-semibold text-foreground mb-3">
        Brze akcije
      </h3>
      <div className="grid grid-cols-4 gap-2.5">
        {actions.map((action, idx) => (
          <motion.button
            key={action.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + idx * 0.05 }}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            className="glass-card rounded-2xl p-3 flex flex-col items-center gap-2 cursor-pointer"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${action.color}`}>
              <action.icon className="w-5 h-5" />
            </div>
            <span className="text-[10px] text-muted-foreground font-medium text-center leading-tight">
              {action.label}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default QuickActions;
