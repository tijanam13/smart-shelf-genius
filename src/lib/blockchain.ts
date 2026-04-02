/*
 * src/lib/blockchain.ts
 */

import { BrowserProvider, Contract } from "ethers";

// Adresa contracta
export const CONTRACT_ADDRESS = "0x9DfB77f3e7e845A39c18c40E15D0F02b42C1a7f5";

// Sepolia Chain ID
const SEPOLIA_CHAIN_ID = "0xaa36a7";

// ABI
export const CONTRACT_ABI = [
  {
    inputs: [
      { internalType: "address", name: "recipient", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "awardBonusTokens",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "itemName", type: "string" },
      { internalType: "bool", name: "isCritical", type: "bool" },
    ],
    name: "donate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "donor", type: "address" },
      { indexed: false, internalType: "string", name: "itemName", type: "string" },
      { indexed: false, internalType: "uint256", name: "tokensAwarded", type: "uint256" },
      { indexed: false, internalType: "bool", name: "isCritical", type: "bool" },
      { indexed: false, internalType: "uint256", name: "timestamp", type: "uint256" },
    ],
    name: "DonationRecorded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "donor", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "TokensRedeemed",
    type: "event",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "donationCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "donations",
    outputs: [
      { internalType: "address", name: "donor", type: "address" },
      { internalType: "string", name: "itemName", type: "string" },
      { internalType: "uint256", name: "tokensAwarded", type: "uint256" },
      { internalType: "bool", name: "isCritical", type: "bool" },
      { internalType: "uint256", name: "timestamp", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "index", type: "uint256" }],
    name: "getDonation",
    outputs: [
      { internalType: "address", name: "donor", type: "address" },
      { internalType: "string", name: "itemName", type: "string" },
      { internalType: "uint256", name: "tokensAwarded", type: "uint256" },
      { internalType: "bool", name: "isCritical", type: "bool" },
      { internalType: "uint256", name: "timestamp", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "donor", type: "address" }],
    name: "getDonationCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "donor", type: "address" }],
    name: "getTokenBalance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getTotalDonations",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "tokenBalance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "TOKENS_CRITICAL",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "TOKENS_NORMAL",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

export interface DonationResult {
  success: boolean;
  txHash?: string;
  etherscanUrl?: string;
  tokensAwarded?: number;
  error?: string;
}

export function isMetaMaskInstalled(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).ethereum);
}

export async function switchToSepolia(): Promise<void> {
  const ethereum = (window as any).ethereum;
  if (!ethereum) return;
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID }],
    });
  } catch (err: any) {
    if (err.code === 4902) {
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
    }
  }
}

export async function recordDonationOnChain(itemName: string, isCritical: boolean): Promise<DonationResult> {
  try {
    if (!isMetaMaskInstalled()) return { success: false, error: "MetaMask nije instaliran." };

    const provider = new BrowserProvider((window as any).ethereum);
    await provider.send("eth_requestAccounts", []);
    await switchToSepolia();

    const signer = await provider.getSigner();
    const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    const tx = await (contract as any).donate(itemName, isCritical);
    await tx.wait();

    return {
      success: true,
      txHash: tx.hash,
      etherscanUrl: `https://sepolia.etherscan.io/tx/${tx.hash}`,
      tokensAwarded: isCritical ? 5 : 3,
    };
  } catch (err: any) {
    if (err.code === 4001 || err.code === "ACTION_REJECTED") {
      return { success: false, error: "Transakcija odbijena." };
    }
    return { success: false, error: err.message || "Greška na blockchainu." };
  }
}

export async function getBlockchainTokenBalance(address: string): Promise<number> {
  try {
    if (!isMetaMaskInstalled()) return 0;
    const provider = new BrowserProvider((window as any).ethereum);
    const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    const balance = await (contract as any).getTokenBalance(address);
    return Number(balance);
  } catch {
    return 0;
  }
}
