import { motion } from "framer-motion";
import { Bell, Leaf } from "lucide-react";

const Header = () => {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-5 pt-12 pb-4 lg:px-8 xl:px-16 2xl:px-24"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
            <Leaf className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold text-foreground tracking-tight">
              EatSmart
            </h1>
            <p className="text-[10px] text-muted-foreground -mt-0.5">
              Zero waste living
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="relative"
          >
            <div className="w-9 h-9 glass-card rounded-xl flex items-center justify-center cursor-pointer">
              <Bell className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-urgent rounded-full border-2 border-background" />
          </motion.div>
          <div className="w-9 h-9 rounded-xl bg-primary/30 flex items-center justify-center text-sm font-semibold text-primary-foreground font-display">
            A
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-5"
      >
        <p className="text-muted-foreground text-sm">Zdravo, Anđela 👋</p>
        <h2 className="font-display text-xl font-bold text-foreground mt-0.5">
          Tvoj frižider na dlanu
        </h2>
      </motion.div>
    </motion.header>
  );
};

export default Header;
