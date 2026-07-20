/**
 * Wallet connection.
 *
 * Stellar Wallets Kit keeps the chosen wallet in a module-level store shared by
 * every kit instance, so selecting one here also settles which wallet
 * stellar-helper signs payments with and which one signs contract calls.
 *
 * This exists because `stellar-helper.ts` — which must not be modified — reads
 * the address immediately after opening the picker:
 *
 *     await kit.openModal({ onWalletSelected: (o) => kit.setWallet(o.id) });
 *     const { address } = await kit.getAddress();
 *
 * `openModal` resolves as soon as the modal is in the DOM, not when the user
 * picks something, so `getAddress()` runs against whatever wallet was selected
 * beforehand — the Freighter default. On a desktop with the Freighter
 * extension installed that happens to succeed, which is why it went unnoticed.
 * On a phone, where Freighter does not exist, it fails with "Freighter is not
 * connected" while the picker is still on screen.
 *
 * `connectWallet` below waits for the selection before reading the address.
 */

'use client';

import {
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
  FREIGHTER_ID,
} from '@creit.tech/stellar-wallets-kit';

let kit: StellarWalletsKit | null = null;

/** The shared kit. Its selected wallet is global to the Wallets Kit store. */
export function getKit(): StellarWalletsKit {
  if (!kit) {
    kit = new StellarWalletsKit({
      network: WalletNetwork.TESTNET,
      // Only a starting value; connectWallet always overwrites it with the
      // wallet the user actually picked.
      selectedWalletId: FREIGHTER_ID,
      modules: allowAllModules(),
    });
  }
  return kit;
}

/**
 * Open the wallet picker and resolve with the address, once the user has
 * chosen a wallet and it has returned one.
 */
export async function connectWallet(): Promise<string> {
  const k = getKit();

  const walletId = await new Promise<string>((resolve, reject) => {
    k.openModal({
      onWalletSelected: (option) => resolve(option.id),
      onClosed: () => reject(new Error('Wallet selection was cancelled.')),
    }).catch(reject);
  });

  k.setWallet(walletId);

  const { address } = await k.getAddress();
  if (!address) {
    throw new Error('The wallet connected but returned no address.');
  }
  return address;
}
