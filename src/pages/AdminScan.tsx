/**
 * src/pages/AdminScan.tsx
 *
 * Admin-only QR scanner page.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, QrCode, CheckCircle, AlertCircle, Loader2, Wallet, ExternalLink, RefreshCw } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  connectMetaMask,
  recordDonationOnChain,
  isMetaMaskAvailable,
  isMobileDevice,
  getMetaMaskLoginDeepLink,
  switchToSepolia,
  checkNetwork,
  type DonationResult,
} from "@/lib/blockchain";

// ─── TYPES ────────────────────────────────────────────────────────────────────

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

// ─── COMPONENT ────────────────────────────────────────────────────────────────

const AdminScan = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // ── Admin check done locally (avoids race condition with AdminContext) ──
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null); // null = still checking

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        setIsAdmin(false);
        return;
      }
      const { data } = await supabase.from("profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
      const admin = data?.is_admin === true;
      setIsAdmin(admin);
      if (!admin) {
        toast({
          title: "Access Denied",
          description: "This page is for administrators only.",
          variant: "destructive",
        });
        navigate("/");
      }
    };
    checkAdmin();
  }, [user]);

  // ── Wallet (persists across all scans in this session) ──
  const [adminWalletAddress, setAdminWalletAddress] = useState("");
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [isOnSepolia, setIsOnSepolia] = useState(false);

  // ── Page flow ──
  const [step, setStep] = useState<PageStep>("scanner");
  const [scannedData, setScannedData] = useState<QRDonationData | null>(null);
  const [txResult, setTxResult] = useState<DonationResult | null>(null);
  const [scanning, setScanning] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);

  // ── Camera cleanup on unmount ──
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  // ── Listen for MetaMask network changes ──
  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;
    const handleChainChange = async () => {
      const net = await checkNetwork();
      setIsOnSepolia(net.ok);
    };
    ethereum.on("chainChanged", handleChainChange);
    return () => ethereum.removeListener("chainChanged", handleChainChange);
  }, []);

  // ─── WALLET ──────────────────────────────────────────────────────────

  const connectWallet = async () => {
    setIsConnectingWallet(true);
    try {
      const address = await connectMetaMask();
      const net = await checkNetwork();
      setIsOnSepolia(net.ok);
      setAdminWalletAddress(address);
      toast({
        title: "✅ Wallet Connected",
        description: `${address.slice(0, 8)}...${address.slice(-6)}`,
      });
    } catch (err: any) {
      toast({ title: "Connection Error", description: err.message, variant: "destructive" });
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const switchNetwork = async () => {
    try {
      await switchToSepolia();
      const net = await checkNetwork();
      setIsOnSepolia(net.ok);
      if (net.ok) toast({ title: "✅ Sepolia Testnet Active" });
    } catch (err: any) {
      toast({ title: "Network Error", description: err.message, variant: "destructive" });
    }
  };

  // ─── SCANNER ─────────────────────────────────────────────────────────

  // Safely destroy old scanner instance before creating a new one
  const destroyScanner = useCallback(async () => {
    const s = scannerRef.current;
    if (!s) return;
    try {
      if (s.isScanning) await s.stop();
      await s.clear();
    } catch {
      // ignore — element may already be gone
    }
    scannerRef.current = null;
  }, []);

  const stopScanner = useCallback(async () => {
    const s = scannerRef.current;
    if (!s) return;
    try {
      if (s.isScanning) await s.stop();
    } catch {
      /* ignore */
    }
    setScanning(false);
  }, []);

  const startScanner = async () => {
    // Fully destroy any previous instance first to avoid "unconfigured name" error
    await destroyScanner();

    try {
      const scanner = new Html5Qrcode(SCANNER_ID, { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (decodedText) => {
          scanner.stop().catch(() => {});
          setScanning(false);
          handleQRScanned(decodedText);
        },
        undefined,
      );
      setScanning(true);
    } catch {
      setScanning(false);
      toast({
        title: "Camera Error",
        description: "Could not start camera. Please allow camera access in your browser.",
        variant: "destructive",
      });
    }
  };

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
      toast({ title: "✅ QR Scanned!", description: `Found: ${data.itemName}` });
    } catch {
      toast({
        title: "Read Error",
        description: "Could not parse QR code. Please try again.",
        variant: "destructive",
      });
    }
  };

  // ─── BLOCKCHAIN ──────────────────────────────────────────────────────

  const handleConfirmOnChain = async () => {
    if (!scannedData || !user) return;

    // Mobile without MetaMask browser → open MetaMask app at login page
    if (!isMetaMaskAvailable() && isMobileDevice()) {
      window.location.href = getMetaMaskLoginDeepLink();
      return;
    }

    // Desktop without MetaMask extension
    if (!isMetaMaskAvailable()) {
      toast({
        title: "MetaMask Not Found",
        description: "Please install the MetaMask extension at metamask.io",
        variant: "destructive",
      });
      return;
    }

    // Auto-connect wallet if not yet connected, then proceed immediately
    if (!adminWalletAddress) {
      try {
        setIsConnectingWallet(true);
        const address = await connectMetaMask();
        const net = await checkNetwork();
        setIsOnSepolia(net.ok);
        setAdminWalletAddress(address);
        setIsConnectingWallet(false);
      } catch (err: any) {
        setIsConnectingWallet(false);
        toast({ title: "Connection Error", description: err.message, variant: "destructive" });
        return;
      }
    }

    setStep("processing");

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

    // Sync with Supabase after blockchain confirmation
    try {
      const tokens = scannedData.isCritical ? 5 : 3;

      const { data: donorProfile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("wallet_address", scannedData.userWalletAddress)
        .maybeSingle();

      const donorUserId = donorProfile?.user_id;

      await supabase.from("donations").insert({
        user_id: donorUserId || user.id,
        item_name: scannedData.itemName,
        quantity: 1,
        unit: "pcs",
      });

      if (scannedData.itemId) {
        await supabase.from("fridge_items").delete().eq("id", scannedData.itemId);
      }

      if (donorUserId) {
        await supabase.rpc("adjust_user_tokens", {
          _user_id: donorUserId,
          _token_delta: tokens,
          _point_delta: tokens,
        });
      }
    } catch (err: any) {
      console.error("Database sync error:", err.message);
      // Don't fail — blockchain is source of truth
    }

    setStep("success");
  };

  // ─── RESET ───────────────────────────────────────────────────────────

  // Scan again: keep wallet connected, go back to scanner
  const handleScanAgain = async () => {
    await destroyScanner(); // clean up before re-rendering scanner DOM element
    setStep("scanner");
    setScannedData(null);
    setTxResult(null);
    setScanning(false);
  };

  // ─── LOADING / GUARD ─────────────────────────────────────────────────

  if (isAdmin === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!isAdmin) return null;

  // ─── RENDER ──────────────────────────────────────────────────────────

  const metamaskAvailable = isMetaMaskAvailable();
  const onMobile = isMobileDevice();

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden">
      <div className="relative z-10 pb-28 px-5 pt-10 flex flex-col items-center">
        {/* ── Header ── */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md mb-6">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
              <ShieldCheck className="text-primary" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold">Admin — QR Scanner</h1>
              <p className="text-xs text-muted-foreground">Blockchain Donations • Sepolia Testnet</p>
            </div>
          </div>

          {/* Wallet status bar */}
          <div className="mt-3 px-3 py-2 rounded-xl border flex items-center justify-between bg-background/40">
            {adminWalletAddress ? (
              <>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-safe" />
                  <span className="text-xs text-safe font-mono">
                    {adminWalletAddress.slice(0, 10)}...{adminWalletAddress.slice(-6)}
                  </span>
                  {!isOnSepolia && (
                    <button onClick={switchNetwork} className="text-[10px] text-yellow-400 underline ml-1">
                      Switch to Sepolia
                    </button>
                  )}
                </div>
                <button
                  onClick={() => {
                    setAdminWalletAddress("");
                    setIsOnSepolia(false);
                  }}
                  className="text-[10px] underline text-muted-foreground"
                >
                  Change
                </button>
              </>
            ) : metamaskAvailable ? (
              <button
                onClick={connectWallet}
                disabled={isConnectingWallet}
                className="flex items-center gap-2 text-xs text-orange-400 hover:text-orange-300 transition-colors disabled:opacity-60"
              >
                {isConnectingWallet ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wallet className="w-3.5 h-3.5" />
                )}
                {isConnectingWallet ? "Connecting..." : "Connect MetaMask to sign transactions"}
              </button>
            ) : onMobile ? (
              <a href={getMetaMaskLoginDeepLink()} className="flex items-center gap-2 text-xs text-orange-400">
                <ExternalLink className="w-3.5 h-3.5" />
                Sign in via MetaMask browser
              </a>
            ) : (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />
                MetaMask extension not installed
              </span>
            )}
          </div>
        </motion.div>

        {/* ── Step Content ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {/* ═══════════════════════════════════════
                STEP 1 — SCANNER
            ═══════════════════════════════════════ */}
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
                  <h2 className="text-lg font-bold">Scan Donor QR Code</h2>
                  <p className="text-sm text-muted-foreground">
                    Ask the donor to show their QR code from the Fridge section
                  </p>
                </div>

                {/* Camera viewport */}
                <div className="w-full rounded-2xl overflow-hidden bg-black/30 min-h-[290px] relative border border-border/30">
                  <div id={SCANNER_ID} className="w-full" />
                  {!scanning && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 gap-2">
                      <QrCode className="w-14 h-14 opacity-25" />
                      <p className="text-sm text-muted-foreground">Press the button below to start the camera</p>
                    </div>
                  )}
                  {scanning && (
                    <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-safe/80 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      <span className="text-[10px] text-white font-bold">SCANNING</span>
                    </div>
                  )}
                </div>

                <Button
                  onClick={scanning ? stopScanner : startScanner}
                  className="w-full"
                  variant={scanning ? "outline" : "default"}
                  size="lg"
                >
                  {scanning ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Stop Camera
                    </>
                  ) : (
                    <>
                      <QrCode className="w-4 h-4 mr-2" />
                      Start Camera & Scan
                    </>
                  )}
                </Button>
              </motion.div>
            )}

            {/* ═══════════════════════════════════════
                STEP 2 — CONFIRM
            ═══════════════════════════════════════ */}
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
                  <h2 className="text-lg font-bold">QR Scanned!</h2>
                  <p className="text-sm text-muted-foreground">
                    Review the donation details before sending to blockchain
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="flex justify-between items-center py-3 px-4 rounded-xl bg-background/40 border">
                    <span className="text-sm text-muted-foreground">Item</span>
                    <span className="text-sm font-bold">{scannedData.itemName}</span>
                  </div>

                  <div className="flex justify-between items-center py-3 px-4 rounded-xl bg-background/40 border">
                    <span className="text-sm text-muted-foreground">Type</span>
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-full ${
                        scannedData.isCritical ? "bg-danger/20 text-danger" : "bg-safe/20 text-safe"
                      }`}
                    >
                      {scannedData.isCritical ? "⚠️ Critical" : "✅ Normal"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-3 px-4 rounded-xl bg-primary/10 border border-primary/20">
                    <span className="text-sm text-muted-foreground">Tokens for donor</span>
                    <span className="text-sm font-bold text-primary">+{scannedData.isCritical ? 5 : 3} 🪙</span>
                  </div>

                  <div className="py-3 px-4 rounded-xl bg-background/40 border">
                    <p className="text-xs text-muted-foreground mb-1">Donor wallet</p>
                    <p className="text-xs font-mono break-all text-foreground/80">{scannedData.userWalletAddress}</p>
                  </div>
                </div>

                {/* MetaMask signing notice */}
                <div className="px-3 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20">
                  {metamaskAvailable ? (
                    <p className="text-xs text-orange-300 leading-relaxed">
                      <strong>MetaMask will open</strong> to sign the transaction. Review the details before confirming.
                    </p>
                  ) : onMobile ? (
                    <p className="text-xs text-orange-300 leading-relaxed">
                      You are using a regular browser. To sign the transaction you need to
                      <strong> sign in inside the MetaMask app browser</strong>. Tap the button below — MetaMask will
                      open the login page, and after signing in you can confirm the transaction there.
                    </p>
                  ) : (
                    <p className="text-xs text-yellow-300 leading-relaxed">
                      <strong>MetaMask is not installed.</strong> Please install the MetaMask extension at metamask.io.
                    </p>
                  )}
                </div>

                <Button onClick={handleConfirmOnChain} className="w-full bg-primary" size="lg">
                  <Wallet className="w-4 h-4 mr-2" />
                  {onMobile && !metamaskAvailable
                    ? "Open MetaMask & Sign"
                    : adminWalletAddress
                      ? "Confirm on Blockchain"
                      : "Connect Wallet & Confirm"}
                </Button>

                <Button onClick={handleScanAgain} variant="outline" className="w-full">
                  Cancel / Scan Again
                </Button>
              </motion.div>
            )}

            {/* ═══════════════════════════════════════
                STEP 3 — PROCESSING
            ═══════════════════════════════════════ */}
            {step === "processing" && (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-card rounded-2xl p-8 flex flex-col items-center gap-5"
              >
                <Loader2 className="w-14 h-14 text-primary animate-spin" />
                <h2 className="text-lg font-bold text-center">Processing on Blockchain</h2>
                <p className="text-sm text-muted-foreground text-center leading-relaxed">
                  Waiting for transaction confirmation on the Sepolia network. This may take 15–30 seconds.
                </p>
                <div className="w-full py-3 px-4 rounded-xl bg-primary/10 border border-primary/20 text-center">
                  <p className="text-xs text-muted-foreground">Do not close this page</p>
                </div>
              </motion.div>
            )}

            {/* ═══════════════════════════════════════
                STEP 4 — SUCCESS
            ═══════════════════════════════════════ */}
            {step === "success" && txResult && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="glass-card rounded-2xl p-7 flex flex-col items-center gap-5"
              >
                <CheckCircle className="w-16 h-16 text-safe" />
                <h2 className="text-xl font-bold">Donation Confirmed! 🎉</h2>
                <p className="text-sm text-center text-muted-foreground">
                  The blockchain has permanently recorded this food donation.
                </p>

                <div className="w-full py-5 rounded-xl bg-primary/10 border border-primary/20 text-center">
                  <p className="text-3xl font-bold text-primary">+{txResult.tokensAwarded} 🪙</p>
                  <p className="text-xs text-muted-foreground mt-1">Awarded to donor wallet</p>
                </div>

                {txResult.etherscanUrl && (
                  <a
                    href={txResult.etherscanUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3 rounded-xl bg-blue-500/15 text-blue-400 text-sm font-bold flex items-center justify-center gap-2 hover:bg-blue-500/25 transition-colors border border-blue-500/20"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View on Etherscan
                  </a>
                )}

                {txResult.txHash && (
                  <div className="w-full py-3 px-4 rounded-xl bg-background/40 border">
                    <p className="text-xs text-muted-foreground mb-1">TX Hash</p>
                    <p className="text-[11px] font-mono break-all text-foreground/70">{txResult.txHash}</p>
                  </div>
                )}

                <Button onClick={handleScanAgain} className="w-full" size="lg">
                  <QrCode className="w-4 h-4 mr-2" />
                  Scan Next Donation
                </Button>
              </motion.div>
            )}

            {/* ═══════════════════════════════════════
                STEP 5 — ERROR
            ═══════════════════════════════════════ */}
            {step === "error" && txResult && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="glass-card rounded-2xl p-7 flex flex-col items-center gap-5"
              >
                <AlertCircle className="w-14 h-14 text-danger" />
                <h2 className="text-lg font-bold">Transaction Failed</h2>

                <div className="w-full py-3 px-4 rounded-xl bg-danger/10 border border-danger/20">
                  <p className="text-sm text-center text-danger/80">{txResult.error}</p>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  Make sure you have enough Sepolia ETH for gas fees, and that MetaMask is on the Sepolia testnet.
                </p>

                <Button onClick={handleScanAgain} className="w-full" variant="outline">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
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
