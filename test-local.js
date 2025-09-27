// Simple test script for local development
// Run: node test-local.js

const testENS = 'vitalik.eth'; // You can change this to any ENS name
const baseURL = 'http://localhost:3000';

async function testAPI() {
  console.log('🧪 Testing GitPay API locally...\n');

  try {
    // Test ENS Stats
    console.log('1. Testing ENS Stats API...');
    const statsResponse = await fetch(`${baseURL}/api/ens-stats?ens=${testENS}`);
    
    if (statsResponse.ok) {
      console.log('✅ ENS Stats API working');
      console.log(`   Response: ${statsResponse.headers.get('content-type')}`);
    } else {
      console.log('❌ ENS Stats API failed:', statsResponse.status);
    }

    // Test Donate API
    console.log('\n2. Testing Donate API...');
    const donateResponse = await fetch(`${baseURL}/api/donate?ens=${testENS}&amount=10`);
    
    if (donateResponse.ok) {
      console.log('✅ Donate API working');
      console.log(`   Response: ${donateResponse.headers.get('content-type')}`);
    } else {
      console.log('❌ Donate API failed:', donateResponse.status);
    }

    console.log('\n🎉 Test completed!');
    console.log('\n📝 Next steps:');
    console.log('1. Make sure you have ALCHEMY_API_KEY in .env.local');
    console.log('2. Start the dev server: vercel dev');
    console.log('3. Open your browser and test the URLs:');
    console.log(`   - ${baseURL}/api/ens-stats?ens=${testENS}`);
    console.log(`   - ${baseURL}/api/donate?ens=${testENS}&amount=10`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure to:');
    console.log('1. Run "vercel dev" in another terminal');
    console.log('2. Set ALCHEMY_API_KEY in .env.local');
  }
}

testAPI();
