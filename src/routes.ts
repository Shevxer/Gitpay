import { Request, Response } from 'express';
import { client } from './config';
import { 
  getPYUSDBalance, 
  generateStatsSVG, 
  generateDonateSVG, 
  generateDonationPageHTML,
  fetchAllGitPayTransactions,
  fetchTransactionsForAddress,
  getGitPayTransactionStats,
  GitPayTransaction
} from './utils';

// Health check route
export function healthCheck(req: Request, res: Response) {
  res.json({ 
    message: 'GitPay API is running!', 
    endpoints: [
      'GET /api/ens-stats?ens=yourname.eth',
      'GET /api/donate?ens=yourname.eth&amount=10',
      'GET /api/transactions - Get all GitPay transactions',
      'GET /api/transactions/:address - Get transactions for specific address',
      'GET /api/transactions/stats - Get transaction statistics',
      'GET /api/transactions/recent - Get recent transactions'
    ]
  });
}

// ENS Stats endpoint
export async function ensStats(req: Request, res: Response) {
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
}

// Donate endpoint - returns SVG button
export async function donate(req: Request, res: Response) {
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
    
    const transactions = await fetchAllGitPayTransactions(limitNum + offsetNum);
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
    const allTransactions = await fetchAllGitPayTransactions(1000);
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
    const transactions = await fetchAllGitPayTransactions(limitNum);
    
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
