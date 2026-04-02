/**
 * src/pages/AdminScan.tsx
 *
 * Admin-only QR scanner stranica.
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

type WalletStep = "choose" | "connecting" | "manual-input" | "connected";
type PageStep = "wallet" | "scanner" | "confirm" | "processing" | "success" | "error";

const SCANNER_ID = "admin-qr-reader";

// ─── COMPONENT ───────────────────────────────────────────────────────────────
const AdminScan = () => {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Wallet state
  const [walletStep, setWalletStep] = useState<WalletStep>("choose");
  const [adminWalletAddress, setAdminWalletAddress] = useState("");
  const [manualAddressInput, setManualAddressInput] = useState("");
  const [manualAddressError, setManualAddressError] = useState("");
  const [isOnSepolia, setIsOnSepolia] = useState(false);
  const [copied, setCopied] = useState(false);

  // Page state
  const [step, setStep] = useState<PageStep>("wallet");
  const [scannedData, setScannedData] = useState<QRDonationData | null>(null);
  const [txResult, setTxResult] = useState<DonationResult | null>(null);
  const [scanning, setScanning] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Redirect non-admins
  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      toast({ title: "Pristup odbijen", description: "Ova stranica je samo za admine.", variant: "destructive" });
      navigate("/");
    }
  }, [isAdmin, adminLoading]);

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  // Slušaj promene mreže u MetaMask-u
  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    const handleChainChange = async () => {
      const net = await checkNetwork();
      setIsOnSepolia(net.ok);
      if (!net.ok) {
        toast({
          title: "Pogrešna mreža",
          description: "MetaMask nije na Sepolia testnetu. Prebacujem...",
          variant: "destructive",
        });
      }
    };

    ethereum.on("chainChanged", handleChainChange);
    return () => ethereum.removeListener("chainChanged", handleChainChange);
  }, []);

  // ─── METAMASK KONEKCIJA ───────────────────────────────────────────
  const handleConnectMetaMask = async () => {
    setWalletStep("connecting");
    try {
      const address = await connectMetaMask();
      const net = await checkNetwork();
      setIsOnSepolia(net.ok);
      setAdminWalletAddress(address);
      setWalletStep("connected");
      setStep("scanner");
      toast({
        title: "✅ MetaMask povezan",
        description: `Adresa: ${address.slice(0, 8)}...${address.slice(-6)} • Sepolia testnet`,
      });
    } catch (err: any) {
      setWalletStep("choose");
      toast({ title: "Greška", description: err.message, variant: "destructive" });
    }
  };

  // ─── PREBACIVANJE NA SEPOLIA ──────────────────────────────────────
  const handleSwitchToSepolia = async () => {
    try {
      await switchToSepolia();
      const net = await checkNetwork();
      setIsOnSepolia(net.ok);
      if (net.ok) {
        toast({ title: "✅ Sepolia testnet aktivan" });
      }
    } catch (err: any) {
      toast({ title: "Greška", description: err.message, variant: "destructive" });
    }
  };

  // ─── RUČNI UNOS ADRESE ────────────────────────────────────────────
  const handleManualAddressSubmit = () => {
    const addr = manualAddressInput.trim();
    if (!isValidEthAddress(addr)) {
      setManualAddressError("Unesite validnu Ethereum adresu (0x...)");
      return;
    }
    setManualAddressError("");
    setAdminWalletAddress(addr);
    setWalletStep("connected");
    setStep("scanner");
    toast({
      title: "✅ Adresa potvrđena",
      description: `${addr.slice(0, 8)}...${addr.slice(-6)}`,
    });
  };

  // ─── KOPIRANJE ADRESE ─────────────────────────────────────────────
  const handleCopyDeepLink = () => {
    const link = getMetaMaskDeepLink();
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
          title: "Pristup kameri odbijen",
          description: "Dozvolite pristup kameri u podešavanjima browsera.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Greška kamere",
          description: err?.message || "Nije moguće pokrenuti kameru. Pokušajte ponovo.",
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

  // ─── HANDLE QR DATA ──────────────────────────────────────────────
  const handleQRScanned = (rawText: string) => {
    try {
      const data: QRDonationData = JSON.parse(rawText);
      if (!data.itemName || !data.userWalletAddress || data.action !== "food_donation") {
        toast({
          title: "Nevažeći QR kod",
          description: "Ovo nije EatSmart donacijski QR kod.",
          variant: "destructive",
        });
        return;
      }
      setScannedData(data);
      setStep("confirm");
      toast({
        title: "✅ QR kod skeniran!",
        description: `${data.itemName} — ${data.isCritical ? "Prioritet (+5 tokena)" : "Standardno (+3 tokena)"}`,
      });
    } catch {
      toast({ title: "Greška čitanja QR koda", description: "Pokušajte ponovo.", variant: "destructive" });
    }
  };

  // ─── POTVRDI DONACIJU NA BLOCKCHAIN ──────────────────────────────
  const handleConfirmOnChain = async () => {
    if (!scannedData || !user) return;
    setStep("processing");

    // Pošalji tx na Sepolia blockchain
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

    // Sinhroniziraj sa Supabase
    const tokens = scannedData.isCritical ? 5 : 3;

    try {
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
      // Blockchain je potvrđen — DB greška ne blokira success ekran
      console.error("Supabase sync greška:", err.message);
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

  const handleFullReset = () => {
    setStep("wallet");
    setWalletStep("choose");
    setAdminWalletAddress("");
    setManualAddressInput("");
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
              <p className="text-xs text-muted-foreground">Blockchain donacije • Sepolia testnet</p>
            </div>
          </div>

          {/* Status bar kad je wallet konektovan */}
          {adminWalletAddress && step !== "wallet" && (
            <div className="mt-3 px-3 py-2 rounded-xl bg-safe/10 border border-safe/30 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-safe shrink-0" />
                <span className="text-xs text-safe font-mono">
                  {adminWalletAddress.slice(0, 10)}...{adminWalletAddress.slice(-8)}
                </span>
              </div>
              <button
                onClick={handleFullReset}
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
              >
                promeni
              </button>
            </div>
          )}
        </motion.div>

        {/* Main content */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {/* ══════════════════════════════════════════
                KORAK 1: WALLET KONEKCIJA
            ══════════════════════════════════════════ */}
            {step === "wallet" && (
              <motion.div key="wallet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {/* CHOOSE — biramo metodu */}
                {walletStep === "choose" && (
                  <div className="glass-card rounded-2xl p-6 flex flex-col gap-4">
                    <div className="text-center mb-2">
                      <Wallet className="w-10 h-10 text-primary mx-auto mb-2" />
                      <h2 className="font-display text-lg font-bold text-foreground">Poveži Admin Wallet</h2>
                      <p className="text-xs text-muted-foreground mt-1">
                        Potreban je Ethereum nalog za potpisivanje blockchain transakcija
                      </p>
                    </div>

                    {/* Opcija 1: MetaMask direktno */}
                    {canUseMetaMaskDirectly() ? (
                      <button
                        onClick={handleConnectMetaMask}
                        className="w-full flex items-center gap-4 px-4 py-4 rounded-xl bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20 transition-colors text-left"
                      >
                        <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0">
                          <Wallet className="w-5 h-5 text-orange-400" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">Poveži MetaMask</p>
                          <p className="text-xs text-muted-foreground">Direktna konekcija • preporučeno</p>
                        </div>
                        <CheckCircle className="w-4 h-4 text-safe ml-auto shrink-0" />
                      </button>
                    ) : (
                      /* MetaMask nije dostupan — ponudi deep link za telefon */
                      <div className="w-full rounded-xl bg-orange-500/10 border border-orange-500/30 p-4 flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0">
                            <Smartphone className="w-5 h-5 text-orange-400" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-foreground">Otvori u MetaMask browseru</p>
                            <p className="text-xs text-muted-foreground">MetaMask nije detektovan u ovom browseru</p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground px-1">
                          Na mobilnom telefonu, MetaMask radi samo kroz sopstveni in-app browser. Klikni dugme da
                          otвориš ovaj sajt unutar MetaMask app-a:
                        </p>
                        <a
                          href={getMetaMaskDeepLink()}
                          className="w-full py-2.5 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Otvori u MetaMask App
                        </a>
                        <button
                          onClick={handleCopyDeepLink}
                          className="w-full py-2 rounded-xl bg-muted/30 text-xs text-muted-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-2"
                        >
                          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copied ? "Link kopiran!" : "Kopiraj link"}
                        </button>
                      </div>
                    )}

                    {/* Razdvojnik */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-border/50" />
                      <span className="text-xs text-muted-foreground">ili</span>
                      <div className="flex-1 h-px bg-border/50" />
                    </div>

                    {/* Opcija 2: Ručni unos adrese */}
                    <button
                      onClick={() => setWalletStep("manual-input")}
                      className="w-full flex items-center gap-4 px-4 py-4 rounded-xl bg-muted/20 border border-border/30 hover:bg-muted/40 transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-muted/30 flex items-center justify-center shrink-0">
                        <PenLine className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">Unesi adresu ručno</p>
                        <p className="text-xs text-muted-foreground">Kopiraj 0x... adresu iz MetaMask app-a</p>
                      </div>
                    </button>

                    <p className="text-[10px] text-muted-foreground text-center px-2">
                      ⚠️ Za slanje blockchain transakcija potreban je Sepolia testni ETH.{" "}
                      <a href="https://faucet.sepolia.dev" target="_blank" rel="noreferrer" className="underline">
                        Uzmi besplatno na faucet.sepolia.dev
                      </a>
                    </p>
                  </div>
                )}

                {/* CONNECTING — čekamo MetaMask */}
                {walletStep === "connecting" && (
                  <div className="glass-card rounded-2xl p-8 flex flex-col items-center gap-5">
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                    <div className="text-center">
                      <p className="font-bold text-foreground">Čekam MetaMask...</p>
                      <p className="text-sm text-muted-foreground mt-1">Potvrdi konekciju u MetaMask popup-u</p>
                    </div>
                  </div>
                )}

                {/* MANUAL INPUT — ručni unos */}
                {walletStep === "manual-input" && (
                  <div className="glass-card rounded-2xl p-6 flex flex-col gap-4">
                    <div className="text-center">
                      <PenLine className="w-8 h-8 text-primary mx-auto mb-2" />
                      <h2 className="font-display text-lg font-bold text-foreground">Unesi Admin Adresu</h2>
                      <p className="text-xs text-muted-foreground mt-1">
                        Otvori MetaMask app → kopiraj svoju 0x... adresu → zalepi ovde
                      </p>
                    </div>

                    {/* Uputstvo za kopiranje iz MetaMask */}
                    <div className="px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-muted-foreground space-y-1">
                      <p className="font-semibold text-foreground">Kako kopirati adresu iz MetaMask:</p>
                      <p>1. Otvori MetaMask app na telefonu</p>
                      <p>2. Na vrhu ekrana klikni na svoju adresu (0x...)</p>
                      <p>3. Adresa je automatski kopirana u clipboard</p>
                      <p>4. Zalepi je ovde (long press → Paste)</p>
                    </div>

                    <div className="space-y-2">
                      <Input
                        placeholder="0x1234...abcd"
                        value={manualAddressInput}
                        onChange={(e) => {
                          setManualAddressInput(e.target.value);
                          setManualAddressError("");
                        }}
                        className={`font-mono text-xs ${manualAddressError ? "border-urgent" : ""}`}
                      />
                      {manualAddressError && <p className="text-xs text-urgent">{manualAddressError}</p>}
                    </div>

                    <div className="flex gap-3">
                      <Button variant="outline" onClick={() => setWalletStep("choose")} className="flex-1">
                        Nazad
                      </Button>
                      <Button
                        onClick={handleManualAddressSubmit}
                        disabled={!manualAddressInput.trim()}
                        className="flex-1"
                      >
                        Potvrdi adresu
                      </Button>
                    </div>

                    <div className="px-3 py-2 rounded-xl bg-warning/10 border border-warning/20">
                      <p className="text-xs text-warning text-center">
                        ⚠️ Ručni unos ne potpisuje transakcije automatski. MetaMask app će morati da bude otvoren i
                        spreman za potpisivanje.
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ══════════════════════════════════════════
                KORAK 2: SCANNER
            ══════════════════════════════════════════ */}
            {step === "scanner" && (
              <motion.div
                key="scanner"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-card rounded-2xl p-6 flex flex-col items-center gap-5"
              >
                {/* Upozorenje ako nije na Sepolia */}
                {canUseMetaMaskDirectly() && !isOnSepolia && (
                  <div className="w-full px-4 py-3 rounded-xl bg-warning/10 border border-warning/30 flex items-center justify-between gap-2">
                    <p className="text-xs text-warning">MetaMask nije na Sepolia mreži</p>
                    <button
                      onClick={handleSwitchToSepolia}
                      className="text-xs text-warning font-bold underline shrink-0"
                    >
                      Prebaci
                    </button>
                  </div>
                )}

                <div className="text-center">
                  <QrCode className="w-10 h-10 text-primary mx-auto mb-2" />
                  <h2 className="font-display text-lg font-bold text-foreground">Skeniraj QR Kod Donora</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Zamoli donora da otvori Donation modal i pokaže ti QR kod
                  </p>
                </div>

                <div className="w-full rounded-2xl overflow-hidden bg-black/20 border border-border/30 min-h-[280px] relative">
                  <div id={SCANNER_ID} className="w-full" />
                  {!scanning && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground bg-background/40">
                      <QrCode className="w-12 h-12 opacity-30" />
                      <p className="text-sm">Klikni "Pokreni kameru" da počneš</p>
                    </div>
                  )}
                </div>

                {!scanning ? (
                  <Button onClick={startScanner} className="w-full">
                    <QrCode className="w-4 h-4 mr-2" />
                    Pokreni kameru i skeniraj
                  </Button>
                ) : (
                  <Button variant="outline" onClick={stopScanner} className="w-full">
                    Zaustavi kameru
                  </Button>
                )}

                <p className="text-[11px] text-muted-foreground text-center">
                  Dozvoli pristup kameri kad browser pita. Usmeri na QR kod na ekranu donora.
                </p>
              </motion.div>
            )}

            {/* ══════════════════════════════════════════
                KORAK 3: POTVRDA DETALJA
            ══════════════════════════════════════════ */}
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
                  <h2 className="font-display text-lg font-bold text-foreground">QR Kod Skeniran!</h2>
                  <p className="text-sm text-muted-foreground mt-1">Proveri detalje pre potvrde</p>
                </div>

                {/* Detalji donacije */}
                <div className="space-y-2.5">
                  <div className="flex justify-between py-3 px-4 rounded-xl bg-background/40 border border-border/30">
                    <span className="text-sm text-muted-foreground">Namirnica</span>
                    <span className="text-sm font-bold text-foreground">{scannedData.itemName}</span>
                  </div>
                  <div className="flex justify-between py-3 px-4 rounded-xl bg-background/40 border border-border/30">
                    <span className="text-sm text-muted-foreground">Prioritet</span>
                    <span className={`text-sm font-bold ${scannedData.isCritical ? "text-warning" : "text-safe"}`}>
                      {scannedData.isCritical ? "⏰ Kritično (ističe uskoro)" : "✅ Standardno"}
                    </span>
                  </div>
                  <div className="flex justify-between py-3 px-4 rounded-xl bg-background/40 border border-border/30">
                    <span className="text-sm text-muted-foreground">Tokeni</span>
                    <span className="text-sm font-bold text-primary">+{scannedData.isCritical ? 5 : 3} 🪙</span>
                  </div>
                  <div className="py-3 px-4 rounded-xl bg-background/40 border border-border/30">
                    <span className="text-xs text-muted-foreground block mb-1">Wallet adresa donora</span>
                    <span className="text-xs font-mono text-foreground break-all">{scannedData.userWalletAddress}</span>
                  </div>
                  <div className="py-3 px-4 rounded-xl bg-background/40 border border-border/30">
                    <span className="text-xs text-muted-foreground block mb-1">Tvoj admin wallet</span>
                    <span className="text-xs font-mono text-foreground break-all">{adminWalletAddress}</span>
                  </div>
                </div>

                {/* Blockchain info */}
                <div className="px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-1">
                  <p className="text-xs font-semibold text-foreground">🔗 Šta se dešava:</p>
                  <p className="text-xs text-muted-foreground">• Transakcija se šalje na Sepolia blockchain</p>
                  <p className="text-xs text-muted-foreground">• Ti plaćaš gas (testni Sepolia ETH)</p>
                  <p className="text-xs text-muted-foreground">• Tokeni idu na donorovu wallet adresu</p>
                  <p className="text-xs text-muted-foreground">• Namirnica se automatski briše iz frižidera</p>
                </div>

                {canUseMetaMaskDirectly() && (
                  <div className="px-3 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20">
                    <p className="text-xs text-orange-400 text-center">
                      📱 MetaMask popup će se otvoriti za potpisivanje transakcije
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleReset} className="flex-1">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Skeniraj ponovo
                  </Button>
                  <Button onClick={handleConfirmOnChain} className="flex-1 bg-primary">
                    Potvrdi na Blockchain
                  </Button>
                </div>
              </motion.div>
            )}

            {/* ══════════════════════════════════════════
                PROCESSING
            ══════════════════════════════════════════ */}
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
                  <p className="text-lg font-bold text-foreground">Slanje na blockchain...</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {canUseMetaMaskDirectly() ? "Potvrdi transakciju u MetaMask popup-u" : "Obrađujem transakciju..."}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Ovo može trajati 15–30 sekundi</p>
                </div>
                <div className="w-full px-4 py-3 rounded-xl bg-muted/30 text-center space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Mreža: <span className="font-semibold text-foreground">Sepolia Testnet</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Namirnica: <span className="font-semibold text-foreground">{scannedData?.itemName}</span>
                  </p>
                </div>
              </motion.div>
            )}

            {/* ══════════════════════════════════════════
                SUCCESS
            ══════════════════════════════════════════ */}
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
                  <p className="text-xl font-bold text-foreground">Donacija Potvrđena! 🎉</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {scannedData?.itemName} je zabeležen na Sepolia blockchain-u
                  </p>
                </div>

                <div className="w-full py-4 rounded-xl bg-primary/10 border border-primary/20 text-center">
                  <p className="text-3xl font-bold text-primary">+{txResult.tokensAwarded} 🪙</p>
                  <p className="text-xs text-muted-foreground mt-1">dodato na donorovu adresu</p>
                </div>

                <div className="w-full space-y-2">
                  <div className="py-3 px-4 rounded-xl bg-safe/5 border border-safe/20 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-safe shrink-0" />
                    <p className="text-xs text-safe font-medium">Namirnica uklonjena iz frižidera ✓</p>
                  </div>
                  <div className="py-3 px-4 rounded-xl bg-safe/5 border border-safe/20 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-safe shrink-0" />
                    <p className="text-xs text-safe font-medium">Donacija zabeležena u bazi ✓</p>
                  </div>
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
                    Pogledaj na Etherscan
                  </a>
                )}

                <Button onClick={handleReset} className="w-full" variant="outline">
                  <QrCode className="w-4 h-4 mr-2" />
                  Skeniraj sledeću donaciju
                </Button>
              </motion.div>
            )}

            {/* ══════════════════════════════════════════
                ERROR
            ══════════════════════════════════════════ */}
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
                  <p className="text-lg font-bold text-foreground">Transakcija Neuspešna</p>
                  <p className="text-sm text-muted-foreground mt-2 px-2">{txResult.error}</p>
                </div>

                {txResult.error?.includes("gas") || txResult.error?.includes("funds") ? (
                  <a
                    href="https://faucet.sepolia.dev"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3 rounded-xl bg-blue-500/15 text-blue-400 text-sm font-bold hover:bg-blue-500/25 transition-colors flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Uzmi testni ETH na faucet.sepolia.dev
                  </a>
                ) : null}

                <div className="flex gap-3 w-full">
                  <Button onClick={() => setStep("confirm")} className="flex-1">
                    Pokušaj ponovo
                  </Button>
                  <Button variant="outline" onClick={handleReset} className="flex-1">
                    Skeniraj ponovo
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
