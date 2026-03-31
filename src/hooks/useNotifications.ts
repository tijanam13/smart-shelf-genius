import { useEffect, useState, useCallback } from 'react';
import { useFridgeItems, getDaysLeft } from './useFridgeItems';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

export interface Notification {
  id: string;
  itemId: string;
  itemName: string;
  message: string;
  level: 'warning' | 'high-priority';
  daysLeft: number;
  createdAt: string;
  readAt: string | null;
  deletedAt: string | null;
  date: string; // YYYY-MM-DD format for duplicate prevention
}

const NOTIFICATION_STORAGE_KEY = 'smart-shelf-notifications';
const NOTIFICATION_DATES_KEY = 'smart-shelf-notification-dates';

// Placeholder notification sound - using Web Audio API
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Create a pleasant notification sound (3 beeps)
    oscillator.frequency.value = 800;
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);

    // Second beep
    const osc2 = audioContext.createOscillator();
    osc2.connect(gainNode);
    osc2.frequency.value = 900;
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + 0.15);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
    osc2.start(audioContext.currentTime + 0.15);
    osc2.stop(audioContext.currentTime + 0.25);
  } catch (error) {
    console.log('Notification sound not available');
  }
};

export const useNotifications = () => {
  const { user } = useAuth();
  const { data: fridgeItems = [] } = useFridgeItems();
  const queryClient = useQueryClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasNewNotification, setHasNewNotification] = useState(false);

  // Load notifications from localStorage
  const loadNotifications = useCallback(() => {
    if (!user?.id) return;
    try {
      const stored = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Filter to only this user's notifications
        const userNotifications = parsed.filter((n: Notification) => n.itemId.startsWith(user.id));
        setNotifications(userNotifications);
        const unread = userNotifications.filter((n: Notification) => !n.readAt && !n.deletedAt).length;
        setUnreadCount(unread);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }, [user?.id]);

  // Save notifications to localStorage
  const saveNotifications = useCallback((notifs: Notification[]) => {
    try {
      localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notifs));
    } catch (error) {
      console.error('Error saving notifications:', error);
    }
  }, []);

  // Check if we already have a notification for this item today
  const hasTodayNotification = useCallback((itemId: string, level: 'warning' | 'high-priority'): boolean => {
    const today = new Date().toISOString().split('T')[0];
    return notifications.some(
      (n) => n.itemId === itemId && n.level === level && n.date === today && !n.deletedAt
    );
  }, [notifications]);

  // Create new notification
  const createNotification = useCallback((
    itemId: string,
    itemName: string,
    level: 'warning' | 'high-priority',
    daysLeft: number
  ) => {
    const today = new Date().toISOString().split('T')[0];
    
    // Prevent duplicates
    if (hasTodayNotification(itemId, level)) {
      return;
    }

    const message = level === 'warning'
      ? `Item ${itemName} expires in ${daysLeft} days. Consider using it soon.`
      : `⚠️ High Priority: ${itemName} expires in ${daysLeft} days. Donate it now to earn bonus tokens!`;

    const newNotification: Notification = {
      id: `${itemId}-${level}-${Date.now()}`,
      itemId,
      itemName,
      message,
      level,
      daysLeft,
      createdAt: new Date().toISOString(),
      readAt: null,
      deletedAt: null,
      date: today,
    };

    const updated = [newNotification, ...notifications];
    setNotifications(updated);
    saveNotifications(updated);
    setHasNewNotification(true);
    playNotificationSound();

    // Reset new notification flag after a moment
    setTimeout(() => setHasNewNotification(false), 3000);
  }, [notifications, hasTodayNotification, saveNotifications]);

  // Check items and generate notifications
  useEffect(() => {
    if (!fridgeItems.length || !user) return;

    fridgeItems.forEach((item) => {
      const days = getDaysLeft(item.expiry_date);

      // Skip expired items
      if (days < 0) return;

      // Level 1: Warning at 10 days
      if (days <= 10 && days > 5) {
        createNotification(item.id, item.name, 'warning', days);
      }

      // Level 2: High priority at 5 days or less (daily persistent)
      if (days <= 5 && days >= 0) {
        createNotification(item.id, item.name, 'high-priority', days);
      }
    });
  }, [fridgeItems, user, createNotification]);

  // Load notifications on component mount
  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Update unread count
  useEffect(() => {
    const unread = notifications.filter((n) => !n.readAt && !n.deletedAt).length;
    setUnreadCount(unread);
  }, [notifications]);

  // Mark notification as read
  const markAsRead = useCallback((notificationId: string) => {
    const updated = notifications.map((n) =>
      n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n
    );
    setNotifications(updated);
    saveNotifications(updated);
  }, [notifications, saveNotifications]);

  // Delete notification
  const deleteNotification = useCallback((notificationId: string) => {
    const updated = notifications.map((n) =>
      n.id === notificationId ? { ...n, deletedAt: new Date().toISOString() } : n
    );
    setNotifications(updated);
    saveNotifications(updated);
  }, [notifications, saveNotifications]);

  // Clear all notifications
  const clearAll = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    const updated = notifications.map((n) =>
      n.date === today ? { ...n, deletedAt: new Date().toISOString() } : n
    );
    setNotifications(updated);
    saveNotifications(updated);
  }, [notifications, saveNotifications]);

  // Mark item as consumed (used) - updates fridge item status and removes notification
  const markAsConsumed = useCallback(async (notificationId: string) => {
    const notif = notifications.find((n) => n.id === notificationId);
    if (notif) {
      // Find the actual fridge item by name (since notif.itemId may be prefixed with user id)
      const fridgeItem = fridgeItems.find((fi) => fi.name === notif.itemName);
      if (fridgeItem) {
        await supabase.from('fridge_items').update({ status: 'consumed' }).eq('id', fridgeItem.id);
        queryClient.invalidateQueries({ queryKey: ['fridge_items'] });
      }
    }
    // Remove notification
    const updated = notifications.map((n) =>
      n.id === notificationId ? { ...n, deletedAt: new Date().toISOString() } : n
    );
    setNotifications(updated);
    saveNotifications(updated);
  }, [notifications, fridgeItems, saveNotifications, queryClient]);

  // Mark item as thrown away (wasted) - updates fridge item status and removes notification
  const markAsDiscarded = useCallback(async (notificationId: string) => {
    const notif = notifications.find((n) => n.id === notificationId);
    if (notif) {
      const fridgeItem = fridgeItems.find((fi) => fi.name === notif.itemName);
      if (fridgeItem) {
        await supabase.from('fridge_items').update({ status: 'discarded' }).eq('id', fridgeItem.id);
        queryClient.invalidateQueries({ queryKey: ['fridge_items'] });
      }
    }
    const updated = notifications.map((n) =>
      n.id === notificationId ? { ...n, deletedAt: new Date().toISOString() } : n
    );
    setNotifications(updated);
    saveNotifications(updated);
  }, [notifications, fridgeItems, saveNotifications, queryClient]);

  // Get active notifications (not read, not deleted)
  const activeNotifications = notifications.filter((n) => !n.readAt && !n.deletedAt);

  return {
    notifications: activeNotifications,
    allNotifications: notifications,
    unreadCount,
    hasNewNotification,
    markAsRead,
    deleteNotification,
    clearAll,
    markAsConsumed,
    markAsDiscarded,
  };
};
