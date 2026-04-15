import "./style.css";

import { EthereumProvider } from "@walletconnect/ethereum-provider";
import { BrowserProvider, Contract, JsonRpcProvider, MaxUint256, formatUnits, getAddress } from "ethers";
import QRCode from "qrcode";

const STORAGE_KEY = "batchtransfer.config.v1";
const CHAIN_ID = 56;
const CHAIN_HEX = "0x38";
const DISTRIBUTOR_ADDRESS = "0x666666C0264E4e56d3D7f28AEd0232705388C1FB";

const erc20Abi = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)"
];

const distributorAbi = [
  "function batchTransfer(address token, address[] recipients, uint256[] amounts) external"
];

const defaultConfig = {
  projectId: import.meta.env.VITE_REOWN_PROJECT_ID || "",
  rpcUrl: "https://bsc-mainnet.public.blastapi.io",
  token: "",
  weights: JSON.stringify(
    {
      "0x1111111111111111111111111111111111111111": 1000,
      "0x2222222222222222222222222222222222222222": 2000
    },
    null,
    2
  )
};

const els = {
  walletAddress: document.querySelector("#walletAddress"),
  copyWalletButton: document.querySelector("#copyWalletButton"),
  chainName: document.querySelector("#chainName"),
  tokenBalance: document.querySelector("#tokenBalance"),
  connectButton: document.querySelector("#connectButton"),
  refreshQrButton: document.querySelector("#refreshQrButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  qrPlaceholder: document.querySelector("#qrPlaceholder"),
  qrCanvas: document.querySelector("#qrCanvas"),
  sessionHint: document.querySelector("#sessionHint"),
  saveConfigButton: document.querySelector("#saveConfigButton"),
  previewButton: document.querySelector("#previewButton"),
  approveButton: document.querySelector("#approveButton"),
  batchTransferButton: document.querySelector("#batchTransferButton"),
  refreshBalanceButton: document.querySelector("#refreshBalanceButton"),
  projectIdInput: document.querySelector("#projectIdInput"),
  rpcUrlInput: document.querySelector("#rpcUrlInput"),
  distributorAddressText: document.querySelector("#distributorAddressText"),
  distributorLink: document.querySelector("#distributorLink"),
  tokenInput: document.querySelector("#tokenInput"),
  weightsInput: document.querySelector("#weightsInput"),
  weightTotal: document.querySelector("#weightTotal"),
  distributionBalance: document.querySelector("#distributionBalance"),
  distributionTotal: document.querySelector("#distributionTotal"),
  distributionRemainder: document.querySelector("#distributionRemainder"),
  previewBody: document.querySelector("#previewBody"),
  messageBox: document.querySelector("#messageBox")
};

let wcProvider;
let browserProvider;
let signer;
let connectedAccount = null;
let tokenMeta = null;
let qrExpiryTimer = null;

bootstrap();

async function bootstrap() {
  loadConfig();
  bindEvents();
  setMessage("填写 Project ID 后点击连接钱包。");
  await restoreSessionIfPossible();
}

function bindEvents() {
  els.connectButton.addEventListener("click", connectWallet);
  els.copyWalletButton.addEventListener("click", copyWalletAddress);
  els.refreshQrButton.addEventListener("click", refreshQrCode);
  els.disconnectButton.addEventListener("click", disconnectWallet);
  els.saveConfigButton.addEventListener("click", () => {
    saveConfig();
    setMessage("配置已保存到浏览器本地存储。");
  });
  els.previewButton.addEventListener("click", previewDistribution);
  els.refreshBalanceButton.addEventListener("click", refreshTokenBalance);
  els.approveButton.addEventListener("click", approveUnlimited);
  els.batchTransferButton.addEventListener("click", sendBatchTransfer);
}

function loadConfig() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const savedConfig = raw ? JSON.parse(raw) : {};
  const config = {
    ...defaultConfig,
    ...savedConfig,
    projectId: import.meta.env.VITE_REOWN_PROJECT_ID || savedConfig.projectId || ""
  };
  els.projectIdInput.value = config.projectId;
  els.rpcUrlInput.value = config.rpcUrl;
  els.distributorAddressText.textContent = DISTRIBUTOR_ADDRESS;
  els.distributorLink.href = `https://bscscan.com/address/${DISTRIBUTOR_ADDRESS}`;
  els.tokenInput.value = config.token;
  els.weightsInput.value = config.weights;
}

function saveConfig() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      projectId: els.projectIdInput.value.trim(),
      rpcUrl: els.rpcUrlInput.value.trim(),
      token: els.tokenInput.value.trim(),
      weights: els.weightsInput.value
    })
  );
}

async function initWalletConnect() {
  if (wcProvider) {
    return wcProvider;
  }

  const projectId = els.projectIdInput.value.trim();
  if (!projectId) {
    throw new Error("请先填写 WalletConnect Project ID。");
  }

  const rpcUrl = els.rpcUrlInput.value.trim();
  wcProvider = await EthereumProvider.init({
    projectId,
    chains: [CHAIN_ID],
    optionalChains: [CHAIN_ID],
    showQrModal: false,
    rpcMap: {
      [CHAIN_ID]: rpcUrl
    },
    methods: ["eth_sendTransaction", "personal_sign", "eth_signTypedData", "eth_signTypedData_v4"],
    events: ["accountsChanged", "chainChanged", "disconnect"],
    metadata: {
      name: "BatchDistributor Tool",
      description: "Approve token and call batchTransfer on BNB Smart Chain",
      url: window.location.origin,
      icons: ["https://walletconnect.com/walletconnect-logo.png"]
    }
  });

  wcProvider.on("display_uri", async (uri) => {
    clearQrExpiryTimer();
    els.qrPlaceholder.hidden = true;
    els.qrCanvas.hidden = false;
    await QRCode.toCanvas(els.qrCanvas, uri, {
      width: 260,
      margin: 1,
      color: {
        dark: "#101828",
        light: "#f9fafb"
      }
    });
    startQrExpiryTimer();
    setMessage("请尽快用手机钱包扫码连接。如果钱包提示二维码过期，点“刷新二维码”。");
  });

  wcProvider.on("accountsChanged", async (accounts) => {
    connectedAccount = accounts?.[0] || null;
    await syncWalletState();
  });

  wcProvider.on("chainChanged", async (chainId) => {
    els.chainName.textContent = normalizeChainName(chainId);
    await syncWalletState();
  });

  wcProvider.on("disconnect", () => {
    clearWalletState();
    setMessage("钱包已断开连接。");
  });

  browserProvider = new BrowserProvider(wcProvider, CHAIN_ID);
  return wcProvider;
}

async function connectWallet() {
  try {
    saveConfig();
    if (!connectedAccount) {
      await resetWalletConnectInstance();
    }
    const provider = await initWalletConnect();
    const accounts = await provider.enable();
    connectedAccount = accounts?.[0] || null;
    signer = await browserProvider.getSigner();
    await ensureBnbChain();
    await syncWalletState();
    setMessage("钱包已连接，可以执行 approve 或 batchTransfer。");
  } catch (error) {
    handleError(error);
  }
}

async function refreshQrCode() {
  try {
    saveConfig();
    await resetWalletConnectInstance();
    const provider = await initWalletConnect();
    setMessage("正在生成新的二维码。");
    await provider.enable();
  } catch (error) {
    handleError(error);
  }
}

async function restoreSessionIfPossible() {
  const projectId = els.projectIdInput.value.trim();
  if (!projectId) {
    return;
  }

  try {
    await initWalletConnect();
    const existingAccounts = wcProvider.accounts || [];
    if (!existingAccounts.length) {
      return;
    }

    connectedAccount = existingAccounts[0];
    signer = await browserProvider.getSigner();
    await ensureBnbChain();
    await syncWalletState();
    setMessage("已恢复之前的 WalletConnect 会话。");
  } catch (error) {
    console.warn("restore session failed", error);
    clearWalletState();
  }
}

async function disconnectWallet() {
  try {
    if (wcProvider) {
      await wcProvider.disconnect();
    }
    clearWalletState();
    setMessage("已断开 WalletConnect 会话。");
  } catch (error) {
    handleError(error);
  }
}

async function resetWalletConnectInstance() {
  clearQrExpiryTimer();
  if (wcProvider) {
    try {
      await wcProvider.disconnect();
    } catch (error) {
      console.warn("disconnect before reconnect failed", error);
    }
  }
  wcProvider = undefined;
  browserProvider = undefined;
  signer = null;
  connectedAccount = null;
  resetQrState("等待生成二维码");
}

async function ensureBnbChain() {
  if (!wcProvider) {
    return;
  }

  const current = await wcProvider.request({ method: "eth_chainId" });
  const normalized = normalizeChainIdValue(current);
  if (normalized !== CHAIN_ID) {
    throw new Error(`当前钱包链不是 BNB Smart Chain。请切到链 ID 56 后重试，当前是 ${current}。`);
  }
}

async function syncWalletState() {
  if (!wcProvider) {
    return;
  }

  const accounts = wcProvider.accounts || [];
  connectedAccount = accounts[0] || connectedAccount;
  els.walletAddress.textContent = connectedAccount || "未连接";
  els.chainName.textContent = "BNB Smart Chain";
  clearQrExpiryTimer();
  resetQrState(connectedAccount ? "已连接，无需再次扫码" : "等待生成二维码");
  if (connectedAccount) {
    await refreshTokenBalance();
  }
}

async function refreshTokenBalance() {
  try {
    const account = requireConnectedAccount();
    const tokenAddress = getAddress(els.tokenInput.value.trim());
    const rpcProvider = new JsonRpcProvider(els.rpcUrlInput.value.trim(), CHAIN_ID);
    const token = new Contract(tokenAddress, erc20Abi, rpcProvider);
    const [balance, decimals, symbol] = await Promise.all([
      token.balanceOf(account),
      token.decimals(),
      token.symbol()
    ]);

    tokenMeta = { decimals, symbol, balance };
    const formatted = formatUnits(balance, decimals);
    els.tokenBalance.textContent = `${formatted} ${symbol}`;
    els.distributionBalance.textContent = `${formatted} ${symbol}`;
    return tokenMeta;
  } catch (error) {
    tokenMeta = null;
    els.tokenBalance.textContent = "-";
    els.distributionBalance.textContent = "-";
    handleError(error);
    return null;
  }
}

async function copyWalletAddress() {
  try {
    const account = requireConnectedAccount();
    await navigator.clipboard.writeText(account);
    setMessage("钱包地址已复制到剪贴板。");
  } catch (error) {
    handleError(error);
  }
}

function parseWeights() {
  const raw = JSON.parse(els.weightsInput.value);
  const entries = Object.entries(raw);
  if (!entries.length) {
    throw new Error("权重对象不能为空。");
  }

  return entries.map(([address, weight]) => {
    const normalized = getAddress(address);
    const value = Number(weight);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`地址 ${normalized} 的权重必须是大于 0 的数字。`);
    }
    return { address: normalized, weight: Math.floor(value) };
  });
}

async function buildDistributionPlan() {
  const account = requireConnectedAccount();
  const tokenAddress = getAddress(els.tokenInput.value.trim());
  const distributor = getAddress(DISTRIBUTOR_ADDRESS);
  const weights = parseWeights();
  const rpcProvider = new JsonRpcProvider(els.rpcUrlInput.value.trim(), CHAIN_ID);
  const token = new Contract(tokenAddress, erc20Abi, rpcProvider);
  const [balance, decimals, symbol] = await Promise.all([
    token.balanceOf(account),
    token.decimals(),
    token.symbol()
  ]);

  const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    throw new Error("总权重必须大于 0。");
  }

  const rows = weights.map((item) => {
    const amount = (balance * BigInt(item.weight)) / BigInt(totalWeight);
    return {
      ...item,
      amount
    };
  });

  const distributionTotal = rows.reduce((sum, item) => sum + item.amount, 0n);
  const remainder = balance - distributionTotal;

  tokenMeta = { balance, decimals, symbol };

  return {
    account,
    tokenAddress,
    distributor,
    totalWeight,
    balance,
    decimals,
    symbol,
    rows,
    distributionTotal,
    remainder
  };
}

async function previewDistribution() {
  try {
    saveConfig();
    const plan = await buildDistributionPlan();
    renderPreview(plan);
    setMessage("预览已更新。请确认数量后再发送 batchTransfer。");
  } catch (error) {
    handleError(error);
  }
}

function renderPreview(plan) {
  els.weightTotal.textContent = String(plan.totalWeight);
  els.distributionBalance.textContent = `${formatUnits(plan.balance, plan.decimals)} ${plan.symbol}`;
  els.distributionTotal.textContent = `${formatUnits(plan.distributionTotal, plan.decimals)} ${plan.symbol}`;
  els.distributionRemainder.textContent = `${formatUnits(plan.remainder, plan.decimals)} ${plan.symbol}`;

  els.previewBody.innerHTML = "";
  for (const row of plan.rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.address}</td>
      <td>${row.weight}</td>
      <td>${formatUnits(row.amount, plan.decimals)} ${plan.symbol}</td>
    `;
    els.previewBody.appendChild(tr);
  }
}

async function approveUnlimited() {
  try {
    requireConnectedAccount();
    if (!signer) {
      signer = await browserProvider.getSigner();
    }

    const tokenAddress = getAddress(els.tokenInput.value.trim());
    const distributor = getAddress(DISTRIBUTOR_ADDRESS);
    const token = new Contract(tokenAddress, erc20Abi, signer);

    setMessage("已发起 approve，请在手机钱包里确认。");
    const tx = await token.approve(distributor, MaxUint256);
    setMessage(`approve 已发送，交易哈希: ${tx.hash}`);
    await tx.wait();
    setMessage(`approve 已确认，交易哈希: ${tx.hash}`);
  } catch (error) {
    handleError(error);
  }
}

async function sendBatchTransfer() {
  try {
    requireConnectedAccount();
    if (!signer) {
      signer = await browserProvider.getSigner();
    }

    const plan = await buildDistributionPlan();
    renderPreview(plan);

    const recipients = plan.rows.map((item) => item.address);
    const amounts = plan.rows.map((item) => item.amount);
    const distributor = new Contract(plan.distributor, distributorAbi, signer);

    setMessage("已发起 batchTransfer，请在手机钱包里确认。");
    const tx = await distributor.batchTransfer(plan.tokenAddress, recipients, amounts);
    setMessage(`batchTransfer 已发送，交易哈希: ${tx.hash}`);
    await tx.wait();
    setMessage(`batchTransfer 已确认，交易哈希: ${tx.hash}`);
    await refreshTokenBalance();
  } catch (error) {
    handleError(error);
  }
}

function requireConnectedAccount() {
  if (!connectedAccount) {
    throw new Error("请先连接钱包。");
  }
  return connectedAccount;
}

function clearWalletState() {
  clearQrExpiryTimer();
  connectedAccount = null;
  signer = null;
  browserProvider = null;
  wcProvider = null;
  els.walletAddress.textContent = "未连接";
  els.chainName.textContent = "BNB Smart Chain";
  els.tokenBalance.textContent = "-";
  resetQrState("等待生成二维码");
}

function startQrExpiryTimer() {
  clearQrExpiryTimer();
  qrExpiryTimer = window.setTimeout(() => {
    resetQrState("二维码可能已过期，请点“刷新二维码”重新生成");
    setMessage("二维码可能已过期，请点击“刷新二维码”后重新扫码。", true);
  }, 90_000);
}

function clearQrExpiryTimer() {
  if (qrExpiryTimer) {
    window.clearTimeout(qrExpiryTimer);
    qrExpiryTimer = null;
  }
}

function resetQrState(text) {
  els.qrCanvas.hidden = true;
  els.qrPlaceholder.hidden = false;
  els.qrPlaceholder.textContent = text;
}

function normalizeChainName(chainId) {
  return normalizeChainIdValue(chainId) === CHAIN_ID ? "BNB Smart Chain" : String(chainId);
}

function normalizeChainIdValue(chainId) {
  if (typeof chainId === "number") {
    return chainId;
  }
  if (typeof chainId === "string") {
    if (chainId.startsWith("0x") || chainId.startsWith("0X")) {
      return Number.parseInt(chainId, 16);
    }
    return Number.parseInt(chainId, 10);
  }
  return Number.NaN;
}

function setMessage(message, isError = false) {
  els.messageBox.textContent = message;
  els.messageBox.classList.toggle("error", isError);
}

function handleError(error) {
  const message = error?.shortMessage || error?.message || String(error);
  setMessage(message, true);
  console.error(error);
}
