/**
 * src/pages/AdminScan.tsx
 *
 * Admin-only QR scanner page.
 * Admin scans the donor's QR code → confirms donation (Supabase only, no MetaMask needed).
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, QrCode, CheckCircle, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import BottomNav from "@/components/BottomNav";
import { useAdmin } from "@/contexts/AdminContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

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

interface DonationResult {
  success: boolean;
  tokensAwarded?: number;
  donorAddress?: string;
  error?: string;
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
  const startScanner = async () => {
    try {
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
        scannerRef.current = null;
      }

      const scanner = new Html5Qrcode(SCANNER_ID, { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          scanner.stop().catch(() => {});
          setScanning(false);
          handleQRScanned(decodedText);
        },
        undefined,
      );

      setScanning(true);
    } catch (err: any) {
      setScanning(false);

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

  // ─── CONFIRM DONATION — SUPABASE ONLY, NO METAMASK NEEDED ─────────
  const handleConfirmDonation = async () => {
    if (!scannedData || !user) return;
    setStep("processing");

    const tokens = scannedData.isCritical ? 5 : 3;

    try {
      // 1. Find donor by their wallet address in Supabase
      const { data: donorProfile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("wallet_address", scannedData.userWalletAddress)
        .maybeSingle();

      const donorUserId = donorProfile?.user_id;

      // 2. Record donation in donations table
      await supabase.from("donations").insert({
        user_id: donorUserId || user.id,
        item_name: scannedData.itemName,
        quantity: 1,
        unit: "pcs",
      });

      // 3. Remove item from fridge
      if (scannedData.itemId) {
        const { error: deleteError } = await supabase.from("fridge_items").delete().eq("id", scannedData.itemId);

        if (deleteError) {
          console.error("Failed to delete fridge item:", deleteError.message);
        }
      }

      // 4. Award tokens to donor in Supabase
      if (donorUserId) {
        await supabase.rpc("adjust_user_tokens", {
          _user_id: donorUserId,
          _token_delta: tokens,
          _point_delta: tokens,
        });
      }

      setTxResult({
        success: true,
        tokensAwarded: tokens,
        donorAddress: scannedData.userWalletAddress,
      });
      setStep("success");
    } catch (err: any) {
      console.error("Donation confirmation error:", err.message);
      setTxResult({
        success: false,
        error: err.message || "Something went wrong. Please try again.",
      });
      setStep("error");
    }
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
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-foreground">Admin — QR Scanner</h1>
              <p className="text-xs text-muted-foreground">Scan donor QR codes to confirm donations</p>
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

                <div className="w-full rounded-2xl overflow-hidden bg-black/20 border border-border/30 min-h-[280px] relative">
                  <div id={SCANNER_ID} className="w-full" />

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

                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleReset} className="flex-1">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Scan Again
                  </Button>
                  <Button onClick={handleConfirmDonation} className="flex-1">
                    Confirm Donation
                  </Button>
                </div>
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
                  <p className="text-lg font-bold text-foreground">Processing Donation...</p>
                  <p className="text-sm text-muted-foreground mt-2">Awarding tokens and removing item from fridge</p>
                  <p className="text-xs text-muted-foreground mt-1">This will only take a moment</p>
                </div>
                <div className="w-full px-4 py-3 rounded-xl bg-muted/30 text-center space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Item: <span className="font-semibold text-foreground">{scannedData?.itemName}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tokens: <span className="font-semibold text-foreground">+{scannedData?.isCritical ? 5 : 3} 🪙</span>
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
                    {scannedData?.itemName} has been successfully donated
                  </p>
                </div>

                <div className="w-full py-4 rounded-xl bg-primary/10 border border-primary/20 text-center">
                  <p className="text-3xl font-bold text-primary">+{txResult.tokensAwarded} 🪙</p>
                  <p className="text-xs text-muted-foreground mt-1">awarded to donor's account</p>
                </div>

                <div className="w-full space-y-2">
                  <div className="py-3 px-4 rounded-xl bg-safe/5 border border-safe/20 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-safe shrink-0" />
                    <p className="text-xs text-safe font-medium">Item removed from donor's fridge ✓</p>
                  </div>
                  <div className="py-3 px-4 rounded-xl bg-safe/5 border border-safe/20 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-safe shrink-0" />
                    <p className="text-xs text-safe font-medium">Donation recorded in database ✓</p>
                  </div>
                </div>

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
                  <p className="text-lg font-bold text-foreground">Confirmation Failed</p>
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
