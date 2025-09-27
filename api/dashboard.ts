import { VercelRequest, VercelResponse } from '@vercel/node';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { normalize } from 'viem/ens';

// Create viem client for Sepolia
const client = createPublicClient({
  chain: sepolia,
  transport: http(`https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`),
});

// PYUSD contract address on Sepolia testnet
const PYUSD_CONTRACT = '0xCaC524BcA292aaade2DF8A05cC58F0a65B1B3bB9';

// Interface for GitPay transaction data
interface GitPayTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  blockNumber: string;
  timestamp: number;
  recipient: string;
  amount: string;
  memo?: string;
  ens?: string;
}

// GitPay transaction identifier - hex for "GITPAY" (32 bytes = 64 hex chars)
const GITPAY_IDENTIFIER = '0x4749545041590000000000000000000000000000000000000000000000000000';

// Helper function to check if input data contains GitPay identifier
function containsGitPayIdentifier(data: string): boolean {
  // Check if the input data contains the GitPay identifier
  // The identifier should be in the additional data after the standard transfer parameters
  if (data.length > 138) {
    const additionalData = data.slice(138);
    const hasIdentifier = additionalData.includes(GITPAY_IDENTIFIER.slice(2)); // Remove 0x prefix
    
    // Debug logging
    if (hasIdentifier) {
      console.log(`🔍 Found GitPay identifier in transaction data:`, {
        dataLength: data.length,
        additionalData: additionalData.slice(0, 20) + '...',
        identifier: GITPAY_IDENTIFIER.slice(2)
      });
    }
    
    return hasIdentifier;
  }
  return false;
}

// Helper function to check if this is a GitPay transaction based on input data analysis
function isGitPayTransactionByInputData(data: string, tx: any): boolean {
  // 1. Must be a standard ERC20 transfer
  if (!data.startsWith('0xa9059cbb') || data.length < 138) {
    return false;
  }
  
  // 2. ONLY consider transactions that contain the GitPay identifier
  const hasGitPayIdentifier = containsGitPayIdentifier(data);
  
  return hasGitPayIdentifier;
}

// Helper function to parse GitPay transaction data
function parseGitPayTransactionData(data: string, tx?: any): { isGitPay: boolean; recipient?: string; amount?: string; memo?: string } {
  if (!data || data.length < 138) { // Minimum length for standard transfer
    return { isGitPay: false };
  }
  
  // Check if it's a transfer function call
  if (!data.startsWith('0xa9059cbb')) {
    return { isGitPay: false };
  }
  
  // Extract recipient address (bytes 4-35)
  const recipientHex = data.slice(10, 74);
  const recipient = '0x' + recipientHex.slice(24); // Remove padding
  
  // Extract amount (bytes 36-67)
  const amountHex = data.slice(74, 138);
  const amount = parseInt(amountHex, 16).toString();
  
  // Use the sophisticated GitPay detection logic
  const isGitPay = isGitPayTransactionByInputData(data, tx);
  
  return {
    isGitPay,
    recipient,
    amount,
    memo: undefined // No memo support for now
  };
}

// Helper function to fetch transactions for a specific address using Alchemy Asset Transfers API
async function fetchTransactionsForAddress(address: string, limit: number = 100): Promise<GitPayTransaction[]> {
  try {
    console.log(`🔍 Fetching asset transfers for address: ${address}`);
    
    const url = `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    // Get transfers TO the address
    const toAddressBody = JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "alchemy_getAssetTransfers",
      params: [
        {
          fromBlock: "0x0",
          toBlock: "latest",
          toAddress: address,
          withMetadata: true,
          excludeZeroValue: true,
          maxCount: "0x3e8", // 1000 transfers
          category: ["erc20"]
        }
      ]
    });

    // Get transfers FROM the address
    const fromAddressBody = JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "alchemy_getAssetTransfers",
      params: [
        {
          fromBlock: "0x0",
          toBlock: "latest",
          fromAddress: address,
          withMetadata: true,
          excludeZeroValue: true,
          maxCount: "0x3e8", // 1000 transfers
          category: ["erc20"]
        }
      ]
    });

    // Fetch both TO and FROM transfers
    const [toResponse, fromResponse] = await Promise.all([
      fetch(url, { method: 'POST', headers, body: toAddressBody }),
      fetch(url, { method: 'POST', headers, body: fromAddressBody })
    ]);

    const toData = await toResponse.json();
    const fromData = await fromResponse.json();

    if (toData.error) {
      throw new Error(`Alchemy API error (to): ${toData.error.message}`);
    }
    if (fromData.error) {
      throw new Error(`Alchemy API error (from): ${fromData.error.message}`);
    }

    const allTransfers = [
      ...(toData.result?.transfers || []),
      ...(fromData.result?.transfers || [])
    ];

    console.log(`📋 Found ${allTransfers.length} total asset transfers for address ${address}`);

    // Filter for PYUSD transfers only
    const pyusdTransfers = allTransfers.filter(transfer => 
      transfer.rawContract?.address?.toLowerCase() === PYUSD_CONTRACT.toLowerCase()
    );

    console.log(`📋 Found ${pyusdTransfers.length} PYUSD transfers for address ${address}`);

    const gitPayTransactions: GitPayTransaction[] = [];

    // Process each transfer and check if it's actually a GitPay transaction
    for (const transfer of pyusdTransfers.slice(0, limit)) {
      try {
        // Get the actual transaction to check its input data
        const tx = await client.getTransaction({ hash: transfer.hash as `0x${string}` });
        
        if (tx.input) {
          const parsed = parseGitPayTransactionData(tx.input, tx);
          
          console.log(`🔍 Checking transaction ${transfer.hash}:`, {
            input: tx.input.slice(0, 20) + '...',
            isGitPay: parsed.isGitPay,
            recipient: parsed.recipient,
            amount: parsed.amount,
            transferFrom: transfer.from,
            transferTo: transfer.to
          });
          
          // For now, let's be more lenient and include all PYUSD transfers
          // This will help debug the counting issue
          const amount = transfer.value ? (parseFloat(transfer.value) * Math.pow(10, transfer.rawContract?.decimals || 6)).toString() : '0';
          
          gitPayTransactions.push({
            hash: transfer.hash,
            from: transfer.from,
            to: transfer.to,
            value: amount,
            blockNumber: transfer.blockNum,
            timestamp: new Date(transfer.metadata?.blockTimestamp).getTime(),
            recipient: parsed.recipient || transfer.to,
            amount: parsed.amount || amount,
            memo: parsed.memo
          });
        }
      } catch (error) {
        console.error('Error processing transfer:', error);
        continue;
      }
    }

    console.log(`✅ Found ${gitPayTransactions.length} GitPay transactions for address ${address}`);
    
    // Remove duplicates based on transaction hash
    const uniqueTransactions = gitPayTransactions.reduce((acc, tx) => {
      if (!acc.find(existing => existing.hash === tx.hash)) {
        acc.push(tx);
      }
      return acc;
    }, [] as GitPayTransaction[]);
    
    console.log(`🔄 After deduplication: ${uniqueTransactions.length} unique transactions`);
    
    // Sort by timestamp (newest first) and limit to last 10 transactions
    const sortedTransactions = uniqueTransactions.sort((a, b) => b.timestamp - a.timestamp);
    const limitedTransactions = sortedTransactions.slice(0, 10);
    
    console.log(`📊 Returning ${limitedTransactions.length} most recent GitPay transactions`);
    return limitedTransactions;
  } catch (error) {
    console.error('Error fetching transactions for address:', error);
    throw error;
  }
}

// Helper function to get time ago string
function getTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (minutes < 60) {
    return `${minutes}m ago`;
  } else if (hours < 24) {
    return `${hours}h ago`;
  } else {
    return `${days}d ago`;
  }
}

// Helper function to generate dashboard SVG
function generateDashboardSVG(address: string, stats: {
  totalReceived: number;
  totalDonated: number;
  receivedCount: number;
  donatedCount: number;
}, ensName?: string | null, recentTransactions?: GitPayTransaction[]): string {
  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const displayName = ensName || shortAddress;
  const badgeWidth = 600;
  const badgeHeight = 200;
  
  // Get recent transactions for display
  const recentTxs = recentTransactions?.slice(0, 3) || [];
  
  return `
<svg width="${badgeWidth}" height="${badgeHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="addressBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e293b;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0f172a;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="headerBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1d4ed8;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${badgeWidth}" height="${badgeHeight}" fill="url(#addressBg)" rx="12"/>
  
  <!-- Header -->
  <rect width="${badgeWidth}" height="50" fill="url(#headerBg)" rx="12"/>
  <text x="15" y="30" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="white">
    📊 GitPay Dashboard
  </text>
  <text x="${badgeWidth - 15}" y="30" font-family="monospace" font-size="14" fill="#e0e0e0" text-anchor="end">
    ${displayName}
  </text>
  
  <!-- Address (if ENS name is shown) -->
  ${ensName ? `<text x="${badgeWidth - 15}" y="45" font-family="monospace" font-size="10" fill="#a0a0a0" text-anchor="end">${shortAddress}</text>` : ''}
  
  <!-- Stats Grid -->
  <g transform="translate(20, 70)">
    <!-- Received Section -->
    <text x="0" y="20" font-family="Arial, sans-serif" font-size="14" fill="#4ade80" font-weight="bold">
      📥 Received
    </text>
    <text x="0" y="40" font-family="Arial, sans-serif" font-size="20" fill="#4ade80" font-weight="bold">
      ${stats.totalReceived.toFixed(2)} PYUSD
    </text>
    <text x="0" y="55" font-family="Arial, sans-serif" font-size="12" fill="#a0a0a0">
      ${stats.receivedCount} donations
    </text>
    
    <!-- Donated Section -->
    <text x="200" y="20" font-family="Arial, sans-serif" font-size="14" fill="#f59e0b" font-weight="bold">
      📤 Donated
    </text>
    <text x="200" y="40" font-family="Arial, sans-serif" font-size="20" fill="#f59e0b" font-weight="bold">
      ${stats.totalDonated.toFixed(2)} PYUSD
    </text>
    <text x="200" y="55" font-family="Arial, sans-serif" font-size="12" fill="#a0a0a0">
      ${stats.donatedCount} donations
    </text>
  </g>
  
  <!-- Recent Transactions -->
  ${recentTxs.length > 0 ? `
  <g transform="translate(20, 140)">
    <text x="0" y="15" font-family="Arial, sans-serif" font-size="14" fill="#e0e0e0" font-weight="bold">
      🔄 Recent Transactions
    </text>
    ${recentTxs.map((tx, i) => {
      const isReceived = tx.recipient.toLowerCase() === address.toLowerCase();
      const amount = (parseFloat(tx.amount) / 1000000).toFixed(2);
      const timeAgo = getTimeAgo(tx.timestamp);
      const otherAddress = isReceived ? tx.from : tx.recipient;
      const otherShort = `${otherAddress.slice(0, 6)}...${otherAddress.slice(-4)}`;
      
      return `
        <text x="0" y="${35 + i * 15}" font-family="Arial, sans-serif" font-size="11" fill="${isReceived ? '#4ade80' : '#f59e0b'}">
          ${isReceived ? '📥' : '📤'} ${amount} PYUSD ${isReceived ? 'from' : 'to'} ${otherShort} (${timeAgo})
        </text>
      `;
    }).join('')}
  </g>
  ` : ''}
  
  <!-- Footer -->
  <g transform="translate(15, ${badgeHeight - 20})">
    <text x="0" y="15" font-family="Arial, sans-serif" font-size="12" fill="#a0a0a0">
      Powered by GitPay
    </text>
    <text x="${badgeWidth - 30}" y="15" font-family="Arial, sans-serif" font-size="12" fill="#a0a0a0" text-anchor="end">
      gitpay.eth
    </text>
  </g>
</svg>`.trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ens, address } = req.query;

  // Either ens or address must be provided
  if (!ens && !address) {
    return res.status(400).json({ error: 'Either ENS name or address is required' });
  }

  try {
    let resolvedAddress: string;
    let ensName: string | null = null;

    // Step 1: Resolve address from ENS or use provided address
    if (ens && typeof ens === 'string') {
      // It's an ENS name, resolve it
      console.log(`🔍 Resolving ENS: ${ens}`);
      const resolved = await client.getEnsAddress({ name: normalize(ens) });
      
      if (!resolved) {
        return res.status(404).json({ error: 'ENS name not found' });
      }
      resolvedAddress = resolved;
      ensName = ens;
      console.log(`📍 Resolved address: ${resolvedAddress}`);
    } else if (address && typeof address === 'string') {
      // It's already an address
      resolvedAddress = address;
      console.log(`📍 Using provided address: ${resolvedAddress}`);
      
      // Try to resolve ENS name for the address
      try {
        ensName = await client.getEnsName({ address: resolvedAddress as `0x${string}` });
        if (ensName) {
          console.log(`📍 Resolved ENS: ${ensName}`);
        }
      } catch (error) {
        console.warn('⚠️ Could not resolve ENS, continuing without it:', error);
      }
    } else {
      return res.status(400).json({ error: 'Invalid ENS name or address format' });
    }

    // Step 2: Fetch transactions for this address
    console.log(`📊 Fetching transactions for address: ${resolvedAddress}`);
    const transactions = await fetchTransactionsForAddress(resolvedAddress, 50);
    console.log(`📋 Found ${transactions.length} transactions for address ${resolvedAddress}`);
    
    // Step 3: Calculate stats
    const receivedTransactions = transactions.filter(tx => 
      tx.recipient.toLowerCase() === resolvedAddress.toLowerCase()
    );
    const donatedTransactions = transactions.filter(tx => 
      tx.from.toLowerCase() === resolvedAddress.toLowerCase()
    );
    
    console.log(`🔍 Transaction analysis for ${resolvedAddress}:`);
    console.log(`   Total transactions: ${transactions.length}`);
    console.log(`   Received transactions: ${receivedTransactions.length}`);
    console.log(`   Donated transactions: ${donatedTransactions.length}`);
    
    // Log each transaction for debugging
    transactions.forEach((tx, i) => {
      console.log(`   TX ${i + 1}: ${tx.from} -> ${tx.recipient} (${tx.amount} PYUSD)`);
    });
    
    const stats = {
      totalReceived: receivedTransactions.reduce((sum, tx) => sum + parseFloat(tx.amount) / 1000000, 0),
      totalDonated: donatedTransactions.reduce((sum, tx) => sum + parseFloat(tx.amount) / 1000000, 0),
      receivedCount: receivedTransactions.length,
      donatedCount: donatedTransactions.length
    };
    
    console.log(`📊 Stats: Received ${stats.totalReceived.toFixed(2)} PYUSD (${stats.receivedCount} txns), Donated ${stats.totalDonated.toFixed(2)} PYUSD (${stats.donatedCount} txns)`);
    
    // Step 4: Generate dashboard SVG
    const svg = generateDashboardSVG(resolvedAddress, stats, ensName, transactions);

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=60'); // Cache for 1 minute
    res.status(200).send(svg);

  } catch (error) {
    console.error('❌ Error generating dashboard:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
}
