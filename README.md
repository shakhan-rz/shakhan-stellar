# Shakhan — Stellar Money Toolkit

A small, focused payments toolkit built on the **Stellar** blockchain (testnet). Instead of one generic "dashboard", Shakhan bundles three everyday money tools behind a single wallet connection:

- **💸 Send** — send XLM to any Stellar address with an optional memo and instant confirmation.
- **🫙 Tip Jar** — turn your wallet into a shareable QR page so anyone can scan and send you a tip.
- **🧮 Split Bill** — enter a total, add a few friends, and pay everyone their even share in one flow.

Built for the **Stellar Journey to Mastery — White Belt (Level 1)** challenge.

**🌐 Live demo:** https://shakhan-stellar.vercel.app

> ⚠️ Runs on **Stellar Testnet** only. No real funds are ever used.

---

## ✨ Features

| Requirement | Where it lives |
|---|---|
| Connect / disconnect a wallet | Header wallet button → `app/page.tsx` |
| Fetch & display XLM balance | `components/BalanceDisplay.tsx` |
| Send an XLM transaction on testnet | `components/PaymentForm.tsx` |
| Transaction feedback (success/fail + hash) | `components/PaymentForm.tsx`, `components/SplitBill.tsx` |
| Activity / transaction history | `components/TransactionHistory.tsx` |
| **Bonus:** QR tip jar | `components/TipJar.tsx` |
| **Bonus:** multi-recipient split payments | `components/SplitBill.tsx` |

The app connects through **Stellar Wallets Kit**, so it works with Freighter, xBull, Albedo, Rabet, Lobstr, Hana, WalletConnect and more. Signing always happens **inside the user's wallet** — Shakhan never sees a private key.

---

## 🛠️ Tech Stack

- **Next.js 14** (App Router) + **React 18**
- **TypeScript**
- **Tailwind CSS**
- **@stellar/stellar-sdk** — blockchain calls (Horizon testnet)
- **@creit.tech/stellar-wallets-kit** — multi-wallet connection & signing
- **qrcode.react** — Tip Jar QR codes

---

## 🚀 Run it locally

**Prerequisites:** Node.js 18+ and a Stellar wallet extension (e.g. [Freighter](https://www.freighter.app/)) set to **Test Net**.

```bash
# 1. install dependencies
npm install

# 2. start the dev server
npm run dev

# 3. open the app
#    http://localhost:3000
```

Then:

1. Click **Connect Wallet** (top-right) and approve in your wallet.
2. Fund your testnet account with free XLM via [Friendbot](https://friendbot.stellar.org/) if the balance is 0.
3. Use the **Send / Tip Jar / Split Bill** tabs.

---

## 📸 Screenshots

**Landing**
![Landing](./screenshots/landing.png)

**Wallet connected + balance**
![Connected](./screenshots/connected.png)

**Successful testnet Send (with transaction hash)**
![Send success](./screenshots/send.png)

**Split Bill — paid everyone at once**
![Split Bill](./screenshots/split.png)

---

## 📂 Project structure

```
app/
  layout.tsx          # metadata + root layout
  page.tsx            # header wallet connect + app shell (sidebar/tabs)
  globals.css
components/
  BalanceDisplay.tsx
  PaymentForm.tsx      # Send
  TipJar.tsx           # Tip Jar (QR)      <- custom
  SplitBill.tsx        # Split Bill        <- custom
  TransactionHistory.tsx
  example-components.tsx
lib/
  stellar-helper.ts    # all blockchain logic (Stellar Wallets Kit + SDK)
```

---

## 🔒 A note on safety

- Testnet only — the network passphrase is `Test SDF Network ; September 2015`.
- Private keys never touch the app; every transaction is signed by the connected wallet.
- Always double-check a recipient address — blockchain payments can't be undone.
