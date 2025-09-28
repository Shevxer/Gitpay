import { VercelRequest, VercelResponse } from '@vercel/node';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { normalize } from 'viem/ens';

// PYUSD contract address on Sepolia testnet
const PYUSD_CONTRACT = '0xCaC524BcA292aaade2DF8A05cC58F0a65B1B3bB9';

// Create viem client for Sepolia
const client = createPublicClient({
  chain: sepolia,
  transport: http(`https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`),
});

// PYUSD ABI for balanceOf function
const PYUSD_ABI = [
  {
    "constant": true,
    "inputs": [{"name": "_owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "balance", "type": "uint256"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "decimals",
    "outputs": [{"name": "", "type": "uint8"}],
    "type": "function"
  }
] as const;

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
    // Step 1: Resolve ENS to address
    const address = await client.getEnsAddress({ name: normalize(ens) });
    
    if (!address) {
      return res.status(404).json({ error: 'ENS name not found' });
    }

    // Step 2: Get PYUSD balance
    const balance = await client.readContract({
      address: PYUSD_CONTRACT,
      abi: PYUSD_ABI,
      functionName: 'balanceOf',
      args: [address]
    });

    // Step 3: Get decimals
    const decimals = await client.readContract({
      address: PYUSD_CONTRACT,
      abi: PYUSD_ABI,
      functionName: 'decimals'
    });

    // Convert balance to human readable format
    const formattedBalance = Number(balance) / Math.pow(10, Number(decimals));

    // Step 4: Generate SVG
    const svg = generateStatsSVG(ens, address, formattedBalance, style as 'light' | 'dark' | 'neon');

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.status(200).send(svg);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

function generateStatsSVG(ens: string, address: string, balance: number, style: 'light' | 'dark' | 'neon'): string {
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
