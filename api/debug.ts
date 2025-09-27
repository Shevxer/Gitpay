import { VercelRequest, VercelResponse } from '@vercel/node';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { normalize } from 'viem/ens';

// Create viem client for Sepolia
const client = createPublicClient({
  chain: sepolia,
  transport: http(`https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`),
});

// PYUSD contract address on Sepolia testnet
const PYUSD_CONTRACT = '0xCaC524BcA292aaade2DF8A05cC58F0a65B1B3bB9';

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

  const { ens, address } = req.query;

  if (!ens && !address) {
    return res.status(400).json({ error: 'Either ENS name or address is required' });
  }

  try {
    let resolvedAddress: string;

    if (ens && typeof ens === 'string') {
      const resolved = await client.getEnsAddress({ name: normalize(ens) });
      if (!resolved) {
        return res.status(404).json({ error: 'ENS name not found' });
      }
      resolvedAddress = resolved;
    } else if (address && typeof address === 'string') {
      resolvedAddress = address;
    } else {
      return res.status(400).json({ error: 'Invalid ENS name or address format' });
    }

    // Get recent PYUSD transfers
    const url = `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
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
          toAddress: resolvedAddress,
          withMetadata: true,
          excludeZeroValue: true,
          maxCount: "0x3e8",
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
          fromAddress: resolvedAddress,
          withMetadata: true,
          excludeZeroValue: true,
          maxCount: "0x3e8",
          category: ["erc20"]
        }
      ]
    });

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

    // Filter for PYUSD transfers only
    const pyusdTransfers = allTransfers.filter(transfer => 
      transfer.rawContract?.address?.toLowerCase() === PYUSD_CONTRACT.toLowerCase()
    );

    // Get transaction details for each transfer
    const detailedTransfers = [];
    for (const transfer of pyusdTransfers.slice(0, 10)) {
      try {
        const tx = await client.getTransaction({ hash: transfer.hash as `0x${string}` });
        const amount = transfer.value ? (parseFloat(transfer.value) * Math.pow(10, transfer.rawContract?.decimals || 6)).toString() : '0';
        
        detailedTransfers.push({
          hash: transfer.hash,
          from: transfer.from,
          to: transfer.to,
          amount: amount,
          timestamp: new Date(transfer.metadata?.blockTimestamp).getTime(),
          input: tx.input ? tx.input.slice(0, 20) + '...' : 'No input',
          isTransfer: tx.input ? tx.input.startsWith('0xa9059cbb') : false,
          hasGitPayId: tx.input ? tx.input.includes('474954504159') : false
        });
      } catch (error) {
        console.error('Error processing transfer:', error);
      }
    }

    res.json({
      address: resolvedAddress,
      totalTransfers: allTransfers.length,
      pyusdTransfers: pyusdTransfers.length,
      detailedTransfers: detailedTransfers.sort((a, b) => b.timestamp - a.timestamp)
    });

  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
}
