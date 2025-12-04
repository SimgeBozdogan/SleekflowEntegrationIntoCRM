// API Base URL - Widget içinde çalışıyorsa dinamik, değilse localhost
const API_BASE_URL = (typeof window !== 'undefined' && window.location.origin) 
    ? `${window.location.origin}/api` 
    : 'http://localhost:3000/api';

// State Management
const state = {
    sleekflow: {
        connected: false,
        apiKey: '',
        baseUrl: 'https://api.sleekflow.io'
    },
    zoho: {
        connected: false,
        clientId: '',
        clientSecret: '',
        redirectUri: 'http://localhost:3000/callback',
        region: 'com'
    },
    conversations: [],
    allConversations: [], // Tüm konuşmalar (filtreleme için)
    currentConversation: null,
    messages: {},
    selectedChannelFilter: '', // Kanal filtreleme için
    filterByZohoLead: false, // Zoho lead'e göre filtreleme aktif mi?
    showAllConversations: false, // Tüm konuşmaları göster
    pendingZohoFilter: false // Zoho data geldi ama konuşmalar henüz yüklenmedi
};

// DOM Elements
const elements = {
    // Sidebar
    sidebar: document.getElementById('sidebar'),
    toggleSidebar: document.getElementById('toggleSidebar'),
    openSidebar: document.getElementById('openSidebar'),
    sleekflowApiKey: document.getElementById('sleekflowApiKey'),
    sleekflowBaseUrl: document.getElementById('sleekflowBaseUrl'),
    connectSleekflow: document.getElementById('connectSleekflow'),
    zohoClientId: document.getElementById('zohoClientId'),
    zohoClientSecret: document.getElementById('zohoClientSecret'),
    zohoRedirectUri: document.getElementById('zohoRedirectUri'),
    zohoRegion: document.getElementById('zohoRegion'),
    connectZoho: document.getElementById('connectZoho'),
    
    // Chat
    conversationsList: document.getElementById('conversationsList'),
    searchConversations: document.getElementById('searchConversations'),
    refreshConversations: document.getElementById('refreshConversations'),
    chatView: document.getElementById('chatView'),
    chatEmpty: document.querySelector('.chat-empty'),
    chatActive: document.getElementById('chatActive'),
    messagesList: document.getElementById('messagesList'),
    messageInput: document.getElementById('messageInput'),
    sendMessage: document.getElementById('sendMessage'),
    fileInput: document.getElementById('fileInput'),
    attachFile: document.getElementById('attachFile'),
    selectedFilesContainer: document.getElementById('selectedFilesContainer'),
    chatContactName: document.getElementById('chatContactName'),
    chatMeta: document.getElementById('chatMeta'),
    chatAvatar: document.getElementById('chatAvatar'),
    channelFilter: document.getElementById('channelFilter'), // Kanal filtreleme dropdown'u
    
    // Loading
    loadingOverlay: document.getElementById('loadingOverlay')
};

// Utility Functions
function showLoading() {
    elements.loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    elements.loadingOverlay.style.display = 'none';
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    }[type] || 'ℹ️';
    
    toast.innerHTML = `<span>${icon} ${message}</span>`;
    
    const container = document.getElementById('toastContainer');
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// API Functions
async function apiRequest(endpoint, method = 'GET', data = null) {
    try {
        const fullUrl = `${API_BASE_URL}${endpoint}`;
        console.log(`🔍 API Request: ${method} ${fullUrl}`, data ? { body: data } : '');
        
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (data) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(fullUrl, options);
        console.log(`📡 Response Status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Error Response:`, errorText);
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { error: errorText || `HTTP ${response.status}` };
            }
            
            // If endpoint was found but auth failed, include that info
            if (errorData.endpointFound) {
                const error = new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
                error.endpointFound = true;
                error.details = errorData.details;
                throw error;
            }
            
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log(`✅ Success Response:`, result);
        return result;
    } catch (error) {
        console.error('❌ API Error:', error);
        throw error;
    }
}

// Sleekflow Functions
async function connectSleekflow() {
    let apiKey = elements.sleekflowApiKey.value.trim();
    const baseUrl = elements.sleekflowBaseUrl.value.trim() || 'https://api.sleekflow.io';
    
    // Clean API key - only remove whitespace and non-printable characters
    const originalApiKey = apiKey;
    
    // Remove leading/trailing whitespace
    apiKey = apiKey.trim();
    
    // Remove any invisible characters (non-printable)
    apiKey = apiKey.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    
    // Remove newlines and tabs but keep spaces if any (unlikely for API key)
    apiKey = apiKey.replace(/[\r\n\t]/g, '');
    
    // Basic validation - just check length
    if (!apiKey || apiKey.length < 10) {
        showToast('❌ API anahtarı çok kısa. En az 10 karakter olmalı.', 'error');
        return;
    }
    
    // Only check for obvious wrong content (HTML tags, URLs, etc)
    // Don't block valid API keys that might contain words like "http" in them
    const obviousWrongContent = ['<html', '<div', '<script', 'document.getElementById'];
    const hasObviousWrong = obviousWrongContent.some(pattern => 
        apiKey.toLowerCase().includes(pattern.toLowerCase())
    );
    
    if (hasObviousWrong) {
        showToast('❌ Yanlış içerik algılandı. Lütfen sadece API anahtarını girin.', 'error');
        elements.sleekflowApiKey.value = '';
        return;
    }
    
    // If cleaned version is different, update the field
    if (apiKey !== originalApiKey && apiKey.length > 0) {
        elements.sleekflowApiKey.value = apiKey;
    }
    
    // Debug: Log API key before sending
    console.log(`\n🔍 === Frontend: Sending API Key ===`);
    console.log(`   API Key type: ${typeof apiKey}`);
    console.log(`   API Key length: ${apiKey.length}`);
    console.log(`   API Key preview: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 5)}`);
    console.log(`   Base URL: ${baseUrl}`);
    
    showLoading();
    
    try {
        const requestData = {
            apiKey: apiKey,
            baseUrl: baseUrl
        };
        
        console.log(`   Request data keys:`, Object.keys(requestData));
        console.log(`   Request apiKey length: ${requestData.apiKey ? requestData.apiKey.length : 'NULL'}`);
        
        const result = await apiRequest('/sleekflow/connect', 'POST', requestData);
        
        state.sleekflow.connected = true;
        state.sleekflow.apiKey = apiKey;
        state.sleekflow.baseUrl = baseUrl;
        
        // Save to localStorage for auto-connect
        localStorage.setItem('sleekflowApiKey', apiKey);
        localStorage.setItem('sleekflowBaseUrl', baseUrl);
        
        updateSleekflowStatus(true);
        
        // Check if there's an error response
        if (result.error) {
            let errorMsg = '';
            
            if (result.endpointFound === false) {
                // Endpoint bulunamadı
                errorMsg = `❌ Endpoint bulunamadı!\n\n` +
                          `URL: ${result.url || 'N/A'}\n` +
                          `Hata: ${result.details || result.error}\n\n` +
                          `💡 ${result.suggestion || 'Base URL\'i kontrol edin'}`;
            } else if (result.status === 401 || result.status === 403) {
                // API anahtarı geçersiz
                errorMsg = `✅ Endpoint bulundu! ❌ Ancak API anahtarı geçersiz.\n\n` +
                          `📋 YAPILMASI GEREKEN:\n` +
                          `1. Sleekflow hesabınıza giriş yapın\n` +
                          `2. Channels > Add integrations > API bölümüne gidin\n` +
                          `3. YENİ bir API key oluşturun\n` +
                          `4. Yeni key'i kopyalayıp buraya yapıştırın\n\n` +
                          `⚠️ Not: Eski key geçersiz görünüyor. Yeni key oluşturmanız gerekiyor.`;
            } else if (result.status === 500) {
                // Sunucu hatası
                errorMsg = `❌ Sleekflow sunucu hatası!\n\n` +
                          `Status: ${result.status}\n` +
                          `URL: ${result.url || 'N/A'}\n` +
                          `Hata: ${result.details?.message || result.details || result.error}\n\n` +
                          `💡 ${result.suggestion || 'Lütfen daha sonra tekrar deneyin'}`;
            } else {
                // Diğer hatalar
                errorMsg = `❌ Bağlantı hatası!\n\n` +
                          `Hata: ${result.error}\n` +
                          (result.details ? `Detay: ${JSON.stringify(result.details).substring(0, 200)}\n` : '') +
                          (result.suggestion ? `\n💡 ${result.suggestion}` : '');
            }
            
            showToast(errorMsg, 'error');
            console.error('❌ SLEEKFLOW BAĞLANTI HATASI!');
            console.error('   Status:', result.status || 'N/A');
            console.error('   Endpoint found:', result.endpointFound || false);
            console.error('   URL:', result.url || 'N/A');
            console.error('   Error:', result.error);
            console.error('   Details:', result.details);
            
            // Mark as not connected - don't try to load conversations
            state.sleekflow.connected = false;
            updateSleekflowStatus(false);
            
            // Don't try to load conversations with invalid key
            return;
        } else {
            showToast('✅ Sleekflow bağlantısı başarılı!', 'success');
            state.sleekflow.connected = true;
            updateSleekflowStatus(true);
            
            // ✅ Zoho içindeyken de otomatik kapansın
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                sidebar.classList.remove('open');
                sidebar.style.left = '-320px';
                sidebar.style.opacity = '0';
                sidebar.style.visibility = 'hidden';
                document.body.style.overflow = '';
                localStorage.setItem('sidebarClosed', 'true');
                console.log('✅ Sidebar otomatik kapatıldı (SleekFlow bağlantısı başarılı)');
            }
            
            // Start polling
            await apiRequest('/polling/start', 'POST');
            startMessagePolling();
            
            // Load conversations after connection
            await loadConversations();
        }
    } catch (error) {
        // Check if endpoint was found but API key is invalid
        if (error.endpointFound) {
            showToast('✅ Endpoint bulundu! Ancak API anahtarı geçersiz. Lütfen Sleekflow hesabınızdan doğru API anahtarını alın.', 'warning');
            console.log('✅ Endpoint bulundu:', error.details?.triedUrl || 'https://api.sleekflow.io/api/contact');
            console.log('❌ API anahtarı geçersiz:', error.details);
        } else if (error.message.includes('endpointFound') || error.message.includes('Endpoint bulundu')) {
            showToast('✅ Endpoint bulundu! Ancak API anahtarı geçersiz. Lütfen doğru API anahtarını girin.', 'warning');
        } else {
            showToast(`Bağlantı hatası: ${error.message}`, 'error');
        }
        updateSleekflowStatus(false);
    } finally {
        hideLoading();
    }
}

function updateSleekflowStatus(connected) {
    // Status is now hidden, just update state
    state.sleekflow.connected = connected;
}

// Zoho Functions
async function connectZoho() {
    const clientId = elements.zohoClientId.value.trim();
    const clientSecret = elements.zohoClientSecret.value.trim();
    const redirectUri = elements.zohoRedirectUri.value.trim();
    const region = elements.zohoRegion.value;
    
    if (!clientId || !clientSecret) {
        showToast('❌ Lütfen Client ID ve Client Secret girin', 'error');
        return;
    }
    
    // Validate Client ID format (usually starts with 1000.)
    if (!clientId.startsWith('1000.')) {
        showToast('⚠️ Client ID formatı hatalı görünüyor. Zoho Client ID genellikle "1000." ile başlar.', 'warning');
    }
    
    showLoading();
    
    try {
        // Save credentials to localStorage
        localStorage.setItem('zohoClientId', clientId);
        localStorage.setItem('zohoClientSecret', clientSecret);
        localStorage.setItem('zohoRegion', region);
        
        const result = await apiRequest('/zoho/connect', 'POST', {
            clientId,
            clientSecret,
            redirectUri,
            region
        });
        
        if (result.authUrl) {
            // Store state
            state.zoho.clientId = clientId;
            state.zoho.clientSecret = clientSecret;
            state.zoho.region = region;
            
            showToast('✅ Zoho yetkilendirme penceresi açılıyor...', 'info');
            window.open(result.authUrl, '_blank', 'width=600,height=700');
            
            // OAuth callback is handled by existing message listener below
        }
    } catch (error) {
        showToast(`❌ Bağlantı hatası: ${error.message}`, 'error');
        console.error('Zoho connection error:', error);
    } finally {
        hideLoading();
    }
}

function updateZohoStatus(connected) {
    // Status is now hidden, just update state
    state.zoho.connected = connected;
}

async function testZoho() {
    showLoading();
    try {
        const result = await apiRequest('/zoho/test', 'GET');
        showToast('✅ Zoho bağlantısı başarılı!', 'success');
        updateZohoStatus(true);
        console.log('✅ Zoho test başarılı:', result);
    } catch (error) {
        const errorMsg = error.message || 'Bilinmeyen hata';
        
        // Check for specific error messages
        if (errorMsg.includes('OAuth bağlantısı yok') || errorMsg.includes('hasCredentials')) {
            showToast('ℹ️ Lütfen önce Zoho OAuth bağlantısı yapın (Bağlan butonuna tıklayın)', 'info');
        } else if (errorMsg.includes('Client ID')) {
            showToast('ℹ️ Lütfen Zoho Client ID ve Client Secret girin', 'info');
        } else {
            showToast(`❌ Zoho bağlantı hatası: ${errorMsg}`, 'error');
        }
        
        updateZohoStatus(false);
        console.error('❌ Zoho test hatası:', error);
    } finally {
        hideLoading();
    }
}

// Conversations Functions
async function loadConversations(silent = false) {
    // Bağlantı yoksa konuşmaları yükleme
    if (!state.sleekflow.connected) {
        console.log('⚠️ SleekFlow bağlantısı yok, konuşmalar yüklenmiyor');
        return;
    }
    
    if (!silent) {
        console.log('📥 Konuşmalar yükleniyor...');
        showLoading();
    }
    
    try {
        // Channel filtresi varsa query parametresi olarak ekle
        const url = state.selectedChannelFilter 
            ? `/sleekflow/conversations?channel=${encodeURIComponent(state.selectedChannelFilter)}`
            : '/sleekflow/conversations';
        
        const result = await apiRequest(url, 'GET');
        
        console.log('✅ Konuşmalar alındı:', result);
        
        if (result && result.conversations) {
            // Tüm konuşmaları sakla
            state.allConversations = result.conversations;
            
            // Zoho lead bilgisi varsa ve kullanıcı "Tüm konuşmaları göster" dememişse, OTOMATIK filtrele
            const hasZohoData = typeof window !== 'undefined' && window.zohoCustomerData;
            
            console.log('🔍 loadConversations - Zoho data kontrolü:', {
                hasZohoData,
                showAllConversations: state.showAllConversations,
                filterByZohoLead: state.filterByZohoLead,
                zohoData: hasZohoData ? {
                    name: window.zohoCustomerData.name,
                    phone: window.zohoCustomerData.phone?.substring(0, 10) + '...',
                    email: window.zohoCustomerData.email?.substring(0, 15) + '...'
                } : null
            });
            
            // Zoho data varsa VE kullanıcı "Tüm konuşmaları göster" dememişse, MUTLAKA filtrele
            if (hasZohoData) {
                if (!state.showAllConversations) {
                    // OTOMATIK FİLTRELEME - Kullanıcıya sormadan
                    state.filterByZohoLead = true;
                    state.conversations = filterConversationsByZohoLead(result.conversations);
                    console.log(`🔍 Zoho lead'e göre OTOMATIK filtrelendi: ${state.conversations.length}/${result.conversations.length} konuşma`);
                } else {
                    // Kullanıcı "Tüm konuşmaları göster" dedi, filtreleme yapma
                    state.filterByZohoLead = false;
                    state.conversations = result.conversations;
                    console.log('ℹ️ Kullanıcı "Tüm konuşmaları göster" dedi, filtreleme yapılmıyor');
                }
            } else {
                // Zoho data yoksa, tüm konuşmaları göster
                state.filterByZohoLead = false;
                state.conversations = result.conversations;
                console.log('ℹ️ Zoho data yok, tüm konuşmalar gösteriliyor');
            }
            
            // Pending filter varsa, şimdi filtrele
            if (state.pendingZohoFilter && hasZohoData && !state.showAllConversations) {
                state.pendingZohoFilter = false;
                state.filterByZohoLead = true;
                state.conversations = filterConversationsByZohoLead(result.conversations);
                console.log(`🔍 Pending filter uygulandı: ${state.conversations.length}/${result.conversations.length} konuşma`);
            }
            
            console.log(`✅ ${result.conversations.length} konuşma yüklendi`);
            renderConversations();
            
            // Chat view'ı güncelle - biraz gecikme ile (DOM güncellensin)
            setTimeout(() => {
                updateChatEmptyView();
            }, 200);
            
            // Zoho widget içinde çalışıyorsa, conversation'lar yüklendiğini bildir
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('conversationsLoaded'));
            }
        } else {
            console.warn('⚠️ Konuşmalar bulunamadı');
            renderConversations(); // Boş liste göster
            updateChatEmptyView(); // Chat view'ı güncelle
        }
    } catch (error) {
        const errorMsg = error.message || 'Bilinmeyen hata';
        
        // SleekFlow sunucu hatası (500) ise: sadece logla, popup gösterme
        if (errorMsg.includes('SleekFlow sunucu hatası')) {
            console.warn('⚠️ SleekFlow 500 (Internal Server Error) verdi, mevcut konuşma listesi korunuyor.');
            return; // kullanıcıya tost gösterme
        }
        
        // Diğer hatalarda eski davranış kalsın
        if (!silent) {
            console.error('❌ Konuşmalar yüklenemedi:', errorMsg);
            if (errorMsg.includes('401') || errorMsg.includes('bağlantısı yok')) {
                showToast('SleekFlow bağlantısı yok. Lütfen API anahtarınızı girin ve bağlanın.', 'error');
            } else {
                showToast(`Konuşmalar yüklenemedi: ${errorMsg}`, 'error');
            }
        }
    } finally {
        hideLoading();
    }
}

// Zoho lead bilgisine göre konuşmaları filtrele
function filterConversationsByZohoLead(conversations) {
    if (!window.zohoCustomerData) {
        console.log('⚠️ filterConversationsByZohoLead: Zoho customer data yok');
        return conversations;
    }
    
    const zohoData = window.zohoCustomerData;
    console.log('🔍 Filtreleme başlıyor:', {
        zohoPhone: zohoData.phone,
        zohoEmail: zohoData.email,
        totalConversations: conversations.length
    });
    
    const filtered = conversations.filter(conv => {
        // Telefon numarası eşleşmesi
        if (zohoData.phone && conv.phoneNumber) {
            const zohoPhone = zohoData.phone.replace(/\D/g, '');
            const convPhone = conv.phoneNumber.replace(/\D/g, '');
            if (zohoPhone && convPhone && (convPhone.includes(zohoPhone) || zohoPhone.includes(convPhone))) {
                console.log('✅ Telefon eşleşti:', zohoPhone, '==', convPhone, 'Contact:', conv.contactName);
                return true;
            }
        }
        
        // Email eşleşmesi
        if (zohoData.email && conv.email) {
            if (zohoData.email.toLowerCase() === conv.email.toLowerCase()) {
                console.log('✅ Email eşleşti:', zohoData.email, '==', conv.email, 'Contact:', conv.contactName);
                return true;
            }
        }
        
        return false;
    });
    
    console.log(`📊 Filtreleme sonucu: ${filtered.length}/${conversations.length} konuşma eşleşti`);
    return filtered;
}

// Chat view'ı güncelle (Zoho lead'e göre)
function updateChatEmptyView() {
    // Eğer bir konuşma seçiliyse, chatEmpty'i gösterme
    if (state.currentConversation) {
        return;
    }
    
    // Zoho lead data varsa ve filtrelenmiş konuşma yoksa, buton göster
    const hasZohoData = typeof window !== 'undefined' && window.zohoCustomerData;
    const conversationsLength = state.conversations ? state.conversations.length : 0;
    const allConversationsLength = state.allConversations ? state.allConversations.length : 0;
    const hasFilteredConversations = state.filterByZohoLead && conversationsLength > 0;
    const hasAllConversations = allConversationsLength > 0;
    
    // Koşul: Zoho data var, filtre aktif, filtrelenmiş konuşma yok ama tüm konuşmalar var
    const shouldShowButton = hasZohoData && 
                             state.filterByZohoLead && 
                             conversationsLength === 0 && 
                             hasAllConversations && 
                             !state.showAllConversations;
    
    console.log('🔍 updateChatEmptyView - Kontroller:', {
        hasZohoData,
        filterByZohoLead: state.filterByZohoLead,
        conversationsLength,
        allConversationsLength,
        hasFilteredConversations,
        hasAllConversations,
        showAllConversations: state.showAllConversations,
        shouldShowButton,
        zohoData: hasZohoData ? {
            name: window.zohoCustomerData.name,
            phone: window.zohoCustomerData.phone?.substring(0, 10) + '...',
            email: window.zohoCustomerData.email?.substring(0, 15) + '...'
        } : null
    });
    
    if (shouldShowButton) {
        // Zoho lead var ama bu lead ile konuşma yok - mesaj ekranında buton göster
        console.log('✅ Zoho lead ile konuşma yok - Mesaj ekranında "Tüm Konuşmaları Gör" butonu gösteriliyor');
        elements.chatEmpty.style.display = 'flex';
        elements.chatActive.style.display = 'none';
        
        const chatEmptyHTML = '<div class="empty-icon">💬</div>' +
            '<h2>Bu lead ile konuşma bulunamadı</h2>' +
            '<p>Bu lead ile henüz bir konuşma yapılmamış</p>' +
            '<button class="btn btn-primary" id="showAllConversationsFromChat" style="margin-top: 20px; padding: 12px 24px; font-size: 16px; cursor: pointer;">' +
            'Tüm Konuşmaları Gör' +
            '</button>';
        
        elements.chatEmpty.innerHTML = chatEmptyHTML;
        
        // Buton event listener'ı ekle - daha güvenli yöntem
        setTimeout(() => {
            const showAllBtn = document.getElementById('showAllConversationsFromChat');
            if (showAllBtn) {
                console.log('✅ Buton bulundu, event listener ekleniyor...');
                // onClick attribute kullanarak daha güvenli hale getir
                showAllBtn.onclick = function() {
                    console.log('🔘 "Tüm Konuşmaları Gör" butonuna tıklandı!');
                    state.showAllConversations = true;
                    state.filterByZohoLead = false;
                    if (state.allConversations && state.allConversations.length > 0) {
                        state.conversations = [...state.allConversations]; // Copy array
                    }
                    renderConversations();
                    updateChatEmptyView(); // Chat view'ı güncelle
                    console.log('✅ Tüm konuşmalar gösteriliyor - Filtre kalıcı olarak kapatıldı');
                    
                    // Polling'i durdur ve yeniden başlat (filtreleme olmadan)
                    if (messagePollInterval) {
                        clearInterval(messagePollInterval);
                    }
                    startMessagePolling();
                };
            } else {
                console.error('❌ Buton bulunamadı!');
            }
        }, 100);
    } else {
        // Normal durum - standart mesaj göster
        elements.chatEmpty.style.display = 'flex';
        elements.chatActive.style.display = 'none';
        elements.chatEmpty.innerHTML = '<div class="empty-icon">💬</div>' +
            '<h2>Bir konuşma seçin</h2>' +
            '<p>Sol taraftan bir konuşma seçerek mesajları görüntüleyin</p>';
    }
}

function renderConversations() {
    const list = elements.conversationsList;
    list.innerHTML = '';
    
    // Debug: Durumu logla
    console.log('🔍 renderConversations - Durum:', {
        filterByZohoLead: state.filterByZohoLead,
        conversationsCount: state.conversations?.length || 0,
        allConversationsCount: state.allConversations?.length || 0,
        showAllConversations: state.showAllConversations,
        hasZohoData: !!window.zohoCustomerData
    });
    
    // Zoho lead filtresi aktifse ve konuşma yoksa, "Tüm konuşmaları göster" butonu göster
    if (state.filterByZohoLead && state.conversations && state.conversations.length === 0 && state.allConversations && state.allConversations.length > 0) {
        console.log('✅ Bu lead ile konuşma yok - "Tüm konuşmaları göster" butonu gösteriliyor');
        list.innerHTML = `
            <div class="empty-state">
                <p>📭 Bu lead ile konuşma bulunamadı</p>
                <p class="empty-hint">Bu lead ile henüz bir konuşma yapılmamış</p>
                <button class="btn btn-primary" id="showAllConversations" style="margin-top: 15px; padding: 10px 20px;">
                    Tüm konuşmaları göster
                </button>
            </div>
        `;
        
                // "Tüm konuşmaları göster" butonuna event listener ekle
                setTimeout(() => {
                    const showAllBtn = document.getElementById('showAllConversations');
                    if (showAllBtn) {
                        console.log('✅ Konuşma listesindeki buton bulundu, event listener ekleniyor...');
                        // onClick kullanarak daha güvenli
                        showAllBtn.onclick = function() {
                            console.log('🔘 Konuşma listesindeki "Tüm konuşmaları göster" butonuna tıklandı!');
                            state.showAllConversations = true;
                            state.filterByZohoLead = false;
                            if (state.allConversations && state.allConversations.length > 0) {
                                state.conversations = [...state.allConversations]; // Copy array
                            }
                            renderConversations();
                            updateChatEmptyView(); // Chat view'ı güncelle
                            console.log('✅ Tüm konuşmalar gösteriliyor - Filtre kalıcı olarak kapatıldı');
                            
                            // Polling'i durdur ve yeniden başlat (filtreleme olmadan)
                            if (messagePollInterval) {
                                clearInterval(messagePollInterval);
                            }
                            // Polling'i tekrar başlat ama filtreleme olmadan devam etsin
                            startMessagePolling();
                        };
                    } else {
                        console.error('❌ Konuşma listesindeki buton bulunamadı!');
                    }
                }, 100);
                
                // Chat view'ı güncelle
                updateChatEmptyView();
                return;
    }
    
    if (state.conversations.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <p>📭 Henüz konuşma yok</p>
                <p class="empty-hint">Sleekflow'dan konuşmalar yükleniyor...</p>
            </div>
        `;
        // Chat view'ı güncelle
        updateChatEmptyView();
        return;
    }
    
    state.conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = 'conversation-item';
        if (state.currentConversation && state.currentConversation.id === conv.id) {
            item.classList.add('active');
        }
        
        // Kanal ikonunu belirle
        const channel = conv.channel || conv.rawChannel || '';
        const channelIcon = getChannelIcon(channel);
        
        // Debug: İlk birkaç conversation için log
        if (state.conversations.indexOf(conv) < 3) {
            console.log('🔍 Conversation channel:', {
                contactName: conv.contactName,
                channel: conv.channel,
                rawChannel: conv.rawChannel,
                detectedChannel: channel,
                icon: channelIcon
            });
        }
        
        item.innerHTML = `
            <div class="conversation-avatar">
                ${getInitials(conv.contactName || 'U')}
                ${channelIcon ? `<span class="channel-icon">${channelIcon}</span>` : ''}
            </div>
            <div class="conversation-info">
                <div class="conversation-name">${conv.contactName || 'Bilinmeyen'}</div>
                <div class="conversation-preview">${conv.lastMessage || ''}</div>
            </div>
            <div class="conversation-time">${formatTime(conv.lastMessageTime)}</div>
        `;
        
        item.addEventListener('click', () => selectConversation(conv));
        list.appendChild(item);
    });
    
    // Chat view'ı güncelle
    updateChatEmptyView();
}

function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function getChannelIcon(channel) {
    if (!channel) return '';
    
    const channelLower = channel.toLowerCase();
    
    if (channelLower.includes('whatsapp') || channelLower === 'whatsapp') {
        // WhatsApp SVG ikonu - Renkli ve opak
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="24" rx="5" fill="#25D366"/>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" fill="white"/>
        </svg>`;
    } else if (channelLower.includes('instagram') || channelLower === 'instagram') {
        // Instagram SVG ikonu - Renkli gradient
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="24" rx="5" fill="url(#instagram-gradient)"/>
            <defs>
                <linearGradient id="instagram-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#833AB4;stop-opacity:1" />
                    <stop offset="50%" style="stop-color:#E1306C;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#FCAF45;stop-opacity:1" />
                </linearGradient>
            </defs>
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" fill="white"/>
        </svg>`;
    } else if (channelLower.includes('facebook') || channelLower === 'facebook') {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="24" rx="5" fill="#1877F2"/>
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="white"/>
        </svg>`;
    } else if (channelLower.includes('sms') || channelLower === 'sms') {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="24" rx="5" fill="#4CAF50"/>
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" fill="white"/>
        </svg>`;
    } else if (channelLower.includes('line') || channelLower === 'line') {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="24" rx="5" fill="#00C300"/>
            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.27l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.058.9l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" fill="white"/>
        </svg>`;
    } else if (channelLower.includes('wechat') || channelLower === 'wechat') {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="24" rx="5" fill="#09BB07"/>
            <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.597-6.348zM6.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 5.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.766 2.118c1.62 0 2.943 1.34 2.943 2.982 0 1.642-1.323 2.983-2.943 2.983a.59.59 0 0 1-.59-.59c0-.326.264-.59.59-.59 1.004 0 1.822-.83 1.822-1.803 0-.973-.818-1.802-1.822-1.802-.98 0-1.78.774-1.818 1.735a.59.59 0 0 1-1.177-.122c.064-1.52 1.328-2.733 2.995-2.733zm-1.71 2.733c.325 0 .59.264.59.59a.59.59 0 0 1-.59.59.59.59 0 0 1-.59-.59c0-.326.265-.59.59-.59zm-4.096.59c0 .326-.264.59-.59.59a.59.59 0 0 1-.59-.59.59.59 0 0 1 .59-.59c.326 0 .59.264.59.59zm8.637-2.733c1.62 0 2.943 1.34 2.943 2.982 0 1.642-1.323 2.983-2.943 2.983a.59.59 0 0 1-.59-.59c0-.326.264-.59.59-.59 1.004 0 1.822-.83 1.822-1.803 0-.973-.818-1.802-1.822-1.802-.98 0-1.78.774-1.818 1.735a.59.59 0 0 1-1.177-.122c.064-1.52 1.328-2.733 2.995-2.733zm-1.71 2.733c.325 0 .59.264.59.59a.59.59 0 0 1-.59.59.59.59 0 0 1-.59-.59c0-.326.265-.59.59-.59z" fill="white"/>
        </svg>`;
    } else if (channelLower.includes('web') || channelLower === 'web') {
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="24" rx="5" fill="#2196F3"/>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="white"/>
        </svg>`;
    }
    
    return '';
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Şimdi';
    if (minutes < 60) return `${minutes}dk`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}s`;
    return date.toLocaleDateString('tr-TR');
}

// Messages Functions
async function selectConversation(conversation) {
    state.currentConversation = conversation;
    renderConversations();
    
    elements.chatEmpty.style.display = 'none';
    elements.chatActive.style.display = 'flex';
    
    // Zoho müşteri bilgisi varsa ve eşleşiyorsa göster
    let displayName = conversation.contactName || 'Bilinmeyen';
    if (typeof window !== 'undefined' && window.zohoCustomerData) {
        const zohoData = window.zohoCustomerData;
        // Telefon numarası veya email ile eşleştir
        const phoneMatch = zohoData.phone && conversation.phoneNumber && 
                          conversation.phoneNumber.replace(/\D/g, '').includes(zohoData.phone.replace(/\D/g, ''));
        const emailMatch = zohoData.email && conversation.email && 
                          conversation.email.toLowerCase() === zohoData.email.toLowerCase();
        
        if (phoneMatch || emailMatch) {
            // Zoho'dan gelen ismi göster
            displayName = zohoData.name || displayName;
            console.log('✅ Zoho müşteri bilgisi eşleşti:', zohoData);
        }
    }
    
    elements.chatContactName.textContent = displayName;
    elements.chatMeta.textContent = conversation.channel || 'Sleekflow';
    elements.chatAvatar.textContent = getInitials(displayName || 'U');
    
    elements.messageInput.disabled = false;
    elements.sendMessage.disabled = false;
    
    await loadMessages(conversation.id);
}

async function loadMessages(conversationId, silent = false) {
    // Bağlantı yoksa mesajları yükleme
    if (!state.sleekflow.connected) {
        if (!silent) {
            console.log('⚠️ SleekFlow bağlantısı yok, mesajlar yüklenmiyor');
        }
        return;
    }
    
    if (!silent) {
        showLoading();
    }
    
    try {
        const result = await apiRequest(`/sleekflow/conversations/${conversationId}/messages`, 'GET');
        
        console.log('📥 Mesaj response:', result);
        
        if (result && result.messages) {
            state.messages[conversationId] = result.messages;
            renderMessages(result.messages);
        } else if (result && Array.isArray(result)) {
            // Eğer direkt array döndüyse
            state.messages[conversationId] = result;
            renderMessages(result);
        } else {
            console.warn('⚠️ Mesajlar boş veya beklenmeyen format:', result);
            renderMessages([]);
        }
    } catch (error) {
        console.error('❌ Mesaj yükleme hatası:', error);
        if (!silent) {
            showToast(`Mesajlar yüklenemedi: ${error.message}`, 'error');
        }
    } finally {
        if (!silent) {
            hideLoading();
        }
    }
}

function renderMessages(messages) {
    const list = elements.messagesList;
    if (!list) {
        console.error('❌ messagesList elementi bulunamadı');
        return;
    }

    console.log('📝 renderMessages çağrıldı, mesaj sayısı:', messages?.length || 0);

    list.innerHTML = '';

    if (!messages || messages.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Henüz mesaj yok</p></div>';
        return;
    }

    messages.forEach((msg, index) => {
        try {
            const messageEl = document.createElement('div');
            messageEl.className = `message ${msg.direction || 'received'}`;
            messageEl.dataset.messageId = msg.id || `msg_${index}`;

            const messageTime = formatTime(
                msg.timestamp || msg.createdAt || msg.created_at || new Date()
            );

            const fileUrl = msg.fileUrl || null;
            const fileName = msg.fileName || '';
            const isStory = !!msg.isStory;
            const messageText = (msg.text || '').trim();
            
            // DEBUG: Backend'den gelen veriyi logla
            if (index < 5) { // İlk 5 mesajı logla
                console.log(`🔍 FRONTEND MSG[${index}]:`, {
                    id: msg.id,
                    text: msg.text?.substring(0, 100),
                    content: msg.content?.substring(0, 100),
                    fileUrl: msg.fileUrl?.substring(0, 100),
                    fileName: msg.fileName,
                    hasText: !!messageText,
                    hasFile: !!fileUrl
                });
            }

            // Hem text hem file tamamen boşsa hiç gösterme
            if (!fileUrl && !messageText) {
                console.warn(`⚠️ Boş mesaj (index ${index}) atlanıyor`);
                return;
            }

            let contentHtml = '';

            if (fileUrl) {
                const isVideo =
                    msg.type === 'video' ||
                    /\.(mp4|avi|mov|wmv|webm)$/i.test(fileUrl);
                const isImage =
                    msg.type === 'image' ||
                    /\.(jpg|jpeg|png|gif|webp|jfif)$/i.test(fileUrl);
                const isAudio = /\.(mp3|wav|ogg|m4a)$/i.test(fileUrl);
                
                // Conversation/... gibi path'leri kullanıcıya göstermeyelim
                const safeFileLabel =
                    fileName && !fileName.includes('Conversation/')
                        ? fileName
                        : (isVideo ? 'Video' : 'Dosya İndir');

                if (isStory) {
                    // Instagram story kartı
                    contentHtml += `
                        <div style="border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; margin-bottom: 8px; background: #fff;">
                            <div style="padding: 12px; background: #f8f9fa; border-bottom: 1px solid #e0e0e0;">
                                <div style="font-weight: 600; color: #333; margin-bottom: 4px;">Replied to your story</div>
                            </div>
                    `;

                    if (isVideo) {
                        contentHtml += `
                            <video controls style="width: 100%; max-height: 500px; display: block;">
                                <source src="${escapeHtml(fileUrl)}" type="video/mp4">
                                Tarayıcınız video oynatmayı desteklemiyor.
                            </video>
                        `;
                    } else if (isImage) {
                        contentHtml += `
                            <img src="${escapeHtml(fileUrl)}" alt="Instagram Story" style="width: 100%; max-height: 500px; display: block; object-fit: contain;">
                        `;
                    }

                    contentHtml += `
                            <div style="padding: 8px 12px;">
                                <a href="${escapeHtml(fileUrl)}" target="_blank" style="color: #0066cc; text-decoration: none; font-size: 0.9em;">View story</a>
                            </div>
                        </div>
                    `;
                } else if (isVideo) {
                    contentHtml += `
                        <video controls style="max-width: 100%; max-height: 400px; border-radius: 8px; margin-bottom: 8px; background: #000;">
                            <source src="${escapeHtml(fileUrl)}" type="video/mp4">
                            Tarayıcınız video oynatmayı desteklemiyor.
                        </video>
                    `;
                } else if (isImage) {
                    contentHtml += `
                        <img src="${escapeHtml(fileUrl)}" alt="${escapeHtml(fileName || 'Resim')}" style="max-width: 100%; max-height: 400px; border-radius: 8px; margin-bottom: 8px; cursor: pointer; object-fit: contain;" onclick="window.open('${escapeHtml(fileUrl)}', '_blank')">
                    `;
                } else if (isAudio) {
                    contentHtml += `
                        <audio controls style="width: 100%; margin-bottom: 8px;">
                            <source src="${escapeHtml(fileUrl)}" type="audio/mpeg">
                            Tarayıcınız ses oynatmayı desteklemiyor.
                        </audio>
                    `;
                } else {
                    // DİĞER DOSYALAR İÇİN İNDİRME LİNKİ
                    // Conversation/... gibi path'leri kullanıcıya göstermeyelim
                    contentHtml += `
                        <a href="${escapeHtml(fileUrl)}" target="_blank" download="${escapeHtml(fileName || 'dosya')}" style="display: inline-block; padding: 10px 16px; background: #f0f0f0; border-radius: 8px; text-decoration: none; color: #333; margin-bottom: 8px; font-weight: 500;">
                            📎 ${escapeHtml(safeFileLabel)}
                        </a>
                    `;
                }
            }

            if (messageText) {
                // Eğer dosya da varsa altına küçük caption gibi koy
                const style = fileUrl
                    ? 'margin-top: 8px; font-size: 0.9em; color: #666;'
                    : 'white-space: pre-wrap; word-wrap: break-word;';
                contentHtml += `<div style="${style}">${escapeHtml(messageText)}</div>`;
            }

            messageEl.innerHTML = `
                <div class="message-bubble">${contentHtml}</div>
                <div class="message-time">${messageTime}</div>
            `;

            list.appendChild(messageEl);
        } catch (err) {
            console.error(`❌ Mesaj render hatası (index ${index}):`, err);
        }
    });
    
    console.log(`✅ ${list.children.length} mesaj render edildi`);
    
    // Scroll to bottom (en yeni mesajlar altta olduğu için)
    setTimeout(() => {
        const messagesArea = document.getElementById('messagesArea');
        if (messagesArea) {
            messagesArea.scrollTop = messagesArea.scrollHeight;
        } else {
            list.scrollTop = list.scrollHeight;
        }
    }, 100);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// File handling functions
let selectedFiles = [];

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    selectedFiles = [...selectedFiles, ...files];
    updateSelectedFiles();
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    updateSelectedFiles();
    // File input'u sıfırla
    if (elements.fileInput) {
        elements.fileInput.value = '';
    }
}

function updateSelectedFiles() {
    const container = elements.selectedFilesContainer;
    if (!container) return;
    
    if (selectedFiles.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    
    container.style.display = 'block';
    container.innerHTML = selectedFiles.map((file, index) => `
        <div class="selected-file-item" style="display: flex; align-items: center; gap: 8px; padding: 8px; background: #f3f4f6; border-radius: 6px; margin-top: 8px;">
            <span style="font-size: 0.875rem;">📎 ${file.name}</span>
            <button onclick="removeFile(${index})" style="background: #ef4444; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.75rem;">✕</button>
        </div>
    `).join('');
}

// Make removeFile globally accessible
window.removeFile = removeFile;

async function sendMessage() {
    if (!state.currentConversation) {
        showToast('Lütfen bir konuşma seçin', 'warning');
        return;
    }
    
    const text = elements.messageInput.value.trim();
    const hasFiles = selectedFiles.length > 0;
    
    if (!text && !hasFiles) {
        showToast('Lütfen mesaj yazın veya dosya seçin', 'warning');
        return;
    }
    
    showLoading();
    
    try {
        let result;
        
        if (hasFiles) {
            // Dosya gönderme - FormData kullan
            const formData = new FormData();
            formData.append('text', text || '');
            selectedFiles.forEach((file, index) => {
                formData.append('files', file);
            });
            
            result = await fetch(`${API_BASE_URL}/sleekflow/conversations/${state.currentConversation.id}/messages`, {
                method: 'POST',
                body: formData
            });
            
            if (!result.ok) {
                const errorData = await result.json().catch(() => ({ error: 'Dosya gönderilemedi' }));
                throw new Error(errorData.error || 'Dosya gönderilemedi');
            }
            
            result = await result.json();
        } else {
            // Sadece metin gönderme
            result = await apiRequest(`/sleekflow/conversations/${state.currentConversation.id}/messages`, 'POST', {
                text
            });
        }
        
        // Temizle
        elements.messageInput.value = '';
        selectedFiles = [];
        updateSelectedFiles();
        
        // Reload messages
        await loadMessages(state.currentConversation.id);
        await loadConversations(); // Refresh conversation list
        
        showToast(hasFiles ? 'Dosya ve mesaj gönderildi' : 'Mesaj gönderildi', 'success');
    } catch (error) {
        showToast(`Mesaj gönderilemedi: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

// Sidebar Functions - HTML'deki inline script'te tanımlı
// Burada sadece window referanslarını koruyoruz (backup)
if (typeof window.toggleSidebar === 'undefined') {
    window.toggleSidebar = function() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;
        const isOpen = sidebar.classList.contains('open');
        if (isOpen) {
            sidebar.classList.remove('open');
            document.body.style.overflow = '';
        } else {
            sidebar.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
    };
}

// Event Listeners
// Auto-connect on page load
async function autoConnect() {
    try {
        // Load saved credentials from localStorage
        const savedApiKey = localStorage.getItem('sleekflowApiKey');
        const savedBaseUrl = localStorage.getItem('sleekflowBaseUrl') || 'https://api.sleekflow.io';
        const savedZohoClientId = localStorage.getItem('zohoClientId');
        const savedZohoClientSecret = localStorage.getItem('zohoClientSecret');
        const savedZohoRegion = localStorage.getItem('zohoRegion') || 'com';
        
        if (savedApiKey) {
            // Auto-connect Sleekflow
            const result = await apiRequest('/auto-connect', 'POST', {
                sleekflowApiKey: savedApiKey,
                sleekflowBaseUrl: savedBaseUrl,
                zohoClientId: savedZohoClientId,
                zohoClientSecret: savedZohoClientSecret,
                zohoRegion: savedZohoRegion
            });
            
            if (result.sleekflow?.connected) {
                state.sleekflow.connected = true;
                state.sleekflow.apiKey = savedApiKey;
                state.sleekflow.baseUrl = savedBaseUrl;
                
                // Start polling
                await apiRequest('/polling/start', 'POST');
                
                // Only load conversations if successfully connected
                if (state.sleekflow.connected) {
                    await loadConversations();
                    console.log('✅ Otomatik bağlantı başarılı - konuşmalar yüklendi');
                }
            } else {
                // API key might be invalid - don't mark as connected
                state.sleekflow.connected = false;
                console.log('⚠️ Otomatik bağlantı başarısız - API anahtarı geçersiz olabilir');
            }
            
            if (result.zoho?.connected) {
                state.zoho.connected = true;
            }
        }
    } catch (error) {
        console.error('Auto-connect error:', error);
        // Don't mark as connected on error
        state.sleekflow.connected = false;
    }
}

// Poll for new messages
let messagePollInterval = null;

function startMessagePolling() {
    if (messagePollInterval) {
        clearInterval(messagePollInterval);
    }
    
    messagePollInterval = setInterval(async () => {
        if (!state.sleekflow.connected) {
            return;
        }
        
        try {
            // Refresh conversations to get new messages (sessiz mod)
            await loadConversations(true);
            
            // If there's an active conversation, refresh its messages (sessiz mod)
            if (state.currentConversation) {
                await loadMessages(state.currentConversation.id, true);
            }
        } catch (error) {
            console.error('Message polling error:', error);
        }
    }, 10000); // Every 10 seconds
}

document.addEventListener('DOMContentLoaded', () => {
    // Sidebar event listener'ları HTML'deki inline script'te tanımlı
    // Burada sadece backup olarak kontrol ediyoruz
    
    // Sleekflow
    elements.connectSleekflow?.addEventListener('click', connectSleekflow);
    
    // Zoho
    elements.connectZoho?.addEventListener('click', connectZoho);
    const testZohoBtn = document.getElementById('testZoho');
    if (testZohoBtn) {
        testZohoBtn.addEventListener('click', testZoho);
    }
    
    // Chat
    elements.refreshConversations?.addEventListener('click', loadConversations);
    elements.sendMessage?.addEventListener('click', sendMessage);
    elements.messageInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Channel Filter
    elements.channelFilter?.addEventListener('change', (e) => {
        state.selectedChannelFilter = e.target.value;
        loadConversations();
    });
    
    // File Upload
    elements.attachFile?.addEventListener('click', () => {
        elements.fileInput?.click();
    });
    
    elements.fileInput?.addEventListener('change', handleFileSelect);
    
    // Search (case-insensitive - Türkçe karakter desteği ile)
    elements.searchConversations?.addEventListener('input', (e) => {
        // Türkçe karakterleri normalize et ve küçük harfe çevir
        const normalizeText = (text) => {
            return text
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '') // Diyakritik işaretleri kaldır
                .replace(/ı/g, 'i')
                .replace(/ğ/g, 'g')
                .replace(/ü/g, 'u')
                .replace(/ş/g, 's')
                .replace(/ö/g, 'o')
                .replace(/ç/g, 'c');
        };
        
        const search = normalizeText(e.target.value.trim());
        const items = elements.conversationsList.querySelectorAll('.conversation-item');
        items.forEach(item => {
            const nameEl = item.querySelector('.conversation-name');
            const previewEl = item.querySelector('.conversation-preview');
            
            if (!nameEl) return;
            
            const name = normalizeText(nameEl.textContent.trim());
            const preview = previewEl ? normalizeText(previewEl.textContent.trim()) : '';
            
            // İsim veya mesaj önizlemesinde ara (case-insensitive)
            const matches = search === '' || name.includes(search) || preview.includes(search);
            item.style.display = matches ? 'flex' : 'none';
        });
    });
    
        // Load saved state
        loadSavedState();
        
        // Otomatik olarak konuşmaları yükle (bağlantı varsa)
        console.log('🚀 Sayfa yüklendi, konuşmalar yükleniyor...');
        setTimeout(() => {
            loadConversations().catch(err => {
                console.error('❌ Konuşmalar yüklenirken hata:', err);
            });
        }, 500);
        
        // Auto-connect
        autoConnect().then(() => {
            // Start message polling after connection
            if (state.sleekflow.connected) {
                startMessagePolling();
            }
        });
        
        // Check connection status periodically
        setInterval(checkConnectionStatus, 30000); // Every 30 seconds
});

async function checkConnectionStatus() {
    try {
        const result = await apiRequest('/status', 'GET');
        
        // Only load conversations if actually connected AND has valid API key
        // Don't auto-load if API key is invalid
        if (result.sleekflow?.connected && result.sleekflow?.hasApiKey && state.sleekflow.connected) {
            // Only refresh if already connected - don't auto-connect with invalid key
            if (state.sleekflow.connected) {
                // Already connected, just refresh
                // Don't auto-load - user should manually connect
            }
        } else {
            // Not connected - don't try to load conversations
            state.sleekflow.connected = false;
        }
        
        if (result.zoho?.connected && result.zoho?.hasAccessToken) {
            state.zoho.connected = true;
        } else {
            state.zoho.connected = false;
        }
    } catch (error) {
        console.error('Status check failed:', error);
        // Don't try to load conversations on error
        state.sleekflow.connected = false;
    }
}

function loadSavedState() {
    const saved = localStorage.getItem('sleekflowState');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.sleekflowApiKey) {
                elements.sleekflowApiKey.value = parsed.sleekflowApiKey;
            }
            if (parsed.zohoClientId) {
                elements.zohoClientId.value = parsed.zohoClientId;
            }
        } catch (e) {
            console.error('Failed to load saved state:', e);
        }
    }
}

// Handle Zoho callback
function handleZohoCallback(event) {
    // Only process messages from same origin or Zoho callback
    if (event.data.type === 'zoho_callback_success') {
        state.zoho.connected = true;
        updateZohoStatus(true);
        showToast('✅ Zoho bağlantısı başarılı!', 'success');
        console.log('✅ Zoho OAuth callback başarılı');
    } else if (event.data.type === 'zoho_callback_error') {
        state.zoho.connected = false;
        updateZohoStatus(false);
        showToast(`❌ Zoho bağlantı hatası: ${event.data.error || 'Bilinmeyen hata'}`, 'error');
        console.error('❌ Zoho OAuth callback hatası:', event.data.error);
    }
}

// Listen for Zoho OAuth callback messages
window.addEventListener('message', handleZohoCallback);

// Listen for Zoho lead data loaded event (from widget)
// ÖNEMLİ: Bu listener'ı sayfa yüklenmeden önce ekle
(function() {
    function handleZohoLeadDataLoaded(event) {
        console.log('📋 Zoho lead bilgisi yüklendi, konuşmalar filtreleniyor...', event.detail);
        console.log('📋 window.zohoCustomerData:', window.zohoCustomerData);
        
        // State kontrolü
        if (!state) {
            console.warn('⚠️ State henüz hazır değil, 500ms sonra tekrar deneniyor...');
            setTimeout(() => handleZohoLeadDataLoaded(event), 500);
            return;
        }
        
        // YENİ LEAD'E GİRİLDİĞİNDE: showAllConversations flag'ini sıfırla
        // Çünkü yeni bir lead'e girildiğinde o lead'e göre filtreleme yapılmalı
        console.log('🔄 Yeni Zoho lead\'e girildi, showAllConversations sıfırlanıyor...');
        state.showAllConversations = false;
        state.filterByZohoLead = true;
        
        // window.zohoCustomerData'yı kontrol et
        if (!window.zohoCustomerData && event.detail) {
            window.zohoCustomerData = event.detail;
            console.log('✅ window.zohoCustomerData event.detail\'den set edildi');
        }
        
        // Eğer konuşmalar zaten yüklendiyse, yeniden filtrele
        if (state.allConversations && state.allConversations.length > 0) {
            console.log('🔄 Mevcut konuşmalar filtreleniyor...');
            state.showAllConversations = false;
            state.filterByZohoLead = true;
            state.conversations = filterConversationsByZohoLead(state.allConversations);
            renderConversations();
            
            // Chat view'ı güncelle - biraz gecikme ile (DOM güncellensin)
            setTimeout(() => {
                updateChatEmptyView();
            }, 200);
            
            console.log(`✅ Konuşmalar Zoho lead'e göre filtrelendi: ${state.conversations.length}/${state.allConversations.length} konuşma`);
        } else {
            // Konuşmalar henüz yüklenmediyse, YENİDEN YÜKLE
            console.log('⏳ Konuşmalar henüz yüklenmedi, yeniden yükleniyor...');
            state.pendingZohoFilter = true;
            // Konuşmaları yeniden yükle (filtreleme otomatik yapılacak)
            if (typeof loadConversations === 'function') {
                loadConversations();
            }
        }
    }
    
    // Event listener'ı ekle (hem window hem document için)
    if (typeof window !== 'undefined') {
        window.addEventListener('zohoLeadDataLoaded', handleZohoLeadDataLoaded);
        // Ayrıca document'e de ekle (bazı durumlarda gerekli)
        document.addEventListener('zohoLeadDataLoaded', handleZohoLeadDataLoaded);
        console.log('✅ Zoho lead data event listener eklendi');
        
        // Eğer Zoho data zaten varsa (sayfa yeniden yüklendiğinde), hemen filtrele
        setTimeout(() => {
            if (window.zohoCustomerData && state && state.allConversations && state.allConversations.length > 0) {
                console.log('🔄 Sayfa yüklendi, mevcut Zoho data ile filtreleme yapılıyor...');
                state.showAllConversations = false;
                state.filterByZohoLead = true;
                state.conversations = filterConversationsByZohoLead(state.allConversations);
                renderConversations();
                updateChatEmptyView();
            }
        }, 1000);
    }
})();

