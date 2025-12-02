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
    currentConversation: null,
    messages: {},
    selectedChannelFilter: '' // Kanal filtreleme için
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
            state.conversations = result.conversations;
            console.log(`✅ ${result.conversations.length} konuşma yüklendi`);
            renderConversations();
            
            // Zoho widget içinde çalışıyorsa, conversation'lar yüklendiğini bildir
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('conversationsLoaded'));
            }
        } else {
            console.warn('⚠️ Konuşmalar bulunamadı');
            renderConversations(); // Boş liste göster
        }
    } catch (error) {
        const errorMsg = error.message || 'Bilinmeyen hata';
        
        // Hata durumunda kullanıcıya bildir
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

function renderConversations() {
    const list = elements.conversationsList;
    list.innerHTML = '';
    
    if (state.conversations.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <p>📭 Henüz konuşma yok</p>
                <p class="empty-hint">Sleekflow'dan konuşmalar yükleniyor...</p>
            </div>
        `;
        return;
    }
    
    state.conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = 'conversation-item';
        if (state.currentConversation && state.currentConversation.id === conv.id) {
            item.classList.add('active');
        }
        
        item.innerHTML = `
            <div class="conversation-avatar">${getInitials(conv.contactName || 'U')}</div>
            <div class="conversation-info">
                <div class="conversation-name">${conv.contactName || 'Bilinmeyen'}</div>
                <div class="conversation-preview">${conv.lastMessage || ''}</div>
            </div>
            <div class="conversation-time">${formatTime(conv.lastMessageTime)}</div>
        `;
        
        item.addEventListener('click', () => selectConversation(conv));
        list.appendChild(item);
    });
}

function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
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
    console.log('📝 Mesajlar:', messages);
    
    // Her zaman temizle ve render et
    list.innerHTML = '';
    
    if (!messages || messages.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Henüz mesaj yok</p></div>';
        console.log('ℹ️ Mesaj yok, empty state gösteriliyor');
        return;
    }
    
    messages.forEach((msg, index) => {
        try {
            const messageEl = document.createElement('div');
            messageEl.className = `message ${msg.direction || 'received'}`;
            messageEl.dataset.messageId = msg.id || `msg_${index}`;
            
            // Mesaj içeriğini al - NORMAL MESAJLAŞMA GİBİ
            let messageText = msg.text || msg.content || '';
            const messageTime = formatTime(msg.timestamp || msg.createdAt || msg.created_at || new Date());
            const messageType = msg.type || 'text';
            let fileUrl = msg.fileUrl || null;
            let fileName = msg.fileName || '';
            const isStory = msg.isStory || false;
            
            // Eğer messageText bir dosya path'i gibi görünüyorsa ve fileUrl yoksa, onu fileUrl yap
            if (!fileUrl && messageText && messageText.includes("Conversation/") && messageText.match(/\.(mp4|mp3|pdf|jpg|jpeg|png|gif|webp|doc|docx|xls|xlsx|avi|mov|wmv|webm)$/i)) {
                console.log(`⚠️ Frontend: messageText dosya path'i gibi görünüyor, fileUrl'e çevriliyor: ${messageText.substring(0, 50)}`);
                fileUrl = messageText;
                fileName = messageText.split('/').pop() || messageText.split('\\').pop() || '';
                messageText = ""; // Text olarak gösterme
            }
            
            // Eğer ne text ne dosya varsa, ATLA
            if ((!messageText || !messageText.trim()) && !fileUrl) {
                console.warn(`⚠️ Mesaj ${index} boş, atlanıyor`);
                return;
            }
            
            console.log(`📨 Mesaj ${index}:`, {
                id: msg.id,
                direction: msg.direction,
                type: messageType,
                hasText: !!messageText,
                hasFile: !!fileUrl,
                fileUrl: fileUrl?.substring(0, 50)
            });
            
            // Mesaj içeriğini oluştur - NORMAL MESAJLAŞMA GİBİ
            let contentHtml = '';
            
            // DOSYA VARSA GÖSTER - VİDEO, RESİM, DOSYA, INSTAGRAM STORY
            if (fileUrl) {
                const isVideo = messageType === "video" || fileUrl.match(/\.(mp4|avi|mov|wmv|webm)$/i);
                const isImage = messageType === "image" || fileUrl.match(/\.(jpg|jpeg|png|gif|webp|jfif)$/i);
                const isAudio = fileUrl.match(/\.(mp3|wav|ogg|m4a)$/i);
                
                // INSTAGRAM STORY MESAJLARI - SLEEKFLOW GİBİ GÖSTER
                if (isStory) {
                    // Story mesajları için özel card göster (SleekFlow gibi)
                    contentHtml += `<div style="border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; margin-bottom: 8px; background: #fff;">
                        <div style="padding: 12px; background: #f8f9fa; border-bottom: 1px solid #e0e0e0;">
                            <div style="font-weight: 600; color: #333; margin-bottom: 4px;">Replied to your story</div>
                        </div>`;
                    
                    if (isVideo) {
                        contentHtml += `<video controls style="width: 100%; max-height: 500px; display: block;">
                            <source src="${escapeHtml(fileUrl)}" type="video/mp4">
                            Tarayıcınız video oynatmayı desteklemiyor.
                        </video>`;
                    } else if (isImage) {
                        contentHtml += `<img src="${escapeHtml(fileUrl)}" alt="Instagram Story" style="width: 100%; max-height: 500px; display: block; object-fit: contain;">`;
                    }
                    
                    contentHtml += `<div style="padding: 8px 12px;">
                            <a href="${escapeHtml(fileUrl)}" target="_blank" style="color: #0066cc; text-decoration: none; font-size: 0.9em;">View story</a>
                        </div>
                    </div>`;
                } else if (isVideo) {
                    // NORMAL VİDEO PLAYER
                    contentHtml += `<video controls style="max-width: 100%; max-height: 400px; border-radius: 8px; margin-bottom: 8px; background: #000;">
                        <source src="${escapeHtml(fileUrl)}" type="video/mp4">
                        Tarayıcınız video oynatmayı desteklemiyor.
                    </video>`;
                } else if (isImage) {
                    // RESİM GÖSTER
                    contentHtml += `<img src="${escapeHtml(fileUrl)}" alt="${escapeHtml(fileName || 'Resim')}" style="max-width: 100%; max-height: 400px; border-radius: 8px; margin-bottom: 8px; cursor: pointer; object-fit: contain;" onclick="window.open('${escapeHtml(fileUrl)}', '_blank')">`;
                } else if (isAudio) {
                    // SES PLAYER GÖSTER
                    contentHtml += `<audio controls style="width: 100%; margin-bottom: 8px;">
                        <source src="${escapeHtml(fileUrl)}" type="audio/mpeg">
                        Tarayıcınız ses oynatmayı desteklemiyor.
                    </audio>`;
                } else {
                    // DİĞER DOSYALAR İÇİN İNDİRME LİNKİ
                    contentHtml += `<a href="${escapeHtml(fileUrl)}" target="_blank" download="${escapeHtml(fileName || 'dosya')}" style="display: inline-block; padding: 10px 16px; background: #f0f0f0; border-radius: 8px; text-decoration: none; color: #333; margin-bottom: 8px; font-weight: 500;">
                        📎 ${escapeHtml(fileName || 'Dosya İndir')}
                    </a>`;
                }
            }
            
            // TEXT MESAJ VARSA GÖSTER - SADECE GERÇEK TEXT
            if (messageText && messageText.trim() && !fileUrl) {
                // Eğer dosya yoksa text göster
                contentHtml += `<div style="white-space: pre-wrap; word-wrap: break-word;">${escapeHtml(messageText)}</div>`;
            } else if (messageText && messageText.trim() && fileUrl) {
                // Eğer dosya varsa, text'i caption olarak göster (küçük, altında)
                contentHtml += `<div style="margin-top: 8px; font-size: 0.9em; color: #666;">${escapeHtml(messageText)}</div>`;
            }
            
            messageEl.innerHTML = `
                <div class="message-bubble">${contentHtml}</div>
                <div class="message-time">${messageTime}</div>
            `;
            
            list.appendChild(messageEl);
        } catch (renderError) {
            console.error(`❌ Mesaj render hatası (index ${index}):`, renderError.message, renderError);
        }
    });
    
    console.log(`✅ ${list.children.length} mesaj render edildi`);
    
    // Scroll to bottom
    setTimeout(() => {
        list.scrollTop = list.scrollHeight;
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

// Sidebar Functions
function toggleSidebar() {
    const isOpen = elements.sidebar.classList.contains('open');
    elements.sidebar.classList.toggle('open');
    
    // Widget içinde çalışıyorsa sidebar durumunu kaydet
    if (typeof window !== 'undefined' && window.location.pathname.includes('/widget')) {
        localStorage.setItem('sidebarClosed', isOpen ? 'true' : 'false');
    }
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
    // Sidebar
    elements.toggleSidebar?.addEventListener('click', toggleSidebar);
    elements.openSidebar?.addEventListener('click', toggleSidebar);
    
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
    
    // Search (case-insensitive)
    elements.searchConversations?.addEventListener('input', (e) => {
        const search = e.target.value.trim().toLowerCase();
        const items = elements.conversationsList.querySelectorAll('.conversation-item');
        items.forEach(item => {
            const nameEl = item.querySelector('.conversation-name');
            const previewEl = item.querySelector('.conversation-preview');
            
            if (!nameEl) return;
            
            const name = nameEl.textContent.trim().toLowerCase();
            const preview = previewEl ? previewEl.textContent.trim().toLowerCase() : '';
            
            // İsim veya mesaj önizlemesinde ara
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
