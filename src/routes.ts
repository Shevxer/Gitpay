import { Request, Response } from 'express';
import { client, normalize } from './config';
import { 
  getPYUSDBalance, 
  generateDonationPageHTML,
  fetchAllGitPayTransactions,
  fetchTransactionsForAddress,
  getGitPayTransactionStats,
  generateAddressBadgeSVG,
  GitPayTransaction
} from './utils';

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

// Local SVG generation functions (duplicated from /api for src/ independence)
function generateStatsSVG(ens: string, address: string, balance: number, style: 'light' | 'dark' | 'neon' = 'light'): string {
  const formattedBalance = balance.toFixed(2);
  
  // Theme configurations
  const themes = {
    light: {
      background: '#ffffff',
      cardBg: '#f8fafc',
      border: '#e2e8f0',
      primaryText: '#1e293b',
      secondaryText: '#64748b',
      accentText: '#059669',
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
      accentText: '#10b981',
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
      accentText: '#ff0088',
      buttonBg: '#ff0088',
      buttonText: '#000000',
      shadow: '0 0 20px rgba(0, 255, 136, 0.3)'
    }
  };

  const theme = themes[style];
  
  return `
<svg width="500" height="200" xmlns="http://www.w3.org/2000/svg">
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
  
  <rect width="500" height="200" fill="url(#bg)" rx="10" stroke="${theme.border}" stroke-width="2"/>
  ${style === 'neon' ? `<rect width="500" height="200" fill="none" rx="10" stroke="${theme.border}" stroke-width="1" opacity="0.5"/>` : ''}
  
  <!-- Header -->
  <text x="20" y="40" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="${theme.primaryText}" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
    GitPay Stats
  </text>
  
  <!-- ENS Name -->
  <text x="20" y="70" font-family="Arial, sans-serif" font-size="16" fill="${theme.secondaryText}" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
    ENS: ${ens}
  </text>
  
  <!-- Full Address -->
  <text x="20" y="95" font-family="Arial, sans-serif" font-size="12" fill="${theme.secondaryText}" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
    Address: ${address}
  </text>
  
  <!-- PYUSD Logo and Balance -->
  <g transform="translate(20, 110)">
    <circle cx="12" cy="12" r="10" fill="${theme.accentText}" opacity="0.2"/>
    <text x="12" y="16" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="${theme.accentText}" text-anchor="middle">P</text>
  </g>
  <text x="50" y="125" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="${theme.accentText}" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
    PYUSD Balance: ${formattedBalance}
  </text>
  
  <!-- Footer -->
  <text x="20" y="170" font-family="Arial, sans-serif" font-size="12" fill="${theme.secondaryText}" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
    Powered by GitPay
  </text>
  
  <!-- Link to Etherscan -->
  <a href="https://sepolia.etherscan.io/address/${address}" target="_blank">
    <rect x="350" y="150" width="130" height="35" fill="${theme.buttonBg}" rx="8" ${style === 'neon' ? 'filter="url(#glow)"' : ''}/>
    <text x="415" y="172" font-family="Arial, sans-serif" font-size="11" fill="${theme.buttonText}" text-anchor="middle" font-weight="bold">
      View on Etherscan
    </text>
  </a>
</svg>`.trim();
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

function generateDonateSVG(ens: string, address: string, amount: string, style: 'light' | 'dark' | 'neon' = 'light'): string {
  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  
  // Theme configurations
  const themes = {
    light: {
      background: '#ffffff',
      cardBg: '#f8fafc',
      border: '#e2e8f0',
      primaryText: '#1e293b',
      secondaryText: '#64748b',
      accentText: '#059669',
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
      accentText: '#10b981',
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
      accentText: '#ff0088',
      buttonBg: '#ff0088',
      buttonText: '#000000',
      shadow: '0 0 20px rgba(0, 255, 136, 0.3)'
    }
  };

  const theme = themes[style];
  
  return `
<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
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
  
  <rect width="200" height="200" fill="url(#bg)" rx="10" stroke="${theme.border}" stroke-width="2"/>
  ${style === 'neon' ? `<rect width="200" height="200" fill="none" rx="10" stroke="${theme.border}" stroke-width="1" opacity="0.5"/>` : ''}
  
  <!-- Header -->
  <text x="100" y="40" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="${theme.primaryText}" text-anchor="middle" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
    Donate
  </text>
  
  <!-- Amount -->
  <text x="100" y="70" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="${theme.accentText}" text-anchor="middle" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
    ${amount} PYUSD
  </text>
  
  <!-- ENS Name -->
  <text x="100" y="100" font-family="Arial, sans-serif" font-size="14" fill="${theme.secondaryText}" text-anchor="middle" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
    to ${ens}
  </text>
  
  <!-- Address -->
  <text x="100" y="125" font-family="Arial, sans-serif" font-size="10" fill="${theme.secondaryText}" text-anchor="middle" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
    ${shortAddress}
  </text>
  
  <!-- PYUSD Logo -->
  <g transform="translate(100, 150)">
    <circle cx="0" cy="0" r="15" fill="${theme.accentText}" opacity="0.2"/>
    <text x="0" y="5" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="${theme.accentText}" text-anchor="middle" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>P</text>
  </g>
  
  <!-- Click indicator -->
  <text x="100" y="185" font-family="Arial, sans-serif" font-size="10" fill="${theme.secondaryText}" text-anchor="middle" ${style === 'neon' ? 'filter="url(#glow)"' : ''}>
    Click to donate
  </text>
  
  <!-- Clickable area linking to donation page -->
  <a href="/donate?ens=${encodeURIComponent(ens)}&amp;amount=${encodeURIComponent(amount)}" target="_blank">
    <rect width="200" height="200" fill="transparent" style="cursor: pointer;"/>
  </a>
</svg>`.trim();
}

// Health check route
export function healthCheck(req: Request, res: Response) {
  res.json({ 
    message: 'GitPay API is running!', 
    endpoints: [
      'GET /api/ens-stats?ens=yourname.eth&style=light|dark|neon',
      'GET /api/donate?ens=yourname.eth&amount=10&style=light|dark|neon',
      'GET /api/dashboard?ens=yourname.eth&style=light|dark|neon',
      'GET /api/transactions - Get all GitPay transactions',
      'GET /api/transactions/:address - Get transactions for specific address',
      'GET /api/transactions/stats - Get transaction statistics',
      'GET /api/transactions/recent - Get recent transactions'
    ]
  });
}

// ENS Stats endpoint
export async function ensStats(req: Request, res: Response) {
  const { ens, style = 'light' } = req.query;

  if (!ens || typeof ens !== 'string') {
    return res.status(400).json({ error: 'ENS name is required' });
  }

  // Validate style parameter
  const validStyles = ['light', 'dark', 'neon'];
  if (typeof style !== 'string' || !validStyles.includes(style)) {
    return res.status(400).json({ error: 'Invalid style. Must be one of: light, dark, neon' });
  }

  try {
    console.log(`🔍 Processing: ${ens}`);
    
    // Step 1: Check if it's already an address or needs ENS resolution
    let address: string;
    if (ens.startsWith('0x') && ens.length === 42) {
      // It's already an address
      address = ens;
      console.log(`📍 Using provided address: ${address}`);
    } else {
      // It's an ENS name, resolve it
      console.log(`🔍 Resolving ENS: ${ens}`);
      const resolvedAddress = await client.getEnsAddress({ name: normalize(ens) });
      console.log(`📍 Resolved address: ${resolvedAddress}`);
      
      if (!resolvedAddress) {
        return res.status(404).json({ error: 'ENS name not found' });
      }
      address = resolvedAddress;
    }

    // Step 2: Get PYUSD balance using Alchemy RPC
    console.log(`💰 Getting PYUSD balance for: ${address}`);
    const formattedBalance = await getPYUSDBalance(address);
    console.log(`💵 PYUSD balance: ${formattedBalance}`);

    // Step 4: Generate SVG
    const svg = generateStatsSVG(ens, address, formattedBalance, style as 'light' | 'dark' | 'neon');

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.status(200).send(svg);

  } catch (error) {
    console.error('❌ Error in ENS stats:', error);
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
}

// Donate endpoint - returns SVG button
export async function donate(req: Request, res: Response) {
  const { ens, amount = '10', method = 'pyusd', style = 'light' } = req.query;

  if (!ens || typeof ens !== 'string') {
    return res.status(400).json({ error: 'ENS name is required' });
  }

  // Validate style parameter
  const validStyles = ['light', 'dark', 'neon'];
  if (typeof style !== 'string' || !validStyles.includes(style)) {
    return res.status(400).json({ error: 'Invalid style. Must be one of: light, dark, neon' });
  }

  try {
    // Check if it's already an address or needs ENS resolution
    let address: string;
    if (ens.startsWith('0x') && ens.length === 42) {
      // It's already an address
      address = ens;
    } else {
      // It's an ENS name, resolve it
      const resolvedAddress = await client.getEnsAddress({ name: normalize(ens) });
      
      if (!resolvedAddress) {
        return res.status(404).json({ error: 'ENS name not found' });
      }
      address = resolvedAddress;
    }

    // Generate SVG based on method
    let svg: string;

    if (method === 'pyusd') {
      svg = generateDonateSVG(ens, address, amount as string, style as 'light' | 'dark' | 'neon');
    } else {
      return res.status(400).json({ error: 'Invalid method. Use "pyusd"' });
    }

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.status(200).send(svg);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Donation page endpoint - returns HTML page with MetaMask integration
export async function donationPage(req: Request, res: Response) {
  const { ens, amount = '10' } = req.query;

  if (!ens || typeof ens !== 'string') {
    return res.status(400).send('ENS name is required');
  }

  try {
    // Check if it's already an address or needs ENS resolution
    let address: string;
    if (ens.startsWith('0x') && ens.length === 42) {
      address = ens;
    } else {
      const resolvedAddress = await client.getEnsAddress({ name: ens });
      if (!resolvedAddress) {
        return res.status(404).send('ENS name not found');
      }
      address = resolvedAddress;
    }

    const html = generateDonationPageHTML(ens, address, amount as string);

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal server error');
  }
}

// GitPay Transactions API - Get all GitPay transactions
export async function gitPayTransactions(req: Request, res: Response) {
  const { limit = '100', offset = '0' } = req.query;

  try {
    console.log('🔍 Fetching GitPay transactions...');
    
    const limitNum = Math.min(parseInt(limit as string) || 100, 1000); // Max 1000
    const offsetNum = parseInt(offset as string) || 0;
    
    const transactions = await fetchAllGitPayTransactions(50); // Reduced limit for free tier
    const paginatedTransactions = transactions.slice(offsetNum, offsetNum + limitNum);
    
    res.json({
      success: true,
      data: {
        transactions: paginatedTransactions,
        pagination: {
          total: transactions.length,
          limit: limitNum,
          offset: offsetNum,
          hasMore: transactions.length > offsetNum + limitNum
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching GitPay transactions:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
}

// GitPay Transactions by Address - Get transactions for specific address
export async function gitPayTransactionsByAddress(req: Request, res: Response) {
  const { address } = req.params;
  const { limit = '100', offset = '0' } = req.query;

  if (!address || typeof address !== 'string') {
    return res.status(400).json({ 
      success: false,
      error: 'Address parameter is required' 
    });
  }

  try {
    console.log(`🔍 Fetching GitPay transactions for address: ${address}`);
    
    const limitNum = Math.min(parseInt(limit as string) || 100, 1000);
    const offsetNum = parseInt(offset as string) || 0;
    
    // Get all transactions and filter by address
    const allTransactions = await fetchAllGitPayTransactions(50); // Reduced limit for free tier
    const addressTransactions = allTransactions.filter(tx => 
      tx.from.toLowerCase() === address.toLowerCase() || 
      tx.recipient.toLowerCase() === address.toLowerCase()
    );
    
    const paginatedTransactions = addressTransactions.slice(offsetNum, offsetNum + limitNum);
    
    res.json({
      success: true,
      data: {
        address,
        transactions: paginatedTransactions,
        pagination: {
          total: addressTransactions.length,
          limit: limitNum,
          offset: offsetNum,
          hasMore: addressTransactions.length > offsetNum + limitNum
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching transactions for address:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
}

// GitPay Transaction Statistics
export async function gitPayTransactionStats(req: Request, res: Response) {
  try {
    console.log('📊 Fetching GitPay transaction statistics...');
    
    const stats = await getGitPayTransactionStats();
    
    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ Error fetching transaction statistics:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
}

// GitPay Recent Transactions
export async function gitPayRecentTransactions(req: Request, res: Response) {
  const { limit = '10' } = req.query;

  try {
    console.log('🕒 Fetching recent GitPay transactions...');
    
    const limitNum = Math.min(parseInt(limit as string) || 10, 50); // Max 50 for recent
    const transactions = await fetchAllGitPayTransactions(50); // Reduced limit for free tier
    
    res.json({
      success: true,
      data: {
        transactions,
        count: transactions.length
      }
    });

  } catch (error) {
    console.error('❌ Error fetching recent transactions:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
}

// GitPay Dashboard - Generate dashboard SVG for specific address using transactions API
export async function gitPayDashboard(req: Request, res: Response) {
  const { ens, address, style = 'light' } = req.query;

  // Either ens or address must be provided
  if (!ens && !address) {
    return res.status(400).json({ 
      success: false,
      error: 'Either ENS name or address is required' 
    });
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

    console.log(`📊 Generating dashboard for: ${resolvedAddress}`);
    
    // Fetch transactions for this address using the working transactions API
    const transactions = await fetchTransactionsForAddress(resolvedAddress, 50);
    console.log(`📋 Found ${transactions.length} transactions for address ${resolvedAddress}`);
    
    // Calculate stats
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
    
    const svg = await generateDashboardSVG(resolvedAddress, stats, ensName, transactions, style as 'light' | 'dark' | 'neon');
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=60'); // Cache for 1 minute
    res.status(200).send(svg);

  } catch (error) {
    console.error('❌ Error generating dashboard:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
}

// GitPay Address Badge - Generate dynamic SVG badge for specific address (legacy)
export async function gitPayAddressBadge(req: Request, res: Response) {
  const { address } = req.query;

  if (!address || typeof address !== 'string') {
    return res.status(400).json({ 
      success: false,
      error: 'Address parameter is required' 
    });
  }

  try {
    console.log(`🏷️ Generating address badge for: ${address}`);
    
    // Resolve ENS name
    let ensName: string | null = null;
    try {
      ensName = await client.getEnsName({ address: address as `0x${string}` });
      if (ensName) {
        console.log(`📍 Resolved ENS: ${ensName}`);
      }
    } catch (error) {
      console.error('Error resolving ENS:', error);
    }
    
    // Fetch transactions for this address
    const transactions = await fetchTransactionsForAddress(address, 50);
    console.log(`📋 Found ${transactions.length} transactions for address ${address}`);
    
    // Calculate stats
    const receivedTransactions = transactions.filter(tx => 
      tx.recipient.toLowerCase() === address.toLowerCase()
    );
    const donatedTransactions = transactions.filter(tx => 
      tx.from.toLowerCase() === address.toLowerCase()
    );
    
    const stats = {
      totalReceived: receivedTransactions.reduce((sum, tx) => sum + parseFloat(tx.amount) / 1000000, 0),
      totalDonated: donatedTransactions.reduce((sum, tx) => sum + parseFloat(tx.amount) / 1000000, 0),
      receivedCount: receivedTransactions.length,
      donatedCount: donatedTransactions.length
    };
    
    console.log(`📊 Stats: Received ${stats.totalReceived.toFixed(2)} PYUSD (${stats.receivedCount} txns), Donated ${stats.totalDonated.toFixed(2)} PYUSD (${stats.donatedCount} txns)`);
    
    const svg = await generateAddressBadgeSVG(address, stats, ensName, transactions);
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=60'); // Cache for 1 minute
    res.status(200).send(svg);

  } catch (error) {
    console.error('❌ Error generating address badge:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
}

