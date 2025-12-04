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

        // Gerçek SleekFlow API çağrısı - Farklı endpoint'leri dene
        const params = { limit: 100, offset: 0 };
        if (filterChannel) {
            params.channel = filterChannel;
        }
        
        console.log('📥 Conversationlar yükleniyor, params:', params);
        
        // Farklı endpoint'leri dene - en çok kullanılan önce
        const endpointsToTry = [
            "/api/conversation/all",  // En yaygın
            "/api/conversation",      // Alternatif
            "/api/conversations/all", // Çoğul versiyon
            "/api/conversations"      // Son çare
        ];
        
        let data;
        let lastError = null;
        
        for (const endpoint of endpointsToTry) {
            try {
                console.log(`🔍 Endpoint deneniyor: ${endpoint}`);
                data = await callSleekflow("get", endpoint, { params });
                console.log(`✅ API Response alındı (${endpoint}), type:`, typeof data, 'isArray:', Array.isArray(data));
                break; // Başarılı oldu, döngüden çık
            } catch (apiError) {
                const status = apiError.response?.status;
                lastError = apiError;
                
                console.error(`❌ Endpoint başarısız (${endpoint}):`, apiError.message);
                console.error('   Status:', status);
                console.error('   Data:', apiError.response?.data);
                
                // 401/403 = API key yanlış, diğer endpoint'leri deneme
                if (status === 401 || status === 403) {
                    console.error('⚠️ API key geçersiz, diğer endpoint\'ler denenmeyecek');
                    throw apiError;
                }
                
                // 404 = Endpoint yok, diğerini dene
                if (status === 404) {
                    console.log(`⚠️ Endpoint bulunamadı (${endpoint}), diğeri deneniyor...`);
                    continue;
                }
                
                // 500 = Sunucu hatası, diğerini dene (ama sadece ilk endpoint'ler için)
                if (status === 500) {
                    console.log(`⚠️ Sunucu hatası (${endpoint}), diğeri deneniyor...`);
                    // Eğer son endpoint ise ve hala 500 veriyorsa, hata fırlat
                    if (endpoint === endpointsToTry[endpointsToTry.length - 1]) {
                        console.error(`❌ Tüm endpoint'ler 500 hatası verdi`);
                        throw apiError;
                    }
                    continue;
                }
                
                // Diğer hatalar için de devam et
                continue;
            }
        }
        
        // Tüm endpoint'ler başarısız oldu
        if (!data && lastError) {
            console.error('❌ Tüm endpoint\'ler başarısız oldu');
            throw lastError;
        }

        // API'den gelen veriyi parse et
        const rawConversations = Array.isArray(data) ? data : (data.data || data.items || data.conversations || []);
        
        console.log('📊 Raw conversations sayısı:', rawConversations.length);
        
        if (!Array.isArray(rawConversations)) {
            console.error('❌ Raw conversations array değil:', typeof rawConversations, rawConversations);
            return res.status(500).json({ 
                error: "API'den beklenmeyen veri formatı geldi",
                conversations: []
            });
        }
        
        if (rawConversations.length === 0) {
            console.log('ℹ️ Conversation bulunamadı');
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
        let mappedConversations = [];
        
        try {
            mappedConversations = rawConversations.map((c, index) => {
                try {
                    const userProfile = c.userProfile || {};
                    const firstName = userProfile.firstName || '';
                    const lastName = userProfile.lastName || '';
                    const contactName = `${firstName} ${lastName}`.trim() || 'Bilinmeyen';
                    
                    // Channel bilgisini normalize et
                    const lastMessageChannel = (c.lastMessageChannel || '').toLowerCase();
                    const conversationChannels = (c.conversationChannels || []).map(ch => String(ch || '').toLowerCase());
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

                    // Last message bilgisini al
                    let lastMessage = '';
                    if (c.lastMessage) {
                        if (typeof c.lastMessage === 'string') {
                            lastMessage = c.lastMessage;
                        } else if (c.lastMessage.messageContent) {
                            lastMessage = c.lastMessage.messageContent;
                        } else if (c.lastMessage.text) {
                            lastMessage = c.lastMessage.text;
                        }
                    }

                    return {
                        id: c.conversationId || c.id || `conv_${index}`,
                        contactName: contactName,
                        lastMessage: lastMessage,
                        lastMessageTime: c.updatedTime || c.modifiedAt || c.updatedAt || new Date(),
                        channel: displayChannel,
                        rawChannel: lastMessageChannel, // Filtreleme için
                        conversationChannels: allChannels, // Filtreleme için
                        unreadCount: c.unreadMessageCount || 0,
                        phoneNumber: userProfile.phoneNumber || userProfile.phone || '',
                        email: userProfile.email || ''
                    };
                } catch (mapError) {
                    console.error(`❌ Conversation map hatası (index ${index}):`, mapError.message);
                    console.error('   Conversation data:', JSON.stringify(c).substring(0, 200));
                    // Hatalı conversation'ı atla
                    return null;
                }
            }).filter(conv => conv !== null); // null olanları filtrele
        } catch (mapError) {
            console.error('❌ Conversation mapping genel hatası:', mapError.message);
            console.error('   Stack:', mapError.stack);
            // Mapping hatası olsa bile boş array döndür, uygulama çökmesin
            mappedConversations = [];
        }

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
        console.error("   Response status:", err.response?.status);
        console.error("   Response data:", err.response?.data);
        
        // API hatası detaylarını al
        const status = err.response?.status;
        const errorData = err.response?.data;
        const errorMessage = errorData?.error || errorData?.message || err.message;
        
        // 401/403 hatası - API key yanlış
        if (status === 401 || status === 403) {
            return res.status(401).json({ 
                error: "API anahtarı geçersiz veya yetkilendirme hatası",
                message: errorMessage,
                conversations: []
            });
        }
        
        // 404 hatası - Endpoint bulunamadı
        if (status === 404) {
            return res.status(404).json({ 
                error: "SleekFlow API endpoint'i bulunamadı",
                message: errorMessage,
                conversations: []
            });
        }
        
        // 500 hatası - Sunucu hatası
        if (status === 500) {
            console.error('❌ SleekFlow 500 hatası detayları:');
            console.error('   Error message:', errorMessage);
            console.error('   Error data:', JSON.stringify(errorData).substring(0, 500));
            console.error('   Full error:', err.message);
            console.error('   Stack:', err.stack);
            console.error('   URL:', err.config?.url);
            console.error('   Method:', err.config?.method);
            console.error('   Headers:', JSON.stringify(err.config?.headers || {}));
            
            // Daha açıklayıcı hata mesajı
            let userMessage = "SleekFlow sunucu hatası";
            if (errorData && typeof errorData === 'object') {
                const errorStr = JSON.stringify(errorData);
                if (errorStr.includes('Internal Server Error') || errorStr.includes('500')) {
                    userMessage = "SleekFlow API'sinde geçici bir sorun var. Lütfen birkaç dakika sonra tekrar deneyin.";
                } else if (errorStr.includes('endpoint') || errorStr.includes('not found')) {
                    userMessage = "SleekFlow API endpoint'i bulunamadı. Lütfen API anahtarınızı ve base URL'inizi kontrol edin.";
                }
            }
            
            return res.status(500).json({ 
                error: userMessage,
                message: errorMessage || "Request failed with status code 500",
                details: errorData ? (typeof errorData === 'string' ? errorData : JSON.stringify(errorData).substring(0, 200)) : "",
                url: err.config?.url,
                conversations: [],
                suggestion: "Lütfen SleekFlow hesabınızın aktif olduğundan ve API anahtarınızın geçerli olduğundan emin olun. Birkaç dakika sonra tekrar deneyin."
            });
        }
        
        // Network hatası (bağlantı hatası)
        if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
            return res.status(500).json({ 
                error: "SleekFlow sunucusuna bağlanılamadı",
                message: err.message,
                code: err.code,
                conversations: [],
                suggestion: "İnternet bağlantınızı kontrol edin veya SleekFlow servisinin çalıştığından emin olun."
            });
        }
        
        // Diğer hatalar
        return res.status(status || 500).json({ 
            error: "Konuşmalar yüklenemedi",
            message: errorMessage || err.message,
            status: status || 'N/A',
            code: err.code || 'N/A',
            conversations: [],
            suggestion: "Lütfen tekrar deneyin veya SleekFlow API anahtarınızı kontrol edin."
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

        console.log(`📥 Mesajlar yükleniyor, conversation ID: ${id}`);

        // Gerçek SleekFlow API çağrısı - /api/conversation/message/{conversationId}
        // TÜM MESAJLARI ÇEKMEK İÇİN PAGINATION YAP
        let allRawMessages = [];
        let offset = 0;
        const limit = 1000; // Maksimum limit
        let hasMore = true;
        
        console.log('📥 Tüm mesajlar çekiliyor (pagination)...');
        
        while (hasMore) {
            try {
                const data = await callSleekflow("get", `/api/conversation/message/${id}`, {
                    params: { limit: limit, offset: offset }
                });
                
                const batchMessages = Array.isArray(data) ? data : (data.data || data.messages || data.items || []);
                console.log(`   📦 Offset ${offset}: ${batchMessages.length} mesaj alındı`);
                
                if (batchMessages.length === 0) {
                    hasMore = false;
                } else {
                    allRawMessages = allRawMessages.concat(batchMessages);
                    
                    // Eğer gelen mesaj sayısı limit'ten azsa, daha fazla yok demektir
                    if (batchMessages.length < limit) {
                        hasMore = false;
                    } else {
                        offset += limit;
                    }
                }
            } catch (apiError) {
                console.error('❌ SleekFlow API hatası (pagination):', apiError.message);
                console.error('   Status:', apiError.response?.status);
                console.error('   Data:', apiError.response?.data);
                
                // İlk çağrıda hata olursa throw et, sonraki çağrılarda dur
                if (offset === 0) {
                    throw apiError;
                } else {
                    hasMore = false;
                }
            }
        }
        
        const rawMessages = allRawMessages;
        console.log(`✅ Toplam ${rawMessages.length} mesaj çekildi`);
        
        if (!Array.isArray(rawMessages)) {
            console.error('❌ Raw messages array değil:', typeof rawMessages, rawMessages);
            return res.status(500).json({ 
                error: "API'den beklenmeyen veri formatı geldi",
                messages: []
            });
        }
        
        if (rawMessages.length === 0) {
            console.log('ℹ️ Mesaj bulunamadı');
            return res.json({ messages: [] });
        }
        
        console.log(`📊 İlk 3 mesaj örneği:`, rawMessages.slice(0, 3).map(m => ({
            id: m.id,
            messageContent: m.messageContent?.substring(0, 50),
            messageType: m.messageType,
            hasText: !!(m.messageContent || m.text || m.body || m.message || m.content)
        })));

        // ============================================
        // Yardımcı: Dosya path'i mi?
        // ============================================
        function isFilePathString(str) {
            if (!str || typeof str !== "string") return false;
            if (!str.includes("Conversation/")) return false;

            // Uzantıya bak (mp4, jpg, pdf vs.)
            return /\.(mp4|mp3|pdf|jpg|jpeg|png|gif|webp|doc|docx|xls|xlsx|avi|mov|wmv|webm|jfif)$/i.test(str);
        }

        function buildFileUrlFromPath(p) {
            if (!p) return null;
            p = p.trim();

            // Zaten tam URL ise direkt kullan
            if (p.startsWith("http://") || p.startsWith("https://")) {
                return p;
            }

            // Relative path ise base URL ile birleştir
            const base = sleekflowBaseUrl.replace(/\/+$/, "");
            return `${base}${p.startsWith("/") ? "" : "/"}${p}`;
        }

        // Mesajları UI formatına map et - DOSYA PATH'LERİNİ HER ZAMAN TEMİZLE
        console.log(`🔄 ${rawMessages.length} mesaj map ediliyor...`);

        const messages = rawMessages
            .map((m, index) => {
                try {
                    // Zaman
                    let timestamp;
                    if (m.timestamp) {
                        if (typeof m.timestamp === "number") {
                            timestamp =
                                m.timestamp < 10000000000
                                    ? new Date(m.timestamp * 1000)
                                    : new Date(m.timestamp);
                        } else {
                            timestamp = new Date(m.timestamp);
                        }
                    } else if (m.createdAt) {
                        timestamp = new Date(m.createdAt);
                    } else if (m.created_at) {
                        timestamp = new Date(m.created_at);
                    } else {
                        timestamp = new Date();
                    }

                    // Tüm text alanlarını bir araya topla
                    const allTextFields = [
                        m.messageContent,
                        m.text,
                        m.body,
                        m.message,
                        m.content,
                        m.caption
                    ].filter(v => typeof v === "string" && v.trim().length > 0);
                    
                    // DEBUG: Ham veriyi logla
                    if (index < 5) { // İlk 5 mesajı logla
                        console.log(`🔍 RAW MSG[${index}]:`, {
                            id: m.id,
                            messageContent: m.messageContent?.substring(0, 100),
                            text: m.text?.substring(0, 100),
                            body: m.body?.substring(0, 100),
                            message: m.message?.substring(0, 100),
                            content: m.content?.substring(0, 100),
                            caption: m.caption?.substring(0, 100),
                            allTextFields: allTextFields.map(f => f.substring(0, 80))
                        });
                    }

                    let fileUrl = null;
                    let fileName = "";
                    let isStory = false;

                    // 0) Instagram story özel alanları
                    if (m.storyURL || m.storyUrl || m.story) {
                        let storyField = m.storyURL || m.storyUrl || m.story;
                        if (typeof storyField === "object") {
                            storyField = storyField.url || storyField.link || "";
                        }
                        if (storyField) {
                            fileUrl = buildFileUrlFromPath(String(storyField));
                            fileName = "Instagram Story";
                            isStory = true;
                        }
                    }

                    // 1) uploadedFiles
                    if (!fileUrl && Array.isArray(m.uploadedFiles) && m.uploadedFiles.length > 0) {
                        const f = m.uploadedFiles[0];
                        let fUrl = f.url || f.link || f.path || f.fileUrl || "";
                        fileUrl = buildFileUrlFromPath(fUrl);
                        fileName =
                            f.filename ||
                            f.name ||
                            f.fileName ||
                            (fUrl ? fUrl.split("/").pop() : "") ||
                            "";
                    }

                    // 2) fileURLs
                    if (!fileUrl && Array.isArray(m.fileURLs) && m.fileURLs.length > 0) {
                        const fUrl = m.fileURLs[0];
                        fileUrl = buildFileUrlFromPath(String(fUrl));
                        fileName = String(fUrl).split("/").pop() || "";
                    }

                    // 3) Text alanlarının içinden dosya path'i ara
                    if (!fileUrl) {
                        const filePathField = allTextFields.find(isFilePathString);
                        if (filePathField) {
                            fileUrl = buildFileUrlFromPath(filePathField);
                            fileName =
                                filePathField.split("/").pop() ||
                                filePathField.split("\\").pop() ||
                                "";
                        }
                    }

                    // 4) TEXT'i seç – dosya path'i OLMAYAN ilk alanı al
                    let messageText = "";
                    
                    // ÖNCE: Tüm text alanlarını kontrol et, dosya path'i olanları ATLA
                    const nonFilePathFields = allTextFields.filter(v => !isFilePathString(v));
                    
                    // Dosya path'i olmayan ilk alanı al
                    if (nonFilePathFields.length > 0) {
                        messageText = nonFilePathFields[0];
                    }

                    // Son güvenlik: text içinde hâlâ Conversation/ varsa TAMAMEN TEMİZLE
                    if (messageText && messageText.includes("Conversation/")) {
                        console.log(`⚠️ Map msg[${index}]: messageText hala "Conversation/" içeriyor, temizleniyor: ${messageText.substring(0, 80)}`);
                        messageText = "";
                    }
                    
                    // EK GÜVENLİK: Eğer fileUrl varsa ama messageText dosya path'i içeriyorsa, messageText'i temizle
                    if (fileUrl && messageText && messageText.includes("Conversation/")) {
                        console.log(`⚠️ Map msg[${index}]: fileUrl var ama messageText path içeriyor, temizleniyor`);
                        messageText = "";
                    }

                    // Boş tamamen gereksiz mesajları at
                    if ((!messageText || !messageText.trim()) && !fileUrl) {
                        return null;
                    }

                    console.log(`📨 Map msg[${index}]:`, {
                        id: m.id,
                        type: m.messageType || m.type,
                        hasText: !!messageText,
                        hasFile: !!fileUrl,
                        rawMessageContent: (m.messageContent || "").substring(0, 80),
                        textFields: allTextFields.slice(0, 3),
                        textFieldsCount: allTextFields.length,
                        nonFilePathFieldsCount: nonFilePathFields.length,
                        fileUrl: fileUrl ? fileUrl.substring(0, 80) : "YOK",
                        finalText: messageText ? messageText.substring(0, 50) : "BOŞ"
                    });

                    return {
                        id: m.id || m.message_id || `msg_${index}`,
                        direction: m.isSentFromSleekflow ? "sent" : "received",
                        text: messageText,          // path'ten TEMİZLENMİŞ text
                        content: messageText,       // aynı
                        timestamp,
                        createdAt: timestamp,
                        type: m.messageType || m.type || "text",
                        channel: m.channel || m.channelName || "",
                        fileUrl: fileUrl || null,   // Conversation/... → URL
                        fileName: fileName || null,
                        isStory: isStory
                    };
                } catch (mapError) {
                    console.error(
                        `❌ Mesaj map hatası (index ${index}):`,
                        mapError.message,
                        m
                    );
                    return null;
                }
            })
            .filter(msg => msg !== null); // Sadece tamamen boş mesajları at

        console.log(`📊 Map sonrası: ${messages.length} mesaj (başlangıç: ${rawMessages.length})`);
        
        // Zaman sırasına göre sırala (en eski üstte)
        // En yeni mesajlar önce gelsin (ters sıralama)
        messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        console.log(`✅ ${messages.length} mesaj yüklendi ve gönderiliyor (conversation: ${id})`);
        console.log(`📋 Mesaj ID'leri:`, messages.slice(0, 10).map(m => m.id).join(', '), messages.length > 10 ? '...' : '');
        
        res.json({ messages });
    } catch (err) {
        console.error("❌ Mesajlar hatası:", err.message);
        console.error("   Stack:", err.stack);
        console.error("   Response status:", err.response?.status);
        console.error("   Response data:", err.response?.data);
        
        // API hatası detaylarını al
        const status = err.response?.status;
        const errorData = err.response?.data;
        const errorMessage = errorData?.error || errorData?.message || err.message;
        
        // 401/403 hatası
        if (status === 401 || status === 403) {
            return res.status(401).json({ 
                error: "API anahtarı geçersiz",
                message: errorMessage,
                messages: []
            });
        }
        
        // 404 hatası
        if (status === 404) {
            return res.status(404).json({ 
                error: "Conversation veya mesajlar bulunamadı",
                message: errorMessage,
                messages: []
            });
        }
        
        // 500 hatası
        if (status === 500) {
            return res.status(500).json({ 
                error: "SleekFlow sunucu hatası",
                message: errorMessage,
                details: errorData,
                messages: []
            });
        }
        
        // Diğer hatalar
        return res.status(status || 500).json({ 
            error: "Mesajlar yüklenemedi",
            message: errorMessage,
            status: status,
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
// HEALTH CHECK (Render için)
// ============================================
app.get('/health', (req, res) => {
    console.log('✅ Health check çağrıldı');
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        port: PORT,
        env: process.env.NODE_ENV || 'development'
    });
});

// Root health check (bazı platformlar için)
app.get('/ping', (req, res) => {
    res.status(200).json({ status: 'pong' });
});

// ============================================
// SERVER START
// ============================================
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server çalışıyor: http://0.0.0.0:${PORT}`);
    console.log(`📱 Sleekflow-Zoho Entegrasyon Arayüzü hazır!`);
    console.log(`\n📡 API Routes:`);
    console.log(`   GET  /health (health check)`);
    console.log(`   GET  /ping (ping check)`);
    console.log(`   POST /api/sleekflow/connect`);
    console.log(`   GET  /api/sleekflow/conversations`);
    console.log(`   GET  /api/sleekflow/conversations/:id/messages`);
    console.log(`   POST /api/sleekflow/conversations/:id/messages`);
    console.log(`   POST /api/zoho/connect`);
    console.log(`   GET  /api/zoho/test`);
    console.log(`\n✅ Backend hazır! Authorization: Bearer formatı kullanılıyor.\n`);
    console.log(`✅ Health check: http://0.0.0.0:${PORT}/health`);
});

// Server error handling
server.on('error', (err) => {
    console.error('❌ Server hatası:', err);
    process.exit(1);
});
