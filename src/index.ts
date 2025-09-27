import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';

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

// PYUSD contract address on Sepolia testnet
const PYUSD_CONTRACT = '0xCaC524BcA292aaade2DF8A05cC58F0a65B1B3bB9';

// Check if API key is provided
if (!process.env.ALCHEMY_API_KEY || process.env.ALCHEMY_API_KEY === 'your_alchemy_api_key_here') {
  console.error('❌ ALCHEMY_API_KEY is not set or is using placeholder value');
  console.error('Please set your Alchemy API key in the .env file');
  process.exit(1);
}

// Create viem client for Sepolia testnet
const alchemyUrl = `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;

const client = createPublicClient({
  chain: sepolia,
  transport: http(alchemyUrl),
});

// Helper function to get PYUSD balance using Alchemy RPC
async function getPYUSDBalance(address: string): Promise<number> {
  const url = `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
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
  <a href="https://sepolia.etherscan.io/address/${address}" target="_blank">
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
<svg width="400" height="120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1d4ed8;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <rect width="400" height="120" fill="url(#bg)" rx="8"/>
  
  <!-- Donate Button -->
  <text x="200" y="35" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="white" text-anchor="middle">
    Donate ${amount} PYUSD
  </text>
  
  <!-- ENS -->
  <text x="200" y="55" font-family="Arial, sans-serif" font-size="14" fill="#e0e0e0" text-anchor="middle">
    to ${ens}
  </text>
  
  <!-- Address -->
  <text x="200" y="75" font-family="Arial, sans-serif" font-size="12" fill="#c0c0c0" text-anchor="middle">
    ${shortAddress}
  </text>
  
  <!-- Click indicator -->
  <text x="200" y="95" font-family="Arial, sans-serif" font-size="10" fill="#a0a0a0" text-anchor="middle">
    Click to open donation page
  </text>
  
  <!-- Clickable area linking to donation page -->
  <a href="/donate?ens=${encodeURIComponent(ens)}&amp;amount=${encodeURIComponent(amount)}" target="_blank">
    <rect width="400" height="120" fill="transparent" style="cursor: pointer;"/>
  </a>
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
      const resolvedAddress = await client.getEnsAddress({ name: ens });
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
    const svg = generateStatsSVG(ens, address, formattedBalance);

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.status(200).send(svg);

  } catch (error) {
    console.error('❌ Error in ENS stats:', error);
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

// Donate endpoint - returns SVG button
app.get('/api/donate', async (req, res) => {
  const { ens, amount = '10', method = 'pyusd' } = req.query;

  if (!ens || typeof ens !== 'string') {
    return res.status(400).json({ error: 'ENS name is required' });
  }

  try {
    // Check if it's already an address or needs ENS resolution
    let address: string;
    if (ens.startsWith('0x') && ens.length === 42) {
      // It's already an address
      address = ens;
    } else {
      // It's an ENS name, resolve it
      const resolvedAddress = await client.getEnsAddress({ name: ens });
      
      if (!resolvedAddress) {
        return res.status(404).json({ error: 'ENS name not found' });
      }
      address = resolvedAddress;
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

// Donation page endpoint - returns HTML page with MetaMask integration
app.get('/donate', async (req, res) => {
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

    const amountInWei = (parseFloat(amount as string) * 1000000).toString(); // PYUSD has 6 decimals

    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Donate to ${ens}</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #f5f5f5; }
        .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .amount { font-size: 24px; font-weight: bold; color: #3b82f6; }
        .address { font-family: monospace; background: #f0f0f0; padding: 10px; border-radius: 5px; margin: 10px 0; }
        .button { background: #3b82f6; color: white; padding: 15px 30px; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; width: 100%; margin: 10px 0; }
        .button:hover { background: #1d4ed8; }
        .button:disabled { background: #ccc; cursor: not-allowed; }
        .status { margin: 10px 0; padding: 10px; border-radius: 5px; }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎁 Donate PYUSD</h1>
            <div class="amount">${amount} PYUSD</div>
            <p>to <strong>${ens}</strong></p>
            <div class="address">${address}</div>
        </div>
        
        <div id="status"></div>
        
        <button id="donateBtn" class="button" onclick="donatePYUSD()">
            🦊 Connect MetaMask & Donate
        </button>
        
        <p style="text-align: center; color: #666; font-size: 14px;">
            This will open MetaMask and handle the approval + transfer automatically
        </p>
    </div>

    <script>
        const PYUSD_CONTRACT = '${PYUSD_CONTRACT}';
        const RECIPIENT_ADDRESS = '${address}';
        const AMOUNT = '${amountInWei}';
        const AMOUNT_DISPLAY = '${amount}';
        
        function showStatus(message, type = 'info') {
            const statusDiv = document.getElementById('status');
            statusDiv.innerHTML = '<div class="status ' + type + '">' + message + '</div>';
        }
        
        async function donatePYUSD() {
            const btn = document.getElementById('donateBtn');
            btn.disabled = true;
            btn.textContent = 'Processing...';
            
            if (typeof window.ethereum === 'undefined') {
                showStatus('❌ Please install MetaMask to donate!', 'error');
                btn.disabled = false;
                btn.textContent = '🦊 Connect MetaMask & Donate';
                return;
            }
            
            try {
                showStatus('🔗 Connecting to MetaMask...', 'info');
                
                // Request account access
                const accounts = await window.ethereum.request({ 
                    method: 'eth_requestAccounts' 
                });
                const userAddress = accounts[0];
                
                showStatus('✅ Connected: ' + userAddress.slice(0, 6) + '...' + userAddress.slice(-4), 'success');
                
                // Check current allowance
                showStatus('🔍 Checking current allowance...', 'info');
                
                const allowanceData = {
                    to: PYUSD_CONTRACT,
                    data: '0xdd62ed3e' + userAddress.slice(2).padStart(64, '0') + RECIPIENT_ADDRESS.slice(2).padStart(64, '0')
                };
                
                const allowance = await window.ethereum.request({
                    method: 'eth_call',
                    params: [allowanceData, 'latest']
                });
                
                const currentAllowance = parseInt(allowance, 16);
                const requiredAmount = parseInt(AMOUNT);
                
                // Step 1: Approve if needed
                if (currentAllowance < requiredAmount) {
                    showStatus('📝 Approval needed. Sending approval transaction...', 'info');
                    
                    const approveData = '0x095ea7b3' + RECIPIENT_ADDRESS.slice(2).padStart(64, '0') + AMOUNT.padStart(64, '0');
                    
                    const approveTx = await window.ethereum.request({
                        method: 'eth_sendTransaction',
                        params: [{
                            from: userAddress,
                            to: PYUSD_CONTRACT,
                            data: approveData
                        }]
                    });
                    
                    showStatus('⏳ Approval transaction sent: ' + approveTx.slice(0, 10) + '... Please wait for confirmation.', 'info');
                    
                    // Wait for approval confirmation
                    await waitForTransaction(approveTx);
                    showStatus('✅ Approval confirmed!', 'success');
                }
                
                // Step 2: Transfer tokens
                showStatus('💸 Sending donation...', 'info');
                
                const transferData = '0xa9059cbb' + RECIPIENT_ADDRESS.slice(2).padStart(64, '0') + AMOUNT.padStart(64, '0');
                
                const transferTx = await window.ethereum.request({
                    method: 'eth_sendTransaction',
                    params: [{
                        from: userAddress,
                        to: PYUSD_CONTRACT,
                        data: transferData
                    }]
                });
                
                showStatus('⏳ Transfer transaction sent: ' + transferTx.slice(0, 10) + '...', 'info');
                
                // Wait for transfer confirmation
                await waitForTransaction(transferTx);
                
                showStatus('🎉 Donation of ' + AMOUNT_DISPLAY + ' PYUSD sent successfully!', 'success');
                btn.textContent = '✅ Donation Complete!';
                
            } catch (error) {
                console.error('Donation failed:', error);
                showStatus('❌ Donation failed: ' + error.message, 'error');
                btn.disabled = false;
                btn.textContent = '🦊 Connect MetaMask & Donate';
            }
        }
        
        async function waitForTransaction(txHash) {
            return new Promise((resolve, reject) => {
                const checkInterval = setInterval(async () => {
                    try {
                        const receipt = await window.ethereum.request({
                            method: 'eth_getTransactionReceipt',
                            params: [txHash]
                        });
                        
                        if (receipt) {
                            clearInterval(checkInterval);
                            if (receipt.status === '0x1') {
                                resolve(receipt);
                            } else {
                                reject(new Error('Transaction failed'));
                            }
                        }
                    } catch (error) {
                        clearInterval(checkInterval);
                        reject(error);
                    }
                }, 2000);
                
                // Timeout after 2 minutes
                setTimeout(() => {
                    clearInterval(checkInterval);
                    reject(new Error('Transaction timeout'));
                }, 120000);
            });
        }
    </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal server error');
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 GitPay server running on http://localhost:${PORT}`);
  console.log(`📊 ENS Stats: http://localhost:${PORT}/api/ens-stats?ens=vitalik.eth`);
  console.log(`💰 Donate: http://localhost:${PORT}/api/donate?ens=vitalik.eth&amount=10`);
  console.log(`\n💡 Make sure to set ALCHEMY_API_KEY in your .env file`);
});
