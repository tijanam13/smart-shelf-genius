# SmartEat — AI-Powered Smart Fridge & Food Waste Reduction App

> **FON Hackathon – Web4 Challenge 2026**  
> Organized by Blockchain Laboratory · Student Blockchain Club · FONIS  
> Faculty of Organizational Sciences, University of Belgrade  
> Within the EIT HEI project **TROPHY**  
> [https://bc.elab.fon.bg.ac.rs/hackathon/](https://bc.elab.fon.bg.ac.rs/hackathon/)

**Live Demo:** [smart-eat-smart-fridge.lovable.app](https://smart-eat-smart-fridge.lovable.app/)

---

## About the Project

**SmartEat** is a full-stack application that helps households track fridge contents, reduce food waste, and donate surplus food, all while earning blockchain-backed rewards. The app combines AI-driven recipe suggestions, receipt scanning, expiry-date notifications, and a Web3 donation system to create a complete ecosystem that incentivizes sustainable food habits.

SmartEat was built as a hackathon submission and targets the intersection of **sustainability**, **Web3 technology**, and **everyday usability**.

---

## Features

### Smart Fridge Management
- Track food items with name, category, quantity, unit, and expiry date
- Visual urgency indicators: **Safe** (green) · **Warning** (yellow, ≤10 days) · **Urgent** (red, ≤5 days)
- Emoji-rich product visualizations for quick at-a-glance identification
- Filter and sort items by category or expiry date
- Edit quantities, update expiry dates, or delete items inline

### AI Receipt Scanner
- Upload a photo or take a picture of a grocery receipt
- Powered by **Google Gemini 2.5 Flash** via Supabase Edge Functions
- Automatically extracts food items, translates Serbian/local names to English, assigns categories, and estimates expiry dates
- Review and edit extracted items before saving them to the fridge

### Barcode Scanner
- Scan EAN-13 and Data Matrix barcodes using the device camera
- Automatically identifies the product and pre-fills the entry form

### Manual Entry
- Add items manually with a clean form interface
- Full category selection and date picker

### AI Recipe Suggestions
- Generates 3–5 personalized recipes based on what is currently in your fridge
- Prioritizes ingredients expiring soonest to minimize waste
- Powered by **Google Gemini 3 Flash Preview** via Lovable AI Gateway
- Each recipe includes ingredient list, step-by-step instructions, prep time, difficulty, and token reward value

### AI Recipe Chat
- Ask follow-up questions about recipes or request variations
- Conversational interface backed by an AI edge function

### Smart Notification System
- Automatically scans fridge and creates notifications for items expiring in 10 days (warning) or 5 days (urgent)
- Duplicate prevention ensures notifications are not repeated on the same day
- Notification center in the header with unread count badge and pulsing animation
- Mark as read, delete individual, or clear all notifications

### Food Donation & Blockchain Rewards
- Donate expiring items directly from the fridge view
- Generates a QR code for the donation that an admin scans to confirm
- Confirmed donations are recorded on-chain via a **Solidity smart contract** deployed on the **Ethereum Sepolia testnet**
- Donors earn **EatTokens** for each donation, with bonus tokens for critical (urgent) items
- Connect a **MetaMask** wallet to track on-chain token balance
- Supports mobile deep-link to MetaMask for mobile users

### Planet Progress
- Visual gamification layer showing the household's cumulative eco-impact
- Points grow with every donation and completed recipe
- Six progression tiers: 🌱 Seedling → 🌿 Sprouting → 🌳 Growing → 🌸 Blooming → 🌺 Lush → ✨ Cosmic
- Daily AI-generated eco tips powered by a Supabase Edge Function

### Shopping List
- AI-powered shopping suggestions based on fridge contents
- Manage shopping items with check-off functionality

### Reward Store
- Spend earned tokens on rotating weekly coupons (12 active coupons per week)
- Categories: Groceries, Eco, Planet, Special
- Purchased coupons generate a scannable QR code for redemption at partner stores
- Track active and used coupons in a tabbed view

### Family Groups
- Create or join a family group with an invite code
- Shared token pool — every family member's donations and recipes contribute
- Shared planet progress that grows with the whole household

### User Profile
- Update display name and avatar
- Connect / disconnect MetaMask wallet
- View personal stats: total tokens, donation count, on-chain balance
- Toggle dark/light theme
- Phone notification opt-in

### Authentication & Authorization
- Email/password registration and login via Supabase Auth
- Password reset via email
- Admin role: admins are redirected to a dedicated scan page to confirm donations and record them on-chain
- Route guards for authenticated and admin-only pages

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + shadcn/ui (Radix UI primitives) |
| Animations | Framer Motion |
| State & Data Fetching | TanStack React Query |
| Routing | React Router DOM v6 |
| Backend / Database | Supabase (PostgreSQL + Row Level Security) |
| Authentication | Supabase Auth |
| Edge Functions | Supabase Edge Functions (Deno) |
| AI / LLM | Google Gemini 2.5 Flash & Gemini 3 Flash Preview via Lovable AI Gateway |
| Blockchain | Ethereum Sepolia Testnet · Solidity Smart Contract · ethers.js v6 |
| Web3 Wallet | MetaMask (browser extension + mobile deep link) |
| Barcode Scanning | html5-qrcode |
| QR Code Generation | qrcode.react |
| Payments | Stripe (via Supabase Edge Function) |
| Testing | Vitest + React Testing Library + Playwright |
| Build Tooling | Vite + SWC |
| Package Manager | Bun / npm |

---

## Project Structure

```
smart-eat/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── ui/              # shadcn/ui base components
│   │   ├── AIInsightCard    # AI recipe suggestions widget
│   │   ├── DonationModal    # QR-based donation flow
│   │   ├── NotificationCenter / NotificationDetail
│   │   ├── PlanetProgress   # Animated eco-progress visual
│   │   ├── ExpiringSection  # Fridge expiry overview
│   │   ├── RewardSection    # Token rewards overview
│   │   └── ...
│   ├── pages/               # Route-level page components
│   │   ├── Index            # Dashboard / home
│   │   ├── Fridge           # Full fridge management
│   │   ├── ShoppingList     # Smart shopping list
│   │   ├── ReceiptScanner   # AI receipt scanning
│   │   ├── BarcodeScanner   # Barcode scanning
│   │   ├── ManualEntry      # Manual item entry
│   │   ├── Planet           # Eco progress & tips
│   │   ├── Store            # Reward coupon store
│   │   ├── Family           # Family group management
│   │   ├── Profile          # User profile & settings
│   │   ├── AdminScan        # Admin donation confirmation
│   │   └── Login / Register / ForgotPassword / ResetPassword
│   ├── contexts/            # React contexts (Auth, Premium, Admin, Theme)
│   ├── hooks/               # Custom hooks (fridge items, notifications, family data)
│   ├── integrations/
│   │   └── supabase/        # Supabase client + generated TypeScript types
│   └── lib/
│       └── blockchain.ts    # Web3 / MetaMask / smart contract utilities
├── supabase/
│   ├── functions/           # Deno Edge Functions
│   │   ├── generate-recipes    # AI recipe generation
│   │   ├── recipe-chat         # AI recipe chat
│   │   ├── scan-receipt        # AI receipt OCR & parsing
│   │   ├── eco-tip             # Daily eco tip generation
│   │   ├── suggest-shopping    # AI shopping suggestions
│   │   ├── create-checkout     # Stripe checkout session
│   │   ├── stripe-webhook      # Stripe webhook handler
│   │   └── verify-premium      # Premium subscription verification
│   └── migrations/          # PostgreSQL schema migrations
└── public/
```

---

## Database Schema (Supabase)

Key tables:

- **profiles** — user profile data, wallet address, token balance, admin flag
- **fridge_items** — food items per user with name, category, quantity, unit, expiry date
- **donations** — record of donated items per user
- **notifications** — smart expiry notifications per user
- **family_groups** — household groups with invite codes
- **family_members** — membership join table
- **purchased_coupons** — store coupons bought with tokens, QR codes, redemption status
- **pending_donations** — QR-based donation queue awaiting admin scan confirmation

---

## Blockchain Integration

SmartEat uses a custom **FoodDonation** smart contract deployed on the **Ethereum Sepolia testnet**.

- **Contract address:** `0xb4aF266E08659B6C18da330b7596fA8b92e42783`
- **Network:** Sepolia (Chain ID: 11155111)

### Contract functions:

| Function | Description |
|---|---|
| `recordDonation(donor, itemName, isCritical)` | Records a donation and awards EatTokens |
| `getTokenBalance(donor)` | Returns on-chain token balance for an address |
| `getDonationCount(donor)` | Returns total number of donations by an address |
| `getTotalDonations()` | Returns the global donation counter |

### Donation flow:

1. User clicks **Donate** on an expiring fridge item
2. App generates a QR code containing item details and the user's wallet address
3. A volunteer/admin scans the QR code on the `/admin-scan` page
4. Admin confirms the donation → app calls `recordDonation` on-chain
5. Item is removed from the user's fridge
6. User receives EatTokens (more for critical/urgent items)

---

## Team

Built with ❤️ at **FON Hackathon – Web4 Challenge 2026** by:

- [@tijanam13](https://github.com/tijanam13)
- [@andjelaaNikolic](https://github.com/andjelaaNikolic)
- [@andrijanaopacic](https://github.com/andrijanaopacic)

The application was developed using Lovable as an AI-assisted full-stack development platform, enabling rapid implementation of features, integrations, and deployment within the hackathon timeframe, including a Supabase backend, Edge Functions, and blockchain components.

---

## License

This project was created for the FON Hackathon – Web4 Challenge 2026 and is intended for educational and demonstration purposes.

## Acknowledgements

- [FON Blockchain Laboratory](https://bc.elab.fon.bg.ac.rs/), [FONIS](https://fonis.rs/) & [EIT HEI TROPHY project](https://trophy.fon.bg.ac.rs/) for organizing the hackathon
- [Supabase](https://supabase.com/) for the backend infrastructure
- [Lovable](https://lovable.dev/) for the AI-assisted development platform
- [Google Gemini](https://deepmind.google/technologies/gemini/) for powering the AI features
- [shadcn/ui](https://ui.shadcn.com/) for the component library



