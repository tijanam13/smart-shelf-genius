/**
 * src/components/DonationModal.tsx
 *
 * Shown to the regular user (donor) when they click "Donate" on a fridge item.
 * Displays a QR code that the admin scans to confirm the donation.
 * Auto-closes when the item is deleted from fridge (after admin blockchain confirmation).
 */

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, QrCode, CheckCircle, AlertTriangle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

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
  unit = "pcs",
  userWalletAddress,
}) => {
  const [confirmed, setConfirmed] = useState(false);
  const [localWallet, setLocalWallet] = useState(userWalletAddress || "");
  const isCritical = daysLeft <= 5 && daysLeft >= 0;
  const isExpired = daysLeft < 0;
  const bonusTokens = isCritical ? 5 : 3;
  const hasValidWallet = /^0x[a-fA-F0-9]{40}$/.test(localWallet);

  // QR code payload — admin scans this to confirm the donation
  const qrData = JSON.stringify({
    itemId,
    itemName,
    isCritical,
    bonusTokens,
    userWalletAddress: localWallet,
    action: "food_donation",
    network: "sepolia",
  });

  // Listen for realtime DELETE on this fridge item — means admin confirmed donation
  useEffect(() => {
    if (!isOpen || !itemId) return;

    const channel = supabase
      .channel(`donation-watch-${itemId}`)
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "fridge_items",
          filter: `id=eq.${itemId}`,
        },
        () => {
          // Item was deleted by admin after blockchain confirmation
          setConfirmed(true);
          // Auto-close after showing success for 3 seconds
          setTimeout(() => {
            setConfirmed(false);
            onClose();
          }, 3500);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, itemId, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 z-[9998] backdrop-blur-md"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 60 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: 60 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          className={`w-full max-w-sm rounded-3xl p-7 shadow-2xl pointer-events-auto flex flex-col items-center relative overflow-y-auto max-h-[90vh] transition-all ${
            isCritical ? "glass-card-strong bg-warning/10 border border-warning/30" : "glass-card-strong"
          }`}
        >
          {/* Close button */}
          <div className="absolute top-5 right-5">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-6 h-6" />
            </motion.button>
          </div>

          <AnimatePresence mode="wait">
            {confirmed ? (
              <motion.div
                key="confirmed"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full flex flex-col items-center py-6"
              >
                <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
                <h2 className="text-xl font-bold text-foreground">Donation Confirmed! 🎉</h2>
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  The admin verified your donation on the blockchain. You earned <strong>+{bonusTokens} tokens</strong>!
                </p>
                <p className="text-xs text-muted-foreground mt-3">Closing automatically...</p>
              </motion.div>
            ) : (
            <motion.div
              key="info"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full flex flex-col items-center"
            >
              {isCritical && (
                <div className="mb-3 px-3 py-1 rounded-full bg-warning/20 text-warning text-xs font-semibold">
                  ⏰ Priority Donation (+{bonusTokens} Tokens)
                </div>
              )}

              <h2 className="text-xl font-bold text-foreground mt-2 text-center">
                {isExpired ? "🗑️ Item Expired" : "🎁 Donate Item"}
              </h2>

              <div className="mt-4 mb-4 text-center">
                <p className="text-lg font-semibold text-foreground">{itemName}</p>
                {isCritical && <p className="text-sm text-warning mt-1 font-medium">⏰ Expires in {daysLeft} days</p>}
              </div>

              {!isExpired && (
                <>
                  {/* Wallet warning + manual input */}
                  {!hasValidWallet && (
                    <div className="w-full mb-4 px-4 py-3 rounded-xl bg-warning/10 border border-warning/30">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-warning" />
                        <p className="text-xs font-semibold text-warning">Wallet address required</p>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Add your MetaMask wallet address on the Profile page, or enter it below:
                      </p>
                      <Input
                        value={localWallet}
                        onChange={(e) => setLocalWallet(e.target.value)}
                        placeholder="0x..."
                        className="font-mono text-xs h-9"
                      />
                    </div>
                  )}

                  {/* Instructions */}
                  <div className="w-full mb-4 px-4 py-3 rounded-xl bg-primary/5 border border-primary/20 text-center">
                    <QrCode className="w-5 h-5 text-primary mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">
                      Show this QR code to the{" "}
                      <span className="font-semibold text-foreground">donation center admin</span> — they will scan it
                      and confirm your donation.
                    </p>
                  </div>

                  {/* QR Code */}
                  <div className={`bg-white rounded-2xl p-4 mb-4 shadow-sm ${!hasValidWallet ? 'opacity-40 pointer-events-none' : ''}`}>
                    <QRCodeSVG
                      value={qrData}
                      size={190}
                      level="H"
                      includeMargin={true}
                      fgColor="#000000"
                      bgColor="#ffffff"
                    />
                  </div>

                  {/* Token reward info */}
                  <div className="w-full text-center mb-4 space-y-1 text-xs text-muted-foreground">
                    <p>✅ You earn +{bonusTokens} tokens when confirmed</p>
                    <p>🌱 Helps reduce food waste</p>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={onClose}
                    className="w-full py-3 rounded-xl bg-muted/30 text-muted-foreground text-sm font-bold hover:bg-muted/50 transition-colors"
                  >
                    Close
                  </motion.button>
                </>
              )}

              {isExpired && (
                <>
                  <div className="mb-6 text-center px-4 py-3 rounded-lg bg-urgent/10 border border-urgent/20">
                    <p className="text-sm text-urgent">This item has expired and should be removed from your fridge.</p>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={onClose}
                    className="w-full py-3 rounded-lg bg-primary/20 text-primary text-sm font-bold hover:bg-primary/30 transition-colors"
                  >
                    Close
                  </motion.button>
                </>
              )}
            </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
};

export default DonationModal;
