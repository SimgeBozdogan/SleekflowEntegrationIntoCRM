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
    selectedFiles: document.getElementById('selectedFiles'),
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
                errorMsg = `✅ Endpoint bulundu! ❌ Ancak Platform API anahtarı geçersiz.\n\n` +
                          `📋 YAPILMASI GEREKEN:\n` +
                          `1. SleekFlow hesabınıza Admin yetkisiyle giriş yapın\n` +
                          `2. Sol navigasyon çubuğunda ⚙️ (Ayarlar) ikonuna tıklayın\n` +
                          `3. "Direct API" altında "Platform API" seçeneğini bulun\n` +
                          `4. "Connect" butonuna tıklayın\n` +
                          `5. "Your unique API key" altındaki anahtarı kopyalayın\n` +
                          `6. Yeni key'i buraya yapıştırın ve tekrar deneyin\n\n` +
                          `💡 İpucu: API anahtarınızı yenilemek için "Refresh API key" butonunu kullanabilirsiniz.`;
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
            showToast('✅ Endpoint bulundu! Ancak Platform API anahtarı geçersiz. Lütfen SleekFlow hesabınızdan doğru Platform API anahtarını alın (Ayarlar > Direct API > Platform API > Connect).', 'warning');
            console.log('✅ Endpoint bulundu:', error.details?.triedUrl || 'https://api.sleekflow.io/api/contact');
            console.log('❌ API anahtarı geçersiz:', error.details);
        } else if (error.message.includes('endpointFound') || error.message.includes('Endpoint bulundu')) {
            showToast('✅ Endpoint bulundu! Ancak Platform API anahtarı geçersiz. Lütfen doğru Platform API anahtarını girin.', 'warning');
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
        
        if (!silent) {
            console.log('✅ Konuşmalar alındı:', result);
        }
        
        if (result && result.conversations) {
            // Mevcut conversation'ları kontrol et - değişiklik var mı?
            const currentConvs = state.conversations || [];
            const newConvs = result.conversations;
            
            // Conversation sayısı veya ilk conversation ID'si değiştiyse render et
            const hasChanged = currentConvs.length !== newConvs.length || 
                             (currentConvs.length > 0 && newConvs.length > 0 && 
                              currentConvs[0].id !== newConvs[0].id);
            
            if (hasChanged || !silent) {
                // Değişiklik varsa veya ilk yükleme ise render et
                state.conversations = newConvs;
                if (!silent) {
                    console.log(`✅ ${newConvs.length} konuşma yüklendi`);
                }
                renderConversations();
            }
            // Değişiklik yoksa ve sessiz mod ise hiçbir şey yapma
        } else {
            if (!silent) {
                console.warn('⚠️ Konuşmalar bulunamadı');
            }
            if (state.conversations.length === 0) {
                renderConversations(); // Sadece boşsa göster
            }
        }
    } catch (error) {
        const errorMsg = error.message || 'Bilinmeyen hata';
        if (!silent) {
            console.error('Konuşmalar yüklenirken hata:', errorMsg);
        }
        // Sessizce devam et, kullanıcıya gösterme
        renderConversations(); // Boş liste göster
    } finally {
        if (!silent) {
            hideLoading();
        }
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
    
    // Sessizce yükle - loading gösterme
    await loadMessages(conversation.id, true); // silent = true
}

async function loadMessages(conversationId, silent = false) {
    if (!state.sleekflow.connected) return;
    
    if (!silent) {
        showLoading();
    }
    
    try {
        const result = await apiRequest(`/sleekflow/conversations/${conversationId}/messages`, 'GET');
        
        if (result.messages) {
            // Mevcut mesajları kontrol et - değişiklik var mı?
            const currentMessages = state.messages[conversationId] || [];
            const newMessages = result.messages;
            
            // Mesaj sayısı kontrolü
            if (currentMessages.length !== newMessages.length) {
                // Mesaj sayısı değişti - yeni mesaj var
                state.messages[conversationId] = newMessages;
                renderMessages(newMessages, silent);
            } else if (currentMessages.length > 0 && newMessages.length > 0) {
                // Son mesaj ID'si kontrolü
                const lastCurrentId = String(currentMessages[currentMessages.length - 1].id || '');
                const lastNewId = String(newMessages[newMessages.length - 1].id || '');
                
                if (lastCurrentId !== lastNewId) {
                    // Yeni mesaj var
                    state.messages[conversationId] = newMessages;
                    renderMessages(newMessages, silent);
                } else if (!silent) {
                    // İlk yükleme veya manuel refresh - render et
                    state.messages[conversationId] = newMessages;
                    renderMessages(newMessages, false);
                }
                // Değişiklik yok ve silent mod ise hiçbir şey yapma
            } else if (!silent) {
                // İlk yükleme - render et
                state.messages[conversationId] = newMessages;
                renderMessages(newMessages, false);
            }
        }
    } catch (error) {
        if (!silent) {
            showToast(`Mesajlar yüklenemedi: ${error.message}`, 'error');
        }
    } finally {
        if (!silent) {
            hideLoading();
        }
    }
}

function renderMessages(messages, preserveScroll = false) {
    const list = elements.messagesList;
    
    if (!messages || messages.length === 0) {
        if (list.children.length === 0 || list.querySelector('.empty-state')) {
            list.innerHTML = '<div class="empty-state"><p>Henüz mesaj yok</p></div>';
        }
        return;
    }
    
    // Scroll pozisyonunu koru (eğer preserveScroll true ise)
    const wasAtBottom = preserveScroll && (list.scrollHeight - list.scrollTop - list.clientHeight < 50);
    const oldScrollTop = list.scrollTop;
    const oldScrollHeight = list.scrollHeight;
    
    // Mevcut mesaj ID'lerini al
    const existingMessageIds = new Set();
    list.querySelectorAll('.message[data-message-id]').forEach(msgEl => {
        const msgId = msgEl.getAttribute('data-message-id');
        if (msgId) existingMessageIds.add(msgId);
    });
    
    // Eğer hiç mesaj yoksa tümünü render et
    if (existingMessageIds.size === 0) {
        list.innerHTML = '';
        messages.forEach(msg => {
            const msgId = String(msg.id || Math.random());
            const messageEl = document.createElement('div');
            messageEl.className = `message ${msg.direction || 'received'}`;
            messageEl.setAttribute('data-message-id', msgId);
            
            messageEl.innerHTML = `
                <div class="message-bubble">${escapeHtml(msg.text || msg.content || '')}</div>
                <div class="message-time">${formatTime(msg.timestamp || msg.createdAt)}</div>
            `;
            
            list.appendChild(messageEl);
        });
        // İlk yüklemede en alta kaydır
        list.scrollTop = list.scrollHeight;
        return;
    }
    
    // Yeni mesajları kontrol et ve sadece yeni olanları ekle
    let hasNewMessages = false;
    messages.forEach(msg => {
        const msgId = String(msg.id || Math.random());
        if (!existingMessageIds.has(msgId)) {
            hasNewMessages = true;
            const messageEl = document.createElement('div');
            messageEl.className = `message ${msg.direction || 'received'}`;
            messageEl.setAttribute('data-message-id', msgId);
            
            messageEl.innerHTML = `
                <div class="message-bubble">${escapeHtml(msg.text || msg.content || '')}</div>
                <div class="message-time">${formatTime(msg.timestamp || msg.createdAt)}</div>
            `;
            
            list.appendChild(messageEl);
        }
    });
    
    // Scroll pozisyonunu koru veya en alta kaydır
    if (hasNewMessages) {
        // Yeni mesaj varsa en alta kaydır
        list.scrollTop = list.scrollHeight;
    } else if (preserveScroll && !wasAtBottom) {
        // Kullanıcı yukarıda scroll yapmışsa pozisyonu koru
        const newScrollHeight = list.scrollHeight;
        const scrollDiff = newScrollHeight - oldScrollHeight;
        list.scrollTop = oldScrollTop + scrollDiff;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function sendMessage() {
    if (!state.currentConversation) {
        showToast('Lütfen bir konuşma seçin', 'warning');
        return;
    }
    
    const text = elements.messageInput.value.trim();
    const files = elements.fileInput.files;
    
    // Text veya dosya olmalı
    if (!text && files.length === 0) {
        showToast('Lütfen mesaj yazın veya dosya seçin', 'warning');
        return;
    }
    
    showLoading();
    
    try {
        // FormData oluştur (dosya varsa)
        let result;
        if (files.length > 0) {
            const formData = new FormData();
            formData.append('text', text || '');
            
            // Dosyaları ekle
            for (let i = 0; i < files.length; i++) {
                formData.append('files', files[i]);
            }
            
            // Multipart/form-data ile gönder
            const response = await fetch(`${API_BASE_URL}/sleekflow/conversations/${state.currentConversation.id}/messages`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
            
            result = await response.json();
        } else {
            // Sadece text - JSON ile gönder
            result = await apiRequest(`/sleekflow/conversations/${state.currentConversation.id}/messages`, 'POST', {
                text
            });
        }
        
        // Temizle
        elements.messageInput.value = '';
        elements.fileInput.value = '';
        updateSelectedFiles();
        
        // Reload messages - sessizce yükle
        await loadMessages(state.currentConversation.id, true); // silent = true
        await loadConversations(true); // silent = true
        
        showToast('Mesaj gönderildi', 'success');
    } catch (error) {
        showToast(`Mesaj gönderilemedi: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

// Sender Functions

function updateSelectedFiles() {
    const files = elements.fileInput.files;
    const selectedFilesDiv = elements.selectedFiles;
    
    if (files.length === 0) {
        selectedFilesDiv.style.display = 'none';
        selectedFilesDiv.innerHTML = '';
        return;
    }
    
    selectedFilesDiv.style.display = 'block';
    const fileList = Array.from(files).map((file, index) => 
        `<span style="display: inline-block; margin-right: 10px; padding: 3px 8px; background: #e0e7ff; border-radius: 4px; font-size: 11px;">
            📎 ${file.name} (${(file.size / 1024).toFixed(1)} KB)
            <button onclick="removeFile(${index})" style="margin-left: 5px; border: none; background: none; cursor: pointer; color: #666;">✕</button>
        </span>`
    ).join('');
    
    selectedFilesDiv.innerHTML = fileList;
}

// Global function for removing files
window.removeFile = function(index) {
    const dt = new DataTransfer();
    const files = elements.fileInput.files;
    
    for (let i = 0; i < files.length; i++) {
        if (i !== index) {
            dt.items.add(files[i]);
        }
    }
    
    elements.fileInput.files = dt.files;
    updateSelectedFiles();
};

// Sidebar Functions
function toggleSidebar() {
    elements.sidebar.classList.toggle('open');
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
    
    // Gerçek zamanlı güncelleme için 5 saniyede bir kontrol et
    messagePollInterval = setInterval(async () => {
        if (!state.sleekflow.connected) {
            return;
        }
        
        try {
            // Refresh conversations to get new messages (gerçek zamanlı sıralama için)
            // Sessizce güncelle - loading gösterme
            await loadConversations(true); // silent = true
            
            // If there's an active conversation, refresh its messages
            if (state.currentConversation) {
                await loadMessages(state.currentConversation.id, true); // silent = true
            }
        } catch (error) {
            // Sessizce hata logla, kullanıcıya gösterme
            console.error('Message polling error:', error);
        }
    }, 5000); // Her 5 saniyede bir güncelle (gerçek zamanlı)
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
    elements.attachFile?.addEventListener('click', () => {
        elements.fileInput.click();
    });
    elements.fileInput?.addEventListener('change', updateSelectedFiles);
    elements.messageInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Channel filter
    elements.channelFilter?.addEventListener('change', async (e) => {
        const selectedChannel = e.target.value;
        state.selectedChannelFilter = selectedChannel;
        console.log(`📱 Kanal filtresi değişti: ${selectedChannel || 'Tümü'}`);
        // Konuşmaları yeniden yükle
        await loadConversations();
    });
    
    // Search
    elements.searchConversations?.addEventListener('input', (e) => {
        const search = e.target.value.toLowerCase();
        const items = elements.conversationsList.querySelectorAll('.conversation-item');
        items.forEach(item => {
            const name = item.querySelector('.conversation-name').textContent.toLowerCase();
            item.style.display = name.includes(search) ? 'flex' : 'none';
        });
    });
    
        // Load saved state
        loadSavedState();
        
        // Auto-connect
        autoConnect().then(() => {
            // Bağlantı başarılı olduysa konuşmaları yükle
            if (state.sleekflow.connected) {
                console.log('🚀 Bağlantı başarılı, konuşmalar yükleniyor...');
                loadConversations().catch(err => {
                    console.error('❌ Konuşmalar yüklenirken hata:', err);
                });
                startMessagePolling();
            } else {
                console.log('⚠️ Bağlantı yok, konuşmalar yüklenmeyecek');
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
