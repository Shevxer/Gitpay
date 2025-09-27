# GitPay Setup Guide

## 🚀 Quick Setup for Local Development

### 1. Install Dependencies

```bash
npm install
```

### 2. Get Alchemy API Key

1. Go to [alchemy.com](https://alchemy.com)
2. Sign up for a free account
3. Create a new app
4. Select "Ethereum" and "Sepolia" testnet
5. Copy your API key

### 3. Create Environment File

Create `.env.local` in the project root:

```env
ALCHEMY_API_KEY=your_alchemy_api_key_here
```

### 4. Start Development Server

```bash
# Install Vercel CLI globally (if not already installed)
npm i -g vercel

# Start the development server
vercel dev
```

The server will start at `http://localhost:3000`

### 5. Test the APIs

Open these URLs in your browser:

**ENS Stats:**
```
http://localhost:3000/api/ens-stats?ens=vitalik.eth
```

**Donate Button:**
```
http://localhost:3000/api/donate?ens=vitalik.eth&amount=10
```

### 6. Test with Node.js Script

```bash
node test-local.js
```

## 🎯 Example Usage

### In GitHub README

```markdown
[![GitPay Stats](https://your-app.vercel.app/api/ens-stats?ens=yourname.eth)](https://sepolia.etherscan.io/address/0xYourAddress)

[![Donate PYUSD](https://your-app.vercel.app/api/donate?ens=yourname.eth&amount=10)](ethereum:0xYourAddress@1?value=0&address=0xYourAddress&uint256=10000000)
```

## 🔧 Troubleshooting

### Common Issues

1. **"Cannot find module '@vercel/node'"**
   - Run `npm install` to install dependencies

2. **"ALCHEMY_API_KEY is not defined"**
   - Make sure you created `.env.local` with your API key

3. **"ENS name not found"**
   - Try with a different ENS name that exists on Sepolia
   - Note: Some ENS names might not be available on testnet

4. **"Internal server error"**
   - Check your Alchemy API key is correct
   - Make sure you're using Sepolia testnet

### Testing with Different ENS Names

Try these ENS names that should work on Sepolia:
- `vitalik.eth`
- `ens.eth`
- `ethereum.eth`

## 📝 Next Steps

1. Test locally with `vercel dev`
2. Deploy to Vercel with `vercel`
3. Set environment variables in Vercel dashboard
4. Add the SVG URLs to your GitHub README
