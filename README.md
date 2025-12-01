# 🚀 SleekFlow-Zoho CRM Entegrasyonu

SleekFlow mesajlaşma platformunu Zoho CRM'e entegre eden widget uygulaması. Zoho CRM içinde SleekFlow conversation'larını görüntüleyip mesajlaşabilirsiniz.

## 📋 Özellikler

- ✅ SleekFlow Platform API entegrasyonu
- ✅ Zoho CRM Embedded Widget
- ✅ Gerçek zamanlı mesajlaşma
- ✅ Dosya gönderme desteği
- ✅ Kanal filtreleme (WhatsApp, Instagram, Facebook, SMS, vb.)
- ✅ Zoho müşteri bilgileri ile otomatik eşleştirme
- ✅ Responsive tasarım

## 🛠️ Kurulum

### Gereksinimler

- Node.js 18+ 
- npm veya yarn
- SleekFlow Platform API anahtarı
- Zoho CRM hesabı

### 1. Projeyi İndirin

```bash
git clone https://github.com/KULLANICI-ADI/SleekflowEntegrationIntoCRM.git
cd SleekflowEntegrationIntoCRM
```

### 2. Bağımlılıkları Yükleyin

```bash
npm install
```

### 3. Server'ı Başlatın

```bash
npm start
```

Server `http://localhost:3000` adresinde çalışacak.

## 📤 GitHub'a Yükleme

### Hangi Dosyalar Eklenecek?

`.gitignore` dosyası otomatik olarak şunları hariç tutar:
- ❌ `node_modules/` - NPM paketleri
- ❌ `.env` - API anahtarları (hassas bilgiler)
- ❌ `uploads/` - Yüklenen dosyalar
- ❌ `*.log` - Log dosyaları

**Tüm diğer dosyalar** otomatik olarak eklenecek.

### GitHub'a Yükleme Adımları

```bash
# 1. Git başlat
git init

# 2. Dosyaları ekle (.gitignore otomatik filtreler)
git add .

# 3. Commit yap
git commit -m "Initial commit: SleekFlow-Zoho integration"

# 4. GitHub'da repository oluştur, sonra:
git remote add origin https://github.com/KULLANICI-ADI/SleekflowEntegrationIntoCRM.git
git branch -M main
git push -u origin main
```

⚠️ **ÖNEMLİ**: `.env` dosyası ASLA GitHub'a yüklenmemeli! API anahtarları içerir.

## 🚀 Production Deploy

### Seçenek 1: Render (Önerilen - Tamamen Ücretsiz) ⭐

1. **Render hesabı oluşturun**
   - https://render.com adresine gidin
   - GitHub ile giriş yapın

2. **Web Service oluşturun**
   - "New +" → "Web Service"
   - GitHub repository'nizi seçin
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: **Free** (ücretsiz!)

3. **URL'i alın**
   - Render otomatik olarak bir URL verir
   - Örnek: `https://sleekflow-proxy.onrender.com`

4. **Zoho Widget URL'ini güncelleyin**
   - Zoho CRM → Setup → Developer Space → Embedded Apps
   - Widget'ınızı düzenleyin
   - App URL: `https://sleekflow-proxy.onrender.com/widget`

### Seçenek 2: Railway

1. **Railway hesabı oluşturun**
   - https://railway.app adresine gidin
   - GitHub ile giriş yapın

2. **Projeyi deploy edin**
   - "New Project" → "Deploy from GitHub repo"
   - Repository'nizi seçin
   - Railway otomatik olarak deploy edecek

3. **URL'i alın ve Zoho'da güncelleyin** (yukarıdaki gibi)

**Not:** Railway 30 gün trial verir, sonra ücretli plana geçmeniz gerekir.

## 📱 Zoho CRM Widget Kurulumu

### 1. Zoho CRM'de Widget Oluşturun

1. **Zoho CRM'e giriş yapın**
   - https://www.zoho.com/crm/ adresine gidin

2. **Developer Space'e gidin**
   - Sol menüden **Setup** (⚙️ Ayarlar) tıklayın
   - **Developer Space** → **Embedded Apps**

3. **Yeni Embedded App oluşturun**
   - **Create Embedded App** butonuna tıklayın
   - **App Name**: `Sleekflow Inbox`
   - **App URL**: 
     - Localhost: `http://localhost:3000/widget`
     - Production: `https://your-domain.com/widget`
   - **App Type**: `Widget`
   - **Save**

### 2. Widget'ı Kullanın

1. **Contact/Lead kaydı açın**
   - Zoho CRM'de bir müşteri kaydı açın

2. **Widget'ı ekleyin**
   - Kayıt sayfasında **Widget** sekmesine tıklayın
   - **Sleekflow Inbox** widget'ını seçin

3. **SleekFlow'a bağlanın**
   - Widget içinde **⚙️ Ayarlar** butonuna tıklayın
   - **Platform API Anahtarı** girin
   - **Bölge** seçin (genellikle "West Europe")
   - **🔗 SleekFlow'a Bağlan** butonuna tıklayın

4. **Mesajlaşın**
   - Conversation'lar otomatik yüklenecek
   - Zoho müşteri bilgileri ile eşleşen conversation otomatik seçilecek
   - Mesaj yazın ve gönderin
   - Dosya da ekleyebilirsiniz (📎 butonu)

## 🔑 SleekFlow API Anahtarı Nasıl Alınır?

1. SleekFlow hesabınıza giriş yapın
2. **Ayarlar** ⚙️ → **Direct API** → **Platform API**
3. **Connect** butonuna tıklayın
4. **"Your unique API key"** altındaki anahtarı kopyalayın

## 📁 Proje Yapısı

```
sleekflow-proxy/
├── server.js              # Ana server dosyası
├── app.js                 # Frontend JavaScript
├── index.html             # Ana UI sayfası
├── zoho-widget.html       # Zoho widget sayfası
├── styles.css             # CSS stilleri
├── package.json           # NPM bağımlılıkları
├── .gitignore            # Git ignore kuralları
├── Procfile              # Heroku/Railway için
├── railway.json          # Railway konfigürasyonu
└── render.yaml           # Render konfigürasyonu
```

## 🔧 API Endpoints

- `POST /api/sleekflow/connect` - SleekFlow bağlantısı
- `GET /api/sleekflow/conversations` - Conversation listesi
- `GET /api/sleekflow/conversations/:id/messages` - Mesajlar
- `POST /api/sleekflow/conversations/:id/messages` - Mesaj gönderme
- `GET /widget` - Zoho widget sayfası

## ⚠️ Önemli Notlar

### Environment Variables
- Production'da hassas bilgileri environment variable olarak saklayın
- `.env` dosyası `.gitignore`'da olduğu için GitHub'a yüklenmez

### HTTPS
- Zoho widget'ları HTTPS gerektirir
- Render ve Railway otomatik HTTPS sağlar

### CORS
- `server.js` dosyasında CORS ayarları var
- Production'da domain'i kısıtlayabilirsiniz

## 🐛 Sorun Giderme

### Widget görünmüyor
- Server'ın çalıştığından emin olun
- Browser console'u açın (F12) ve hataları kontrol edin
- Widget URL'inin doğru olduğundan emin olun

### Conversation'lar gelmiyor
- SleekFlow API anahtarının doğru olduğundan emin olun
- Bölge seçiminin doğru olduğundan emin olun
- Browser console'da hata mesajlarını kontrol edin

### Zoho müşteri bilgisi eşleşmiyor
- Zoho'daki Contact kaydında telefon veya email bilgisi olduğundan emin olun
- SleekFlow'daki conversation'da da aynı telefon/email olmalı
- Browser console'da eşleşme loglarını kontrol edin

## 📝 Lisans

MIT

