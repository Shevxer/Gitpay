import { VercelRequest, VercelResponse } from '@vercel/node';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';

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

// Helper function to fetch transactions for a specific address using Alchemy Asset Transfers API
async function fetchTransactionsForAddress(address: string, limit: number = 100): Promise<GitPayTransaction[]> {
  try {
    console.log(`🔍 Fetching asset transfers for address: ${address}`);
    
    const url = 'https://eth-sepolia.g.alchemy.com/v2/pF7o0Ay0uDkAg5iFUe4v1';
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
          // For now, we'll consider all PYUSD transfers as GitPay transactions
          // This is a simplified approach - in production you might want to add additional checks
          const amount = transfer.value ? (parseFloat(transfer.value) * Math.pow(10, transfer.rawContract?.decimals || 6)).toString() : '0';
          
          gitPayTransactions.push({
            hash: transfer.hash,
            from: transfer.from,
            to: transfer.to,
            value: amount,
            blockNumber: transfer.blockNum,
            timestamp: new Date(transfer.metadata?.blockTimestamp).getTime(),
            recipient: transfer.to,
            amount: amount,
            memo: undefined
          });
        }
      } catch (error) {
        console.error('Error processing transfer:', error);
        continue;
      }
    }

    console.log(`✅ Found ${gitPayTransactions.length} GitPay transactions for address ${address}`);
    
    // Sort by timestamp (newest first) and limit to last 10 transactions
    const sortedTransactions = gitPayTransactions.sort((a, b) => b.timestamp - a.timestamp);
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
      const resolved = await client.getEnsAddress({ name: ens });
      
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
