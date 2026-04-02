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
  isMetaMaskAvailable,
  isMobileDevice,
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
  | "scanner" // Kamera i skeniranje QR koda
  | "confirm" // Pregled detalja donacije
  | "processing" // Čekanje na blockchain potvrdu
  | "success" // Uspešno
  | "error"; // Greška

const SCANNER_ID = "admin-qr-reader";

// ─── COMPONENT ────────────────────────────────────────────────────────────────

const AdminScan = () => {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Wallet
  const [adminWalletAddress, setAdminWalletAddress] = useState("");
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [isOnSepolia, setIsOnSepolia] = useState(false);

  // Flow
  const [step, setStep] = useState<PageStep>("scanner");
  const [scannedData, setScannedData] = useState<QRDonationData | null>(null);
  const [txResult, setTxResult] = useState<DonationResult | null>(null);
  const [scanning, setScanning] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);

  // ─── GUARDS ─────────────────────────────────────────────────────────

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

  // Cleanup kamera pri odlasku sa stranice
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  // Prati promenu mreže u MetaMask-u
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
        title: "✅ Wallet povezan",
        description: `${address.slice(0, 8)}...${address.slice(-6)}`,
      });
    } catch (err: any) {
      toast({ title: "Greška", description: err.message, variant: "destructive" });
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const switchNetwork = async () => {
    try {
      await switchToSepolia();
      const net = await checkNetwork();
      setIsOnSepolia(net.ok);
      if (net.ok) toast({ title: "✅ Sepolia aktivan" });
    } catch (err: any) {
      toast({ title: "Greška", description: err.message, variant: "destructive" });
    }
  };

  // ─── KAMERA / SKENER ─────────────────────────────────────────────────

  const startScanner = async () => {
    try {
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
      }
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
      toast({ title: "✅ QR skeniran!", description: `Pronađeno: ${data.itemName}` });
    } catch {
      toast({
        title: "Greška čitanja",
        description: "Nije moguće pročitati QR kod. Pokušajte ponovo.",
        variant: "destructive",
      });
    }
  };

  // ─── BLOCKCHAIN ──────────────────────────────────────────────────────

  const handleConfirmOnChain = async () => {
    if (!scannedData || !user) return;

    // Ako MetaMask nije dostupan (mobilni regularni browser),
    // otvori MetaMask app putem deep linka — korisnik tamo potvrđuje
    if (!isMetaMaskAvailable() && isMobileDevice()) {
      const deepLink = getMetaMaskDeepLink();
      window.location.href = deepLink;
      return;
    }

    // Ako MetaMask nije uopšte dostupan (desktop bez ekstenzije)
    if (!isMetaMaskAvailable()) {
      toast({
        title: "MetaMask nije instaliran",
        description: "Instalirajte MetaMask ekstenziju na metamask.io",
        variant: "destructive",
      });
      return;
    }

    // Ako wallet nije još povezan, poveži ga prvo
    if (!adminWalletAddress) {
      await connectWallet();
      return;
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

    // Sinhronizacija sa Supabase bazom posle blockchain potvrde
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
    }

    setStep("success");
  };

  // ─── RESET ───────────────────────────────────────────────────────────

  const handleScanAgain = () => {
    setStep("scanner");
    setScannedData(null);
    setTxResult(null);
    setScanning(false);
  };

  // ─── LOADING / GUARD ─────────────────────────────────────────────────

  if (adminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!isAdmin) return null;

  // ─── RENDER ──────────────────────────────────────────────────────────

  // Odredimo status MetaMask-a za prikaz UI-a
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
              <h1 className="font-display text-xl font-bold">Admin — QR Skener</h1>
              <p className="text-xs text-muted-foreground">Blockchain donacije • Sepolia Testnet</p>
            </div>
          </div>

          {/* Wallet status traka */}
          <div
            className="mt-3 px-3 py-2 rounded-xl border flex items-center justify-between
            bg-background/40"
          >
            {adminWalletAddress ? (
              <>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-safe" />
                  <span className="text-xs text-safe font-mono">
                    {adminWalletAddress.slice(0, 10)}...{adminWalletAddress.slice(-6)}
                  </span>
                  {!isOnSepolia && (
                    <button onClick={switchNetwork} className="text-[10px] text-yellow-400 underline ml-1">
                      Prebaci na Sepolia
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
                  Promeni
                </button>
              </>
            ) : metamaskAvailable ? (
              /* MetaMask dostupan ali nije povezan */
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
                {isConnectingWallet ? "Povezivanje..." : "Poveži MetaMask za potpisivanje"}
              </button>
            ) : onMobile ? (
              /* Mobilni bez MetaMask browsera */
              <a href={getMetaMaskDeepLink()} className="flex items-center gap-2 text-xs text-orange-400">
                <ExternalLink className="w-3.5 h-3.5" />
                Otvori u MetaMask za potpisivanje
              </a>
            ) : (
              /* Desktop bez MetaMask ekstenzije */
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />
                MetaMask ekstenzija nije instalirana
              </span>
            )}
          </div>
        </motion.div>

        {/* ── Step Content ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {/* ══════════════════════════════════════════════
                STEP 1 — SKENER (uvek dostupan)
            ══════════════════════════════════════════════ */}
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

                {/* Viewport kamere */}
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

            {/* ══════════════════════════════════════════════
                STEP 2 — POTVRDA DONACIJE
            ══════════════════════════════════════════════ */}
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

                {/* Poruka o MetaMask potpisivanju */}
                <div className="px-3 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20">
                  {metamaskAvailable ? (
                    <p className="text-xs text-orange-300 leading-relaxed">
                      <strong>MetaMask će se otvoriti</strong> za potpisivanje transakcije.
                    </p>
                  ) : onMobile ? (
                    <p className="text-xs text-orange-300 leading-relaxed">
                      Bićete preusmereni u <strong>MetaMask aplikaciju</strong> da potvrdite transakciju.
                    </p>
                  ) : (
                    <p className="text-xs text-yellow-300 leading-relaxed">
                      <strong>MetaMask nije instaliran.</strong> Instalirajte ekstenziju na metamask.io da biste
                      potpisali transakciju.
                    </p>
                  )}
                </div>

                <Button onClick={handleConfirmOnChain} className="w-full bg-primary" size="lg">
                  <Wallet className="w-4 h-4 mr-2" />
                  {onMobile && !metamaskAvailable ? "Otvori MetaMask i potvrdi" : "Potvrdi na Blockchain-u"}
                </Button>

                <Button onClick={handleScanAgain} variant="outline" className="w-full">
                  Otkaži / Skeniraj ponovo
                </Button>
              </motion.div>
            )}

            {/* ══════════════════════════════════════════════
                STEP 3 — PROCESSING
            ══════════════════════════════════════════════ */}
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
                  Čekamo potvrdu transakcije na Sepolia mreži. Ovo može trajati 15–30 sekundi.
                </p>
                <div className="w-full py-3 px-4 rounded-xl bg-primary/10 border border-primary/20 text-center">
                  <p className="text-xs text-muted-foreground">Ne zatvarajte stranicu</p>
                </div>
              </motion.div>
            )}

            {/* ══════════════════════════════════════════════
                STEP 4 — USPEH
            ══════════════════════════════════════════════ */}
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

            {/* ══════════════════════════════════════════════
                STEP 5 — GREŠKA
            ══════════════════════════════════════════════ */}
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
                  Proverite da li imate dovoljno Sepolia ETH za gas, i da je MetaMask na Sepolia testnet-u.
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
