/**
 * src/components/DonationModal.tsx
 *
 * Shown to the regular user (donor) when they click "Donate" on a fridge item.
 * Displays a QR code that the admin scans to confirm the donation on the blockchain.
 * The donor can also self-confirm if they have MetaMask connected.
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, Loader2, CheckCircle, AlertCircle, Wallet, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { recordDonationOnChain, isMetaMaskInstalled, connectMetaMask, type DonationResult } from "@/lib/blockchain";

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

type Step = "info" | "processing" | "success" | "error";

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
  const { user } = useAuth();
  const { toast } = useToast();

  const isCritical = daysLeft <= 5 && daysLeft >= 0;
  const isExpired = daysLeft < 0;
  const bonusTokens = isCritical ? 5 : 3;

  const [step, setStep] = useState<Step>("info");
  const [txResult, setTxResult] = useState<DonationResult | null>(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState("");

  // QR code payload — admin scans this to confirm the donation
  const qrData = JSON.stringify({
    itemId,
    itemName,
    isCritical,
    bonusTokens,
    userWalletAddress,
    action: "food_donation",
    network: "sepolia",
  });

  // ─── CONNECT METAMASK ────────────────────────────────────────────────
  const handleConnectWallet = async () => {
    try {
      const address = await connectMetaMask();
      if (address) {
        setConnectedAddress(address);
        setWalletConnected(true);
        toast({
          title: "✅ MetaMask Connected",
          description: `Wallet: ${address.slice(0, 8)}...${address.slice(-6)}`,
        });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // ─── SELF-CONFIRM ON BLOCKCHAIN (donor confirms themselves) ──────────
  const handleSelfConfirm = async () => {
    if (!user || !connectedAddress) return;
    setStep("processing");

    const result = await recordDonationOnChain(connectedAddress, itemName, isCritical);
    setTxResult(result);

    if (!result.success) {
      setStep("error");
      return;
    }

    // Sync to Supabase
    try {
      await supabase.from("donations").insert({
        user_id: user.id,
        item_name: itemName,
        quantity,
        unit,
      });

      await supabase.rpc('adjust_user_tokens', {
        _user_id: user.id,
        _token_delta: bonusTokens,
        _point_delta: bonusTokens,
      });

      await supabase.from("fridge_items").delete().eq("id", itemId);
    } catch (err: any) {
      console.error("Supabase sync error:", err.message);
    }

    setStep("success");
  };

  const handleClose = () => {
    setStep("info");
    setTxResult(null);
    setWalletConnected(false);
    setConnectedAddress("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
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
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-6 h-6" />
            </motion.button>
          </div>

          <AnimatePresence mode="wait">
            {/* ── INFO STEP ── */}
            {step === "info" && (
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
                    {/* Instructions */}
                    <div className="w-full mb-4 px-4 py-3 rounded-xl bg-primary/5 border border-primary/20 text-center">
                      <QrCode className="w-5 h-5 text-primary mx-auto mb-1" />
                      <p className="text-xs text-muted-foreground">
                        Show this QR code to the{" "}
                        <span className="font-semibold text-foreground">donation center admin</span> — they will scan it
                        and confirm your donation on the blockchain.
                      </p>
                    </div>

                    {/* QR Code */}
                    <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
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
                      <p>🔗 Recorded permanently on Sepolia blockchain</p>
                      <p>🌱 Helps reduce food waste</p>
                    </div>

                    {/* Divider */}
                    <div className="w-full flex items-center gap-3 mb-4">
                      <div className="flex-1 h-px bg-border/50" />
                      <span className="text-xs text-muted-foreground">or confirm yourself</span>
                      <div className="flex-1 h-px bg-border/50" />
                    </div>

                    {/* Self-confirm with MetaMask */}
                    {isMetaMaskInstalled() ? (
                      walletConnected ? (
                        <>
                          <div className="w-full mb-3 px-3 py-2 rounded-xl bg-safe/10 border border-safe/30 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-safe shrink-0" />
                            <p className="text-xs text-safe">
                              <span className="font-semibold">MetaMask connected</span>
                              <br />
                              <span className="font-mono">
                                {connectedAddress.slice(0, 8)}...{connectedAddress.slice(-6)}
                              </span>
                            </p>
                          </div>
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={handleSelfConfirm}
                            className="w-full py-3 rounded-xl bg-primary/20 text-primary text-sm font-bold hover:bg-primary/30 transition-colors flex items-center justify-center gap-2"
                          >
                            🎁 Confirm Myself on Blockchain
                          </motion.button>
                        </>
                      ) : (
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={handleConnectWallet}
                          className="w-full py-2.5 rounded-xl bg-orange-500/20 text-orange-400 text-sm font-bold hover:bg-orange-500/30 transition-colors flex items-center justify-center gap-2"
                        >
                          <Wallet className="w-4 h-4" />
                          Connect MetaMask to Self-Confirm
                        </motion.button>
                      )
                    ) : (
                      <p className="text-[11px] text-muted-foreground text-center">
                        MetaMask not installed — use the admin scanner to confirm.
                      </p>
                    )}
                  </>
                )}

                {isExpired && (
                  <>
                    <div className="mb-6 text-center px-4 py-3 rounded-lg bg-urgent/10 border border-urgent/20">
                      <p className="text-sm text-urgent">
                        This item has expired and should be removed from your fridge.
                      </p>
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={handleClose}
                      className="w-full py-3 rounded-lg bg-primary/20 text-primary text-sm font-bold hover:bg-primary/30 transition-colors"
                    >
                      Close
                    </motion.button>
                  </>
                )}
              </motion.div>
            )}

            {/* ── PROCESSING STEP ── */}
            {step === "processing" && (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full flex flex-col items-center py-8 gap-5"
              >
                <Loader2 className="w-14 h-14 text-primary animate-spin" />
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground">Sending to Blockchain...</p>
                  <p className="text-sm text-muted-foreground mt-2">Confirm the transaction in MetaMask</p>
                  <p className="text-xs text-muted-foreground mt-1">Wait ~15 seconds after confirming</p>
                </div>
              </motion.div>
            )}

            {/* ── SUCCESS STEP ── */}
            {step === "success" && txResult && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="w-full flex flex-col items-center py-4 gap-4"
              >
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.1 }}>
                  <CheckCircle className="w-16 h-16 text-safe" />
                </motion.div>

                <div className="text-center">
                  <p className="text-xl font-bold text-foreground">Donation Confirmed! 🎉</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {itemName} has been recorded on Sepolia blockchain
                  </p>
                </div>

                <div className="w-full py-3 rounded-xl bg-primary/10 border border-primary/20 text-center">
                  <p className="text-2xl font-bold text-primary">+{txResult.tokensAwarded} 🪙</p>
                  <p className="text-xs text-muted-foreground mt-1">tokens added to your account</p>
                </div>

                {txResult.txHash && (
                  <div className="w-full space-y-1">
                    <p className="text-xs text-muted-foreground text-center">Transaction Hash:</p>
                    <div className="px-3 py-2 rounded-lg bg-muted/30 border border-border/30 text-center">
                      <p className="text-[10px] font-mono text-foreground break-all">
                        {txResult.txHash.slice(0, 22)}...{txResult.txHash.slice(-10)}
                      </p>
                    </div>
                  </div>
                )}

                {txResult.etherscanUrl && (
                  <a
                    href={txResult.etherscanUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3 rounded-xl bg-blue-500/15 text-blue-400 text-sm font-bold hover:bg-blue-500/25 transition-colors flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View on Etherscan
                  </a>
                )}

                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleClose}
                  className="w-full py-3 rounded-xl bg-primary/20 text-primary text-sm font-bold hover:bg-primary/30 transition-colors"
                >
                  Close
                </motion.button>
              </motion.div>
            )}

            {/* ── ERROR STEP ── */}
            {step === "error" && txResult && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full flex flex-col items-center py-6 gap-4"
              >
                <AlertCircle className="w-14 h-14 text-urgent" />
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground">Transaction Failed</p>
                  <p className="text-sm text-muted-foreground mt-2 px-2">{txResult.error}</p>
                </div>
                <div className="flex gap-3 w-full">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setStep("info")}
                    className="flex-1 py-3 rounded-xl bg-primary/20 text-primary text-sm font-bold hover:bg-primary/30 transition-colors"
                  >
                    Try Again
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleClose}
                    className="flex-1 py-3 rounded-xl bg-muted/30 text-muted-foreground text-sm font-bold hover:bg-muted/50 transition-colors"
                  >
                    Cancel
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
};

export default DonationModal;
