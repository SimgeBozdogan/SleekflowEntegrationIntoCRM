const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Static files middleware - CSS, JS, images için
app.use(express.static(path.join(__dirname)));

// Debug middleware
app.use((req, res, next) => {
    console.log(`\n🔵 ${req.method} ${req.url}`);
    if (req.body && Object.keys(req.body).length > 0) {
        console.log(`   Body:`, JSON.stringify(req.body).substring(0, 200));
    }
    next();
});

// ============================================
// BELLEKTE TUTULAN BAĞLANTI BİLGİLERİ
// ============================================
let sleekflowApiKey = null;
let sleekflowBaseUrl = "https://api.sleekflow.io";

// ============================================
// YARDIMCI: SLEEKFLOW'A İSTEK AT
// ============================================
async function callSleekflow(method, path, { params = {}, data = null } = {}) {
    if (!sleekflowApiKey) {
        throw new Error("Sleekflow API anahtarı ayarlı değil");
    }

    // baseUrl sonunda / varsa kes
    const base = sleekflowBaseUrl.replace(/\/+$/, "");
    const url = `${base}${path}`;

    console.log(`\n🔍 Sleekflow API Call:`);
    console.log(`   Method: ${method.toUpperCase()}`);
    console.log(`   URL: ${url}`);
    console.log(`   API Key: ${sleekflowApiKey.substring(0, 10)}... (length: ${sleekflowApiKey.length})`);

    // ÖNCE X-Sleekflow-Api-Key formatını deneyelim (401 alıyoruz ama endpoint tanınıyor)
    // 401 hatası = endpoint var ama API key yanlış
    // 500 hatası = sunucu hatası (Bearer formatında)
    const headerFormats = [
        { "X-Sleekflow-Api-Key": sleekflowApiKey, "Content-Type": "application/json" }, // İLK ÖNCE BU
        { "Authorization": `Bearer ${sleekflowApiKey}`, "Content-Type": "application/json" }, // Sonra bu
    ];
    
    let lastHeaderError = null;
    let triedFormats = [];
    
    for (const headers of headerFormats) {
        try {
            const config = {
                method,
                url,
                params,
                headers: headers,
                timeout: 15000,
            };

            if (data) {
                config.data = data;
            }

            const headerName = Object.keys(headers)[0];
            console.log(`   🔍 Header format deneniyor: ${headerName}`);
            triedFormats.push(headerName);
            
            const res = await axios(config);
            console.log(`   ✅ Başarılı! Kullanılan header: ${headerName}`);
            return res.data;
        } catch (err) {
            const errorStatus = err.response?.status;
            const headerName = Object.keys(headers)[0];
            lastHeaderError = err;
            
            console.log(`   ❌ ${headerName} başarısız: ${errorStatus || err.message}`);
            
            // 401/403 hatası alırsak, endpoint tanınıyor ama API key yanlış
            // Bu durumda hemen durdur çünkü diğer formatlar da muhtemelen aynı sonucu verir
            if (errorStatus === 401 || errorStatus === 403) {
                throw err;
            }
            
            // 500 hatası alırsak, diğer formatı dene
            if (errorStatus === 500) {
                console.log(`   ⚠️  ${headerName} 500 verdi, diğer format deneniyor...`);
                continue;
            }
            
            // Diğer hatalar için de diğer formatı dene
            continue;
        }
    }
    
    // Tüm header formatları başarısız oldu
    console.log(`   ❌ Tüm header formatları başarısız. Denenen formatlar: ${triedFormats.join(', ')}`);
    throw lastHeaderError || new Error("Tüm header formatları başarısız");
}

// ============================================
// 1) /api/sleekflow/connect
// ============================================
app.post("/api/sleekflow/connect", async (req, res) => {
    console.log(`\n📥 POST /api/sleekflow/connect`);
    
    try {
        const { apiKey, baseUrl } = req.body || {};

        if (!apiKey) {
            return res.status(400).json({ error: "API anahtarı gerekli" });
        }

        // API key'i temizle
        sleekflowApiKey = apiKey.trim();
        
        // FARKLI BASE URL'LERİ DENEYELİM - DOKÜMANTASYONDA FARKLI BÖLGELER VAR!
        const baseUrlsToTry = [
            baseUrl ? baseUrl.trim().replace(/\/+$/, "") : null, // Kullanıcının seçtiği
            "https://api.sleekflow.io", // Hong Kong
            "https://sleekflow-core-app-weu-production.azurewebsites.net", // West Europe
            "https://sleekflow-core-app-eus-production.azurewebsites.net", // United States
            "https://sleekflow-core-app-seas-production.azurewebsites.net", // Singapore
            "https://sleekflow-core-app-uaen-production.azurewebsites.net", // UAE North
        ].filter(Boolean);

        console.log(`   API Key length: ${sleekflowApiKey.length}`);
        console.log(`   Denenecek Base URL'ler: ${baseUrlsToTry.length} adet`);
        
        let testData = null;
        let workingBaseUrl = null;
        let workingEndpoint = null;
        let lastError = null;

        // Her base URL'i dene
        for (const testBaseUrl of baseUrlsToTry) {
            sleekflowBaseUrl = testBaseUrl;
            console.log(`\n   🔍 Base URL deneniyor: ${testBaseUrl}`);
            
            try {
                console.log(`   🔍 Test endpoint: /api/contact`);
                testData = await callSleekflow("get", "/api/contact", {
                    params: { limit: 1, offset: 0 },
                });
                workingBaseUrl = testBaseUrl;
                workingEndpoint = "/api/contact";
                console.log(`   ✅ BAŞARILI! Base URL: ${workingBaseUrl}`);
                break; // Başarılı oldu, döngüden çık
            } catch (err) {
                const status = err.response?.status;
                console.log(`   ❌ ${testBaseUrl} başarısız: ${status || err.message}`);
                
                // 401/403 = API key geçersiz ama base URL doğru olabilir
                if (status === 401 || status === 403) {
                    workingBaseUrl = testBaseUrl; // Base URL doğru ama API key yanlış
                    lastError = err;
                    console.log(`   ⚠️ Base URL doğru görünüyor ama API key geçersiz`);
                    break; // Base URL bulundu ama API key sorunu var
                }
                
                // 500 = Sunucu hatası, base URL yanlış olabilir
                if (status === 500) {
                    console.log(`   ⚠️ 500 hatası - Bu base URL yanlış olabilir`);
                    lastError = err;
                    continue; // Diğer base URL'i dene
                }
                
                lastError = err;
            }
        }

        // Eğer hiçbir base URL çalışmadıysa
        if (!workingBaseUrl && lastError) {
            const status = lastError.response?.status;
            
            if (status === 401 || status === 403) {
                // Base URL bulundu ama API key yanlış
                return res.status(401).json({
                    error: "API anahtarı geçersiz",
                    endpointFound: true,
                    status: status,
                    url: lastError.config?.url,
                    baseUrl: lastError.config?.baseURL || sleekflowBaseUrl,
                    details: lastError.response?.data || lastError.message,
                    suggestion: "API anahtarı geçersiz. Lütfen Sleekflow hesabınızdan doğru API anahtarını alın."
                });
            }
            
            if (status === 500) {
                return res.status(500).json({
                    error: "Tüm base URL'ler denenendi ama bağlantı kurulamadı",
                    endpointFound: false,
                    status: 500,
                    triedUrls: baseUrlsToTry,
                    details: lastError.response?.data || lastError.message,
                    suggestion: "Sleekflow hesabınızın hangi bölgede olduğunu kontrol edin ve uygun base URL'i seçin."
                });
            }
            
            throw lastError;
        }
        
        // Başarılı olduysa
        if (workingBaseUrl) {
            sleekflowBaseUrl = workingBaseUrl;
            console.log(`   ✅ Çalışan Base URL: ${workingBaseUrl}`);
        }

        if (!testData) {
            throw lastError || new Error("Bağlantı testi başarısız");
        }

        console.log(`✅ Sleekflow bağlantısı başarılı! Çalışan endpoint: ${workingEndpoint}`);

        res.json({
            success: true,
            connected: true,
            endpointFound: true,
            message: "Sleekflow bağlantısı başarılı",
            workingEndpoint: workingEndpoint,
            testSample: testData,
        });
    } catch (err) {
        // Backend exception - log it first
        console.error(`\n❌ ========== BACKEND EXCEPTION ==========`);
        console.error(`   Error message: ${err.message}`);
        console.error(`   Error stack: ${err.stack}`);
        console.error(`==============================================\n`);

        const status = err.response?.status;
        const body = err.response?.data;
        const headers = err.response?.headers || {};

        console.log(`\n❌ ========== SLEEKFLOW BAĞLANTI HATASI ==========`);
        console.log(`   Status: ${status || 'N/A'}`);
        console.log(`   Message: ${err.message}`);
        console.log(`   URL: ${err.config?.url || 'N/A'}`);
        console.log(`   Method: ${err.config?.method?.toUpperCase() || 'N/A'}`);
        console.log(`   Headers sent:`, JSON.stringify(err.config?.headers || {}, null, 2));
        if (body) {
            console.log(`   Response body:`, JSON.stringify(body, null, 2));
        }
        console.log(`==============================================\n`);

        // Eğer bu bir backend hatası ise (Sleekflow API hatası değil)
        if (!err.response && !status) {
            return res.status(500).json({
                error: "Backend hatası",
                message: err.message,
                stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
                suggestion: "Sunucu loglarını kontrol edin veya tekrar deneyin."
            });
        }

        // Sleekflow'dan 401/403 geldiyse → API key hatalı
        if (status === 401 || status === 403) {
            return res.status(401).json({
                error: "API anahtarı geçersiz veya yetkilendirme hatası",
                endpointFound: true,
                status: status,
                details: body,
                url: err.config?.url,
                suggestion: "Lütfen Sleekflow hesabınızdan doğru API anahtarını aldığınızdan emin olun. Ayarlar > API bölümünden yeni bir API anahtarı oluşturmayı deneyin."
            });
        }

        // 404 - Endpoint bulunamadı
        if (status === 404) {
            return res.status(404).json({
                error: "Endpoint bulunamadı",
                endpointFound: false,
                status: status,
                url: err.config?.url,
                details: body || err.message,
                suggestion: "Sleekflow API endpoint'i bulunamadı. Base URL'i kontrol edin veya Sleekflow dokümantasyonuna bakın."
            });
        }

        // 500 - Sunucu hatası
        if (status === 500) {
            return res.status(500).json({
                error: "Sleekflow sunucu hatası",
                endpointFound: true, // Endpoint var ama sunucu hatası
                status: status,
                url: err.config?.url,
                details: body || err.message,
                suggestion: "Sleekflow sunucusunda bir sorun var. Lütfen daha sonra tekrar deneyin."
            });
        }

        // Network hatası
        if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
            return res.status(500).json({
                error: "Sleekflow sunucusuna bağlanılamadı",
                endpointFound: false,
                code: err.code,
                url: err.config?.url,
                details: err.message,
                suggestion: "İnternet bağlantınızı kontrol edin veya Sleekflow servisinin çalıştığından emin olun."
            });
        }

        // Başka bir hata
        return res.status(500).json({
            error: "Sleekflow bağlantı hatası",
            status: status || 'N/A',
            code: err.code || 'N/A',
            url: err.config?.url || 'N/A',
            details: body || err.message,
            fullError: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// ============================================
// AUTO-CONNECT ENDPOINT
// ============================================
app.post("/api/auto-connect", async (req, res) => {
    try {
        // Load saved credentials from localStorage (sent from frontend)
        const { sleekflowApiKey: savedApiKey, sleekflowBaseUrl: savedBaseUrl } = req.body || {};
        
        if (savedApiKey) {
            // Store credentials without testing (to avoid auto-connect failures)
            sleekflowApiKey = savedApiKey.trim();
            sleekflowBaseUrl = (savedBaseUrl || "https://api.sleekflow.io").trim().replace(/\/+$/, "");
            
            res.json({
                success: true,
                message: "Credentials loaded",
                sleekflow: {
                    connected: !!sleekflowApiKey,
                    hasApiKey: !!sleekflowApiKey
                }
            });
        } else {
            res.json({
                success: false,
                message: "No credentials provided"
            });
        }
    } catch (error) {
        console.error("Auto-connect error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 2) Konuşma listesi
// ============================================
app.get("/api/sleekflow/conversations", async (req, res) => {
    const { channel: filterChannel } = req.query;
    
    try {
        // API key kontrolü - yoksa hata döndür
        if (!sleekflowApiKey) {
            return res.status(401).json({ 
                error: "Sleekflow bağlantısı yok. Lütfen API anahtarınızı girin ve bağlanın.",
                conversations: []
            });
        }

        // Gerçek SleekFlow API çağrısı - /api/conversation/all endpoint'ini kullan
        const params = { limit: 100, offset: 0 };
        if (filterChannel) {
            params.channel = filterChannel;
        }
        
        const data = await callSleekflow("get", "/api/conversation/all", { params });

        // API'den gelen veriyi parse et
        const rawConversations = Array.isArray(data) ? data : (data.data || data.items || data.conversations || []);
        
        if (!Array.isArray(rawConversations) || rawConversations.length === 0) {
            return res.json({ conversations: [] });
        }

        // Channel filtreleme için keyword mapping
        const channelKeywords = {
            whatsapp: ['whatsapp', 'whatsapp360dialog', 'whatsappcloudapi'],
            instagram: ['instagram'],
            facebook: ['facebook'],
            sms: ['sms'],
            line: ['line'],
            wechat: ['wechat', 'weixin'],
            web: ['web', 'webclient']
        };

        // Conversation'ları UI formatına map et
        let mappedConversations = rawConversations.map((c) => {
            const userProfile = c.userProfile || {};
            const firstName = userProfile.firstName || '';
            const lastName = userProfile.lastName || '';
            const contactName = `${firstName} ${lastName}`.trim() || 'Bilinmeyen';
            
            // Channel bilgisini normalize et
            const lastMessageChannel = (c.lastMessageChannel || '').toLowerCase();
            const conversationChannels = (c.conversationChannels || []).map(ch => ch.toLowerCase());
            const allChannels = [lastMessageChannel, ...conversationChannels].filter(Boolean);
            
            // Display channel belirle
            let displayChannel = 'WhatsApp';
            if (allChannels.some(ch => ch.includes('instagram'))) {
                displayChannel = 'Instagram';
            } else if (allChannels.some(ch => ch.includes('facebook'))) {
                displayChannel = 'Facebook';
            } else if (allChannels.some(ch => ch.includes('sms'))) {
                displayChannel = 'SMS';
            } else if (allChannels.some(ch => ch.includes('line'))) {
                displayChannel = 'LINE';
            } else if (allChannels.some(ch => ch.includes('wechat') || ch.includes('weixin'))) {
                displayChannel = 'WeChat';
            } else if (allChannels.some(ch => ch.includes('web'))) {
                displayChannel = 'Web';
            } else if (allChannels.some(ch => ch.includes('whatsapp'))) {
                displayChannel = 'WhatsApp';
            }

            return {
                id: c.conversationId || c.id || Math.random().toString(),
                contactName: contactName,
                lastMessage: c.lastMessage?.messageContent || c.lastMessage?.text || '',
                lastMessageTime: c.updatedTime || c.modifiedAt || c.updatedAt || new Date(),
                channel: displayChannel,
                rawChannel: lastMessageChannel, // Filtreleme için
                conversationChannels: allChannels, // Filtreleme için
                unreadCount: c.unreadMessageCount || 0,
                phoneNumber: userProfile.phoneNumber || userProfile.phone || '',
                email: userProfile.email || ''
            };
        });

        // Channel filtreleme uygula
        if (filterChannel && filterChannel.trim() !== '') {
            const targetChannel = filterChannel.toLowerCase().trim();
            const keywords = channelKeywords[targetChannel] || [targetChannel];
            
            mappedConversations = mappedConversations.filter(conv => {
                const allChannelsText = [
                    conv.rawChannel || '',
                    ...(conv.conversationChannels || [])
                ].join(' ').toLowerCase();
                
                // WhatsApp için özel kontrol
                if (targetChannel === 'whatsapp') {
                    return keywords.some(keyword => allChannelsText.includes(keyword));
                }
                
                // Diğer kanallar için - WhatsApp'ı hariç tut
                if (targetChannel !== 'whatsapp' && allChannelsText.includes('whatsapp')) {
                    return false;
                }
                
                // Seçilen kanalın keyword'lerini kontrol et
                return keywords.some(keyword => allChannelsText.includes(keyword));
            });
        }

        // Zaman sırasına göre sırala (en yeni üstte)
        mappedConversations.sort((a, b) => {
            const timeA = new Date(a.lastMessageTime).getTime();
            const timeB = new Date(b.lastMessageTime).getTime();
            return timeB - timeA;
        });

        console.log(`✅ ${mappedConversations.length} conversation yüklendi`);
        res.json({ conversations: mappedConversations });
    } catch (err) {
        console.error("❌ Konuşmalar hatası:", err.message);
        console.error("   Stack:", err.stack);
        
        // Hata durumunda boş array döndür, demo veri YOK
        return res.status(500).json({ 
            error: "Konuşmalar yüklenemedi: " + err.message,
            conversations: []
        });
    }
});

// ============================================
// 3) Mesaj listesi
// ============================================
app.get("/api/sleekflow/conversations/:id/messages", async (req, res) => {
    const { id } = req.params;
    
    try {
        // API key kontrolü
        if (!sleekflowApiKey) {
            return res.status(401).json({ 
                error: "Sleekflow bağlantısı yok. Lütfen API anahtarınızı girin ve bağlanın.",
                messages: []
            });
        }

        // Gerçek SleekFlow API çağrısı - /api/conversation/message/{conversationId}
        const data = await callSleekflow("get", `/api/conversation/message/${id}`, {
            params: { limit: 100, offset: 0 }
        });

        // API'den gelen veriyi parse et
        const rawMessages = Array.isArray(data) ? data : (data.data || data.messages || data.items || []);
        
        if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
            return res.json({ messages: [] });
        }

        // Mesajları UI formatına map et
        const messages = rawMessages.map((m) => ({
            id: m.id || m.message_id || Math.random().toString(),
            direction: m.isSentFromSleekflow ? "sent" : "received",
            text: m.messageContent || m.text || m.body || m.message || m.content || "",
            timestamp: m.timestamp ? new Date(m.timestamp * 1000) : (m.createdAt || m.created_at || new Date()),
            type: m.messageType || m.type || "text",
            channel: m.channel || m.channelName || ""
        }));

        // Zaman sırasına göre sırala (en eski üstte)
        messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        console.log(`✅ ${messages.length} mesaj yüklendi (conversation: ${id})`);
        res.json({ messages });
    } catch (err) {
        console.error("❌ Mesajlar hatası:", err.message);
        console.error("   Stack:", err.stack);
        
        // Hata durumunda boş array döndür, demo veri YOK
        return res.status(500).json({ 
            error: "Mesajlar yüklenemedi: " + err.message,
            messages: []
        });
    }
});

// ============================================
// 4) Mesaj gönder
// ============================================
app.post("/api/sleekflow/conversations/:id/messages", async (req, res) => {
    const { id } = req.params;
    const { text } = req.body || {};

    if (!text) {
        return res.status(400).json({ error: "Mesaj metni gerekli" });
    }

    if (!sleekflowApiKey) {
        return res.status(401).json({ error: "Sleekflow bağlantısı yok. Lütfen API anahtarınızı girin ve bağlanın." });
    }

    try {
        // Sleekflow mesaj gönderme endpoint'ine göre ayarla
        const payload = {
            conversation_id: id,
            conversationId: id,
            type: "text",
            text: text,
            message: text
        };

        const data = await callSleekflow("post", "/api/message/send", {
            data: payload,
        });

        res.json({ success: true, message: "Mesaj gönderildi", data: data });
    } catch (err) {
        console.error("Mesaj gönderme hatası:", err.message);
        res.status(500).json({ error: "Mesaj gönderilemedi: " + (err.response?.data?.message || err.message) });
    }
});

// ============================================
// ZOHO ROUTES (Mevcut kod korunuyor)
// ============================================
// Helper functions
function getZohoBaseUrl(region) {
    const regionMap = {
        'com': 'https://accounts.zoho.com',
        'eu': 'https://accounts.zoho.eu',
        'in': 'https://accounts.zoho.in',
        'com.au': 'https://accounts.zoho.com.au',
        'com.cn': 'https://accounts.zoho.com.cn'
    };
    return regionMap[region] || regionMap['com'];
}

function getZohoApiUrl(region) {
    const regionMap = {
        'com': 'https://www.zohoapis.com',
        'eu': 'https://www.zohoapis.eu',
        'in': 'https://www.zohoapis.in',
        'com.au': 'https://www.zohoapis.com.au',
        'com.cn': 'https://www.zohoapis.com.cn'
    };
    return regionMap[region] || regionMap['com'];
}

// Storage for Zoho
const zohoStorage = {
    clientId: null,
    clientSecret: null,
    redirectUri: null,
    region: 'com',
    accessToken: null,
    refreshToken: null,
    tokenExpiry: null,
    connected: false
};

app.post('/api/zoho/connect', async (req, res) => {
    try {
        const { clientId, clientSecret, redirectUri, region } = req.body;
        
        if (!clientId || !clientSecret) {
            return res.status(400).json({ error: 'Client ID ve Client Secret gerekli' });
        }
        
        zohoStorage.clientId = clientId;
        zohoStorage.clientSecret = clientSecret;
        zohoStorage.redirectUri = redirectUri || 'http://localhost:3000/callback';
        zohoStorage.region = region || 'com';
        
        const baseUrl = getZohoBaseUrl(region || 'com');
        // Scope'lar: Widget için yeterli - Zoho CRM verilerini okumak için
        // ZohoCRM.modules.ALL → Tüm modüllere erişim (Contact, Lead, vb.)
        // ZohoCRM.settings.ALL → Ayarlara erişim
        // ZohoCRM.users.READ → Kullanıcı bilgilerini okuma
        // ZohoCRM.org.READ → Organizasyon bilgilerini okuma
        const scopes = 'ZohoCRM.modules.ALL,ZohoCRM.settings.ALL,ZohoCRM.users.READ,ZohoCRM.org.READ';
        const authUrl = `${baseUrl}/oauth/v2/auth?scope=${encodeURIComponent(scopes)}&client_id=${clientId}&response_type=code&access_type=offline&redirect_uri=${encodeURIComponent(zohoStorage.redirectUri)}&state=zoho`;
        
        res.json({ 
            success: true, 
            authUrl,
            message: 'Zoho OAuth URL oluşturuldu' 
        });
    } catch (error) {
        console.error('Zoho connection error:', error.message);
        res.status(500).json({ error: error.message || 'Zoho bağlantısı başarısız' });
    }
});

app.get('/api/zoho/test', async (req, res) => {
    try {
        if (!zohoStorage.connected || !zohoStorage.accessToken) {
            return res.status(400).json({ 
                error: 'Zoho OAuth bağlantısı yok',
                hint: 'Lütfen önce Zoho OAuth bağlantısı yapın (Bağlan butonuna tıklayın)',
                hasCredentials: !!zohoStorage.clientId
            });
        }
        
        const apiUrl = getZohoApiUrl(zohoStorage.region);
        const response = await axios.get(`${apiUrl}/crm/v3/users`, {
            headers: {
                'Authorization': `Zoho-oauthtoken ${zohoStorage.accessToken}`,
                'Content-Type': 'application/json'
            },
            params: { type: 'AllUsers' },
            timeout: 15000,
            validateStatus: () => true
        });
        
        if (response.status === 200 || response.status === 201) {
            res.json({ success: true, data: response.data });
        } else if (response.status === 401 && zohoStorage.refreshToken) {
            // Try refresh
            try {
                const baseUrl = getZohoBaseUrl(zohoStorage.region);
                const refreshResponse = await axios.post(`${baseUrl}/oauth/v2/token`, null, {
                    params: {
                        grant_type: 'refresh_token',
                        client_id: zohoStorage.clientId,
                        client_secret: zohoStorage.clientSecret,
                        refresh_token: zohoStorage.refreshToken
                    }
                });
                
                zohoStorage.accessToken = refreshResponse.data.access_token;
                if (refreshResponse.data.refresh_token) {
                    zohoStorage.refreshToken = refreshResponse.data.refresh_token;
                }
                
                // Retry
                const retryResponse = await axios.get(`${apiUrl}/crm/v3/users`, {
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${zohoStorage.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    params: { type: 'AllUsers' }
                });
                
                return res.json({ success: true, data: retryResponse.data });
            } catch (refreshError) {
                zohoStorage.connected = false;
                return res.status(500).json({ error: 'Token yenileme başarısız' });
            }
        } else {
            throw new Error(`API Error: ${response.status}`);
        }
    } catch (error) {
        console.error('Zoho test error:', error.message);
        res.status(500).json({ error: error.response?.data?.message || error.message });
    }
});

// OAuth Callback
app.get('/callback', async (req, res) => {
    const code = req.query.code;
    const error = req.query.error;
    
    if (error) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>OAuth Hata</title></head>
            <body>
                <h1>OAuth Hatası</h1>
                <p>${error}</p>
                <script>
                    setTimeout(() => {
                        if (window.opener) {
                            window.opener.postMessage({ type: 'zoho_callback_error', error: '${error}' }, '*');
                            window.close();
                        } else {
                            window.location.href = '/?error=${encodeURIComponent(error)}';
                        }
                    }, 2000);
                </script>
            </body>
            </html>
        `);
    }
    
    if (code) {
        try {
            const baseUrl = getZohoBaseUrl(zohoStorage.region);
            const tokenResponse = await axios.post(`${baseUrl}/oauth/v2/token`, null, {
                params: {
                    grant_type: 'authorization_code',
                    client_id: zohoStorage.clientId,
                    client_secret: zohoStorage.clientSecret,
                    redirect_uri: zohoStorage.redirectUri,
                    code: code
                }
            });
            
            zohoStorage.accessToken = tokenResponse.data.access_token;
            zohoStorage.refreshToken = tokenResponse.data.refresh_token;
            zohoStorage.connected = true;
            const expiresIn = tokenResponse.data.expires_in || 3600;
            zohoStorage.tokenExpiry = new Date(Date.now() + (expiresIn - 300) * 1000);
            
            res.send(`
                <!DOCTYPE html>
                <html>
                <head><title>OAuth Başarılı</title></head>
                <body>
                    <h1>✅ Bağlantı Başarılı!</h1>
                    <p>Zoho hesabınız başarıyla bağlandı.</p>
                    <script>
                        if (window.opener) {
                            window.opener.postMessage({ type: 'zoho_callback_success' }, '*');
                            setTimeout(() => window.close(), 2000);
                        } else {
                            window.location.href = '/?zoho_connected=true';
                        }
                    </script>
                </body>
                </html>
            `);
        } catch (error) {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head><title>OAuth Hata</title></head>
                <body>
                    <h1>OAuth Hatası</h1>
                    <p>${error.response?.data?.error || error.message}</p>
                    <script>
                        setTimeout(() => {
                            if (window.opener) {
                                window.opener.postMessage({ type: 'zoho_callback_error', error: '${error.message}' }, '*');
                                window.close();
                            } else {
                                window.location.href = '/?error=${encodeURIComponent(error.message)}';
                            }
                        }, 3000);
                    </script>
                </body>
                </html>
            `);
        }
    } else {
        res.status(400).send('Geçersiz callback parametreleri');
    }
});

// ============================================
// STATUS & STATIC FILES
// ============================================
app.get('/api/status', (req, res) => {
    res.json({
        sleekflow: {
            connected: !!sleekflowApiKey,
            baseUrl: sleekflowBaseUrl,
            hasApiKey: !!sleekflowApiKey
        },
        zoho: {
            connected: zohoStorage.connected,
            region: zohoStorage.region,
            hasAccessToken: !!zohoStorage.accessToken
        }
    });
});

// Static files
app.get('/styles.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'styles.css'));
});

app.get('/app.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'app.js'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Polling endpoint (frontend'den polling başlatmak için)
app.post('/api/polling/start', (req, res) => {
    console.log('🔄 Polling başlatma isteği alındı');
    res.json({ 
        success: true, 
        message: 'Polling başlatıldı',
        note: 'Polling frontend tarafında yönetiliyor'
    });
});

// SleekFlow Widget sayfası (Zoho için)
app.get('/widget', (req, res) => {
    console.log('📱 Widget sayfası isteniyor...');
    const widgetPath = path.join(__dirname, 'zoho-widget.html');
    console.log('   Widget dosya yolu:', widgetPath);
    res.sendFile(widgetPath, (err) => {
        if (err) {
            console.error('❌ Widget dosyası gönderilemedi:', err.message);
            res.status(500).send('Widget dosyası bulunamadı: ' + err.message);
        } else {
            console.log('✅ Widget sayfası başarıyla gönderildi');
        }
    });
});

// ============================================
// SERVER START
// ============================================
app.listen(PORT, () => {
    console.log(`\n🚀 Server çalışıyor: http://localhost:${PORT}`);
    console.log(`📱 Sleekflow-Zoho Entegrasyon Arayüzü hazır!`);
    console.log(`\n📡 API Routes:`);
    console.log(`   POST /api/sleekflow/connect`);
    console.log(`   GET  /api/sleekflow/conversations`);
    console.log(`   GET  /api/sleekflow/conversations/:id/messages`);
    console.log(`   POST /api/sleekflow/conversations/:id/messages`);
    console.log(`   POST /api/zoho/connect`);
    console.log(`   GET  /api/zoho/test`);
    console.log(`\n✅ Backend hazır! Authorization: Bearer formatı kullanılıyor.\n`);
});
