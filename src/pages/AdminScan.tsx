/**
 * src/pages/AdminScan.tsx
 *
 * Admin-only QR scanner page.
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  QrCode,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Wallet,
  ExternalLink,
  Smartphone,
  PenLine,
  Copy,
  Check,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BottomNav from "@/components/BottomNav";
import { useAdmin } from "@/contexts/AdminContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  connectMetaMask,
  recordDonationOnChain,
  canUseMetaMaskDirectly,
  isMobileDevice,
  getMetaMaskDeepLink,
  isValidEthAddress,
  switchToSepolia,
  checkNetwork,
  type DonationResult,
} from "@/lib/blockchain";

interface QRDonationData {
  itemId: string;
  itemName: string;
  isCritical: boolean;
  bonusTokens: number;
  userWalletAddress: string;
  action: string;
  network: string;
}

type WalletStep = "choose" | "connecting" | "manual-input" | "connected";
type PageStep = "wallet" | "scanner" | "confirm" | "processing" | "success" | "error";

const SCANNER_ID = "admin-qr-reader";

const AdminScan = () => {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // State Management
  const [walletStep, setWalletStep] = useState<WalletStep>("choose");
  const [adminWalletAddress, setAdminWalletAddress] = useState("");
  const [manualAddressInput, setManualAddressInput] = useState("");
  const [manualAddressError, setManualAddressError] = useState("");
  const [isOnSepolia, setIsOnSepolia] = useState(false);
  const [copied, setCopied] = useState(false);

  const [step, setStep] = useState<PageStep>("wallet");
  const [scannedData, setScannedData] = useState<QRDonationData | null>(null);
  const [txResult, setTxResult] = useState<DonationResult | null>(null);
  const [scanning, setScanning] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Security: Redirect non-admins
  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      toast({ title: "Access Denied", description: "This page is for administrators only.", variant: "destructive" });
      navigate("/");
    }
  }, [isAdmin, adminLoading]);

  // Clean up camera on exit
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  // Listen for MetaMask network changes
  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    const handleChainChange = async () => {
      const net = await checkNetwork();
      setIsOnSepolia(net.ok);
      if (!net.ok) {
        toast({
          title: "Wrong Network",
          description: "MetaMask is not on Sepolia. Switching...",
          variant: "destructive",
        });
      }
    };

    ethereum.on("chainChanged", handleChainChange);
    return () => ethereum.removeListener("chainChanged", handleChainChange);
  }, []);

  // ─── WALLET ACTIONS ───────────────────────────────────────────────

  const handleConnectMetaMask = async () => {
    setWalletStep("connecting");
    try {
      const address = await connectMetaMask();
      const net = await checkNetwork();
      setIsOnSepolia(net.ok);
      setAdminWalletAddress(address);
      setWalletStep("connected");
      setStep("scanner");
      toast({ title: "✅ Wallet Connected", description: `Address: ${address.slice(0, 8)}...${address.slice(-6)}` });
    } catch (err: any) {
      setWalletStep("choose");
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleSwitchToSepolia = async () => {
    try {
      await switchToSepolia();
      const net = await checkNetwork();
      setIsOnSepolia(net.ok);
      if (net.ok) toast({ title: "✅ Sepolia Testnet Active" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleManualAddressSubmit = () => {
    const addr = manualAddressInput.trim();
    if (!isValidEthAddress(addr)) {
      setManualAddressError("Please enter a valid Ethereum address (0x...)");
      return;
    }
    setAdminWalletAddress(addr);
    setWalletStep("connected");
    setStep("scanner");
    toast({ title: "✅ Address Confirmed", description: `${addr.slice(0, 8)}...` });
  };

  const handleCopyDeepLink = () => {
    const link = getMetaMaskDeepLink();
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ─── SCANNER ACTIONS ───────────────────────────────────────────────

  const startScanner = async () => {
    try {
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
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
      toast({
        title: "Camera Error",
        description: "Could not start camera. Check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current?.isScanning) await scannerRef.current.stop().catch(() => {});
    setScanning(false);
  };

  const handleQRScanned = (rawText: string) => {
    try {
      const data: QRDonationData = JSON.parse(rawText);
      if (!data.itemName || !data.userWalletAddress || data.action !== "food_donation") {
        toast({ title: "Invalid QR", description: "Not a valid EatSmart donation code.", variant: "destructive" });
        return;
      }
      setScannedData(data);
      setStep("confirm");
      toast({ title: "✅ QR Scanned!", description: `Found: ${data.itemName}` });
    } catch {
      toast({ title: "Read Error", description: "Failed to parse QR code.", variant: "destructive" });
    }
  };

  // ─── BLOCKCHAIN CONFIRMATION ─────────────────────────────────────

  const handleConfirmOnChain = async () => {
    if (!scannedData || !user) return;
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

    // Sync with Database after Blockchain confirmation
    try {
      const tokens = scannedData.isCritical ? 5 : 3;
      const { data: donorProfile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("wallet_address", scannedData.userWalletAddress)
        .maybeSingle();

      const donorUserId = donorProfile?.user_id;

      // Log donation
      await supabase.from("donations").insert({
        user_id: donorUserId || user.id,
        item_name: scannedData.itemName,
        quantity: 1,
        unit: "pcs",
      });

      // Remove from Fridge
      if (scannedData.itemId) {
        await supabase.from("fridge_items").delete().eq("id", scannedData.itemId);
      }

      // Award Tokens in Supabase
      if (donorUserId) {
        await supabase.rpc("adjust_user_tokens", {
          _user_id: donorUserId,
          _token_delta: tokens,
          _point_delta: tokens,
        });
      }
    } catch (err: any) {
      console.error("Database sync error:", err.message);
    }

    setStep("success");
  };

  const handleReset = () => {
    setStep("scanner");
    setScannedData(null);
    setTxResult(null);
    setScanning(false);
  };

  const handleFullReset = () => {
    setStep("wallet");
    setWalletStep("choose");
    setAdminWalletAddress("");
    setScannedData(null);
    setTxResult(null);
    setScanning(false);
  };

  if (adminLoading)
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden">
      <div className="relative z-10 pb-28 px-5 pt-10 flex flex-col items-center">
        {/* Header */}
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

          {adminWalletAddress && step !== "wallet" && (
            <div className="mt-3 px-3 py-2 rounded-xl bg-safe/10 border border-safe/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-safe" />
                <span className="text-xs text-safe font-mono">{adminWalletAddress.slice(0, 10)}...</span>
              </div>
              <button onClick={handleFullReset} className="text-[10px] underline">
                Change
              </button>
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {/* STEP 1: WALLET SELECTION */}
            {step === "wallet" && (
              <motion.div
                key="wallet"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass-card rounded-2xl p-6 flex flex-col gap-4"
              >
                <div className="text-center mb-2">
                  <Wallet className="w-10 h-10 text-primary mx-auto mb-2" />
                  <h2 className="text-lg font-bold">Connect Admin Wallet</h2>
                  <p className="text-xs text-muted-foreground">Required to sign blockchain transactions</p>
                </div>

                {canUseMetaMaskDirectly() ? (
                  <button
                    onClick={handleConnectMetaMask}
                    className="w-full flex items-center gap-4 px-4 py-4 rounded-xl bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20 text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                      <Wallet className="text-orange-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">Connect MetaMask</p>
                      <p className="text-xs text-muted-foreground">Direct connection • Recommended</p>
                    </div>
                    <CheckCircle className="text-safe ml-auto shrink-0" />
                  </button>
                ) : (
                  <div className="w-full rounded-xl bg-orange-500/10 p-4 flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground">
                      MetaMask works best inside its in-app browser on mobile:
                    </p>
                    <a
                      href={getMetaMaskDeepLink()}
                      className="w-full py-2.5 rounded-xl bg-orange-500 text-white text-sm font-bold flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" /> Open in MetaMask App
                    </a>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border/50" /> <span className="text-xs">or</span>{" "}
                  <div className="flex-1 h-px bg-border/50" />
                </div>

                <button
                  onClick={() => setWalletStep("manual-input")}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-xl bg-muted/20 border hover:bg-muted/40 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-muted/30 flex items-center justify-center">
                    <PenLine className="text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">Enter Address Manually</p>
                  </div>
                </button>
              </motion.div>
            )}

            {/* STEP 2: SCANNER */}
            {step === "scanner" && (
              <motion.div
                key="scanner"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass-card rounded-2xl p-6 flex flex-col items-center gap-5"
              >
                <div className="text-center">
                  <QrCode className="w-10 h-10 text-primary mx-auto mb-2" />
                  <h2 className="text-lg font-bold">Scan Donor QR Code</h2>
                  <p className="text-sm text-muted-foreground">Ask the donor to show their QR code from the Fridge</p>
                </div>

                <div className="w-full rounded-2xl overflow-hidden bg-black/20 min-h-[280px] relative">
                  <div id={SCANNER_ID} className="w-full" />
                  {!scanning && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/40">
                      <QrCode className="opacity-30" />
                      <p className="text-sm mt-2">Tap "Start Camera"</p>
                    </div>
                  )}
                </div>

                <Button
                  onClick={scanning ? stopScanner : startScanner}
                  className="w-full"
                  variant={scanning ? "outline" : "default"}
                >
                  {scanning ? "Stop Camera" : "Start Camera & Scan"}
                </Button>
              </motion.div>
            )}

            {/* STEP 3: CONFIRMATION */}
            {step === "confirm" && scannedData && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="glass-card rounded-2xl p-6 flex flex-col gap-5"
              >
                <div className="text-center">
                  <CheckCircle className="w-10 h-10 text-safe mx-auto mb-2" />
                  <h2 className="text-lg font-bold">QR Scanned!</h2>
                  <p className="text-sm text-muted-foreground">Review donation details before sending to blockchain</p>
                </div>

                <div className="space-y-2.5">
                  <div className="flex justify-between py-3 px-4 rounded-xl bg-background/40 border">
                    <span className="text-sm text-muted-foreground">Item</span>
                    <span className="text-sm font-bold">{scannedData.itemName}</span>
                  </div>
                  <div className="flex justify-between py-3 px-4 rounded-xl bg-background/40 border">
                    <span className="text-sm text-muted-foreground">Tokens</span>
                    <span className="text-sm font-bold text-primary">+{scannedData.isCritical ? 5 : 3} 🪙</span>
                  </div>
                </div>

                <Button onClick={handleConfirmOnChain} className="w-full bg-primary">
                  Confirm on Blockchain
                </Button>
                <Button onClick={handleReset} variant="outline" className="w-full">
                  Cancel / Scan Again
                </Button>
              </motion.div>
            )}

            {/* STEP 4: SUCCESS */}
            {step === "success" && txResult && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-card rounded-2xl p-7 flex flex-col items-center gap-5"
              >
                <CheckCircle className="w-16 h-16 text-safe" />
                <h2 className="text-xl font-bold">Donation Confirmed! 🎉</h2>
                <p className="text-sm text-center text-muted-foreground">
                  Blockchain has permanently recorded this donation.
                </p>

                <div className="w-full py-4 rounded-xl bg-primary/10 border border-primary/20 text-center">
                  <p className="text-3xl font-bold text-primary">+{txResult.tokensAwarded} 🪙</p>
                  <p className="text-xs text-muted-foreground">Awarded to donor wallet</p>
                </div>

                {txResult.etherscanUrl && (
                  <a
                    href={txResult.etherscanUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3 rounded-xl bg-blue-500/15 text-blue-400 text-sm font-bold flex items-center justify-center gap-2 hover:bg-blue-500/25 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" /> View on Etherscan
                  </a>
                )}

                <Button onClick={handleReset} className="w-full">
                  Scan Next Donation
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
