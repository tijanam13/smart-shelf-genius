import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, Loader2, CheckCircle, AlertCircle, Wallet } from "lucide-react";
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
  const [connectedAddress, setConnectedAddress] = useState<string>("");

  // QR kod koji sadrži sve podatke namirnice + wallet adresu
  const qrData = JSON.stringify({
    itemId,
    itemName,
    isCritical,
    bonusTokens,
    userWalletAddress,
    action: "food_donation",
    network: "sepolia",
  });

  // ─── POVEŽI METAMASK ────────────────────────────────────────────────
  const handleConnectWallet = async () => {
    try {
      const address = await connectMetaMask();
      if (address) {
        setConnectedAddress(address);
        setWalletConnected(true);
        toast({
          title: "✅ MetaMask povezan!",
          description: `Adresa: ${address.slice(0, 6)}...${address.slice(-4)}`,
        });
      }
    } catch (err: any) {
      toast({
        title: "Greška",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  // ─── BLOCKCHAIN DONACIJA ────────────────────────────────────────────
  const handleBlockchainDonate = async () => {
    if (!user) return;
    setStep("processing");

    // 1. Pošalji na blockchain
    const result = await recordDonationOnChain(itemName, isCritical);
    setTxResult(result);

    if (!result.success) {
      setStep("error");
      return;
    }

    // 2. Zabelezi u Supabase
    try {
      await supabase.from("donations").insert({
        user_id: user.id,
        item_name: itemName,
        quantity,
        unit,
      });

      const { data: existing } = await supabase
        .from("user_tokens")
        .select("total_tokens, total_points")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("user_tokens")
          .update({
            total_tokens: (existing as any).total_tokens + bonusTokens,
            total_points: ((existing as any).total_points || 0) + bonusTokens,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);
      } else {
        await supabase.from("user_tokens").insert({
          user_id: user.id,
          total_tokens: bonusTokens,
          total_points: bonusTokens,
        } as any);
      }

      await supabase.from("fridge_items").delete().eq("id", itemId);
    } catch (err: any) {
      // Blockchain transakcija uspela, ali Supabase greška — ne blokiraj
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

          {/* ── KORAK: INFO (početni ekran) ── */}
          <AnimatePresence mode="wait">
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
                    {/* QR Kod */}
                    <div className="mb-4 text-center">
                      <p className="text-xs text-muted-foreground mb-3">
                        QR kod sadrži sve podatke o donaciji i tvojoj blockchain adresi
                      </p>
                      <div className="bg-white rounded-2xl p-4 inline-block">
                        <QRCodeSVG
                          value={qrData}
                          size={180}
                          level="H"
                          includeMargin={true}
                          fgColor="#000000"
                          bgColor="#ffffff"
                        />
                      </div>
                    </div>

                    {/* MetaMask status */}
                    {isMetaMaskInstalled() ? (
                      walletConnected ? (
                        <div className="w-full mb-4 px-3 py-2 rounded-xl bg-safe/10 border border-safe/30 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-safe shrink-0" />
                          <div className="text-xs text-safe">
                            <span className="font-semibold">Wallet povezan</span>
                            <br />
                            <span className="font-mono">
                              {connectedAddress.slice(0, 8)}...{connectedAddress.slice(-6)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={handleConnectWallet}
                          className="w-full mb-4 py-2.5 rounded-xl bg-orange-500/20 text-orange-400 text-sm font-bold hover:bg-orange-500/30 transition-colors flex items-center justify-center gap-2"
                        >
                          <Wallet className="w-4 h-4" />
                          Connect MetaMask
                        </motion.button>
                      )
                    ) : (
                      <div className="w-full mb-4 px-3 py-2 rounded-xl bg-urgent/10 border border-urgent/30 text-xs text-urgent text-center">
                        MetaMask nije instaliran.{" "}
                        <a
                          href="https://metamask.io"
                          target="_blank"
                          rel="noreferrer"
                          className="underline font-semibold"
                        >
                          Instaliraj ovde
                        </a>
                      </div>
                    )}

                    {/* Info */}
                    <div className="w-full text-center mb-5 space-y-1 text-xs text-muted-foreground">
                      <p>✅ Earn +{bonusTokens} tokens for donating</p>
                      <p>🔗 Transakcija se beleži na Sepolia blockchain</p>
                      <p>🌱 Impact your planet growth</p>
                    </div>

                    {/* Dugme za potvrdu */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleBlockchainDonate}
                      disabled={!walletConnected}
                      className="w-full py-3 rounded-xl bg-primary/20 text-primary text-sm font-bold hover:bg-primary/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      🎁 Confirm Donation on Blockchain
                    </motion.button>

                    {!walletConnected && isMetaMaskInstalled() && (
                      <p className="text-[11px] text-muted-foreground mt-2 text-center">Poveži MetaMask pre potvrde</p>
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

            {/* ── KORAK: PROCESSING ── */}
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
                  <p className="text-lg font-bold text-foreground">Slanje na blockchain...</p>
                  <p className="text-sm text-muted-foreground mt-2">Potvrdi transakciju u MetaMask prozoru</p>
                  <p className="text-xs text-muted-foreground mt-1">Čekaj ~15 sekundi nakon potvrde</p>
                </div>
                <div className="w-full px-4 py-3 rounded-xl bg-muted/30 text-center">
                  <p className="text-xs text-muted-foreground">
                    Mreža: <span className="font-semibold text-foreground">Sepolia Testnet</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Namirnica: <span className="font-semibold text-foreground">{itemName}</span>
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── KORAK: SUCCESS ── */}
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
                  <p className="text-xl font-bold text-foreground">Donacija potvrđena! 🎉</p>
                  <p className="text-sm text-muted-foreground mt-1">{itemName} je zabeležen na Sepolia blockchain-u</p>
                </div>

                {/* Tokeni */}
                <div className="w-full py-3 rounded-xl bg-primary/10 border border-primary/20 text-center">
                  <p className="text-2xl font-bold text-primary">+{txResult.tokensAwarded} 🪙</p>
                  <p className="text-xs text-muted-foreground mt-1">tokena dodato na tvoj nalog</p>
                </div>

                {/* TX Hash */}
                {txResult.txHash && (
                  <div className="w-full space-y-2">
                    <p className="text-xs text-muted-foreground text-center">Transaction Hash:</p>
                    <div className="px-3 py-2 rounded-lg bg-muted/30 border border-border/30 text-center">
                      <p className="text-[10px] font-mono text-foreground break-all">
                        {txResult.txHash.slice(0, 20)}...{txResult.txHash.slice(-10)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Etherscan link */}
                {txResult.etherscanUrl && (
                  <a
                    href={txResult.etherscanUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3 rounded-xl bg-blue-500/15 text-blue-400 text-sm font-bold hover:bg-blue-500/25 transition-colors flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Pogledaj na Etherscan
                  </a>
                )}

                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleClose}
                  className="w-full py-3 rounded-xl bg-primary/20 text-primary text-sm font-bold hover:bg-primary/30 transition-colors"
                >
                  Zatvori
                </motion.button>
              </motion.div>
            )}

            {/* ── KORAK: ERROR ── */}
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
                  <p className="text-lg font-bold text-foreground">Transakcija nije uspela</p>
                  <p className="text-sm text-muted-foreground mt-2 px-2">{txResult.error}</p>
                </div>
                <div className="flex gap-3 w-full">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setStep("info")}
                    className="flex-1 py-3 rounded-xl bg-primary/20 text-primary text-sm font-bold hover:bg-primary/30 transition-colors"
                  >
                    Pokušaj ponovo
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleClose}
                    className="flex-1 py-3 rounded-xl bg-muted/30 text-muted-foreground text-sm font-bold hover:bg-muted/50 transition-colors"
                  >
                    Otkaži
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
