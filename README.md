# GitPay 🚀

**GitPay** - ENS to PYUSD balance and donation buttons for GitHub READMEs

Resolve ENS names to wallet addresses, fetch PYUSD balances, and generate beautiful SVG cards for your GitHub profile or project READMEs.

## ✨ Features

- 🔍 **ENS Resolution**: Convert ENS names to wallet addresses
- 💰 **PYUSD Balance**: Fetch real-time PYUSD token balances
- 🎨 **Beautiful SVGs**: Generate attractive SVG cards
- 🚀 **Vercel Ready**: Deploy instantly to Vercel
- ⚡ **Fast & Cached**: 5-minute caching for optimal performance
- 🌐 **Sepolia Testnet**: Currently configured for Sepolia testnet

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <your-repo>
cd gitpay
npm install
```

### 2. Environment Setup

Create a `.env.local` file:

```env
ALCHEMY_API_KEY=your_alchemy_api_key_here
```

Get your free Alchemy API key at [alchemy.com](https://alchemy.com)

### 3. Local Development

```bash
# Install Vercel CLI globally if you haven't
npm i -g vercel

# Start local development server
vercel dev
```

Your API will be available at:
- `http://localhost:3000/api/ens-stats?ens=yourname.eth`
- `http://localhost:3000/api/donate?ens=yourname.eth&amount=10`
- `http://localhost:3000/api/dashboard?ens=yourname.eth` (or `?address=0x...`)

### 4. Deploy to Vercel

```bash
# Deploy to Vercel
vercel

# Set environment variable
vercel env add ALCHEMY_API_KEY
```

## 📖 API Endpoints

### `/api/ens-stats`

Get ENS stats and PYUSD balance as an SVG card.

**Parameters:**
- `ens` (required): ENS name (e.g., `vitalik.eth`)

**Example:**
```
GET /api/ens-stats?ens=vitalik.eth
```

**Response:** SVG image showing:
- ENS name
- Resolved address
- PYUSD balance

### `/api/donate`

Generate a donation button SVG.

**Parameters:**
- `ens` (required): ENS name
- `amount` (optional): Donation amount in PYUSD (default: 10)
- `method` (optional): Payment method (default: pyusd)

**Example:**
```
GET /api/donate?ens=vitalik.eth&amount=25&method=pyusd
```

**Response:** SVG donation button

### `/api/dashboard`

Generate a comprehensive dashboard SVG showing sent/received amounts and recent transactions.

**Parameters:**
- `ens` (optional): ENS name (e.g., `vitalik.eth`)
- `address` (optional): Ethereum address (e.g., `0x...`)

**Note:** Either `ens` or `address` must be provided.

**Example:**
```
GET /api/dashboard?ens=vitalik.eth
GET /api/dashboard?address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
```

**Response:** SVG dashboard showing:
- ENS name (if resolvable) and address
- Total received PYUSD amount and count
- Total donated PYUSD amount and count
- Recent transaction history

## 🎨 GitHub README Integration

### Stats Card

Add this to your README to show your ENS stats:

```markdown
[![GitPay Stats](https://your-app.vercel.app/api/ens-stats?ens=yourname.eth)](https://sepolia.etherscan.io/address/0xYourAddress)
```

### Donation Button

Add this to encourage donations:

```markdown
[![Donate PYUSD](https://your-app.vercel.app/api/donate?ens=yourname.eth&amount=10)](ethereum:0xYourAddress@1?value=0&address=0xYourAddress&uint256=10000000)
```

### Dashboard

Add this to show a comprehensive transaction dashboard:

```markdown
[![GitPay Dashboard](https://your-app.vercel.app/api/dashboard?ens=yourname.eth)](https://sepolia.etherscan.io/address/0xYourAddress)
```

## 🔧 Configuration

### Supported Networks

Currently configured for **Sepolia testnet**. To change networks:

1. Update the chain in `api/ens-stats.ts` and `api/donate.ts`:
   ```typescript
   import { mainnet } from 'viem/chains'; // For mainnet
   ```

2. Update the PYUSD contract address for the target network

3. Update the Alchemy RPC URL

### PYUSD Contract

- **Sepolia**: `0x6c3ea9036406852006290770BEdFcAbA0e23A0e8`
- **Mainnet**: `0x6c3ea9036406852006290770BEdFcAbA0e23A0e8`

## 🛠️ Development

### Project Structure

```
gitpay/
├── api/
│   ├── ens-stats.ts    # ENS resolution + PYUSD balance
│   ├── donate.ts       # Donation button generation
│   └── dashboard.ts    # Transaction dashboard with sent/received stats
├── package.json
├── tsconfig.json
├── vercel.json
└── README.md
```

### Dependencies

- **viem**: Ethereum library for ENS resolution and contract calls
- **@vercel/node**: Vercel serverless functions
- **typescript**: Type safety

## 🚨 Important Notes

1. **Testnet Only**: Currently configured for Sepolia testnet
2. **API Key Required**: You need an Alchemy API key
3. **ENS Resolution**: Works with any valid ENS name
4. **Caching**: SVGs are cached for 5 minutes
5. **Rate Limits**: Subject to Alchemy API rate limits

## 🔗 Links

- [Vercel](https://vercel.com) - Deployment platform
- [Alchemy](https://alchemy.com) - Ethereum RPC provider
- [viem](https://viem.sh) - TypeScript Ethereum library
- [ENS](https://ens.domains) - Ethereum Name Service

## 📄 License

MIT License - feel free to use this project!

---

**Made with ❤️ for the Ethereum community**
