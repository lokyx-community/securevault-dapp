import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract, formatEther, isAddress, parseEther } from "ethers";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, CircleHelp, Copy, ExternalLink, Fingerprint, LockKeyhole, RefreshCw, ShieldCheck, Wallet, Waves } from "lucide-react";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;
    };
  }
}

const VAULT_ADDRESS = (import.meta.env.VITE_VAULT_ADDRESS || "").trim();
const TARGET_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || "11155111");
const NETWORK_NAME = import.meta.env.VITE_NETWORK_NAME || (TARGET_CHAIN_ID === 31337 ? "Hardhat Local" : "Sepolia");
const ABI = [
  "function deposit() external payable",
  "function withdraw(uint256 amount) external",
  "function depositsOf(address account) external view returns (uint256)",
  "function totalDeposits() external view returns (uint256)",
  "event Deposited(address indexed account, uint256 amount, uint256 newBalance)",
  "event Withdrawn(address indexed account, uint256 amount, uint256 remainingBalance)"
];

type Notice = { kind: "success" | "error" | "info"; message: string };

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function explainError(error: unknown): string {
  const e = error as { code?: number | string; shortMessage?: string; reason?: string; message?: string };
  if (e?.code === 4001 || e?.code === "ACTION_REJECTED") return "You cancelled the request in your wallet.";
  if (e?.shortMessage) return e.shortMessage;
  if (e?.reason) return e.reason;
  if (typeof e?.message === "string") {
    if (e.message.toLowerCase().includes("insufficient funds")) return "Your wallet doesn't have enough test ETH to cover the transaction and gas.";
    return e.message.slice(0, 180);
  }
  return "Something went wrong. Please try again.";
}

export default function App() {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [walletBalance, setWalletBalance] = useState("0.0000");
  const [vaultBalance, setVaultBalance] = useState("0.0000");
  const [totalDeposits, setTotalDeposits] = useState("0.0000");
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [busy, setBusy] = useState<"connect" | "deposit" | "withdraw" | "refresh" | "switch" | "" > ("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [lastTx, setLastTx] = useState("");
  const [copied, setCopied] = useState(false);

  const provider = useMemo(() => window.ethereum ? new BrowserProvider(window.ethereum as never) : null, []);
  const isConfigured = isAddress(VAULT_ADDRESS);
  const onTargetNetwork = chainId === TARGET_CHAIN_ID;
  const contractRead = useMemo(() => provider && isConfigured ? new Contract(VAULT_ADDRESS, ABI, provider) : null, [provider, isConfigured]);

  const refresh = useCallback(async (address = account) => {
    if (!provider || !address || !isAddress(address)) return;
    setBusy((current) => current === "" ? "refresh" : current);
    try {
      const network = await provider.getNetwork();
      setChainId(Number(network.chainId));
      const nativeBalance = await provider.getBalance(address);
      setWalletBalance(Number(formatEther(nativeBalance)).toLocaleString("en-US", { maximumFractionDigits: 4, minimumFractionDigits: 4 }));
      if (isConfigured) {
        const vault = new Contract(VAULT_ADDRESS, ABI, provider);
        const [userAmount, totalAmount] = await Promise.all([
          vault.depositsOf(address) as Promise<bigint>,
          vault.totalDeposits() as Promise<bigint>
        ]);
        setVaultBalance(Number(formatEther(userAmount)).toLocaleString("en-US", { maximumFractionDigits: 4, minimumFractionDigits: 4 }));
        setTotalDeposits(Number(formatEther(totalAmount)).toLocaleString("en-US", { maximumFractionDigits: 4, minimumFractionDigits: 4 }));
      }
    } catch (error) {
      setNotice({ kind: "error", message: explainError(error) });
    } finally {
      setBusy((current) => current === "refresh" ? "" : current);
    }
  }, [provider, account, isConfigured]);

  const connectWallet = async () => {
    if (!window.ethereum || !provider) {
      setNotice({ kind: "error", message: "MetaMask wasn't detected. Install the MetaMask browser extension and reopen this page in that browser." });
      return;
    }
    setBusy("connect"); setNotice(null);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      const network = await provider.getNetwork();
      setAccount(accounts[0] || "");
      setChainId(Number(network.chainId));
      if (accounts[0]) await refresh(accounts[0]);
      setNotice({ kind: "success", message: "Wallet connected. Check the network before sending a transaction." });
    } catch (error) {
      setNotice({ kind: "error", message: explainError(error) });
    } finally { setBusy(""); }
  };

  const switchNetwork = async () => {
    if (!window.ethereum) return;
    setBusy("switch"); setNotice(null);
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${TARGET_CHAIN_ID.toString(16)}` }] });
      if (provider) {
        const network = await provider.getNetwork(); setChainId(Number(network.chainId));
        if (account) await refresh(account);
      }
      setNotice({ kind: "success", message: `Switched to ${NETWORK_NAME}.` });
    } catch (error) {
      const message = explainError(error);
      setNotice({ kind: "error", message: message.includes("4902") ? `Add ${NETWORK_NAME} to MetaMask first, then try again.` : message });
    } finally { setBusy(""); }
  };

  const transact = async (kind: "deposit" | "withdraw") => {
    if (!provider || !account || !isConfigured) {
      setNotice({ kind: "error", message: "Connect MetaMask and configure the deployed vault address first." }); return;
    }
    if (!onTargetNetwork) {
      setNotice({ kind: "error", message: `Please switch MetaMask to ${NETWORK_NAME} before using the vault.` }); return;
    }
    const rawAmount = kind === "deposit" ? depositAmount.trim() : withdrawAmount.trim();
    let amount: bigint;
    try {
      if (!rawAmount || !/^(?:\d+\.?\d*|\.\d+)$/.test(rawAmount)) throw new Error("Enter a valid amount, for example 0.05.");
      amount = parseEther(rawAmount);
      if (amount <= 0n) throw new Error("Amount must be greater than zero.");
      if (kind === "deposit" && Number(rawAmount) > Number(walletBalance)) throw new Error("That amount is higher than your displayed wallet balance. Leave some ETH for gas.");
      if (kind === "withdraw" && amount > parseEther(vaultBalance.replaceAll(",", ""))) throw new Error("You can't withdraw more than your vault balance.");
    } catch (error) { setNotice({ kind: "error", message: explainError(error) }); return; }

    setBusy(kind); setNotice({ kind: "info", message: "Confirm the transaction in MetaMask. Keep this page open while it is submitted." });
    try {
      const signer = await provider.getSigner();
      const vault = new Contract(VAULT_ADDRESS, ABI, signer);
      const tx = kind === "deposit" ? await vault.deposit({ value: amount }) : await vault.withdraw(amount);
      setLastTx(tx.hash);
      setNotice({ kind: "info", message: "Transaction submitted. Waiting for on-chain confirmation…" });
      await tx.wait();
      if (kind === "deposit") setDepositAmount(""); else setWithdrawAmount("");
      await refresh(account);
      setNotice({ kind: "success", message: `${kind === "deposit" ? "Deposit" : "Withdrawal"} confirmed on ${NETWORK_NAME}.` });
    } catch (error) { setNotice({ kind: "error", message: explainError(error) }); }
    finally { setBusy(""); }
  };

  useEffect(() => {
    if (!window.ethereum?.on) return;
    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      setAccount(accounts?.[0] || "");
      if (accounts?.[0]) void refresh(accounts[0]);
      else { setWalletBalance("0.0000"); setVaultBalance("0.0000"); }
    };
    const onChain = () => { if (provider) void provider.getNetwork().then((network) => { setChainId(Number(network.chainId)); if (account) void refresh(account); }); };
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    return () => { window.ethereum?.removeListener?.("accountsChanged", onAccounts); window.ethereum?.removeListener?.("chainChanged", onChain); };
  }, [provider, account, refresh]);

  const copyAddress = async () => {
    try { await navigator.clipboard.writeText(account); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
    catch { setNotice({ kind: "error", message: "Couldn't copy automatically. You can select the address and copy it manually." }); }
  };

  const explorerBase = TARGET_CHAIN_ID === 11155111 ? "https://sepolia.etherscan.io" : "";

  return (
    <div className="app-shell">
      <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="SecureVault home"><span className="brand-mark"><LockKeyhole size={18}/></span><span>secure<span className="brand-accent">vault</span></span><span className="brand-beta">DEMO</span></a>
        <div className="top-actions"><span className={`network-pill ${onTargetNetwork && chainId ? "network-good" : ""}`}><span className="status-dot"/>{chainId ? (onTargetNetwork ? NETWORK_NAME : `Chain ${chainId}`) : NETWORK_NAME}</span><button className="wallet-button" onClick={connectWallet} disabled={busy !== ""}>{account ? <><Wallet size={16}/>{shortAddress(account)}<ChevronDown size={15}/></> : <><Wallet size={16}/> Connect wallet</>}</button></div>
      </header>

      <main id="top" className="main-content">
        <section className="hero">
          <div className="eyebrow"><span className="eyebrow-line"/> SELF-CUSTODY, MADE CLEAR</div>
          <h1>Your ETH.<br/><span>Your rules.</span></h1>
          <p className="hero-copy">A straightforward vault for your test ETH. Deposit when you want, withdraw what belongs to you, and verify every move on-chain.</p>
          <div className="hero-meta"><span><ShieldCheck size={16}/> Non-custodial by design</span><span><Waves size={16}/> EVM compatible</span></div>
        </section>

        {!isConfigured && <div className="setup-banner"><CircleHelp size={19}/><div><strong>One setup step left</strong><p>Deploy the contract, then add its address to <code>frontend/.env</code> as <code>VITE_VAULT_ADDRESS</code>. See the README for exact commands.</p></div></div>}
        {notice && <div className={`notice notice-${notice.kind}`} role="status"><span className="notice-icon">{notice.kind === "success" ? <Check size={17}/> : notice.kind === "error" ? <CircleHelp size={17}/> : <RefreshCw size={17}/>}</span><span>{notice.message}</span><button aria-label="Dismiss notification" onClick={() => setNotice(null)}>×</button></div>}

        <section className="dashboard-grid" aria-label="Vault overview">
          <article className="balance-card primary-card"><div className="card-top"><span className="card-label">YOUR VAULT BALANCE</span><span className="card-icon purple"><LockKeyhole size={18}/></span></div><div className="balance-number">{vaultBalance}<span> ETH</span></div><p className="card-foot">Your recorded deposit in this vault</p><div className="card-divider"/><div className="mini-detail"><span>Connected wallet</span><strong>{account ? shortAddress(account) : "Not connected"}</strong></div><div className="mini-detail"><span>Network</span><strong>{chainId ? (onTargetNetwork ? NETWORK_NAME : "Wrong network") : "Awaiting wallet"}</strong></div></article>
          <article className="balance-card"><div className="card-top"><span className="card-label">WALLET BALANCE</span><span className="card-icon blue"><Wallet size={18}/></span></div><div className="balance-number">{walletBalance}<span> ETH</span></div><p className="card-foot">Available wallet balance, including funds you may use for gas</p><button className="text-action" onClick={() => void refresh()} disabled={!account || busy !== ""}><RefreshCw size={14}/> Refresh balances</button></article>
          <article className="balance-card"><div className="card-top"><span className="card-label">TOTAL IN VAULT</span><span className="card-icon green"><Fingerprint size={18}/></span></div><div className="balance-number">{totalDeposits}<span> ETH</span></div><p className="card-foot">All users' recorded deposits combined</p><div className="vault-note"><span className="status-dot"/> Contract state, read directly</div></article>
        </section>

        {!onTargetNetwork && chainId !== null && <div className="network-warning"><div><strong>You're on the wrong network.</strong><p>Switch to {NETWORK_NAME} before depositing or withdrawing.</p></div><button onClick={switchNetwork} disabled={busy !== ""}>{busy === "switch" ? "Switching…" : `Switch to ${NETWORK_NAME}`}</button></div>}

        <section className="action-grid">
          <article className="action-card"><div className="action-heading"><span className="action-icon deposit-icon"><ArrowDownLeft size={20}/></span><div><h2>Deposit ETH</h2><p>Add funds to your personal vault balance.</p></div></div><label htmlFor="deposit-amount">Amount</label><div className="amount-field"><input id="deposit-amount" inputMode="decimal" placeholder="0.00" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} disabled={busy !== ""}/><span>ETH</span><button onClick={() => setDepositAmount(walletBalance.replaceAll(",", ""))} disabled={!account || busy !== ""}>MAX*</button></div><p className="field-help">*Leaves no guaranteed gas reserve. Enter a little less than your full wallet balance.</p><button className="submit-button deposit-submit" onClick={() => void transact("deposit")} disabled={busy !== "" || !account || !isConfigured || !onTargetNetwork}>{busy === "deposit" ? <><span className="spinner"/> Waiting for transaction…</> : <><ArrowDownLeft size={17}/> Deposit to vault</>}</button><p className="action-caption"><LockKeyhole size={13}/> You'll confirm the transaction in MetaMask.</p></article>
          <article className="action-card"><div className="action-heading"><span className="action-icon withdraw-icon"><ArrowUpRight size={20}/></span><div><h2>Withdraw ETH</h2><p>Send your deposited funds back to your wallet.</p></div></div><label htmlFor="withdraw-amount">Amount</label><div className="amount-field"><input id="withdraw-amount" inputMode="decimal" placeholder="0.00" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} disabled={busy !== ""}/><span>ETH</span><button onClick={() => setWithdrawAmount(vaultBalance.replaceAll(",", ""))} disabled={!account || busy !== ""}>MAX</button></div><p className="field-help">You can only withdraw up to your own recorded vault balance.</p><button className="submit-button withdraw-submit" onClick={() => void transact("withdraw")} disabled={busy !== "" || !account || !isConfigured || !onTargetNetwork}>{busy === "withdraw" ? <><span className="spinner"/> Waiting for transaction…</> : <><ArrowUpRight size={17}/> Withdraw to wallet</>}</button><p className="action-caption"><ShieldCheck size={13}/> Withdrawals are limited by the contract.</p></article>
        </section>

        <section className="activity-section"><div className="section-heading"><div><span className="card-label">ON-CHAIN ACTIVITY</span><h2>Latest transaction</h2></div><span className="live-tag"><span className="status-dot"/> LIVE STATE</span></div>{lastTx ? <div className="transaction-row"><div className="transaction-icon"><Check size={17}/></div><div className="transaction-copy"><strong>Vault transaction</strong><span>{shortAddress(lastTx)}</span></div>{explorerBase && <a className="explorer-link" href={`${explorerBase}/tx/${lastTx}`} target="_blank" rel="noreferrer">View on explorer <ExternalLink size={14}/></a>}</div> : <div className="empty-activity"><div className="empty-icon"><Waves size={20}/></div><div><strong>No transaction in this session yet</strong><p>After your first confirmed deposit or withdrawal, its transaction hash will appear here.</p></div></div>}</section>

        <section className="trust-row"><div><ShieldCheck size={19}/><span><strong>Transparent by default</strong><small>Balances are read from contract state.</small></span></div><div><LockKeyhole size={19}/><span><strong>You stay in control</strong><small>The contract has no owner withdrawal function.</small></span></div><div><ExternalLink size={19}/><span><strong>Verify on-chain</strong><small>Use a block explorer to inspect transactions.</small></span></div></section>
        <footer><a className="brand footer-brand" href="#top"><span className="brand-mark"><LockKeyhole size={15}/></span><span>secure<span className="brand-accent">vault</span></span></a><span>Portfolio demo · Testnet only · Not audited</span><a href="https://ethereum.org/en/developers/docs/" target="_blank" rel="noreferrer">Ethereum docs <ExternalLink size={12}/></a></footer>
      </main>
    </div>
  );
}
