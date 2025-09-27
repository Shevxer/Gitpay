import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

// Debug environment variables
console.log('Environment check:');
console.log('ALCHEMY_API_KEY exists:', !!process.env.ALCHEMY_API_KEY);
console.log('ALCHEMY_API_KEY length:', process.env.ALCHEMY_API_KEY?.length || 0);

// Constants
export const PORT = process.env.PORT || 3000;
export const PYUSD_CONTRACT = '0xCaC524BcA292aaade2DF8A05cC58F0a65B1B3bB9';

// Check if API key is provided
if (!process.env.ALCHEMY_API_KEY || process.env.ALCHEMY_API_KEY === 'your_alchemy_api_key_here') {
  console.error('❌ ALCHEMY_API_KEY is not set or is using placeholder value');
  console.error('Please set your Alchemy API key in the .env file');
  process.exit(1);
}

// Create viem client for Sepolia testnet
const alchemyUrl = `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;

export const client = createPublicClient({
  chain: sepolia,
  transport: http(alchemyUrl),
});

export { alchemyUrl as alchemyRpcUrl };
