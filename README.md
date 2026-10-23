# SecureVault dApp

A portfolio demo built with Solidity, OpenZeppelin, Hardhat, React, TypeScript, and ethers v6. Users connect MetaMask, deposit test ETH, withdraw their own recorded deposits, and see transaction status.

> **Testnet/demo only. Not audited. Do not deposit real funds.** Security patterns reduce risk; they do not prove a contract is bug-free.

## Features

- MetaMask connection and account/network change handling
- Network guard before sending transactions
- Read wallet balance, individual vault balance, and aggregate deposits from the contract
- Deposit and withdraw transaction flows with wallet rejection, pending, confirmation, and error states
- Solidity custom errors and events
- OpenZeppelin `ReentrancyGuard`, checks-effects-interactions, and per-account accounting
- Hardhat tests for deposits, withdrawals, zero amounts, over-withdrawal, and balance isolation

## Requirements

- Node.js 20 or newer
- npm
- MetaMask for browser interaction
- For Sepolia: a dedicated test wallet and Sepolia test ETH

## Install

From the project root:

```bash
npm install
npm --prefix frontend install
```

## Compile and test the contract

```bash
npm run compile
npm test
```

The tests run against Hardhat's local in-memory network and do not require real ETH.

## Run locally

Terminal 1, from the project root:

```bash
npm run node
```

Terminal 2:

```bash
npm run deploy:local
```

Copy the printed `SecureVault deployed to` address. Add it to `frontend/.env`:

```env
VITE_VAULT_ADDRESS=0xPASTE_DEPLOYED_ADDRESS_HERE
VITE_CHAIN_ID=31337
VITE_NETWORK_NAME=Hardhat Local
```

Create `frontend/.env` by copying `frontend/.env.example` first. Add the Hardhat local network to MetaMask:

- Network name: Hardhat Local
- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Currency symbol: `ETH`

Use a **throwaway local development account only**. Hardhat prints development private keys; never use those keys on mainnet or with real assets. Import one of the local accounts into MetaMask for testing.

Terminal 3:

```bash
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

## Deploy to Sepolia

1. Create a separate test wallet. Never use a wallet holding real assets for deployment testing.
2. Get Sepolia test ETH from a reputable faucet.
3. Copy `.env.example` to `.env` at the project root. Set `SEPOLIA_RPC_URL` to a trusted RPC URL. Set `DEPLOYER_PRIVATE_KEY` to the dedicated test wallet's private key. Never commit `.env`; it is gitignored.
4. Deploy:

   ```bash
   npm run deploy:sepolia
   ```

5. Copy the deployed contract address into `frontend/.env`:

   ```env
   VITE_VAULT_ADDRESS=0xYOUR_DEPLOYED_ADDRESS
   VITE_CHAIN_ID=11155111
   VITE_NETWORK_NAME=Sepolia
   ```

6. Start the frontend again with `npm run dev`, connect MetaMask on Sepolia, and test with small amounts of **test ETH only**.

The included default RPC is a public community endpoint and may be rate-limited or unavailable. For reliable use, set an RPC URL from a provider you trust.

## Build the frontend

```bash
npm run build:web
```

## Security notes and limitations

- Each account can withdraw only its own recorded deposits; there is no owner/admin withdrawal function.
- `withdraw` uses OpenZeppelin's `ReentrancyGuard` and updates accounting before making the external ETH call.
- Failed ETH transfers revert the entire transaction, restoring the accounting changes.
- The contract intentionally has no `receive` or `fallback` function; ordinary direct ETH transfers are rejected. ETH forced into the contract by mechanisms outside normal calls may make its ETH balance larger than `totalDeposits`; this does not increase any user's withdrawable accounting balance.
- No upgradeability, admin controls, yield, token support, or emergency recovery is included.
- Frontend balance values are for display only. Contract checks are authoritative. The UI's MAX deposit button does not guarantee gas reserve; users should leave ETH for gas.
- This repository has not been externally audited. Before production use, arrange an independent security review, broaden tests (including adversarial receiver/reentrancy cases), review deployment configuration, and verify the deployed bytecode/source.

## Suggested portfolio demo flow

1. Show the contract tests passing.
2. Connect a test wallet on the chosen network.
3. Deposit a small amount of test ETH and show the pending/confirmed state.
4. Open the transaction in a block explorer.
5. Show the updated user balance and aggregate deposits.
6. Withdraw a portion and show that a different account cannot withdraw the first account's balance.

When sharing this project with a client, label it as a personal demo/prototype and describe exactly what you built and tested. Do not claim an audit or production deployment unless those have actually happened.
