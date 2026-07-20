/**
 * Crowdfunding contract client (frontend side).
 *
 * Talks to the Soroban crowdfunding contract deployed on Stellar testnet.
 * Reads are done via RPC simulation (no signature); contributing builds a
 * contract-invoke transaction, has the user's wallet sign it, submits it,
 * and waits for the on-chain result.
 *
 * This lives OUTSIDE stellar-helper.ts (which must not be modified) and uses
 * its own Wallets Kit instance for signing contract calls.
 */

'use client';

import * as StellarSdk from '@stellar/stellar-sdk';
import {
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
  FREIGHTER_ID,
} from '@creit.tech/stellar-wallets-kit';
import { xlmToStroops, rankSupporters, Tier, type Badge, type Campaign } from './amounts';

// Amount conversion and the badge types live in ./amounts, which has no wallet
// or network dependency so it can be unit-tested on its own. Re-exported here
// so callers still have a single import.
export {
  xlmToStroops,
  stroopsToXlm,
  rankSupporters,
  nextTierGap,
  Tier,
} from './amounts';
export type { Badge, Campaign } from './amounts';

/** The campaign. Calls into BADGE_ID on every contribution. */
export const CONTRACT_ID =
  'CDARMHEBXGGGVQ53GASWRQHWDCVVB7O6SXZLZY47PTPINF6DDZWW4DNZ';

/** The supporter badge registry the campaign reports to. */
export const BADGE_ID =
  'CBACUDL2SDBNBPDBDBFND6LQYZW25LKNFWWXZSWI277TA5WHXYFFU3WY';

const RPC_URL = 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

const server = new StellarSdk.rpc.Server(RPC_URL);
const contract = new StellarSdk.Contract(CONTRACT_ID);
const badgeContract = new StellarSdk.Contract(BADGE_ID);

// A dedicated kit just for signing contract invocations.
let signingKit: StellarWalletsKit | null = null;
function getKit(): StellarWalletsKit {
  if (!signingKit) {
    signingKit = new StellarWalletsKit({
      network: WalletNetwork.TESTNET,
      selectedWalletId: FREIGHTER_ID,
      modules: allowAllModules(),
    });
  }
  return signingKit;
}

// ---- reads (via simulation) ----------------------------------------------

const addr = (a: string) => StellarSdk.Address.fromString(a).toScVal();

/**
 * Call a read-only contract method through simulation. No signature, no fee,
 * no transaction — the RPC server just runs it and hands back the result.
 */
async function read(
  target: StellarSdk.Contract,
  source: string,
  method: string,
  ...args: StellarSdk.xdr.ScVal[]
): Promise<any> {
  const account = await server.getAccount(source);
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(target.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }
  return StellarSdk.scValToNative(sim.result!.retval);
}

export async function getCampaign(source: string): Promise<Campaign> {
  const [goal, raised, deadline] = await Promise.all([
    read(contract, source, 'goal'),
    read(contract, source, 'total_raised'),
    read(contract, source, 'deadline'),
  ]);
  return {
    goalStroops: BigInt(goal),
    raisedStroops: BigInt(raised),
    deadline: Number(deadline),
  };
}

export async function getContribution(source: string): Promise<bigint> {
  return BigInt(await read(contract, source, 'contribution', addr(source)));
}

function toBadge(raw: any): Badge {
  return {
    supporter: raw.supporter,
    total: BigInt(raw.total),
    tier: Number(raw.tier) as Tier,
    count: Number(raw.count),
  };
}

/** The badge `source` holds for this campaign, or null if they have none yet. */
export async function getBadge(source: string): Promise<Badge | null> {
  const raw = await read(badgeContract, source, 'badge_of', addr(CONTRACT_ID), addr(source));
  return raw ? toBadge(raw) : null;
}

/** Every supporter of this campaign, ranked by amount given (highest first). */
export async function getSupporters(source: string): Promise<Badge[]> {
  const raw: any[] = await read(badgeContract, source, 'supporters', addr(CONTRACT_ID));
  return rankSupporters(raw.map(toBadge));
}

/** The (silver, gold) thresholds in stroops. */
export async function getThresholds(source: string): Promise<[bigint, bigint]> {
  const [silver, gold] = await read(badgeContract, source, 'thresholds');
  return [BigInt(silver), BigInt(gold)];
}

// ---- write (contribute) ---------------------------------------------------

/**
 * Contribute `amountXlm` XLM to the campaign. Returns the transaction hash
 * once the contract call is confirmed on-chain.
 */
export async function contribute(donor: string, amountXlm: string): Promise<string> {
  const amount = xlmToStroops(amountXlm);
  if (amount <= 0n) throw new Error('Amount must be greater than zero.');

  const account = await server.getAccount(donor);
  const op = contract.call(
    'contribute',
    StellarSdk.Address.fromString(donor).toScVal(),
    StellarSdk.nativeToScVal(amount, { type: 'i128' })
  );

  const built = new StellarSdk.TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(120)
    .build();

  // Simulate + assemble (adds Soroban footprint, auth and resource fees).
  const prepared = await server.prepareTransaction(built);

  const { signedTxXdr } = await getKit().signTransaction(prepared.toXDR(), {
    address: donor,
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  const signed = StellarSdk.TransactionBuilder.fromXDR(
    signedTxXdr,
    NETWORK_PASSPHRASE
  );

  const sent = await server.sendTransaction(signed as StellarSdk.Transaction);
  if (sent.status === 'ERROR') {
    throw new Error('The network rejected the transaction.');
  }

  const hash = sent.hash;
  const started = Date.now();
  let result = await server.getTransaction(hash);
  while (result.status === StellarSdk.rpc.Api.GetTransactionStatus.NOT_FOUND) {
    if (Date.now() - started > 40000) {
      throw new Error('Timed out waiting for the transaction to confirm.');
    }
    await new Promise((r) => setTimeout(r, 2000));
    result = await server.getTransaction(hash);
  }

  if (result.status === StellarSdk.rpc.Api.GetTransactionStatus.FAILED) {
    throw new Error('The transaction failed on-chain.');
  }

  return hash;
}

// ---- live updates via contract events --------------------------------------

/** A `Contributed` event as emitted by the campaign contract. */
export type ContributedEvent = {
  donor: string;
  amount: bigint;
  totalRaised: bigint;
  goalReached: boolean;
  ledger: number;
  txHash: string;
};

/**
 * Watch the campaign for new `Contributed` events and call `onEvent` for each.
 *
 * Soroban RPC has no push channel, so this polls `getEvents` from the latest
 * ledger forward. That is still meaningfully different from re-reading the
 * contract: we learn *what changed and who did it* — including contributions
 * made by other people in other browsers — rather than just noticing a number
 * moved.
 *
 * Returns an unsubscribe function.
 */
export function watchContributions(
  onEvent: (e: ContributedEvent) => void,
  onError?: (e: Error) => void,
  intervalMs = 5000
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cursorLedger: number | undefined;
  let consecutiveFailures = 0;

  const tick = async () => {
    if (stopped) return;
    try {
      if (cursorLedger === undefined) {
        const latest = await server.getLatestLedger();
        cursorLedger = latest.sequence;
      }

      const res = await server.getEvents({
        startLedger: cursorLedger,
        filters: [
          {
            type: 'contract',
            contractIds: [CONTRACT_ID],
            // First topic is the event name the #[contractevent] macro derives
            // from the struct: Contributed -> "contributed".
            topics: [[StellarSdk.xdr.ScVal.scvSymbol('contributed').toXDR('base64'), '*']],
          },
        ],
        limit: 100,
      });

      for (const ev of res.events) {
        const data: any = StellarSdk.scValToNative(ev.value);
        onEvent({
          donor: StellarSdk.scValToNative(ev.topic[1]),
          amount: BigInt(data.amount),
          totalRaised: BigInt(data.total_raised),
          goalReached: Boolean(data.goal_reached),
          ledger: ev.ledger,
          txHash: ev.txHash,
        });
      }

      // Resume after the newest ledger we have seen.
      cursorLedger = (res.latestLedger ?? cursorLedger) + 1;
      consecutiveFailures = 0;
    } catch (err: any) {
      // A poll failing is not fatal — the next one usually succeeds. Report it
      // so the UI can show a degraded state rather than looking simply idle.
      consecutiveFailures += 1;

      // Soroban RPC only retains a day or so of events. After a laptop sleeps
      // or the connection drops for long enough, the cursor falls outside that
      // window and every later poll fails on the same ledger — the watcher
      // would be stuck for good. Give up on the gap and rejoin at the head.
      // Retry the same range a few times first, so a brief blip does not cost
      // us events.
      if (consecutiveFailures >= 3) {
        cursorLedger = undefined;
      }

      if (onError) onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
  };

  tick();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
