import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface DonationModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId: string;
  itemName: string;
  daysLeft: number;
  quantity?: number;
  unit?: string;
  userWalletAddress: string;
}

const DonationModal: React.FC<DonationModalProps> = ({
  isOpen,
  onClose,
  itemId,
  itemName,
  daysLeft,
  quantity = 1,
  unit = 'pcs',
  userWalletAddress,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const isCritical = daysLeft <= 5 && daysLeft >= 0;
  const isExpired = daysLeft < 0;
  const bonusTokens = isCritical ? 5 : 3;

  const qrData = JSON.stringify({
    itemId,
    itemName,
    isCritical,
    userWalletAddress,
  });

  const handleDonate = async () => {
    if (!user) return;

    try {
      // Record donation
      await supabase.from('donations').insert({
        user_id: user.id,
        item_name: itemName,
        quantity,
        unit,
      });

      // Add bonus tokens
      const { data: existing } = await supabase
        .from('user_tokens')
        .select('total_tokens')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('user_tokens')
          .update({ total_tokens: (existing as any).total_tokens + bonusTokens, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('user_tokens')
          .insert({ user_id: user.id, total_tokens: bonusTokens });
      }

      // Remove item from fridge
      await supabase.from('fridge_items').delete().eq('id', itemId);

      toast({
        title: "Donated! 🎉",
        description: `You earned +${bonusTokens} 🪙 tokens for donating ${itemName}!`,
      });

      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 z-[9998] backdrop-blur-md"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 60 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: 60 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none"
      >
        <div className={`w-full max-w-sm rounded-3xl p-7 shadow-2xl pointer-events-auto flex flex-col items-center transition-all ${
          isCritical
            ? 'glass-card-strong bg-warning/10 border border-warning/30'
            : 'glass-card-strong'
        }`}>
          <div className="absolute top-5 right-5">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-6 h-6" />
            </motion.button>
          </div>

          {isCritical && (
            <div className="mb-3 px-3 py-1 rounded-full bg-warning/20 text-warning text-xs font-semibold">
              ⏰ Priority Donation (+{bonusTokens} Tokens)
            </div>
          )}

          <h2 className="text-xl font-bold text-foreground mt-2 text-center">
            {isExpired ? '🗑️ Item Expired' : '🎁 Donate Item'}
          </h2>

          <div className="mt-4 mb-6 text-center">
            <p className="text-lg font-semibold text-foreground">{itemName}</p>
            {isCritical && (
              <p className="text-sm text-warning mt-2 font-medium">
                ⏰ Expires in {daysLeft} days
              </p>
            )}
          </div>

          {!isExpired && (
            <div className="mb-6 text-center">
              <p className="text-sm text-muted-foreground">
                Scan this QR code at the donation center to earn your tokens. 🌍
              </p>
            </div>
          )}

          {!isExpired && (
            <div className="bg-white rounded-2xl p-5 mb-6">
              <QRCodeSVG
                value={qrData}
                size={200}
                level="H"
                includeMargin={true}
                fgColor="#000000"
                bgColor="#ffffff"
              />
            </div>
          )}

          {isExpired && (
            <div className="mb-6 text-center px-4 py-3 rounded-lg bg-urgent/10 border border-urgent/20">
              <p className="text-sm text-urgent">
                This item has expired and should be removed from your fridge.
              </p>
            </div>
          )}

          {!isExpired && (
            <div className="w-full text-center mb-4 space-y-1 text-xs text-muted-foreground">
              <p>✅ Earn +{bonusTokens} tokens for donating</p>
              <p>🎁 Help others in need</p>
              <p>🌱 Impact your planet growth</p>
            </div>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            onClick={isExpired ? onClose : handleDonate}
            className="w-full py-3 rounded-lg bg-primary/20 text-primary text-sm font-bold hover:bg-primary/30 transition-colors mt-auto"
          >
            {isExpired ? 'Close' : '🎁 Confirm Donation'}
          </motion.button>
        </div>
      </motion.div>
    </>
  );
};

export default DonationModal;
