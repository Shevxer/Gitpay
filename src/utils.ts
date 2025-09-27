import { alchemyRpcUrl, PYUSD_CONTRACT } from './config';

// Helper function to get PYUSD balance using Alchemy RPC
export async function getPYUSDBalance(address: string): Promise<number> {
  const url = alchemyRpcUrl;
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
export function generateStatsSVG(ens: string, address: string, balance: number): string {
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
export function generateDonateSVG(ens: string, address: string, amount: string): string {
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

// GitPay transaction identifier - hex for "GITPAY" (32 bytes = 64 hex chars)
export const GITPAY_IDENTIFIER = '0x4749545041590000000000000000000000000000000000000000000000000000';

// Helper function to create GitPay transaction data with memo
export function createGitPayTransactionData(recipientAddress: string, amountInWei: string, memo?: string): string {
  // Standard ERC20 transfer function signature: transfer(address,uint256)
  const transferSignature = '0xa9059cbb';
  
  // Pad recipient address to 32 bytes (64 hex chars)
  const paddedRecipient = recipientAddress.slice(2).padStart(64, '0');
  
  // Pad amount to 32 bytes (64 hex chars)
  const paddedAmount = parseInt(amountInWei).toString(16).padStart(64, '0');
  
  // Create memo data (GitPay identifier + optional memo)
  const memoData = memo ? 
    GITPAY_IDENTIFIER + Buffer.from(memo, 'utf8').toString('hex').padEnd(64, '0') :
    GITPAY_IDENTIFIER;
  
  // Combine all data: transfer signature + recipient + amount + memo
  return transferSignature + paddedRecipient + paddedAmount + memoData;
}

// Helper function to parse GitPay transaction data
export function parseGitPayTransactionData(data: string): { isGitPay: boolean; recipient?: string; amount?: string; memo?: string } {
  if (!data || data.length < 138) { // Minimum length for transfer + memo
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
  
  // Check for GitPay identifier (bytes 68-99)
  const memoStart = data.slice(138, 202);
  if (memoStart.startsWith(GITPAY_IDENTIFIER.slice(2))) {
    // Extract memo if present (bytes 100+)
    let memo = '';
    if (data.length > 202) {
      const memoHex = data.slice(202);
      try {
        memo = Buffer.from(memoHex, 'hex').toString('utf8').replace(/\0/g, '').trim();
      } catch (e) {
        // If memo parsing fails, just return empty string
        memo = '';
      }
    }
    
    return {
      isGitPay: true,
      recipient,
      amount,
      memo: memo || undefined
    };
  }
  
  return { isGitPay: false };
}

// Interface for GitPay transaction data
export interface GitPayTransaction {
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

// Helper function to fetch transactions for a specific address using Alchemy
export async function fetchTransactionsForAddress(address: string, limit: number = 100): Promise<any[]> {
  const url = alchemyRpcUrl;
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  const body = JSON.stringify({
    id: 1,
    jsonrpc: "2.0",
    method: "alchemy_getAssetTransfers",
    params: [{
      fromBlock: "0x0",
      toBlock: "latest",
      fromAddress: address,
      toAddress: address,
      category: ["erc20"],
      withMetadata: true,
      excludeZeroValue: false,
      maxCount: limit
    }]
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

    return data.result.transfers || [];
  } catch (error) {
    console.error('Error fetching transactions:', error);
    throw error;
  }
}

// Helper function to fetch all GitPay transactions
export async function fetchAllGitPayTransactions(limit: number = 1000): Promise<GitPayTransaction[]> {
  const url = alchemyRpcUrl;
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  // Get recent blocks first
  const blockBody = JSON.stringify({
    id: 1,
    jsonrpc: "2.0",
    method: "eth_blockNumber",
    params: []
  });

  try {
    const blockResponse = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: blockBody
    });

    const blockData = await blockResponse.json();
    const latestBlock = parseInt(blockData.result, 16);
    const fromBlock = Math.max(0, latestBlock - 10000); // Last ~10k blocks

    // Get all ERC20 transfers to PYUSD contract
    const transferBody = JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "alchemy_getAssetTransfers",
      params: [{
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: "latest",
        toAddress: PYUSD_CONTRACT,
        category: ["erc20"],
        withMetadata: true,
        excludeZeroValue: false,
        maxCount: limit
      }]
    });

    const transferResponse = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: transferBody
    });

    const transferData = await transferResponse.json();
    
    if (transferData.error) {
      throw new Error(`Alchemy RPC error: ${transferData.error.message}`);
    }

    const transfers = transferData.result.transfers || [];
    const gitPayTransactions: GitPayTransaction[] = [];

    // Filter and process GitPay transactions
    for (const transfer of transfers) {
      if (transfer.rawContract && transfer.rawContract.address.toLowerCase() === PYUSD_CONTRACT.toLowerCase()) {
        // Get transaction details to check for GitPay identifier
        const txBody = JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "eth_getTransactionByHash",
          params: [transfer.hash]
        });

        const txResponse = await fetch(url, {
          method: 'POST',
          headers: headers,
          body: txBody
        });

        const txData = await txResponse.json();
        
        if (txData.result && txData.result.input) {
          const parsed = parseGitPayTransactionData(txData.result.input);
          
          if (parsed.isGitPay) {
            gitPayTransactions.push({
              hash: transfer.hash,
              from: transfer.from,
              to: transfer.to,
              value: transfer.value,
              blockNumber: transfer.blockNum,
              timestamp: new Date(transfer.metadata.blockTimestamp).getTime(),
              recipient: parsed.recipient || transfer.to,
              amount: parsed.amount || transfer.value,
              memo: parsed.memo
            });
          }
        }
      }
    }

    return gitPayTransactions.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Error fetching GitPay transactions:', error);
    throw error;
  }
}

// Helper function to get transaction statistics
export async function getGitPayTransactionStats(): Promise<{
  totalTransactions: number;
  totalVolume: number;
  uniqueRecipients: number;
  recentTransactions: GitPayTransaction[];
}> {
  const transactions = await fetchAllGitPayTransactions(1000);
  
  const totalTransactions = transactions.length;
  const totalVolume = transactions.reduce((sum, tx) => sum + parseFloat(tx.amount) / 1000000, 0); // Convert from wei
  const uniqueRecipients = new Set(transactions.map(tx => tx.recipient)).size;
  const recentTransactions = transactions.slice(0, 10);

  return {
    totalTransactions,
    totalVolume,
    uniqueRecipients,
    recentTransactions
  };
}

// Helper function to generate donation page HTML
export function generateDonationPageHTML(ens: string, address: string, amount: string): string {
  const amountInWei = (parseFloat(amount) * 1000000).toString(); // PYUSD has 6 decimals
  console.log(`Amount: ${amount}, Amount in Wei: ${amountInWei}`);

  return `
<!DOCTYPE html>
<html>
<head>
    <title>Donate to ${ens} - Sepolia Testnet</title>
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
            <p style="color: #666; font-size: 14px; margin-top: 10px;">
                🌐 <strong>Sepolia Testnet</strong> - Test tokens only
            </p>
        </div>
        
        <div id="status"></div>
        
        <button id="donateBtn" class="button" onclick="donatePYUSD()">
            🦊 Connect MetaMask & Donate
        </button>
        
        <p style="text-align: center; color: #666; font-size: 14px;">
            This will open MetaMask and send PYUSD directly 
        </p>
    </div>

    <script>
        const PYUSD_CONTRACT = '${PYUSD_CONTRACT}';
        const RECIPIENT_ADDRESS = '${address}';
        const AMOUNT = '${amountInWei}';
        const AMOUNT_DISPLAY = '${amount}';
        const CHAIN_ID = '0xaa36a7'; // Sepolia testnet chain ID
        
        // GitPay transaction identifier
        const GITPAY_IDENTIFIER = '0x4749545041590000000000000000000000000000000000000000000000000000';
        
        // Function to create GitPay transaction data with memo
        function createGitPayTransactionData(recipientAddress, amountInWei, memo) {
            const transferSignature = '0xa9059cbb';
            const paddedRecipient = recipientAddress.slice(2).padStart(64, '0');
            const paddedAmount = parseInt(amountInWei).toString(16).padStart(64, '0');
            
            let memoData = GITPAY_IDENTIFIER;
            if (memo) {
                const memoHex = Buffer.from(memo, 'utf8').toString('hex').padEnd(64, '0');
                memoData = GITPAY_IDENTIFIER + memoHex;
            }
            
            return transferSignature + paddedRecipient + paddedAmount + memoData;
        }
        
        console.log('Donation details:', {
            contract: PYUSD_CONTRACT,
            recipient: RECIPIENT_ADDRESS,
            amount: AMOUNT,
            displayAmount: AMOUNT_DISPLAY,
            amountAsNumber: parseInt(AMOUNT),
            amountAsHex: parseInt(AMOUNT).toString(16)
        });
        
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
                
                // Check if we're on the correct network (Sepolia)
                const chainId = await window.ethereum.request({ method: 'eth_chainId' });
                if (chainId !== CHAIN_ID) {
                    showStatus('🔄 Switching to Sepolia testnet...', 'info');
                    try {
                        await window.ethereum.request({
                            method: 'wallet_switchEthereumChain',
                            params: [{ chainId: CHAIN_ID }],
                        });
                    } catch (switchError) {
                        // If Sepolia is not added, add it
                        if (switchError.code === 4902) {
                            await window.ethereum.request({
                                method: 'wallet_addEthereumChain',
                                params: [{
                                    chainId: CHAIN_ID,
                                    chainName: 'Sepolia Test Network',
                                    rpcUrls: ['https://sepolia.infura.io/v3/'],
                                    nativeCurrency: {
                                        name: 'SepoliaETH',
                                        symbol: 'SepoliaETH',
                                        decimals: 18
                                    },
                                    blockExplorerUrls: ['https://sepolia.etherscan.io']
                                }]
                            });
                        } else {
                            throw switchError;
                        }
                    }
                }
                
                // Request account access
                const accounts = await window.ethereum.request({ 
                    method: 'eth_requestAccounts' 
                });
                const userAddress = accounts[0];
                
                showStatus('✅ Connected: ' + userAddress.slice(0, 6) + '...' + userAddress.slice(-4), 'success');
                
                // Direct transfer (no approval needed for direct transfers)
                showStatus('💸 Sending donation...', 'info');
                
                // Create GitPay transaction data with memo
                const memo = 'Donation via GitPay to ${ens}';
                const transferData = createGitPayTransactionData(RECIPIENT_ADDRESS, AMOUNT, memo);
                console.log('GitPay transaction data:', transferData);
                console.log('Amount as number:', parseInt(AMOUNT));
                
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
}
