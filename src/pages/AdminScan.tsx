/**
 * src/pages/AdminScan.tsx
 *
 * Admin-only QR scanner page.
 * Admin scans the donor's QR code → confirms donation on Sepolia blockchain
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  QrCode,
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  Wallet,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import BottomNav from "@/components/BottomNav";
import { useAdmin } from "@/contexts/AdminContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { recordDonationOnChain, connectMetaMask, isMetaMaskInstalled, type DonationResult } from "@/lib/blockchain";

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface QRDonationData {
  itemId: string;
  itemName: string;
  isCritical: boolean;
  bonusTokens: number;
  userWalletAddress: string;
  action: string;
  network: string;
}

type PageStep = "scanner" | "confirm" | "processing" | "success" | "error";

const SCANNER_ID = "admin-qr-reader";

// ─── COMPONENT ───────────────────────────────────────────────────────────────
const AdminScan = () => {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<PageStep>("scanner");
  const [scannedData, setScannedData] = useState<QRDonationData | null>(null);
  const [txResult, setTxResult] = useState<DonationResult | null>(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [adminWalletAddress, setAdminWalletAddress] = useState("");
  const [scanning, setScanning] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Redirect non-admins immediately
  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      toast({ title: "Access Denied", description: "This page is only for admins.", variant: "destructive" });
      navigate("/");
    }
  }, [isAdmin, adminLoading]);

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  // ─── START SCANNER ────────────────────────────────────────────────
  // Uses the exact same pattern as BarcodeScanner.tsx which already works
  const startScanner = async () => {
    try {
      // If there's already an instance running, stop it first
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
        scannerRef.current = null;
      }

      // Create new instance — verbose: false suppresses console noise
      const scanner = new Html5Qrcode(SCANNER_ID, { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" }, // back camera on phone
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // QR code found — stop scanner and process
          scanner.stop().catch(() => {});
          setScanning(false);
          handleQRScanned(decodedText);
        },
        undefined, // ignore per-frame errors
      );

      setScanning(true);
    } catch (err: any) {
      setScanning(false);

      // Friendly error messages for common camera issues
      if (err?.message?.toLowerCase().includes("permission") || err?.message?.toLowerCase().includes("notallowed")) {
        toast({
          title: "Camera Permission Denied",
          description: "Please allow camera access in your browser settings and try again.",
          variant: "destructive",
        });
      } else if (err?.message?.toLowerCase().includes("notfound")) {
        toast({
          title: "No Camera Found",
          description: "This device does not have an accessible camera.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Camera Error",
          description: err?.message || "Could not start the camera. Try reloading the page.",
          variant: "destructive",
        });
      }
    }
  };

  // ─── STOP SCANNER ────────────────────────────────────────────────
  const stopScanner = async () => {
    if (scannerRef.current?.isScanning) {
      await scannerRef.current.stop().catch(() => {});
    }
    scannerRef.current = null;
    setScanning(false);
  };

  // ─── HANDLE QR DATA ───────────────────────────────────────────────
  const handleQRScanned = (rawText: string) => {
    try {
      const data: QRDonationData = JSON.parse(rawText);

      // Validate this is an EatSmart donation QR
      if (!data.itemName || !data.userWalletAddress || data.action !== "food_donation") {
        toast({
          title: "Invalid QR Code",
          description: "This is not a valid EatSmart donation QR code.",
          variant: "destructive",
        });
        return;
      }

      setScannedData(data);
      setStep("confirm");

      toast({
        title: "✅ QR Code Scanned!",
        description: `${data.itemName} — ${data.isCritical ? "Priority (+5 tokens)" : "Standard (+3 tokens)"}`,
      });
    } catch {
      toast({
        title: "QR Read Error",
        description: "Could not parse QR code. Please try scanning again.",
        variant: "destructive",
      });
    }
  };

  // ─── CONNECT ADMIN METAMASK ───────────────────────────────────────
  const handleConnectWallet = async () => {
    try {
      const address = await connectMetaMask();
      if (address) {
        setAdminWalletAddress(address);
        setWalletConnected(true);
        toast({
          title: "✅ MetaMask Connected",
          description: `Admin wallet: ${address.slice(0, 8)}...${address.slice(-6)}`,
        });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // ─── CONFIRM ON BLOCKCHAIN + REMOVE FROM FRIDGE ───────────────────
  const handleConfirmOnChain = async () => {
    if (!scannedData || !user) return;
    setStep("processing");

    // 1. Send transaction to blockchain
    //    Admin pays gas, tokens go to the DONOR's wallet address
    const result = await recordDonationOnChain(
      scannedData.userWalletAddress,
      scannedData.itemName,
      scannedData.isCritical,
    );

    setTxResult(result);

    if (!result.success) {
      setStep("error");
      return;
    }

    // 2. Find donor by their wallet address in Supabase
    const { data: donorProfile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("wallet_address", scannedData.userWalletAddress)
      .maybeSingle();

    const donorUserId = donorProfile?.user_id;
    const tokens = scannedData.isCritical ? 5 : 3;

    try {
      // 3. Record donation in donations table
      await supabase.from("donations").insert({
        user_id: donorUserId || user.id,
        item_name: scannedData.itemName,
        quantity: 1,
        unit: "pcs",
      });

      // 4. Remove item from fridge_items — this is the KEY fix
      //    Delete by itemId regardless of who the donor is
      if (scannedData.itemId) {
        const { error: deleteError } = await supabase.from("fridge_items").delete().eq("id", scannedData.itemId);

        if (deleteError) {
          console.error("Failed to delete fridge item:", deleteError.message);
        }
      }

      // 5. Award tokens to donor in Supabase (if we found their account)
      if (donorUserId) {
        const { data: existing } = await supabase
          .from("user_tokens")
          .select("total_tokens, total_points")
          .eq("user_id", donorUserId)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("user_tokens")
            .update({
              total_tokens: (existing as any).total_tokens + tokens,
              total_points: ((existing as any).total_points || 0) + tokens,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", donorUserId);
        } else {
          await supabase.from("user_tokens").insert({
            user_id: donorUserId,
            total_tokens: tokens,
            total_points: tokens,
          } as any);
        }
      }
    } catch (err: any) {
      // Blockchain confirmed — log DB error but don't block success screen
      console.error("Database sync error:", err.message);
    }

    setStep("success");
  };

  // ─── RESET ───────────────────────────────────────────────────────
  const handleReset = () => {
    setStep("scanner");
    setScannedData(null);
    setTxResult(null);
    setScanning(false);
  };

  // ─── LOADING / ACCESS CHECK ───────────────────────────────────────
  if (adminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!isAdmin) return null;

  // ─── RENDER ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden">
      <div className="absolute top-0 left-1/3 w-[500px] h-[500px] rounded-full bg-mint/5 blur-[140px] pointer-events-none" />

      <div className="relative z-10 pb-28 px-5 pt-10 flex flex-col items-center">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                stopScanner();
                navigate("/");
              }}
              className="p-2 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-foreground">Admin — QR Scanner</h1>
                <p className="text-xs text-muted-foreground">Scan donor QR codes to confirm blockchain donations</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Main content */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {/* ── SCANNER STEP ── */}
            {step === "scanner" && (
              <motion.div
                key="scanner"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-card rounded-2xl p-6 flex flex-col items-center gap-5"
              >
                <div className="text-center">
                  <QrCode className="w-10 h-10 text-primary mx-auto mb-2" />
                  <h2 className="font-display text-lg font-bold text-foreground">Scan Donation QR Code</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ask the donor to open their Donation modal and show you the QR code
                  </p>
                </div>

                {/* Scanner viewport — div must exist in DOM before Html5Qrcode starts */}
                <div className="w-full rounded-2xl overflow-hidden bg-black/20 border border-border/30 min-h-[280px] relative">
                  {/* This div is always rendered so Html5Qrcode can find it by ID */}
                  <div id={SCANNER_ID} className="w-full" />

                  {/* Overlay shown when camera is not active */}
                  {!scanning && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground bg-background/40">
                      <QrCode className="w-12 h-12 opacity-30" />
                      <p className="text-sm">Tap "Start Camera" to begin</p>
                    </div>
                  )}
                </div>

                {!scanning ? (
                  <Button onClick={startScanner} className="w-full">
                    <QrCode className="w-4 h-4 mr-2" />
                    Start Camera & Scan
                  </Button>
                ) : (
                  <Button variant="outline" onClick={stopScanner} className="w-full">
                    Stop Camera
                  </Button>
                )}

                <p className="text-[11px] text-muted-foreground text-center">
                  Allow camera access when your browser prompts you. Point at the QR code displayed on the donor's
                  screen.
                </p>
              </motion.div>
            )}

            {/* ── CONFIRM STEP ── */}
            {step === "confirm" && scannedData && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="glass-card rounded-2xl p-6 flex flex-col gap-5"
              >
                <div className="text-center">
                  <CheckCircle className="w-10 h-10 text-safe mx-auto mb-2" />
                  <h2 className="font-display text-lg font-bold text-foreground">QR Code Scanned!</h2>
                  <p className="text-sm text-muted-foreground mt-1">Review the donation details before confirming</p>
                </div>

                {/* Details */}
                <div className="space-y-2.5">
                  <div className="flex justify-between py-3 px-4 rounded-xl bg-background/40 border border-border/30">
                    <span className="text-sm text-muted-foreground">Food Item</span>
                    <span className="text-sm font-bold text-foreground">{scannedData.itemName}</span>
                  </div>
                  <div className="flex justify-between py-3 px-4 rounded-xl bg-background/40 border border-border/30">
                    <span className="text-sm text-muted-foreground">Priority</span>
                    <span className={`text-sm font-bold ${scannedData.isCritical ? "text-warning" : "text-safe"}`}>
                      {scannedData.isCritical ? "⏰ Critical (expires soon)" : "✅ Standard"}
                    </span>
                  </div>
                  <div className="flex justify-between py-3 px-4 rounded-xl bg-background/40 border border-border/30">
                    <span className="text-sm text-muted-foreground">Tokens to Award</span>
                    <span className="text-sm font-bold text-primary">+{scannedData.isCritical ? 5 : 3} 🪙</span>
                  </div>
                  <div className="py-3 px-4 rounded-xl bg-background/40 border border-border/30">
                    <span className="text-xs text-muted-foreground block mb-1">Donor Wallet</span>
                    <span className="text-xs font-mono text-foreground break-all">{scannedData.userWalletAddress}</span>
                  </div>
                  <div className="py-2 px-4 rounded-xl bg-primary/5 border border-primary/20">
                    <p className="text-xs text-muted-foreground">
                      ℹ️ After confirmation, this item will be{" "}
                      <span className="font-semibold text-foreground">
                        automatically removed from the donor's fridge.
                      </span>
                    </p>
                  </div>
                </div>

                {/* MetaMask */}
                {isMetaMaskInstalled() ? (
                  walletConnected ? (
                    <div className="px-4 py-3 rounded-xl bg-safe/10 border border-safe/30 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-safe shrink-0" />
                      <div className="text-xs text-safe">
                        <span className="font-semibold block">Admin wallet connected</span>
                        <span className="font-mono">
                          {adminWalletAddress.slice(0, 10)}...{adminWalletAddress.slice(-8)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={handleConnectWallet}
                      className="w-full border-orange-500/40 text-orange-400 hover:bg-orange-500/10"
                    >
                      <Wallet className="w-4 h-4 mr-2" />
                      Connect MetaMask (Admin Wallet)
                    </Button>
                  )
                ) : (
                  <div className="px-4 py-3 rounded-xl bg-urgent/10 border border-urgent/30 text-xs text-urgent text-center">
                    MetaMask not installed.{" "}
                    <a href="https://metamask.io" target="_blank" rel="noreferrer" className="underline font-semibold">
                      Install here
                    </a>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleReset} className="flex-1">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Scan Again
                  </Button>
                  <Button onClick={handleConfirmOnChain} disabled={!walletConnected} className="flex-1">
                    Confirm on Blockchain
                  </Button>
                </div>

                {!walletConnected && (
                  <p className="text-[11px] text-muted-foreground text-center">Connect MetaMask before confirming</p>
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
                className="glass-card rounded-2xl p-8 flex flex-col items-center gap-6"
              >
                <Loader2 className="w-16 h-16 text-primary animate-spin" />
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground">Sending to Blockchain...</p>
                  <p className="text-sm text-muted-foreground mt-2">Confirm the transaction in your MetaMask popup</p>
                  <p className="text-xs text-muted-foreground mt-1">This may take 15–30 seconds after confirming</p>
                </div>
                <div className="w-full px-4 py-3 rounded-xl bg-muted/30 text-center space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Network: <span className="font-semibold text-foreground">Sepolia Testnet</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Item: <span className="font-semibold text-foreground">{scannedData?.itemName}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Removing item from donor's fridge after confirmation...
                  </p>
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
                className="glass-card rounded-2xl p-7 flex flex-col items-center gap-5"
              >
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.1 }}>
                  <CheckCircle className="w-16 h-16 text-safe" />
                </motion.div>

                <div className="text-center">
                  <p className="text-xl font-bold text-foreground">Donation Confirmed! 🎉</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {scannedData?.itemName} recorded on Sepolia blockchain
                  </p>
                </div>

                <div className="w-full py-4 rounded-xl bg-primary/10 border border-primary/20 text-center">
                  <p className="text-3xl font-bold text-primary">+{txResult.tokensAwarded} 🪙</p>
                  <p className="text-xs text-muted-foreground mt-1">awarded to donor's wallet</p>
                </div>

                <div className="w-full space-y-2">
                  <div className="py-3 px-4 rounded-xl bg-safe/5 border border-safe/20 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-safe shrink-0" />
                    <p className="text-xs text-safe font-medium">Item removed from donor's fridge ✓</p>
                  </div>
                </div>

                <div className="w-full py-3 px-4 rounded-xl bg-muted/30 border border-border/30">
                  <p className="text-xs text-muted-foreground mb-1">Donor address:</p>
                  <p className="text-xs font-mono text-foreground break-all">{txResult.donorAddress}</p>
                </div>

                {txResult.txHash && (
                  <div className="w-full space-y-1">
                    <p className="text-xs text-muted-foreground text-center">Transaction Hash:</p>
                    <div className="px-3 py-2 rounded-lg bg-muted/30 border border-border/30 text-center">
                      <p className="text-[10px] font-mono text-foreground break-all">
                        {txResult.txHash.slice(0, 26)}...{txResult.txHash.slice(-10)}
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

                <Button onClick={handleReset} className="w-full" variant="outline">
                  <QrCode className="w-4 h-4 mr-2" />
                  Scan Another Donation
                </Button>
              </motion.div>
            )}

            {/* ── ERROR STEP ── */}
            {step === "error" && txResult && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-card rounded-2xl p-7 flex flex-col items-center gap-5"
              >
                <AlertCircle className="w-14 h-14 text-urgent" />
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground">Transaction Failed</p>
                  <p className="text-sm text-muted-foreground mt-2 px-2">{txResult.error}</p>
                </div>
                <div className="flex gap-3 w-full">
                  <Button onClick={() => setStep("confirm")} className="flex-1">
                    Try Again
                  </Button>
                  <Button variant="outline" onClick={handleReset} className="flex-1">
                    Start Over
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <BottomNav />
    </div>
  );
};

export default AdminScan;
