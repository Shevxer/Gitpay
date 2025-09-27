import { VercelRequest, VercelResponse } from '@vercel/node';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';

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

  const { ens } = req.query;

  if (!ens || typeof ens !== 'string') {
    return res.status(400).json({ error: 'ENS name is required' });
  }

  try {
    // Step 1: Resolve ENS to address
    const address = await client.getEnsAddress({ name: ens });
    
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
    const svg = generateStatsSVG(ens, address, formattedBalance);

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.status(200).send(svg);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

function generateStatsSVG(ens: string, address: string, balance: number): string {
  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const formattedBalance = balance.toFixed(2);
  
  return `
<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <rect width="400" height="200" fill="url(#bg)" rx="10"/>
  
  <!-- Header -->
  <text x="20" y="40" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="white">
    GitPay Stats
  </text>
  
  <!-- ENS Name -->
  <text x="20" y="70" font-family="Arial, sans-serif" font-size="16" fill="#e0e0e0">
    ENS: ${ens}
  </text>
  
  <!-- Address -->
  <text x="20" y="95" font-family="Arial, sans-serif" font-size="14" fill="#c0c0c0">
    Address: ${shortAddress}
  </text>
  
  <!-- PYUSD Balance -->
  <text x="20" y="125" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#4ade80">
    PYUSD Balance: ${formattedBalance}
  </text>
  
  <!-- Footer -->
  <text x="20" y="170" font-family="Arial, sans-serif" font-size="12" fill="#a0a0a0">
    Powered by GitPay
  </text>
  
  <!-- Link to Etherscan -->
  <a href="https://sepolia.etherscan.io/address/${address}" target="_blank">
    <rect x="300" y="150" width="80" height="30" fill="#3b82f6" rx="5"/>
    <text x="320" y="170" font-family="Arial, sans-serif" font-size="12" fill="white" text-anchor="middle">
      View on Etherscan
    </text>
  </a>
</svg>`.trim();
}
