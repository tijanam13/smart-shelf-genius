/**
 * src/pages/AdminScan.tsx
 *
 * Admin-only QR scanner page.
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, QrCode, CheckCircle, AlertCircle, Loader2, Wallet, ExternalLink, RefreshCw } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
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
  getMetaMaskDeepLink,
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

type PageStep =
  | "wallet" // Step 1: Connect MetaMask
  | "scanner" // Step 2: Scan QR code
  | "confirm" // Step 3: Review & confirm
  | "processing" // Step 4: Waiting for blockchain
  | "success" // Done
  | "error"; // Something went wrong

const SCANNER_ID = "admin-qr-reader";

// ─── COMPONENT ────────────────────────────────────────────────────────────────

const AdminScan = () => {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Wallet state
  const [adminWalletAddress, setAdminWalletAddress] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isOnSepolia, setIsOnSepolia] = useState(false);

  // Page flow
  const [step, setStep] = useState<PageStep>("wallet");
  const [scannedData, setScannedData] = useState<QRDonationData | null>(null);
  const [txResult, setTxResult] = useState<DonationResult | null>(null);
  const [scanning, setScanning] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);

  // ─── GUARDS ────────────────────────────────────────────────────────

  // Redirect non-admins
  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      toast({
        title: "Pristup odbijen",
        description: "Ova stranica je samo za administratore.",
        variant: "destructive",
      });
      navigate("/");
    }
  }, [isAdmin, adminLoading]);

  // Clean up camera on unmount
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
          title: "Pogrešna mreža",
          description: "MetaMask nije na Sepolia testnet-u.",
          variant: "destructive",
        });
      }
    };

    ethereum.on("chainChanged", handleChainChange);
    return () => ethereum.removeListener("chainChanged", handleChainChange);
  }, []);

  // ─── WALLET CONNECTION ──────────────────────────────────────────────

  const handleConnectMetaMask = async () => {
    setIsConnecting(true);
    try {
      const address = await connectMetaMask();
      const net = await checkNetwork();
      setIsOnSepolia(net.ok);
      setAdminWalletAddress(address);
      setStep("scanner");
      toast({
        title: "Wallet povezan",
        description: `Adresa: ${address.slice(0, 8)}...${address.slice(-6)}`,
      });
    } catch (err: any) {
      toast({ title: "Greška", description: err.message, variant: "destructive" });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSwitchToSepolia = async () => {
    try {
      await switchToSepolia();
      const net = await checkNetwork();
      setIsOnSepolia(net.ok);
      if (net.ok) toast({ title: "Sepolia Testnet aktivan" });
    } catch (err: any) {
      toast({ title: "Greška", description: err.message, variant: "destructive" });
    }
  };

  // ─── CAMERA / SCANNER ───────────────────────────────────────────────

  const startScanner = async () => {
    try {
      // Stop any running instance first
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
      }

      const scanner = new Html5Qrcode(SCANNER_ID, { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" }, // Use rear camera
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (decodedText) => {
          // QR code successfully decoded
          scanner.stop().catch(() => {});
          setScanning(false);
          handleQRScanned(decodedText);
        },
        undefined, // Ignore per-frame errors silently
      );

      setScanning(true);
    } catch (err: any) {
      setScanning(false);
      toast({
        title: "Greška kamere",
        description: "Nije moguće pokrenuti kameru. Proverite dozvole u browseru.",
        variant: "destructive",
      });
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current?.isScanning) {
      await scannerRef.current.stop().catch(() => {});
    }
    setScanning(false);
  };

  const handleQRScanned = (rawText: string) => {
    try {
      const data: QRDonationData = JSON.parse(rawText);

      // Validate that this is a valid EatSmart donation QR
      if (!data.itemName || !data.userWalletAddress || data.action !== "food_donation") {
        toast({
          title: "Nevažeći QR",
          description: "Ovo nije validan EatSmart donacioni QR kod.",
          variant: "destructive",
        });
        return;
      }

      setScannedData(data);
      setStep("confirm");
      toast({ title: "QR skeniran!", description: `Pronađeno: ${data.itemName}` });
    } catch {
      toast({
        title: "Greška čitanja",
        description: "Nije moguće pročitati QR kod. Pokušajte ponovo.",
        variant: "destructive",
      });
    }
  };

  // ─── BLOCKCHAIN TRANSACTION ─────────────────────────────────────────

  const handleConfirmOnChain = async () => {
    if (!scannedData || !user) return;
    setStep("processing");

    // This will trigger MetaMask to open for transaction signing.
    // On mobile (MetaMask in-app browser), MetaMask pops up automatically.
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

    // ── Sync with Supabase database after blockchain confirmation ──
    try {
      const tokens = scannedData.isCritical ? 5 : 3;

      // Find the donor's user account by their wallet address
      const { data: donorProfile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("wallet_address", scannedData.userWalletAddress)
        .maybeSingle();

      const donorUserId = donorProfile?.user_id;

      // Log the donation record
      await supabase.from("donations").insert({
        user_id: donorUserId || user.id,
        item_name: scannedData.itemName,
        quantity: 1,
        unit: "pcs",
      });

      // Remove item from the donor's fridge
      if (scannedData.itemId) {
        await supabase.from("fridge_items").delete().eq("id", scannedData.itemId);
      }

      // Award EatSmart tokens to the donor in Supabase
      if (donorUserId) {
        await supabase.rpc("adjust_user_tokens", {
          _user_id: donorUserId,
          _token_delta: tokens,
          _point_delta: tokens,
        });
      }
    } catch (err: any) {
      console.error("Database sync error:", err.message);
      // Don't fail the whole flow — blockchain is the source of truth
    }

    setStep("success");
  };

  // ─── RESET HELPERS ──────────────────────────────────────────────────

  /** Go back to the scanner (keep wallet connected) */
  const handleScanAgain = () => {
    setStep("scanner");
    setScannedData(null);
    setTxResult(null);
    setScanning(false);
  };

  /** Full reset — back to wallet connection */
  const handleFullReset = () => {
    stopScanner();
    setStep("wallet");
    setAdminWalletAddress("");
    setIsOnSepolia(false);
    setScannedData(null);
    setTxResult(null);
    setScanning(false);
  };

  // ─── LOADING / GUARD RENDERS ────────────────────────────────────────

  if (adminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!isAdmin) return null;

  // ─── MAIN RENDER ────────────────────────────────────────────────────

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
              <h1 className="font-display text-xl font-bold">Admin — QR Skener</h1>
              <p className="text-xs text-muted-foreground">Blockchain donacije • Sepolia Testnet</p>
            </div>
          </div>

          {/* Connected wallet badge */}
          {adminWalletAddress && step !== "wallet" && (
            <div className="mt-3 px-3 py-2 rounded-xl bg-safe/10 border border-safe/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-safe" />
                <span className="text-xs text-safe font-mono">
                  {adminWalletAddress.slice(0, 10)}...{adminWalletAddress.slice(-6)}
                </span>
                {!isOnSepolia && (
                  <button onClick={handleSwitchToSepolia} className="text-[10px] text-yellow-400 underline ml-1">
                    Prebaci na Sepolia
                  </button>
                )}
              </div>
              <button onClick={handleFullReset} className="text-[10px] underline text-muted-foreground">
                Promeni
              </button>
            </div>
          )}
        </motion.div>

        {/* ── Step Content ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {/* ══════════════════════════════════════════════════════════
                STEP 1 — CONNECT WALLET
            ══════════════════════════════════════════════════════════ */}
            {step === "wallet" && (
              <motion.div
                key="wallet"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-card rounded-2xl p-6 flex flex-col gap-5"
              >
                <div className="text-center">
                  <Wallet className="w-12 h-12 text-primary mx-auto mb-3" />
                  <h2 className="text-lg font-bold">Poveži Admin Wallet</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    MetaMask mora biti povezan da bi admin mogao da potpiše blockchain transakciju
                  </p>
                </div>

                {canUseMetaMaskDirectly() ? (
                  /* ── MetaMask extension detected ── */
                  <button
                    onClick={handleConnectMetaMask}
                    disabled={isConnecting}
                    className="w-full flex items-center gap-4 px-5 py-4 rounded-xl bg-orange-500/10 border border-orange-500/40 hover:bg-orange-500/20 active:scale-95 transition-all text-left disabled:opacity-60"
                  >
                    <div className="w-11 h-11 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0">
                      {isConnecting ? (
                        <Loader2 className="w-5 h-5 text-orange-400 animate-spin" />
                      ) : (
                        <Wallet className="w-5 h-5 text-orange-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold">{isConnecting ? "Povezivanje..." : "Poveži MetaMask"}</p>
                      <p className="text-xs text-muted-foreground">Direktna konekcija • Preporučeno</p>
                    </div>
                    {!isConnecting && <CheckCircle className="w-5 h-5 text-safe shrink-0" />}
                  </button>
                ) : (
                  /* ── No MetaMask — show mobile deep link ── */
                  <div className="flex flex-col gap-3">
                    <div className="px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                      <p className="text-xs text-yellow-300 leading-relaxed">
                        MetaMask ekstenzija nije pronađena. Da biste koristili MetaMask na mobilnom uređaju, otvorite
                        ovu stranicu <strong>unutar MetaMask aplikacije</strong>.
                      </p>
                    </div>

                    <a
                      href={getMetaMaskDeepLink()}
                      className="w-full py-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white text-sm font-bold flex items-center justify-center gap-2 transition-all"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Otvori u MetaMask aplikaciji
                    </a>

                    <p className="text-[11px] text-center text-muted-foreground px-4">
                      MetaMask će otvoriti ovu stranicu u svom pregledaču gde možete direktno potpisati transakcije.
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ══════════════════════════════════════════════════════════
                STEP 2 — QR SCANNER
            ══════════════════════════════════════════════════════════ */}
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
                  <h2 className="text-lg font-bold">Skeniraj QR Kod Donatora</h2>
                  <p className="text-sm text-muted-foreground">Zamolite donatora da pokaže QR kod iz Fridge sekcije</p>
                </div>

                {/* Camera viewport */}
                <div className="w-full rounded-2xl overflow-hidden bg-black/30 min-h-[290px] relative border border-border/30">
                  <div id={SCANNER_ID} className="w-full" />
                  {!scanning && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 gap-2">
                      <QrCode className="w-14 h-14 opacity-25" />
                      <p className="text-sm text-muted-foreground">Pritisnite dugme da pokrenete kameru</p>
                    </div>
                  )}
                  {scanning && (
                    <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-safe/80 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      <span className="text-[10px] text-white font-bold">SKENIRANJE</span>
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
                      Zaustavi kameru
                    </>
                  ) : (
                    <>
                      <QrCode className="w-4 h-4 mr-2" />
                      Pokreni kameru i skeniraj
                    </>
                  )}
                </Button>
              </motion.div>
            )}

            {/* ══════════════════════════════════════════════════════════
                STEP 3 — CONFIRM DONATION
            ══════════════════════════════════════════════════════════ */}
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
                  <h2 className="text-lg font-bold">QR Skeniran!</h2>
                  <p className="text-sm text-muted-foreground">Pregledajte detalje pre slanja na blockchain</p>
                </div>

                {/* Donation details */}
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center py-3 px-4 rounded-xl bg-background/40 border">
                    <span className="text-sm text-muted-foreground">Namirnica</span>
                    <span className="text-sm font-bold">{scannedData.itemName}</span>
                  </div>

                  <div className="flex justify-between items-center py-3 px-4 rounded-xl bg-background/40 border">
                    <span className="text-sm text-muted-foreground">Tip</span>
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-full ${
                        scannedData.isCritical ? "bg-danger/20 text-danger" : "bg-safe/20 text-safe"
                      }`}
                    >
                      {scannedData.isCritical ? "⚠️ Kritično" : "✅ Normalno"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-3 px-4 rounded-xl bg-primary/10 border border-primary/20">
                    <span className="text-sm text-muted-foreground">Tokeni za donatora</span>
                    <span className="text-sm font-bold text-primary">+{scannedData.isCritical ? 5 : 3} 🪙</span>
                  </div>

                  <div className="py-3 px-4 rounded-xl bg-background/40 border">
                    <p className="text-xs text-muted-foreground mb-1">Wallet donatora</p>
                    <p className="text-xs font-mono break-all text-foreground/80">{scannedData.userWalletAddress}</p>
                  </div>
                </div>

                {/* MetaMask notice */}
                <div className="px-3 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20">
                  <p className="text-xs text-orange-300 leading-relaxed">
                    <strong>MetaMask će se otvoriti</strong> za potpisivanje transakcije. Proverite detalje pre potvrde
                    u MetaMask-u.
                  </p>
                </div>

                <Button onClick={handleConfirmOnChain} className="w-full bg-primary" size="lg">
                  <Wallet className="w-4 h-4 mr-2" />
                  Potvrdi na Blockchain-u
                </Button>

                <Button onClick={handleScanAgain} variant="outline" className="w-full">
                  Otkaži / Skeniraj ponovo
                </Button>
              </motion.div>
            )}

            {/* ══════════════════════════════════════════════════════════
                STEP 4 — PROCESSING
            ══════════════════════════════════════════════════════════ */}
            {step === "processing" && (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-card rounded-2xl p-8 flex flex-col items-center gap-5"
              >
                <Loader2 className="w-14 h-14 text-primary animate-spin" />
                <h2 className="text-lg font-bold text-center">Obrađivanje na Blockchain-u</h2>
                <p className="text-sm text-muted-foreground text-center leading-relaxed">
                  MetaMask obrađuje transakciju... Ovo može potrajati 15–30 sekundi dok se blok ne potvrdi na Sepolia
                  testnet-u.
                </p>
                <div className="w-full py-3 px-4 rounded-xl bg-primary/10 border border-primary/20 text-center">
                  <p className="text-xs text-muted-foreground">Ne zatvarajte stranicu</p>
                </div>
              </motion.div>
            )}

            {/* ══════════════════════════════════════════════════════════
                STEP 5 — SUCCESS
            ══════════════════════════════════════════════════════════ */}
            {step === "success" && txResult && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="glass-card rounded-2xl p-7 flex flex-col items-center gap-5"
              >
                <CheckCircle className="w-16 h-16 text-safe" />
                <h2 className="text-xl font-bold">Donacija Potvrđena! 🎉</h2>
                <p className="text-sm text-center text-muted-foreground">
                  Blockchain je trajno zabeležio ovu donaciju hrane.
                </p>

                <div className="w-full py-5 rounded-xl bg-primary/10 border border-primary/20 text-center">
                  <p className="text-3xl font-bold text-primary">+{txResult.tokensAwarded} 🪙</p>
                  <p className="text-xs text-muted-foreground mt-1">Dodeljeno donor wallet-u</p>
                </div>

                {txResult.etherscanUrl && (
                  <a
                    href={txResult.etherscanUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3 rounded-xl bg-blue-500/15 text-blue-400 text-sm font-bold flex items-center justify-center gap-2 hover:bg-blue-500/25 transition-colors border border-blue-500/20"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Pogledaj na Etherscan
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
                  Skeniraj sledeću donaciju
                </Button>
              </motion.div>
            )}

            {/* ══════════════════════════════════════════════════════════
                STEP 6 — ERROR
            ══════════════════════════════════════════════════════════ */}
            {step === "error" && txResult && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="glass-card rounded-2xl p-7 flex flex-col items-center gap-5"
              >
                <AlertCircle className="w-14 h-14 text-danger" />
                <h2 className="text-lg font-bold">Transakcija Neuspešna</h2>

                <div className="w-full py-3 px-4 rounded-xl bg-danger/10 border border-danger/20">
                  <p className="text-sm text-center text-danger/80">{txResult.error}</p>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  Proverite da li imate dovoljno Sepolia ETH za gas naknade, i da je MetaMask na Sepolia testnet-u.
                </p>

                <Button onClick={handleScanAgain} className="w-full" variant="outline">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Pokušaj ponovo
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
