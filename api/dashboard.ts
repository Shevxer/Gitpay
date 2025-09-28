import { VercelRequest, VercelResponse } from '@vercel/node';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { normalize } from 'viem/ens';
import { fetchTransactionsForAddress, parseGitPayTransactionData, GitPayTransaction, generateAddressBadgeSVG } from '../src/utils';

// Create viem client for Sepolia
const client = createPublicClient({
  chain: sepolia,
  transport: http(`https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`),
});

// PYUSD contract address on Sepolia testnet
const PYUSD_CONTRACT = '0xCaC524BcA292aaade2DF8A05cC58F0a65B1B3bB9';


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

// Generate dashboard SVG with theme support
async function generateDashboardSVG(address: string, stats: {
  totalReceived: number;
  totalDonated: number;
  receivedCount: number;
  donatedCount: number;
}, ensName?: string | null, recentTransactions?: GitPayTransaction[], style: 'light' | 'dark' | 'neon' = 'light'): Promise<string> {
  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const displayName = ensName || shortAddress;
  
  // Theme configurations (matching ens-stats with different colors for received/donated)
  const themes = {
    light: {
      background: '#ffffff',
      cardBg: '#f8fafc',
      border: '#e2e8f0',
      primaryText: '#1e293b',
      secondaryText: '#64748b',
      receivedColor: '#059669',
      donatedColor: '#f59e0b',
      buttonBg: '#3b82f6',
      buttonText: '#ffffff',
      shadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
    },
    dark: {
      background: '#0f172a',
      cardBg: '#1e293b',
      border: '#334155',
      primaryText: '#f1f5f9',
      secondaryText: '#cbd5e1',
      receivedColor: '#10b981',
      donatedColor: '#f59e0b',
      buttonBg: '#6366f1',
      buttonText: '#ffffff',
      shadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
    },
    neon: {
      background: '#0a0a0a',
      cardBg: '#111111',
      border: '#00ff88',
      primaryText: '#00ff88',
      secondaryText: '#88ff88',
      receivedColor: '#00ff88',
      donatedColor: '#ff0088',
      buttonBg: '#ff0088',
      buttonText: '#000000',
      shadow: '0 0 20px rgba(0, 255, 136, 0.3)'
    }
  };

  const theme = themes[style];
  const recentTxs = recentTransactions?.slice(0, 3) || [];
  
  // Resolve ENS names for recent transactions
  const ensMap = new Map<string, string>();
  if (recentTxs.length > 0) {
    const allAddresses = new Set<string>();
    recentTxs.forEach(tx => {
      allAddresses.add(tx.from);
      allAddresses.add(tx.recipient);
    });
    
    // Resolve ENS names for all addresses
    for (const addr of allAddresses) {
      try {
        const ens = await client.getEnsName({ address: addr as `0x${string}` });
        if (ens) {
          ensMap.set(addr.toLowerCase(), ens);
        }
      } catch (error) {
        // Ignore ENS resolution errors
      }
    }
  }
  
  return `
<svg width="700" height="250" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${theme.background};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${theme.cardBg};stop-opacity:1" />
    </linearGradient>
    ${style === 'neon' ? `
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge> 
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    ` : ''}
  </defs>
  
  <rect width="700" height="250" fill="url(#bg)" rx="12" stroke="${theme.border}" stroke-width="2"/>
  ${style === 'neon' ? `<rect width="700" height="250" fill="none" rx="12" stroke="${theme.border}" stroke-width="1" opacity="0.5"/>` : ''}
  
  <!-- ENS/Address in top-right corner -->
  <text x="680" y="25" font-family="monospace" font-size="14" fill="${theme.primaryText}" text-anchor="end" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
    ${displayName}
  </text>
  ${ensName ? `<text x="680" y="40" font-family="monospace" font-size="10" fill="${theme.secondaryText}" text-anchor="end" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>${shortAddress}</text>` : ''}
  
  <!-- Stats Grid -->
  <g transform="translate(50, 50)">
    <!-- Received Section -->
    <g transform="translate(0, 0)">
      <!-- Downward arrow SVG icon for received -->
      <path d="M10 5 L20 15 L15 15 L15 25 L5 25 L5 15 L0 15 Z" fill="${theme.receivedColor}" transform="rotate(180 10 15)" ${style === 'neon' ? 'filter="url(#glow)"' : ''}/>
      <text x="25" y="20" font-family="Arial, sans-serif" font-size="16" fill="${theme.receivedColor}" font-weight="bold" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
        Received
      </text>
      <text x="0" y="45" font-family="Arial, sans-serif" font-size="24" fill="${theme.receivedColor}" font-weight="bold" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
        ${stats.totalReceived.toFixed(2)} PYUSD
      </text>
      <text x="0" y="65" font-family="Arial, sans-serif" font-size="12" fill="${theme.secondaryText}" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
        ${stats.receivedCount} donations
      </text>
    </g>
    
    <!-- Donated Section -->
    <g transform="translate(350, 0)">
      <!-- Upward arrow SVG icon for donated -->
      <path d="M10 5 L20 15 L15 15 L15 25 L5 25 L5 15 L0 15 Z" fill="${theme.donatedColor}" ${style === 'neon' ? 'filter="url(#glow)"' : ''}/>
      <text x="25" y="20" font-family="Arial, sans-serif" font-size="16" fill="${theme.donatedColor}" font-weight="bold" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
        Donated
      </text>
      <text x="0" y="45" font-family="Arial, sans-serif" font-size="24" fill="${theme.donatedColor}" font-weight="bold" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
        ${stats.totalDonated.toFixed(2)} PYUSD
      </text>
      <text x="0" y="65" font-family="Arial, sans-serif" font-size="12" fill="${theme.secondaryText}" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
        ${stats.donatedCount} donations
      </text>
    </g>
  </g>
  
  <!-- Recent Transactions -->
  ${recentTxs.length > 0 ? `
  <g transform="translate(50, 130)">
    <text x="0" y="20" font-family="Arial, sans-serif" font-size="14" fill="${theme.primaryText}" font-weight="bold" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
      Recent Transactions
    </text>
    ${recentTxs.map((tx, i) => {
      const isReceived = tx.recipient.toLowerCase() === address.toLowerCase();
      const amount = (parseFloat(tx.amount) / 1000000).toFixed(2);
      const timeAgo = getTimeAgo(tx.timestamp);
      const otherAddress = isReceived ? tx.from : tx.recipient;
      const ensName = ensMap.get(otherAddress.toLowerCase());
      const otherDisplay = ensName || `${otherAddress.slice(0, 6)}...${otherAddress.slice(-4)}`;
      
      return `
        <g transform="translate(0, ${35 + i * 20})">
          <path d="M5 5 L10 10 L8 10 L8 12 L2 12 L2 10 L0 10 Z" fill="${isReceived ? theme.receivedColor : theme.donatedColor}" ${style === 'neon' ? 'filter="url(#glow)"' : ''}/>
          <text x="15" y="12" font-family="Arial, sans-serif" font-size="11" fill="${isReceived ? theme.receivedColor : theme.donatedColor}" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
            ${amount} PYUSD ${isReceived ? 'from' : 'to'} ${otherDisplay} (${timeAgo})
          </text>
        </g>
      `;
    }).join('')}
  </g>
  ` : ''}
  
  <!-- Footer -->
  <g transform="translate(20, 230)">
    <text x="660" y="15" font-family="Arial, sans-serif" font-size="12" fill="${theme.secondaryText}" text-anchor="end" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
      Powered by GitPay
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

  const { ens, address, style = 'light' } = req.query;

  // Either ens or address must be provided
  if (!ens && !address) {
    return res.status(400).json({ error: 'Either ENS name or address is required' });
  }

  // Validate style parameter
  const validStyles = ['light', 'dark', 'neon'];
  if (typeof style !== 'string' || !validStyles.includes(style)) {
    return res.status(400).json({ error: 'Invalid style. Must be one of: light, dark, neon' });
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
    
    const stats = {
      totalReceived: receivedTransactions.reduce((sum, tx) => sum + parseFloat(tx.amount) / 1000000, 0),
      totalDonated: donatedTransactions.reduce((sum, tx) => sum + parseFloat(tx.amount) / 1000000, 0),
      receivedCount: receivedTransactions.length,
      donatedCount: donatedTransactions.length
    };
    
    console.log(`📊 Stats: Received ${stats.totalReceived.toFixed(2)} PYUSD (${stats.receivedCount} txns), Donated ${stats.totalDonated.toFixed(2)} PYUSD (${stats.donatedCount} txns)`);
    
    // Step 4: Generate dashboard SVG
    const svg = await generateDashboardSVG(resolvedAddress, stats, ensName, transactions, style as 'light' | 'dark' | 'neon');

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
