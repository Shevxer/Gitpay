import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

// Load environment variables
dotenv.config({ path: '.env' });

// Debug environment variables
console.log('Environment check:');
console.log('ALCHEMY_API_KEY exists:', !!process.env.ALCHEMY_API_KEY);
console.log('ALCHEMY_API_KEY length:', process.env.ALCHEMY_API_KEY?.length || 0);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// PYUSD contract address on Ethereum mainnet
const PYUSD_CONTRACT = '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8';

// Check if API key is provided
if (!process.env.ALCHEMY_API_KEY || process.env.ALCHEMY_API_KEY === 'your_alchemy_api_key_here') {
  console.error('❌ ALCHEMY_API_KEY is not set or is using placeholder value');
  console.error('Please set your Alchemy API key in the .env file');
  process.exit(1);
}

// Create viem client for mainnet (ENS is on mainnet)
const alchemyUrl = `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
console.log('🔗 Alchemy URL:', alchemyUrl);

const client = createPublicClient({
  chain: mainnet,
  transport: http(alchemyUrl),
});

// Helper function to get PYUSD balance using Alchemy RPC
async function getPYUSDBalance(address: string): Promise<number> {
  const url = `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  const body = JSON.stringify({
    id: 1,
    jsonrpc: "2.0",
    method: "alchemy_getTokenBalances",
    params: [address, [PYUSD_CONTRACT]]
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: body
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Alchemy RPC error: ${data.error.message}`);
    }

    const tokenBalance = data.result.tokenBalances[0];
    if (!tokenBalance || !tokenBalance.tokenBalance) {
      return 0;
    }

    // PYUSD has 6 decimals
    const balance = parseInt(tokenBalance.tokenBalance, 16) / Math.pow(10, 6);
    return balance;
  } catch (error) {
    console.error('Error fetching PYUSD balance:', error);
    throw error;
  }
}

// Helper function to generate stats SVG
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
  <a href="https://etherscan.io/address/${address}" target="_blank">
    <rect x="300" y="150" width="80" height="30" fill="#3b82f6" rx="5"/>
    <text x="320" y="170" font-family="Arial, sans-serif" font-size="12" fill="white" text-anchor="middle">
      View on Etherscan
    </text>
  </a>
</svg>`.trim();
}

// Helper function to generate donate SVG
function generateDonateSVG(ens: string, address: string, amount: string): string {
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

// Routes

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: 'GitPay API is running!', 
    endpoints: [
      'GET /api/ens-stats?ens=yourname.eth',
      'GET /api/donate?ens=yourname.eth&amount=10'
    ]
  });
});

// ENS Stats endpoint
app.get('/api/ens-stats', async (req, res) => {
  const { ens } = req.query;

  if (!ens || typeof ens !== 'string') {
    return res.status(400).json({ error: 'ENS name is required' });
  }

  try {
    console.log(`🔍 Resolving ENS: ${ens}`);
    
    // Step 1: Resolve ENS to address
    const address = await client.getEnsAddress({ name: ens });
    console.log(`📍 Resolved address: ${address}`);
    
    if (!address) {
      return res.status(404).json({ error: 'ENS name not found' });
    }

    // Step 2: Get PYUSD balance using Alchemy RPC
    console.log(`💰 Getting PYUSD balance for: ${address}`);
    const formattedBalance = await getPYUSDBalance(address);
    console.log(`💵 PYUSD balance: ${formattedBalance}`);

    // Step 4: Generate SVG
    const svg = generateStatsSVG(ens, address, formattedBalance);

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.status(200).send(svg);

  } catch (error) {
    console.error('❌ Error in ENS stats:', error);
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

// Donate endpoint
app.get('/api/donate', async (req, res) => {
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

    if (method === 'pyusd') {
      svg = generateDonateSVG(ens, address, amount as string);
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
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 GitPay server running on http://localhost:${PORT}`);
  console.log(`📊 ENS Stats: http://localhost:${PORT}/api/ens-stats?ens=vitalik.eth`);
  console.log(`💰 Donate: http://localhost:${PORT}/api/donate?ens=vitalik.eth&amount=10`);
  console.log(`\n💡 Make sure to set ALCHEMY_API_KEY in your .env file`);
});
