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

export const CONTRACT_ID =
  'CDIM27Z5AFBAP2OV6BI236K32DBXYAGZAIIICPRPRJM4QJV5FFKAGZ4R';

const RPC_URL = 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
const STROOPS = 10_000_000n;

const server = new StellarSdk.rpc.Server(RPC_URL);
const contract = new StellarSdk.Contract(CONTRACT_ID);

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

// ---- amount helpers -------------------------------------------------------

export function xlmToStroops(value: string): bigint {
  const [whole, frac = ''] = value.trim().split('.');
  const fracPadded = (frac + '0000000').slice(0, 7);
  return BigInt(whole || '0') * STROOPS + BigInt(fracPadded || '0');
}

export function stroopsToXlm(stroops: bigint): string {
  const neg = stroops < 0n;
  const abs = neg ? -stroops : stroops;
  const whole = abs / STROOPS;
  const frac = (abs % STROOPS).toString().padStart(7, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}

// ---- reads (via simulation) ----------------------------------------------

export type Campaign = {
  goalStroops: bigint;
  raisedStroops: bigint;
  deadline: number; // unix seconds
};

async function readValue(source: string, method: string): Promise<any> {
  const account = await server.getAccount(source);
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method))
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
    readValue(source, 'goal'),
    readValue(source, 'total_raised'),
    readValue(source, 'deadline'),
  ]);
  return {
    goalStroops: BigInt(goal),
    raisedStroops: BigInt(raised),
    deadline: Number(deadline),
  };
}

export async function getContribution(source: string): Promise<bigint> {
  const account = await server.getAccount(source);
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call('contribution', StellarSdk.Address.fromString(source).toScVal())
    )
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }
  return BigInt(StellarSdk.scValToNative(sim.result!.retval));
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
