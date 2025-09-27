import { alchemyRpcUrl, PYUSD_CONTRACT, client } from './config';

// Helper function to resolve multiple addresses to ENS names
export async function resolveAddressesToENS(addresses: string[]): Promise<Map<string, string | null>> {
  const ensMap = new Map<string, string | null>();
  
  // Process addresses in parallel with a reasonable concurrency limit
  const batchSize = 5;
  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);
    
    const promises = batch.map(async (address) => {
      try {
        const ensName = await client.getEnsName({ address: address as `0x${string}` });
        return { address, ensName };
      } catch (error) {
        console.warn(`⚠️ Could not resolve ENS for ${address}:`, error);
        return { address, ensName: null };
      }
    });
    
    const results = await Promise.all(promises);
    results.forEach(({ address, ensName }) => {
      ensMap.set(address.toLowerCase(), ensName);
    });
  }
  
  return ensMap;
}

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



// GitPay transaction identifier - hex for "GITPAY" (32 bytes = 64 hex chars)
export const GITPAY_IDENTIFIER = '0x4749545041590000000000000000000000000000000000000000000000000000';

// Helper function to check if input data contains GitPay identifier
function containsGitPayIdentifier(data: string): boolean {
  // Simply check if the GitPay identifier exists anywhere in the input data
  const hasIdentifier = data.includes(GITPAY_IDENTIFIER.slice(2)); // Remove 0x prefix
  
  console.log(`🔍 Checking GitPay identifier:`, {
    dataLength: data.length,
    hasIdentifier: hasIdentifier
  });
  
  return hasIdentifier;
}

// Helper function to check if this is a GitPay transaction based on input data analysis
function isGitPayTransactionByInputData(data: string, tx: any): boolean {
  // Only check if the input data contains the GitPay identifier
  return containsGitPayIdentifier(data);
}

// Helper function to parse GitPay transaction data
export function parseGitPayTransactionData(data: string, tx?: any): { isGitPay: boolean; recipient?: string; amount?: string; memo?: string } {
  if (!data) {
    return { isGitPay: false };
  }
  
  // Check if it's a GitPay transaction by looking for the identifier
  const isGitPay = containsGitPayIdentifier(data);
  
  // If it's not a GitPay transaction, return early
  if (!isGitPay) {
    return { isGitPay: false };
  }
  
  // Try to extract recipient and amount if it looks like a transfer
  let recipient: string | undefined = undefined;
  let amount: string | undefined = undefined;
  
  if (data.startsWith('0xa9059cbb') && data.length >= 138) {
    // Extract recipient address (bytes 4-35)
    const recipientHex = data.slice(10, 74);
    recipient = '0x' + recipientHex.slice(24); // Remove padding
    
    // Extract amount (bytes 36-67)
    const amountHex = data.slice(74, 138);
    amount = parseInt(amountHex, 16).toString();
  }
  
  // Parse memo from the 32-byte GitPay identifier if present
  let memo: string | undefined = undefined;
  if (data.length >= 202) {
    // The memo is in the 32-byte identifier after "GITPAY"
    const identifierHex = data.slice(138, 202);
    if (identifierHex.startsWith('474954504159')) { // "GITPAY" in hex
      // Extract the remaining bytes as memo (after "GITPAY" which is 12 hex chars)
      const memoHex = identifierHex.slice(12);
      if (memoHex && memoHex !== '0000000000000000000000000000000000000000000000000000000000000000') {
        // Convert hex to string, removing null bytes
        const memoBytes = Buffer.from(memoHex, 'hex');
        memo = memoBytes.toString('utf8').replace(/\0/g, '').trim();
        if (memo === '') memo = undefined;
      }
    }
  }
  
  return {
    isGitPay,
    recipient,
    amount,
    memo
  };
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

// Helper function to fetch transactions for a specific address using Alchemy Asset Transfers API
export async function fetchTransactionsForAddress(address: string, limit: number = 100): Promise<GitPayTransaction[]> {
  try {
    console.log(`🔍 Fetching asset transfers for address: ${address}`);
    
    const url = alchemyRpcUrl;
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

    // Remove duplicates based on transaction hash
    const uniqueTransfers = allTransfers.filter((transfer, index, self) => 
      index === self.findIndex(t => t.hash === transfer.hash)
    );

    console.log(`📋 Found ${allTransfers.length} total asset transfers, ${uniqueTransfers.length} unique for address ${address}`);

    // Filter for PYUSD transfers only
    const pyusdTransfers = uniqueTransfers.filter(transfer => 
      transfer.rawContract?.address?.toLowerCase() === PYUSD_CONTRACT.toLowerCase()
    );

    console.log(`📋 Found ${pyusdTransfers.length} PYUSD transfers for address ${address}`);

    const gitPayTransactions: GitPayTransaction[] = [];

    // Process each transfer and check if it's actually a GitPay transaction
    for (const transfer of pyusdTransfers.slice(0, limit)) {
      try {
        console.log(`🔍 Processing transfer ${transfer.hash}:`, {
          from: transfer.from,
          to: transfer.to,
          value: transfer.value,
          isToAddress: transfer.to.toLowerCase() === address.toLowerCase(),
          isFromAddress: transfer.from.toLowerCase() === address.toLowerCase()
        });
        
        // Get the actual transaction to check its input data
        const tx = await client.getTransaction({ hash: transfer.hash as `0x${string}` });
        
        if (tx.input) {
          const parsed = parseGitPayTransactionData(tx.input, tx);
          
          console.log(`🔍 Checking transaction ${transfer.hash}:`, {
            inputLength: tx.input.length,
            input: tx.input.slice(0, 50) + '...',
            isGitPay: parsed.isGitPay,
            recipient: parsed.recipient,
            amount: parsed.amount,
            memo: parsed.memo
          });
          
          // Only add if it's actually a GitPay transaction
          if (parsed.isGitPay) {
            const amount = transfer.value ? (parseFloat(transfer.value) * Math.pow(10, transfer.rawContract?.decimals || 6)).toString() : '0';
            
            console.log(`✅ Adding GitPay transaction ${transfer.hash} to results`);
            
            gitPayTransactions.push({
              hash: transfer.hash,
              from: transfer.from,
              to: transfer.to,
              value: amount,
              blockNumber: transfer.blockNum,
              timestamp: new Date(transfer.metadata?.blockTimestamp).getTime(),
              recipient: parsed.recipient || transfer.to,
              amount: parsed.amount || amount,
              memo: parsed.memo
            });
          } else {
            console.log(`❌ Transaction ${transfer.hash} is not a GitPay transaction`);
          }
        } else {
          console.log(`❌ Transaction ${transfer.hash} has no input data`);
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

// Helper function to fetch all GitPay transactions using viem (with block range limit)
export async function fetchAllGitPayTransactions(limit: number = 100): Promise<GitPayTransaction[]> {
  try {
    // Get recent blocks - limit to 10 blocks for Alchemy free tier
    const latestBlock = await client.getBlockNumber();
    const fromBlock = latestBlock - BigInt(9); // 10 blocks total (0-9)
    
    console.log(`🔍 Fetching logs from block ${fromBlock} to ${latestBlock}`);
    
    // Get logs for Transfer events from PYUSD contract
    const logs = await client.getLogs({
      address: PYUSD_CONTRACT,
      event: {
        type: 'event',
        name: 'Transfer',
        inputs: [
          { name: 'from', type: 'address', indexed: true },
          { name: 'to', type: 'address', indexed: true },
          { name: 'value', type: 'uint256', indexed: false }
        ]
      },
      fromBlock,
      toBlock: latestBlock
    });

    console.log(`📋 Found ${logs.length} transfer logs`);

    const gitPayTransactions: GitPayTransaction[] = [];

    // Process each log to check if it's a GitPay transaction
    for (const log of logs.slice(0, limit)) {
      try {
        // Get transaction details
        const tx = await client.getTransaction({ hash: log.transactionHash });
        
        if (tx.input) {
          const parsed = parseGitPayTransactionData(tx.input, tx);
          
          if (parsed.isGitPay) {
            // Get block details for timestamp
            const block = await client.getBlock({ blockNumber: log.blockNumber });
            
            gitPayTransactions.push({
              hash: log.transactionHash,
              from: tx.from,
              to: tx.to || '',
              value: parsed.amount || '0',
              blockNumber: log.blockNumber.toString(),
              timestamp: Number(block.timestamp) * 1000,
              recipient: parsed.recipient || tx.to || '',
              amount: parsed.amount || '0',
              memo: parsed.memo
            });
          }
        }
      } catch (error) {
        console.error('Error processing transaction:', error);
        continue;
      }
    }

    console.log(`✅ Found ${gitPayTransactions.length} GitPay transactions`);
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
  const transactions = await fetchAllGitPayTransactions(50); // Reduced limit for free tier
  
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

// Helper function to generate address-specific GitPay badge
export async function generateAddressBadgeSVG(address: string, stats: {
  totalReceived: number;
  totalDonated: number;
  receivedCount: number;
  donatedCount: number;
}, ensName?: string | null, recentTransactions?: GitPayTransaction[]): Promise<string> {
  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const displayName = ensName || shortAddress;
  const badgeWidth = 600;
  const badgeHeight = 250;
  
  // Get recent transactions for display (show 4 instead of 3)
  const recentTxs = recentTransactions?.slice(0, 4) || [];
  
  // Resolve ENS names for all addresses in recent transactions
  const allAddresses = new Set<string>();
  recentTxs.forEach(tx => {
    allAddresses.add(tx.from.toLowerCase());
    allAddresses.add(tx.recipient.toLowerCase());
  });
  
  const ensMap = await resolveAddressesToENS(Array.from(allAddresses));
  
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
  <g transform="translate(20, 150)">
    <text x="0" y="15" font-family="Arial, sans-serif" font-size="14" fill="#e0e0e0" font-weight="bold">
      🔄 Recent Transactions
    </text>
    ${recentTxs.map((tx, i) => {
      const isReceived = tx.recipient.toLowerCase() === address.toLowerCase();
      const amount = (parseFloat(tx.amount) / 1000000).toFixed(2);
      const timeAgo = getTimeAgo(tx.timestamp);
      const otherAddress = isReceived ? tx.from : tx.recipient;
      
      // Get ENS name or fallback to shortened address
      const ensName = ensMap.get(otherAddress.toLowerCase());
      const otherDisplay = ensName || `${otherAddress.slice(0, 6)}...${otherAddress.slice(-4)}`;
      
      return `
        <text x="0" y="${35 + i * 15}" font-family="Arial, sans-serif" font-size="11" fill="${isReceived ? '#4ade80' : '#f59e0b'}">
          ${isReceived ? '📥' : '📤'} ${amount} PYUSD ${isReceived ? 'from' : 'to'} ${otherDisplay} (${timeAgo})
        </text>
      `;
    }).join('')}
  </g>
  ` : ''}
  
  <!-- Footer -->
  <g transform="translate(15, ${badgeHeight - 20})">
    <text x="${badgeWidth - 30}" y="15" font-family="Arial, sans-serif" font-size="12" fill="#a0a0a0" text-anchor="end">
      Powered by GitPay
    </text>
  </g>
</svg>`.trim();
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
            
            // Create standard ERC20 transfer data
            const transferData = transferSignature + paddedRecipient + paddedAmount;
            
            // Add GitPay identifier to make it recognizable as a GitPay transaction
            const gitpayIdentifier = GITPAY_IDENTIFIER.slice(2); // Remove 0x prefix
            
            return transferData + gitpayIdentifier;
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
                
                // Create GitPay transaction data
                const transferData = createGitPayTransactionData(RECIPIENT_ADDRESS, AMOUNT);
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