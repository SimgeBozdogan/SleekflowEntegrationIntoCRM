const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const FormData = require("form-data");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Multer configuration for file uploads
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

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

    // API key'i temizle - header'da geçersiz karakter olmamalı
    const cleanApiKey = sleekflowApiKey
        .trim()
        .replace(/[\r\n\t]/g, '') // Yeni satır ve tab karakterlerini kaldır
        .replace(/[\x00-\x1F\x7F-\x9F]/g, ''); // Kontrol karakterlerini kaldır

    // ÖNCE X-Sleekflow-Api-Key formatını deneyelim (401 alıyoruz ama endpoint tanınıyor)
    // 401 hatası = endpoint var ama API key yanlış
    // 500 hatası = sunucu hatası (Bearer formatında)
    const headerFormats = [
        { "X-Sleekflow-Api-Key": cleanApiKey, "Content-Type": "application/json" }, // İLK ÖNCE BU
        { "Authorization": `Bearer ${cleanApiKey}`, "Content-Type": "application/json" }, // Sonra bu
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

        // API key'i temizle - tüm geçersiz karakterleri kaldır
        sleekflowApiKey = apiKey
            .trim()
            .replace(/[\r\n\t]/g, '') // Yeni satır ve tab karakterlerini kaldır
            .replace(/[\x00-\x1F\x7F-\x9F]/g, ''); // Kontrol karakterlerini kaldır
        
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
                    error: "Platform API anahtarı geçersiz",
                    endpointFound: true,
                    status: status,
                    url: lastError.config?.url,
                    baseUrl: lastError.config?.baseURL || sleekflowBaseUrl,
                    details: lastError.response?.data || lastError.message,
                    suggestion: "Platform API anahtarı geçersiz. Lütfen SleekFlow hesabınızdan doğru Platform API anahtarını alın: Ayarlar > Direct API > Platform API > Connect"
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
                error: "Platform API anahtarı geçersiz veya yetkilendirme hatası",
                endpointFound: true,
                status: status,
                details: body,
                url: err.config?.url,
                suggestion: "Lütfen SleekFlow hesabınızdan doğru Platform API anahtarını aldığınızdan emin olun. Ayarlar > Direct API > Platform API > Connect bölümünden yeni bir Platform API anahtarı oluşturmayı deneyin."
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
    try {
        if (!sleekflowApiKey) {
            return res.status(401).json({ 
                error: "SleekFlow bağlantısı yok. Lütfen API anahtarınızı girin ve bağlanın.",
                conversations: []
            });
        }

        // Channel filtresi (query parametresi)
        const channelFilter = req.query.channel || null;
        
        // TÜM conversation'ları çek (API filtresi güvenilir değil, backend'de filtreleyeceğiz)
        console.log("🔍 Conversation endpoint çağrılıyor: /api/conversation/all (tüm conversation'lar)");
        const params = { 
            limit: 100, // Daha fazla çek ki filtreleme sonrası yeterli olsun
            offset: 0,
            status: "open" // Sadece açık conversation'lar
        };
        
        const data = await callSleekflow("get", "/api/conversation/all", {
            params: params,
        });

        console.log("✅ Conversation API response alındı");

        // Conversation data bir array olmalı
        let allConversationsData = [];
        if (Array.isArray(data)) {
            allConversationsData = data;
        } else if (data && Array.isArray(data.data)) {
            allConversationsData = data.data;
        } else if (data && Array.isArray(data.items)) {
            allConversationsData = data.items;
        }
        
        console.log(`📊 API'den ${allConversationsData.length} conversation alındı`);
        
        // ÖNCE: Channel filtresi varsa, RAW channel değerine göre filtrele
        let filteredConversationsData = allConversationsData;
        if (channelFilter) {
            const filterChannel = channelFilter.toLowerCase();
            
            console.log(`🔍 Filtreleme yapılıyor: Seçilen kanal = "${filterChannel}"`);
            
            // Frontend'den gelen değerler: whatsapp, instagram, facebook, sms, line, wechat, web
            // API'den gelen channel değerleri: whatsapp, whatsapp360dialog, whatsappcloudapi, instagram, facebook, sms, line, wechat, web
            
            filteredConversationsData = allConversationsData.filter((conv) => {
                const lastChannel = (conv.lastMessageChannel || '').toLowerCase().trim();
                const conversationChannels = (conv.conversationChannels || []).map(c => (c || '').toLowerCase().trim());
                
                // Tüm channel değerlerini topla
                const allChannels = [lastChannel, ...conversationChannels].filter(c => c && c.length > 0);
                
                console.log(`  📋 Conversation ID: ${conv.conversationId}, Channels: [${allChannels.join(', ')}]`);
                
                // Eğer hiç channel yoksa, gösterme
                if (allChannels.length === 0) {
                    return false;
                }
                
                // Instagram seçildiyse: SADECE "instagram" içeren VE "whatsapp" İÇERMEYEN
                if (filterChannel === 'instagram') {
                    // WhatsApp içeriyor mu kontrol et
                    const hasWhatsApp = allChannels.some(ch => 
                        ch.includes('whatsapp')
                    );
                    if (hasWhatsApp) {
                        console.log(`    ❌ Instagram filtresi: WhatsApp içerdiği için HARIÇ TUTULDU`);
                        return false;
                    }
                    // Instagram var mı?
                    const hasInstagram = allChannels.some(ch => ch.includes('instagram'));
                    console.log(`    ${hasInstagram ? '✅' : '❌'} Instagram filtresi: Instagram ${hasInstagram ? 'VAR' : 'YOK'}`);
                    return hasInstagram;
                }
                
                // WhatsApp seçildiyse: SADECE "whatsapp" içeren (whatsapp, whatsapp360dialog, whatsappcloudapi)
                if (filterChannel === 'whatsapp') {
                    const hasWhatsApp = allChannels.some(ch => ch.includes('whatsapp'));
                    console.log(`    ${hasWhatsApp ? '✅' : '❌'} WhatsApp filtresi: WhatsApp ${hasWhatsApp ? 'VAR' : 'YOK'}`);
                    return hasWhatsApp;
                }
                
                // Diğer kanallar için: Seçilen kanalı içeren VE WhatsApp içermeyen
                const hasWhatsApp = allChannels.some(ch => ch.includes('whatsapp'));
                if (hasWhatsApp) {
                    console.log(`    ❌ ${filterChannel} filtresi: WhatsApp içerdiği için HARIÇ TUTULDU`);
                    return false;
                }
                
                const hasSelectedChannel = allChannels.some(ch => ch.includes(filterChannel));
                console.log(`    ${hasSelectedChannel ? '✅' : '❌'} ${filterChannel} filtresi: ${filterChannel} ${hasSelectedChannel ? 'VAR' : 'YOK'}`);
                return hasSelectedChannel;
            });
            
            console.log(`📊 Filtreleme sonucu: ${filteredConversationsData.length} conversation bulundu`);
        }
        
        // SONRA: Conversation'ları UI formatına map et (channel bilgisini normalize et)
        const conversations = filteredConversationsData.map((conv) => {
            const userProfile = conv.userProfile || {};
            const firstName = userProfile.firstName || "";
            const lastName = userProfile.lastName || "";
            const fullName = (firstName + " " + lastName).trim() || conv.messageGroupName || "Bilinmeyen";
            
            // Channel değerini normalize et (UI'da gösterim için)
            const rawChannel = conv.lastMessageChannel || (conv.conversationChannels && conv.conversationChannels[0]) || "";
            let displayChannel = "WhatsApp"; // Default
            if (rawChannel) {
                const lowerChannel = rawChannel.toLowerCase().trim();
                // WhatsApp varyantlarını kontrol et
                if (lowerChannel.includes('whatsapp')) {
                    displayChannel = "WhatsApp";
                } else if (lowerChannel.includes('instagram')) {
                    displayChannel = "Instagram";
                } else if (lowerChannel.includes('facebook')) {
                    displayChannel = "Facebook";
                } else if (lowerChannel.includes('sms') && !lowerChannel.includes('whatsapp')) {
                    displayChannel = "SMS";
                } else if (lowerChannel.includes('line')) {
                    displayChannel = "LINE";
                } else if (lowerChannel.includes('wechat') || lowerChannel.includes('weixin')) {
                    displayChannel = "WeChat";
                } else if (lowerChannel.includes('web') || lowerChannel.includes('webclient')) {
                    displayChannel = "Web";
                } else {
                    displayChannel = rawChannel; // Bilinmeyen channel'lar için raw değeri göster
                }
            }
            
            return {
                id: conv.conversationId || Math.random().toString(),
                contactName: fullName,
                lastMessage: conv.message || "", // Son mesaj
                lastMessageTime: conv.updatedTime || conv.modifiedAt || conv.userProfile?.lastContact || new Date(),
                channel: displayChannel, // Normalize edilmiş channel (UI'da gösterilen)
                rawChannel: rawChannel, // Orijinal channel değeri
                unreadCount: conv.unreadMessageCount || 0,
                phoneNumber: userProfile.whatsAppAccount?.phone_number || "",
                email: userProfile.email || "",
                contactId: userProfile.id,
                status: conv.status || "open",
                conversationId: conv.conversationId
            };
        });
        
        // Gerçek zamanlı sırasıyla sırala (en yeni üstte - updatedTime'a göre)
        conversations.sort((a, b) => {
            const timeA = new Date(a.lastMessageTime).getTime();
            const timeB = new Date(b.lastMessageTime).getTime();
            return timeB - timeA; // Yeni olanlar üstte (gerçek zamanlı sıra)
        });

        console.log(`✅ ${conversations.length} conversation gösterilecek (filtreleme: ${channelFilter || 'Yok'})`);
        res.json({ conversations });
    } catch (err) {
        console.error("❌ Konuşmalar hatası:", err.message);
        console.error("   Status:", err.response?.status);
        console.error("   URL:", err.config?.url);
        if (err.response?.data) {
            console.error("   Response data:", JSON.stringify(err.response.data).substring(0, 300));
        }
        // Hata durumunda boş liste döndür, kullanıcıya hata gösterme
        return res.json({ 
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
        if (!sleekflowApiKey) {
            return res.status(401).json({ 
                error: "SleekFlow bağlantısı yok. Lütfen API anahtarınızı girin ve bağlanın.",
                messages: []
            });
        }

        // Conversation ID ile mesajları çek
        // Doğru endpoint: /api/conversation/message/{conversationId}
        console.log(`🔍 Mesaj endpoint çağrılıyor: /api/conversation/message/${id}`);
        
        try {
            const data = await callSleekflow("get", `/api/conversation/message/${id}`, {
            params: { limit: 100, offset: 0 }
        });

            // Mesaj data formatını kontrol et (API dokümantasyonuna göre array döner)
            let messagesData = [];
            if (Array.isArray(data)) {
                messagesData = data;
            } else if (data && Array.isArray(data.data)) {
                messagesData = data.data;
            } else if (data && Array.isArray(data.items)) {
                messagesData = data.items;
            } else if (data && Array.isArray(data.messages)) {
                messagesData = data.messages;
            }

            console.log(`📊 ${messagesData.length} mesaj bulundu`);

            // API dokümantasyonuna göre mesajları map et
            const messages = messagesData.map((m) => {
                // Mesaj yönü: isSentFromSleekflow true ise "sent", false ise "received"
                const direction = m.isSentFromSleekflow ? "sent" : "received";
                
                // Timestamp: Unix epoch time (integer) veya ISO string
                let timestamp;
                if (m.timestamp && typeof m.timestamp === 'number') {
                    // Unix epoch time (saniye cinsinden) -> Date
                    timestamp = new Date(m.timestamp * 1000);
                } else if (m.createdAt) {
                    timestamp = new Date(m.createdAt);
                } else {
                    timestamp = new Date();
                }
                
                // Mesaj içeriği
                const text = m.messageContent || m.message || m.text || m.body || m.content || "";
                
                // Mesaj tipi
                const type = m.messageType || m.type || "text";
                
                return {
                    id: m.id || m.messageId || Math.random().toString(),
                    direction: direction,
                    text: text,
                    timestamp: timestamp,
                    type: type,
                    // Ek bilgiler
                    channel: m.channel || m.channelName || "",
                    sender: m.sender ? {
                        name: m.sender.displayName || `${m.sender.firstName || ""} ${m.sender.lastName || ""}`.trim(),
                        email: m.sender.email || ""
                    } : null,
                    files: m.uploadedFiles || [],
                    status: m.status || ""
                };
            });

            // Zaman sırasına göre sırala (en eski üstte - chat sırası için)
            messages.sort((a, b) => {
                const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
                const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
                return timeA - timeB; // En eski üstte
            });

            console.log(`✅ ${messages.length} mesaj yüklendi`);
        res.json({ messages });
        } catch (messageErr) {
            console.error(`❌ Mesaj endpoint hatası: ${messageErr.message}`);
            console.error(`   Status: ${messageErr.response?.status}`);
            console.error(`   URL: ${messageErr.config?.url}`);
            // Hata durumunda boş liste döndür
            res.json({ 
                messages: [],
                error: messageErr.response?.status === 404 ? "Mesaj endpoint'i bulunamadı" : messageErr.message
            });
        }
    } catch (err) {
        console.error("Mesajlar hatası:", err.message);
        return res.status(500).json({ 
            error: "Mesajlar yüklenemedi: " + err.message,
            messages: []
        });
    }
});

// ============================================
// 4) Kanal ve Sender bilgilerini çek
// ============================================
app.get("/api/sleekflow/senders", async (req, res) => {
    try {
        if (!sleekflowApiKey) {
            return res.status(401).json({ 
                error: "SleekFlow bağlantısı yok. Lütfen API anahtarınızı girin ve bağlanın.",
                senders: []
            });
        }

        console.log("🔍 Sender/Channel bilgileri çekiliyor...");
        
        const senders = {
            whatsapp: [],
            instagram: [],
            facebook: [],
            sms: [],
            line: [],
            wechat: [],
            web: []
        };

        try {
            // WhatsApp hesaplarını çek
            try {
                const whatsappAccounts = await callSleekflow("get", "/api/whatsapp/account", {});
                if (Array.isArray(whatsappAccounts)) {
                    senders.whatsapp = whatsappAccounts.map(acc => ({
                        id: acc.id || acc.phone_number,
                        phoneNumber: acc.phone_number || acc.id,
                        name: acc.name || acc.phone_number,
                        instanceId: acc.instanceId,
                        isTwilio: acc.is_twilio || false
                    }));
                } else if (whatsappAccounts && Array.isArray(whatsappAccounts.data)) {
                    senders.whatsapp = whatsappAccounts.data.map(acc => ({
                        id: acc.id || acc.phone_number,
                        phoneNumber: acc.phone_number || acc.id,
                        name: acc.name || acc.phone_number,
                        instanceId: acc.instanceId,
                        isTwilio: acc.is_twilio || false
                    }));
                }
                console.log(`✅ ${senders.whatsapp.length} WhatsApp hesabı bulundu`);
            } catch (err) {
                console.log(`⚠️ WhatsApp hesapları çekilemedi: ${err.message}`);
            }

            // Instagram hesaplarını çek
            try {
                const instagramAccounts = await callSleekflow("get", "/api/instagram/account", {});
                if (Array.isArray(instagramAccounts)) {
                    senders.instagram = instagramAccounts.map(acc => ({
                        id: acc.id || acc.instagramId,
                        instagramId: acc.instagramId || acc.id,
                        name: acc.name || acc.username || acc.instagramId,
                        username: acc.username
                    }));
                } else if (instagramAccounts && Array.isArray(instagramAccounts.data)) {
                    senders.instagram = instagramAccounts.data.map(acc => ({
                        id: acc.id || acc.instagramId,
                        instagramId: acc.instagramId || acc.id,
                        name: acc.name || acc.username || acc.instagramId,
                        username: acc.username
                    }));
                }
                console.log(`✅ ${senders.instagram.length} Instagram hesabı bulundu`);
            } catch (err) {
                console.log(`⚠️ Instagram hesapları çekilemedi: ${err.message}`);
            }

            // Facebook hesaplarını çek
            try {
                const facebookAccounts = await callSleekflow("get", "/api/facebook/account", {});
                if (Array.isArray(facebookAccounts)) {
                    senders.facebook = facebookAccounts.map(acc => ({
                        id: acc.id || acc.pageId,
                        pageId: acc.pageId || acc.id,
                        name: acc.name || acc.pageId
                    }));
                } else if (facebookAccounts && Array.isArray(facebookAccounts.data)) {
                    senders.facebook = facebookAccounts.data.map(acc => ({
                        id: acc.id || acc.pageId,
                        pageId: acc.pageId || acc.id,
                        name: acc.name || acc.pageId
                    }));
                }
                console.log(`✅ ${senders.facebook.length} Facebook hesabı bulundu`);
            } catch (err) {
                console.log(`⚠️ Facebook hesapları çekilemedi: ${err.message}`);
            }

            // SMS hesaplarını çek
            try {
                const smsAccounts = await callSleekflow("get", "/api/sms/account", {});
                if (Array.isArray(smsAccounts)) {
                    senders.sms = smsAccounts.map(acc => ({
                        id: acc.id || acc.phone_number,
                        phoneNumber: acc.phone_number || acc.id,
                        name: acc.name || acc.phone_number
                    }));
                } else if (smsAccounts && Array.isArray(smsAccounts.data)) {
                    senders.sms = smsAccounts.data.map(acc => ({
                        id: acc.id || acc.phone_number,
                        phoneNumber: acc.phone_number || acc.id,
                        name: acc.name || acc.phone_number
                    }));
                }
                console.log(`✅ ${senders.sms.length} SMS hesabı bulundu`);
            } catch (err) {
                console.log(`⚠️ SMS hesapları çekilemedi: ${err.message}`);
            }

        } catch (err) {
            console.error("❌ Sender bilgileri çekilirken hata:", err.message);
        }

        res.json({ success: true, senders });
    } catch (error) {
        console.error("❌ Sender endpoint hatası:", error);
        res.status(500).json({ 
            error: error.message,
            senders: {
                whatsapp: [],
                instagram: [],
                facebook: [],
                sms: [],
                line: [],
                wechat: [],
                web: []
            }
        });
    }
});

// ============================================
// 5) Mesaj gönder (Text veya Dosya)
// ============================================
app.post("/api/sleekflow/conversations/:id/messages", upload.array('files', 5), async (req, res) => {
    const { id } = req.params;
    const { text } = req.body || {};
    const files = req.files || [];

    // Text veya dosya olmalı
    if (!text && files.length === 0) {
        return res.status(400).json({ error: "Mesaj metni veya dosya gerekli" });
    }

    if (!sleekflowApiKey) {
        return res.status(401).json({ error: "Sleekflow bağlantısı yok. Lütfen API anahtarınızı girin ve bağlanın." });
    }

    try {
        // Önce conversation detaylarını al (channel bilgisi için)
        console.log(`📤 Mesaj gönderiliyor - Conversation ID: ${id}`);
        console.log(`   Text: ${text ? 'Var' : 'Yok'}, Dosya sayısı: ${files.length}`);
        console.log(`   Conversation detayları alınıyor...`);
        
        const conversationData = await callSleekflow("get", `/api/conversation/${id}`);
        const conversation = Array.isArray(conversationData) ? conversationData[0] : conversationData;
        
        if (!conversation) {
            return res.status(404).json({ error: "Conversation bulunamadı" });
        }

        // Channel'ı conversation'dan al
        const channel = conversation.lastMessageChannel || 
                       (conversation.conversationChannels && conversation.conversationChannels[0]) || 
                       "whatsapp";
        
        const userProfile = conversation.userProfile || {};
        
        console.log(`   Kullanılacak Channel: ${channel}`);

        // Dosya varsa multipart/form-data ile gönder
        if (files.length > 0) {
            console.log(`   📎 Dosya gönderiliyor (multipart/form-data)`);
            
            // FormData oluştur
            const formData = new FormData();
            
            // Channel ve messageType
            formData.append('channel', channel.toLowerCase());
            formData.append('messageType', 'file');
            
            // Channel'a göre receiver ve sender bilgilerini ekle
            if (['whatsapp', 'whatsapp360dialog', 'whatsappcloudapi', 'sms'].includes(channel.toLowerCase())) {
                // WhatsApp/SMS için from ve to gerekli
                if (selectedSenderId) {
                    formData.append('from', selectedSenderId);
                }
                // Receiver phone number conversation'dan alınacak
                const receiverPhone = userProfile.whatsAppAccount?.phone_number || 
                                     userProfile.PhoneNumber || 
                                     "";
                if (receiverPhone) {
                    formData.append('to', receiverPhone.replace(/\+/g, '')); // + işaretini kaldır
                } else {
                    // Phone number yoksa note channel kullan
                    formData.append('channel', 'note');
                    formData.append('ConversationId', id);
                }
            } else if (channel.toLowerCase() === 'facebook') {
                const facebookReceiverId = userProfile.facebookPSId || "";
                if (facebookReceiverId) {
                    formData.append('FacebookReceiverId', facebookReceiverId);
                } else {
                    formData.append('channel', 'note');
                    formData.append('ConversationId', id);
                }
            } else if (channel.toLowerCase() === 'instagram') {
                // Instagram için de note channel kullan (API'de instagram channel'ı olmayabilir)
                formData.append('channel', 'note');
                formData.append('ConversationId', id);
            } else if (channel.toLowerCase() === 'line') {
                const lineReceiverId = userProfile.lineChatId || "";
                if (lineReceiverId) {
                    formData.append('LineReceiverId', lineReceiverId);
                } else {
                    formData.append('channel', 'note');
                    formData.append('ConversationId', id);
                }
            } else if (channel.toLowerCase() === 'wechat') {
                const weChatReceiverOpenId = userProfile.weChatOpenId || "";
                if (weChatReceiverOpenId) {
                    formData.append('WeChatReceiverOpenId', weChatReceiverOpenId);
                } else {
                    formData.append('channel', 'note');
                    formData.append('ConversationId', id);
                }
            } else if (channel.toLowerCase() === 'web') {
                const webClientReceiverId = userProfile.webClientUUID || "";
                if (webClientReceiverId) {
                    formData.append('WebClientReceiverId', webClientReceiverId);
                } else {
                    formData.append('channel', 'note');
                    formData.append('ConversationId', id);
                }
            } else {
                // Default: note channel
                formData.append('channel', 'note');
                formData.append('ConversationId', id);
            }
            
            // Mesaj içeriği (caption) varsa
            if (text) {
                formData.append('messageContent', text);
            }
            
            // Dosyaları ekle
            files.forEach(file => {
                formData.append('files', fs.createReadStream(file.path), {
                    filename: file.originalname || file.filename,
                    contentType: file.mimetype
                });
            });

            // API key'i header'a ekle
            const cleanApiKey = sleekflowApiKey
                .trim()
                .replace(/[\r\n\t]/g, '')
                .replace(/[\x00-\x1F\x7F-\x9F]/g, '');

            const base = sleekflowBaseUrl.replace(/\/+$/, "");
            const url = `${base}/api/message/send`;

            console.log(`   URL: ${url}`);
            console.log(`   Dosya sayısı: ${files.length}`);

            const response = await axios.post(url, formData, {
                headers: {
                    'X-Sleekflow-Api-Key': cleanApiKey,
                    ...formData.getHeaders()
                },
                timeout: 60000, // Dosya upload için daha uzun timeout
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            // Geçici dosyaları sil
            files.forEach(file => {
                fs.unlink(file.path, (err) => {   
                    if (err) console.error(`Dosya silinemedi: ${file.path}`, err);
                });
            });

            console.log(`✅ Dosya ile mesaj gönderildi`);
            res.json({ success: true, message: "Mesaj gönderildi", data: response.data });
        } else {
            // Sadece text mesaj - JSON endpoint kullan
            console.log(`   💬 Text mesaj gönderiliyor (JSON)`);
            
            let payload = {
                channel: channel.toLowerCase(),
                messageType: "text",
                messageContent: text
            };
            
            // Channel'a göre receiver ve sender bilgilerini ekle
            if (['whatsapp', 'whatsapp360dialog', 'whatsappcloudapi', 'sms'].includes(channel.toLowerCase())) {
                // WhatsApp/SMS için from ve to gerekli
                if (selectedSenderId) {
                    payload.from = selectedSenderId;
                }
                // Receiver phone number conversation'dan alınacak
                const receiverPhone = userProfile.whatsAppAccount?.phone_number || 
                                     userProfile.PhoneNumber || 
                                     "";
                if (receiverPhone) {
                    payload.to = receiverPhone.replace(/\+/g, ''); // + işaretini kaldır
                } else {
                    // Phone number yoksa note channel kullan
                    payload.channel = 'note';
                    payload.conversationId = id;
                }
            } else if (channel.toLowerCase() === 'facebook') {
                const facebookReceiverId = userProfile.facebookPSId || "";
                if (facebookReceiverId) {
                    payload.facebookReceiverId = facebookReceiverId;
                } else {
                    payload.channel = 'note';
                    payload.conversationId = id;
                }
            } else if (channel.toLowerCase() === 'instagram') {
                // Instagram için de note channel kullan
                payload.channel = 'note';
                payload.conversationId = id;
            } else if (channel.toLowerCase() === 'line') {
                const lineReceiverId = userProfile.lineChatId || "";
                if (lineReceiverId) {
                    payload.lineReceiverId = lineReceiverId;
                } else {
                    payload.channel = 'note';
                    payload.conversationId = id;
                }
            } else if (channel.toLowerCase() === 'wechat') {
                const weChatReceiverOpenId = userProfile.weChatOpenId || "";
                if (weChatReceiverOpenId) {
                    payload.weChatReceiverOpenId = weChatReceiverOpenId;
                } else {
                    payload.channel = 'note';
                    payload.conversationId = id;
                }
            } else if (channel.toLowerCase() === 'web') {
                const webClientReceiverId = userProfile.webClientUUID || "";
                if (webClientReceiverId) {
                    payload.webClientReceiverId = webClientReceiverId;
                } else {
                    payload.channel = 'note';
                    payload.conversationId = id;
                }
            } else {
                // Default: note channel
                payload.channel = 'note';
                payload.conversationId = id;
            }

            console.log(`   Payload:`, JSON.stringify(payload));

            const data = await callSleekflow("post", "/api/message/send/json", {
            data: payload,
        });

            console.log(`✅ Mesaj gönderildi:`, JSON.stringify(data).substring(0, 200));
        res.json({ success: true, message: "Mesaj gönderildi", data: data });
        }
    } catch (err) {
        // Geçici dosyaları temizle
        if (files && files.length > 0) {
            files.forEach(file => {
                fs.unlink(file.path, (err) => {
                    if (err) console.error(`Dosya silinemedi: ${file.path}`, err);
                });
            });
        }

        console.error("❌ Mesaj gönderme hatası:", err.message);
        console.error("   Status:", err.response?.status);
        console.error("   URL:", err.config?.url);
        if (err.response?.data) {
            console.error("   Response:", JSON.stringify(err.response.data).substring(0, 300));
        }
        
        const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message;
        res.status(err.response?.status || 500).json({ 
            error: "Mesaj gönderilemedi: " + errorMessage,
            details: err.response?.data
        });
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
                        if (window.opener) {
                            window.opener.postMessage({ type: 'zoho_callback_error', error: '${error}' }, '*');
                        }
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
                            if (window.opener) {
                                window.opener.postMessage({ type: 'zoho_callback_error', error: '${error.message}' }, '*');
                            }
                    </script>
                </body>
                </html>
            `);
        }
    } else {
        // Eğer code veya error parametresi yoksa
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Callback - SleekFlow Proxy</title>
                <meta charset="UTF-8">
                <style>
                    body {
                        font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background: #f5f7fa;
                    }
                    .container {
                        text-align: center;
                        background: white;
                        padding: 40px;
                        border-radius: 8px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    }
                    h1 { color: #6366f1; margin-bottom: 20px; }
                    p { color: #666; margin-bottom: 30px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>ℹ️ OAuth Callback</h1>
                    <p>Bu sayfa OAuth yetkilendirme işlemi için kullanılır.</p>
                    <p style="font-size: 14px; color: #999;">Eğer bir OAuth işlemi başlatmadıysanız, bu sayfaya doğrudan erişmemelisiniz.</p>
                </div>
            </body>
            </html>
        `);
    }
});

// ============================================
// POLLING ENDPOINT
// ============================================
app.post('/api/polling/start', (req, res) => {
    // Polling frontend'de yapılıyor, bu endpoint sadece onay için
    res.json({ success: true, message: 'Polling başlatıldı' });
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
