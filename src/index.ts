import express from 'express';
import cors from 'cors';
import { PORT } from './config';
import { 
  healthCheck, 
  ensStats, 
  donate, 
  donationPage,
  gitPayTransactions,
  gitPayTransactionsByAddress,
  gitPayTransactionStats,
  gitPayRecentTransactions
} from './routes';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/', healthCheck);
app.get('/api/ens-stats', ensStats);
app.get('/api/donate', donate);
app.get('/donate', donationPage);

// GitPay Transaction API Routes
app.get('/api/transactions', gitPayTransactions);
app.get('/api/transactions/stats', gitPayTransactionStats);
app.get('/api/transactions/recent', gitPayRecentTransactions);
app.get('/api/transactions/:address', gitPayTransactionsByAddress);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 GitPay server running on http://localhost:${PORT}`);
  console.log(`📊 ENS Stats: http://localhost:${PORT}/api/ens-stats?ens=vitalik.eth`);
  console.log(`💰 Donate: http://localhost:${PORT}/api/donate?ens=vitalik.eth&amount=10`);
  console.log(`\n🔍 GitPay Transaction APIs:`);
  console.log(`   📋 All Transactions: http://localhost:${PORT}/api/transactions`);
  console.log(`   📊 Statistics: http://localhost:${PORT}/api/transactions/stats`);
  console.log(`   🕒 Recent: http://localhost:${PORT}/api/transactions/recent`);
  console.log(`   👤 By Address: http://localhost:${PORT}/api/transactions/0x...`);
  console.log(`\n💡 Make sure to set ALCHEMY_API_KEY in your .env file`);
});
