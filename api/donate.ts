import { VercelRequest, VercelResponse } from '@vercel/node';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { normalize } from 'viem/ens';

// Create viem client for Sepolia
const client = createPublicClient({
  chain: sepolia,
  transport: http(`https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`),
});

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
    // Resolve ENS to address
    const address = await client.getEnsAddress({ name: normalize(ens) });
    
    if (!address) {
      return res.status(404).json({ error: 'ENS name not found' });
    }

    // Generate SVG based on method
    let svg: string;
    let link: string;

    if (method === 'pyusd') {
      svg = generatePYUSDSVG(ens, address, amount as string, style as 'light' | 'dark' | 'neon');
      link = `ethereum:${address}@1?value=0&address=${address}&uint256=${amount}000000`; // Assuming 6 decimals
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

function generatePYUSDSVG(ens: string, address: string, amount: string, style: 'light' | 'dark' | 'neon'): string {
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
</svg>`.trim();
}
