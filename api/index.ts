import { VercelRequest, VercelResponse } from '@vercel/node';

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

  res.json({ 
    message: 'GitPay API is running!', 
    endpoints: [
      'GET /api/ens-stats?ens=yourname.eth - Get ENS stats and PYUSD balance as SVG',
      'GET /api/donate?ens=yourname.eth&amount=10 - Generate donation button SVG',
      'GET /api/dashboard?ens=yourname.eth - Get transaction dashboard SVG',
      'GET /api/dashboard?address=0x... - Get transaction dashboard SVG by address'
    ],
    description: 'GitPay - ENS to PYUSD balance and donation buttons for GitHub READMEs',
    network: 'Sepolia Testnet',
    version: '1.0.0'
  });
}
