import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface FridgeItem {
  id: string;
  name: string;
  category: string;
  expiry_date: string | null;
  gtin_code: string | null;
  quantity: number;
  unit: string;
  status: string;
  created_at: string;
  user_id: string;
}

export function formatQtyUnit(quantity: number, unit: string): string {
  const display = Number.isInteger(quantity) ? quantity.toString() : quantity.toFixed(1);
  return `${display} ${unit}`;
}

export function getConsumeStep(unit: string): number {
  if (unit === "g" || unit === "ml") return 100;
  if (unit === "kg" || unit === "l") return 0.1;
  return 1;
}

export function useFridgeItems() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["fridge_items", user?.id],
    queryFn: async (): Promise<FridgeItem[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("fridge_items")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "in_fridge")
        .order("expiry_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data as FridgeItem[]) || [];
    },
    enabled: !!user,
  });
}

export function getUrgency(expiryDate: string | null): "urgent" | "warning" | "safe" {
  if (!expiryDate) return "safe";
  const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= 2) return "urgent";
  if (days <= 5) return "warning";
  return "safe";
}

export function getDaysLeft(expiryDate: string | null): number {
  if (!expiryDate) return 999;
  return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function getCategoryEmoji(category: string): string {
  const map: Record<string, string> = {
    Dairy: "🥛", Meat: "🥩", Fruit: "🍎", Vegetable: "🥬",
    Bakery: "🍞", Pantry: "🫙", Beverage: "🧃", Other: "📦",
  };
  return map[category] || "📦";
}
