/**
 * src/lib/blockchain.ts
 *
 * Web3 utility functions for MetaMask connection and
 * FoodDonation smart contract interaction on Sepolia testnet.
 */

import { BrowserProvider, Contract } from "ethers";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
export const CONTRACT_ADDRESS = "0xb4aF266E08659B6C18da330b7596fA8b92e42783";

// Sepolia Chain ID
const SEPOLIA_CHAIN_ID = "0xaa36a7"; // = 11155111 decimal

// ABI
export const CONTRACT_ABI = [
  {
    name: "recordDonation",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "donor", type: "address" },
      { name: "itemName", type: "string" },
      { name: "isCritical", type: "bool" },
    ],
    outputs: [],
  },
  {
    name: "getTokenBalance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "donor", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getDonationCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "donor", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getTotalDonations",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "DonationRecorded",
    type: "event",
    inputs: [
      { name: "donor", type: "address", indexed: true },
      { name: "itemName", type: "string", indexed: false },
      { name: "tokensAwarded", type: "uint256", indexed: false },
      { name: "isCritical", type: "bool", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

// ─── TYPES ────────────────────────────────────────────────────────────────────
export interface DonationResult {
  success: boolean;
  txHash?: string;
  etherscanUrl?: string;
  tokensAwarded?: number;
  donorAddress?: string;
  error?: string;
}

// ─── METAMASK DETECTION ───────────────────────────────────────────────────────
export function isMetaMaskInstalled(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).ethereum);
}

// ─── CONNECT METAMASK ─────────────────────────────────────────────────────────
/**
 * Requests wallet connection from MetaMask.
 * Returns the connected account address, or null if rejected.
 */
export async function connectMetaMask(): Promise<string | null> {
  if (!isMetaMaskInstalled()) {
    throw new Error("MetaMask is not installed. Visit metamask.io to install it.");
  }

  try {
    const provider = new BrowserProvider((window as any).ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    return accounts[0] || null;
  } catch (err: any) {
    if (err.code === 4001) {
      throw new Error("MetaMask connection was rejected.");
    }
    throw err;
  }
}

// ─── SWITCH TO SEPOLIA ────────────────────────────────────────────────────────
/**
 * Prompts MetaMask to switch to Sepolia testnet.
 * Adds the network automatically if it doesn't exist.
 */
export async function switchToSepolia(): Promise<void> {
  const ethereum = (window as any).ethereum;
  if (!ethereum) throw new Error("MetaMask not found.");

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID }],
    });
  } catch (switchError: any) {
    // Network not in MetaMask — add it automatically
    if (switchError.code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: SEPOLIA_CHAIN_ID,
            chainName: "Sepolia Test Network",
            nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://rpc.sepolia.org"],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

// ─── RECORD DONATION ON BLOCKCHAIN ───────────────────────────────────────────
/**
 * Called by the ADMIN after scanning the donor's QR code.
 * The admin signs the transaction, but tokens are awarded
 * to the DONOR's wallet address (passed from the QR code).
 *
 * @param donorAddress  Donor's MetaMask wallet address (from QR data)
 * @param itemName      Food item name (e.g. "Milk")
 * @param isCritical    True if expiring within 5 days
 */
export async function recordDonationOnChain(
  donorAddress: string,
  itemName: string,
  isCritical: boolean,
): Promise<DonationResult> {
  try {
    if (!isMetaMaskInstalled()) {
      return {
        success: false,
        error: "MetaMask is not installed. Visit metamask.io.",
      };
    }

    // Connect and switch to Sepolia
    const provider = new BrowserProvider((window as any).ethereum);
    await provider.send("eth_requestAccounts", []);
    await switchToSepolia();

    // Get signer (admin's MetaMask account)
    const signer = await provider.getSigner();

    // Instantiate the contract
    const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    // Call recordDonation(donorAddress, itemName, isCritical)
    // This opens MetaMask popup for the admin to confirm
    const tx = await (contract as any).recordDonation(donorAddress, itemName, isCritical);

    // Wait for the transaction to be confirmed on-chain
    await tx.wait();

    const tokensAwarded = isCritical ? 5 : 3;

    return {
      success: true,
      txHash: tx.hash,
      etherscanUrl: `https://sepolia.etherscan.io/tx/${tx.hash}`,
      tokensAwarded,
      donorAddress,
    };
  } catch (err: any) {
    if (err.code === 4001 || err.code === "ACTION_REJECTED") {
      return {
        success: false,
        error: "Transaction was rejected in MetaMask.",
      };
    }
    return {
      success: false,
      error: err.message || "Transaction failed.",
    };
  }
}

// ─── READ TOKEN BALANCE ───────────────────────────────────────────────────────
/**
 * Read-only call — checks how many tokens an address has on the contract.
 * Does not require a transaction or gas.
 */
export async function getBlockchainTokenBalance(address: string): Promise<number> {
  try {
    const provider = new BrowserProvider((window as any).ethereum);
    const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    const balance = await (contract as any).getTokenBalance(address);
    return Number(balance);
  } catch {
    return 0;
  }
}
