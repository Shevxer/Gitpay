import { VercelRequest, VercelResponse } from '@vercel/node';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';

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

  const { ens, amount = '10', method = 'pyusd' } = req.query;

  if (!ens || typeof ens !== 'string') {
    return res.status(400).json({ error: 'ENS name is required' });
  }

  try {
    // Resolve ENS to address
    const address = await client.getEnsAddress({ name: ens });
    
    if (!address) {
      return res.status(404).json({ error: 'ENS name not found' });
    }

    // Generate SVG based on method
    let svg: string;
    let link: string;

    if (method === 'pyusd') {
      svg = generatePYUSDSVG(ens, address, amount as string);
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

function generatePYUSDSVG(ens: string, address: string, amount: string): string {
  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  
  return `
<svg width="300" height="100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1d4ed8;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <rect width="300" height="100" fill="url(#bg)" rx="8"/>
  
  <!-- Donate Button -->
  <text x="150" y="35" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="white" text-anchor="middle">
    Donate ${amount} PYUSD
  </text>
  
  <!-- ENS -->
  <text x="150" y="55" font-family="Arial, sans-serif" font-size="12" fill="#e0e0e0" text-anchor="middle">
    to ${ens}
  </text>
  
  <!-- Address -->
  <text x="150" y="75" font-family="Arial, sans-serif" font-size="10" fill="#c0c0c0" text-anchor="middle">
    ${shortAddress}
  </text>
  
  <!-- Click indicator -->
  <text x="150" y="90" font-family="Arial, sans-serif" font-size="8" fill="#a0a0a0" text-anchor="middle">
    Click to donate
  </text>
</svg>`.trim();
}
