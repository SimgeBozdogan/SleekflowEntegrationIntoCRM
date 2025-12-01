// Sleekflow API Test Script
// Bu script'i direkt çalıştırarak API key'inizi test edebilirsiniz

const axios = require('axios');

const API_KEY = '1s4Npe771yHJHv0ho5thauUHCCAQ38kChRdHCXilw5Y';
const BASE_URL = 'https://api.sleekflow.io';

async function testSleekflowAPI() {
    console.log('\n🔍 === SLEEKFLOW API TEST ===\n');
    console.log(`API Key: ${API_KEY.substring(0, 10)}...${API_KEY.substring(API_KEY.length - 5)}`);
    console.log(`Base URL: ${BASE_URL}\n`);

    // Test 1: X-Sleekflow-Api-Key header
    console.log('📌 TEST 1: X-Sleekflow-Api-Key header');
    try {
        const response = await axios.get(`${BASE_URL}/api/contact`, {
            params: { limit: 1, offset: 0 },
            headers: {
                'X-Sleekflow-Api-Key': API_KEY,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        console.log('✅ BAŞARILI!');
        console.log(`   Status: ${response.status}`);
        console.log(`   Data:`, JSON.stringify(response.data).substring(0, 200));
    } catch (error) {
        console.log('❌ BAŞARISIZ!');
        console.log(`   Status: ${error.response?.status || 'N/A'}`);
        console.log(`   Message: ${error.message}`);
        if (error.response?.data) {
            console.log(`   Response:`, JSON.stringify(error.response.data));
        }
    }

    console.log('\n---\n');

    // Test 2: Authorization Bearer header
    console.log('📌 TEST 2: Authorization Bearer header');
    try {
        const response = await axios.get(`${BASE_URL}/api/contact`, {
            params: { limit: 1, offset: 0 },
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        console.log('✅ BAŞARILI!');
        console.log(`   Status: ${response.status}`);
        console.log(`   Data:`, JSON.stringify(response.data).substring(0, 200));
    } catch (error) {
        console.log('❌ BAŞARISIZ!');
        console.log(`   Status: ${error.response?.status || 'N/A'}`);
        console.log(`   Message: ${error.message}`);
        if (error.response?.data) {
            console.log(`   Response:`, JSON.stringify(error.response.data));
        }
    }

    console.log('\n---\n');

    // Test 3: Farklı endpoint - /api/conversation
    console.log('📌 TEST 3: /api/conversation endpoint (X-Sleekflow-Api-Key)');
    try {
        const response = await axios.get(`${BASE_URL}/api/conversation`, {
            params: { limit: 1, offset: 0 },
            headers: {
                'X-Sleekflow-Api-Key': API_KEY,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        console.log('✅ BAŞARILI!');
        console.log(`   Status: ${response.status}`);
        console.log(`   Data:`, JSON.stringify(response.data).substring(0, 200));
    } catch (error) {
        console.log('❌ BAŞARISIZ!');
        console.log(`   Status: ${error.response?.status || 'N/A'}`);
        console.log(`   Message: ${error.message}`);
        if (error.response?.data) {
            console.log(`   Response:`, JSON.stringify(error.response.data));
        }
    }

    console.log('\n✅ === TEST TAMAMLANDI ===\n');
    console.log('📝 SONUÇ:');
    console.log('   - Eğer tüm testler 401 veriyorsa → API KEY YANLIŞ');
    console.log('   - Eğer 500 veriyorsa → Sleekflow sunucusu sorunu (ekip ile iletişime geçin)');
    console.log('   - Eğer 404 veriyorsa → Endpoint yanlış\n');
}

testSleekflowAPI().catch(console.error);

