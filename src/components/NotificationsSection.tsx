import { motion, AnimatePresence } from "framer-motion";
import { Bell, Eye, Trash2, ChevronDown, ChevronUp, Trash } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { useState } from "react";

const NotificationsSection = () => {
  const { notifications, allNotifications, markAsRead, deleteNotification, clearAll } = useNotifications();
  const [showRead, setShowRead] = useState(false);

  const readNotifications = allNotifications.filter((n) => n.readAt && !n.deletedAt);

  if (notifications.length === 0 && readNotifications.length === 0) return null;

  return (
    <div className="px-5 mt-6 lg:px-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <h3 className="font-display text-sm font-semibold text-foreground">
            Notifications
          </h3>
          {notifications.length > 0 && (
            <span className="bg-urgent text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
              {notifications.length}
            </span>
          )}
        </div>
        {allNotifications.filter((n) => !n.deletedAt).length > 0 && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={clearAll}
            className="text-[10px] text-urgent flex items-center gap-1 hover:bg-urgent/10 px-2 py-1 rounded-lg transition-colors"
          >
            <Trash className="w-3 h-3" />
            Clear All
          </motion.button>
        )}
      </div>

      <div className="space-y-2">
        {/* Active (unread) notifications */}
        <AnimatePresence>
          {notifications.map((n, idx) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ delay: idx * 0.05 }}
              className="glass-card rounded-xl p-3 border-l-4 border-urgent bg-urgent/5"
            >
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-urgent mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{n.itemName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-1">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => markAsRead(n.id)}
                    className="p-1.5 text-muted-foreground hover:text-primary transition-colors hover:bg-primary/10 rounded-lg"
                    title="Označi kao pročitano"
                  >
                    <Eye className="w-4 h-4" />
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => deleteNotification(n.id)}
                    className="p-1.5 text-muted-foreground hover:text-urgent transition-colors hover:bg-urgent/10 rounded-lg"
                    title="Obriši"
                  >
                    <Trash2 className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Read notifications toggle */}
        {readNotifications.length > 0 && (
          <>
            <button
              onClick={() => setShowRead(!showRead)}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 hover:text-muted-foreground transition-colors w-full py-1"
            >
              {showRead ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Read ({readNotifications.length})
            </button>
            <AnimatePresence>
              {showRead && readNotifications.map((n) => (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="glass-card rounded-xl p-3 opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">{n.itemName}</p>
                      <p className="text-[10px] text-muted-foreground/50">{new Date(n.createdAt).toLocaleDateString()}</p>
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => deleteNotification(n.id)}
                      className="p-1 text-muted-foreground hover:text-urgent transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
};

export default NotificationsSection;
