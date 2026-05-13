# SafetyWatch AI — İş Güvenliği İhlal Tespit Sistemi
## Bitirme Projesi Teknik Raporu

**Öğrenci:** İbrahim Binbuğa, Fethiye Sarı, Derya Atasoy  
**Tarih:** Mayıs 2026  
**Konu:** YOLOv11 tabanlı gerçek zamanlı kişisel koruyucu ekipman ve düşme tespiti sistemi  
**Canlı Demo:** https://work-safety-backend.vercel.app/

---

## İçindekiler

1. [Proje Genel Bakış](#1-proje-genel-bakış)
2. [Sistem Mimarisi](#2-sistem-mimarisi)
3. [Veritabanı Tasarımı](#3-veritabanı-tasarımı)
4. [Backend — FastAPI](#4-backend--fastapi)
5. [ML Pipeline — YOLOv8](#5-ml-pipeline--yolov8)
6. [Gerçek Zamanlı Bildirim Sistemi](#6-gerçek-zamanlı-bildirim-sistemi)
7. [Web Frontend — React 19](#7-web-frontend--react-19)
8. [Mobil Uygulama — Flutter](#8-mobil-uygulama--flutter)
9. [Raporlama Sistemi](#9-raporlama-sistemi)
10. [Test Suite](#10-test-suite)
11. [Dağıtım](#11-dağıtım)
12. [Teknik Kararlar ve Gerekçeleri](#12-teknik-kararlar-ve-gerekçeleri)
13. [Proje İstatistikleri](#13-proje-i̇statistikleri)
14. [Gelecek Geliştirmeler](#14-gelecek-geliştirmeler)

---

## 1. Proje Genel Bakış

SafetyWatch AI, inşaat sahalarında ve endüstriyel alanlarda çalışan işçilerin güvenlik ihlallerini gerçek zamanlı olarak tespit eden, bildiren ve raporlayan uçtan uca bir iş güvenliği platformudur.

### 1.1 Çözülen Problem

Geleneksel iş güvenliği denetimi manuel gözleme dayalı, reaktif ve ölçeklenemeyen bir süreçtir. Bu proje üç temel güvenlik ihlaline odaklanır:

| İhlal Türü | Açıklama | Tespit Yöntemi |
|------------|----------|----------------|
| **Baret Eksikliği** | Kişinin başında baret/kask olmadığı durumlar | PPE Modeli — `head` sınıfı tespiti |
| **Yelek Eksikliği** | Kişinin üzerinde güvenlik yeleği olmadığı durumlar | PPE Modeli — kişi/yelek örtüşme analizi |
| **Düşme Tespiti** | Çalışanın yere düşmesi veya çökmesi | Fall Detection Modeli — `fallen` sınıfı |

### 1.2 Sistem Bileşenleri

| Bileşen | Teknoloji | Sorumluluk |
|---------|-----------|------------|
| **Backend API** | FastAPI (Python, async) | REST API, WebSocket, ML pipeline yönetimi, zamanlayıcı |
| **Web Frontend** | React 19 + Vite + MUI | Yönetim paneli (dashboard, kameralar, ihlaller, raporlama) |
| **Mobil Uygulama** | Flutter 3.9 (Dart) | Saha personeli için iOS/Android uygulaması |
| **Veritabanı** | PostgreSQL + SQLAlchemy async | Multi-tenant veri modeli |
| **ML Motoru** | YOLOv8/v11 (Ultralytics) | Nesne tespiti — PPE ve düşme |
| **Push Bildirim** | Firebase Cloud Messaging (FCM) | Mobil anlık bildirimler |
| **Gerçek Zamanlı** | WebSocket | Web paneli için canlı ihlal akışı |
| **Dağıtım** | Docker + Render.com / Vercel | Konteynerleştirilmiş bulut dağıtımı |

---

## 2. Sistem Mimarisi

### 2.1 Üst Düzey Mimari

```
┌──────────────────────────────────────────────────────────────┐
│                      Kamera Katmanı                          │
│   RTSP / HTTP-MJPEG / Lokal Kamera                          │
└────────────────────────┬─────────────────────────────────────┘
                         │ frame akışı
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                   ML Tespit Katmanı                          │
│   camera_runner.py — YOLOv8 inference (her 5. frame)        │
│   StateController — IoU tabanlı kişi takibi                 │
│   HttpMjpegCapture — özel MJPEG stream okuyucu              │
└────────────────────────┬─────────────────────────────────────┘
                         │ violation payload
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                  Async Kuyruk Katmanı                        │
│   asyncio.Queue — tespit ve bildirim katmanlarını ayırır    │
│   violation_consumer_task — async kuyruk tüketicisi         │
└──────────┬──────────────────────────────────┬────────────────┘
           │ DB yazımı                         │ bildirim
           ▼                                   ▼
┌──────────────────┐             ┌─────────────────────────────┐
│   PostgreSQL     │             │    Notification Service      │
│   Detection      │             │                             │
│   Violations     │        ┌────┴────────┐   ┌───────────────┐
└──────────┬───────┘        │  WebSocket  │   │  FCM Push     │
           │                │  (Web)      │   │  (Mobil)      │
           ▼                └────────────-┘   └───────────────┘
┌──────────────────┐
│   REST API       │
│   FastAPI        │─────────────────────────────────────────────┐
└──────────────────┘                                             │
          │                                                      │
          ▼                                                      ▼
┌──────────────────┐                              ┌─────────────────────┐
│  Web Dashboard   │                              │  Flutter Mobil App  │
│  React 19 + Vite │                              │  iOS / Android      │
└──────────────────┘                              └─────────────────────┘
```

### 2.2 Uygulama Başlatma Sırası

`main.py` startup event'inde sırayla şunlar gerçekleşir:

1. PostgreSQL şeması oluşturulur (`Base.metadata.create_all`)
2. `CompanyModelCamera` şema migrasyonları uygulanır
3. `asyncio.Queue` ve `violation_consumer_task` başlatılır
4. `WebSocketManager` başlatılır
5. `APScheduler` zamanlanmış rapor görevleri kurulur (daily/weekly/monthly)

### 2.3 Multi-Tenant İzolasyonu

Her API çağrısında `company_code` parametresi zorunludur. Veri katmanında tüm tablolar `company_id` foreign key ile izole edilmiştir. Admin kullanıcılar farklı şirketler arasında geçiş yapabilirken, normal kullanıcılar yalnızca kendi şirket verisine erişir. Kamera thread'leri şirket bazında başlatılıp durdurulur.

---

## 3. Veritabanı Tasarımı

### 3.1 Şema Genel Bakışı

PostgreSQL üzerinde SQLAlchemy ORM ile tanımlanmış 10 tablo. Tüm tablo tanımları `backend/models.py` dosyasındadır.

```
companies
    │
    ├── users (company_id FK)
    ├── cameras (company_id FK)
    │     └── detections (camera_id FK, company_id FK)
    ├── violations (company_id FK)
    ├── company_models (company_id FK, model_id FK)
    │     └── models (ModelMeta)
    ├── company_model_cameras (company_id FK, camera_id FK, model_id FK)
    ├── device_tokens (user_id FK, company_id FK)
    └── company_notification_settings (company_id FK)
```

### 3.2 Tablo Detayları

#### `companies`
Ana multi-tenant birimi. Her şirkete unique `code` atanır (örn: `COMPANY001`). Tüm diğer tablolar bu tabloya bağlanır.

| Sütun | Tip | Açıklama |
|-------|-----|----------|
| `id` | Integer PK | Otomatik artan birincil anahtar |
| `code` | String UNIQUE | Şirket kodu — giriş ekranında kullanılır |
| `name` | String | Şirket tam adı |
| `created_at` | DateTime TZ | Oluşturulma zamanı |

#### `users`
Sistem kullanıcıları. `RoleEnum` ile `admin` ve `user` rolleri tanımlanmıştır.

| Sütun | Tip | Açıklama |
|-------|-----|----------|
| `email` | String UNIQUE | Kullanıcı e-posta adresi |
| `hashed_password` | String | bcrypt ile hash'lenmiş şifre |
| `role` | Enum(admin/user) | Rol tabanlı erişim kontrolü |
| `is_active` | Boolean | Hesap aktiflik durumu |

#### `cameras`
İzleme kameraları. Her kamera bir şirkete aittir.

| Sütun | Tip | Açıklama |
|-------|-----|----------|
| `rtsp_url` | String | RTSP / HTTP / MJPEG / lokal kaynak adresi |
| `status` | String | `online` veya `offline` |
| `location` | String | Kamera konumu (örn: "Depo Girişi") |

#### `detections`
Ham ML tespit kayıtları. Her ihlal için bir `Detection` satırı oluşturulur.

| Sütun | Tip | Açıklama |
|-------|-----|----------|
| `detection_type` | String | `no_helmet`, `no_vest`, `fallen` |
| `confidence` | Float | Model güven skoru (0–1) |
| `is_violation` | Boolean | Her zaman `True` |
| `snapshot_path` | String | İhlal anı görüntüsü dosya yolu |

#### `violations`
Onaylanmış ihlal kayıtları. `review_status` alanı ile inceleme akışı yönetilir.

| Sütun | Tip | Açıklama |
|-------|-----|----------|
| `ihlal_cesidi` | String | `head`, `vest`, `fallen` |
| `ihlal_yapilan_bolge` | String | Kamera konumu |
| `violation_id` | Integer | İşçi takip ID'si |
| `review_status` | String | `pending` / `reviewed` / `resolved` |

#### `company_model_cameras`
Kamera-model atama tablosu. `PriorityEnum` ile kayıt sıklığı belirlenir.

| Öncelik | Minimum Kayıt Aralığı |
|---------|----------------------|
| `critical` | 30 saniye |
| `high` | 2 dakika |
| `medium` | 10 dakika |
| `low` | 30 dakika |

#### `device_tokens`
FCM push bildirimleri için kayıtlı cihaz tokenleri. Başarısız gönderimde stale tokenlar otomatik silinir.

#### `company_notification_settings`
Şirket başına bildirim konfigürasyonu.

| Alan | Tip | Açıklama |
|------|-----|----------|
| `push_enabled` | Boolean | FCM push aktif mi? |
| `email_enabled` | Boolean | E-posta raporları aktif mi? |
| `report_period` | String | `daily` / `weekly` / `monthly` |
| `report_formats` | JSON Array | `["pdf", "excel", "csv"]` |
| `alert_critical` | Boolean | Kritik ihlal bildirimi |

---

## 4. Backend — FastAPI

### 4.1 Teknoloji Stack

| Paket | Versiyon | Kullanım |
|-------|----------|----------|
| FastAPI | Latest | Async ASGI web framework |
| SQLAlchemy | 2.x async | Non-blocking ORM |
| python-jose | — | JWT token encode/decode |
| Ultralytics | — | YOLOv8/v11 inference |
| APScheduler | AsyncIOScheduler | Periyodik rapor görevleri |
| Firebase Admin SDK | — | FCM push bildirimleri |
| OpenCV headless | — | Frame okuma ve encode |
| Uvicorn | standard | ASGI sunucu (WebSocket desteği için `standard`) |

### 4.2 API Router Yapısı

| Router Dosyası | Prefix | Sorumluluk |
|----------------|--------|------------|
| `routes/auth.py` | `/api/auth/` | Login, logout, JWT doğrulama, şirket seçimi |
| `routes/cameras.py` | `/api/cameras/`, `/api/camera/` | Kamera CRUD, stream başlatma/durdurma, MJPEG feed |
| `routes/detections.py` | `/api/detections/`, `/api/violations/` | İhlal listeleme, durum güncelleme (PATCH) |
| `routes/models.py` | `/api/model/`, `/api/models/`, `/api/general-models/` | YOLO model yükleme, aktifleştirme, şirkete atama |
| `routes/users.py` | `/api/admin/users/` | Admin kullanıcı CRUD |
| `routes/reports.py` | `/api/company/{code}/reports/` | İstatistik, CSV/Excel/PDF export, e-posta gönderimi |
| `routes/notifications.py` | `/api/company/{code}/notification-settings/` | Bildirim ayarları GET/PUT |
| `routes/devices.py` | `/api/devices/` | FCM token kayıt ve silme |

**Toplam: 35+ endpoint**

### 4.3 WebSocket Endpoint

```
WS /api/company/{company_code}/ws/violations
```

Bağlantı akışı:
1. İstemci WebSocket bağlantısı açar
2. İlk mesaj olarak JWT token gönderilir (10 saniye timeout)
3. Token doğrulanır, şirket kodu kontrol edilir
4. `{"event":"connected","status":"ok"}` yanıtı gönderilir
5. İstemci `ws_manager._connections[company_id]` setine eklenir
6. Bağlantı koptuğunda set'ten temizlenir

### 4.4 Servis Katmanı

| Servis | Dosya | Sorumluluk |
|--------|-------|------------|
| Camera Service | `services/camera_service.py` | Kamera thread yönetimi, start/stop logic |
| Violation Service | `services/violation_service.py` | Async queue consumer, DB persist, bildirim tetikleme |
| Notification Service | `services/notification_service.py` | WebSocket broadcast, FCM multicast, stale token temizleme |
| Model Service | `services/model_service.py` | Model dosya yönetimi, şirket-kamera atama |
| Report Generator | `services/report_generator.py` | PDF/CSV/Excel dosyası üretimi |
| Report Scheduler | `services/report_scheduler.py` | APScheduler görevleri, SMTP e-posta gönderimi |

### 4.5 Kimlik Doğrulama

JWT tabanlı stateless auth. `python-jose` ile token encode/decode yapılır. Her korunan endpoint'te `dependencies.py` içindeki `get_current_user` bağımlılığı çalışır. 401 yanıtında hem web hem mobil istemci localStorage/SharedPreferences temizler ve giriş ekranına yönlendirir.

---

## 5. ML Pipeline — YOLOv8

### 5.1 Kamera Runner Mimarisi (`camera_runner.py`)

Kamera başına ayrı bir Python thread çalışır. Thread, `stop_event: threading.Event` ile dışarıdan durdurulabilir.

#### Kamera Kaynak Desteği

| Kaynak Türü | Yöntem | Detay |
|-------------|--------|-------|
| RTSP | `cv2.VideoCapture` | Bağlantı testi 3 sn timeout ile yapılır |
| HTTP/MJPEG | `HttpMjpegCapture` (özel sınıf) | `requests` ile byte stream; `0xFFD8`…`0xFFD9` JPEG frame'ler ayıklanır |
| HTTP (fallback) | `cv2.VideoCapture` + `CAP_FFMPEG` | cv2 başarısız olursa devreye girer |
| Lokal kamera | `cv2.VideoCapture(index)` | Windows'ta DirectShow öncelikli |

`HttpMjpegCapture` sınıfı özellikle telefon IP kamera uygulamalarının (DroidCam, EpocCam vb.) tarayıcıda açılan ama cv2/FFmpeg ile açılamayan MJPEG akışlarını çözmek için geliştirilmiştir. Ayrı bir arka plan thread'inde stream okur ve `_latest` frame'i thread-safe şekilde günceller.

#### Frame İşleme Döngüsü

```
frame oku
    │
    ├── (başarısız) → consecutive_failures++
    │                  ≥ 30 → RTSP/HTTP reconnect (backoff: 1–5 sn)
    │
    └── (başarılı) → frame_count++
                     │
                     ├── frame_count % 5 == 1 → YOLOv8 inference çalıştır
                     │                          detections güncelle
                     │
                     ├── (tüm frame'ler) → bounding box çiz
                     │                     status overlay ekle
                     │                     JPEG encode (kalite: 85)
                     │                     _frame_storage[camera_id] = bytes
                     │
                     └── time.time() - last_check ≥ INTERVAL →
                             ihlal tespiti yap → asyncio.Queue'ya gönder
```

**Performans notu:** Inference her 5. frame'de bir çalışır; aradaki frame'lerde önceki tespitler yeniden kullanılır. Bu yaklaşım CPU kullanımını önemli ölçüde azaltırken bounding box görselleştirmesini akıcı tutar.

#### Çoklu Model Desteği (`_run_multi_model_prediction`)

Bir kameraya birden fazla model atanabilir. Her model ayrı ayrı çalıştırılır ve tespitler birleştirilerek döndürülür. Frame üzerinde her model farklı renkte çizilir (`palette` listesi); çakışan label'lar için anchor tabanlı kaydırma uygulanır.

### 5.2 Model Önbelleği

```python
_MODEL_CACHE: dict[str, YOLO] = {}
_MODEL_LOCK: threading.Lock
```

İlk yüklemeden sonra model bellekte tutulur. `preload_model_async` ile kamera başlatılmadan önce model arka planda yüklenebilir.

### 5.3 Model Yolu Çözümleme (`_resolve_model_path`)

Veritabanında model yolları proje-root'a göre göreli olarak saklanır (örn: `model/weights/v1_best.pt`). Bu sayede proje herhangi bir makinede clone'lansa dahi path geçerliliği korunur. Çözümleme sırası:

1. Mutlak yol olarak dene
2. Proje root'una göre göreli dene
3. `backend/` dizinine göre göreli dene
4. `model/weights/` ve `fall_model/weights/` dizinlerinde dosya adına göre ara

### 5.4 State Controller — İşçi Takibi (`yolo_service/logic.py`)

```
Tespit listesi
      │
      ├── person_dets (class_id=3)
      ├── helmet_dets (class_id=0)
      └── vest_dets   (class_id=1)
              │
              ▼
    Her kişi için IoU hesapla
    (kişi kutusu vs helmet/vest kutular, eşik: 0.3)
              │
    has_helmet, has_vest belirlenir
              │
    _assign_worker_id:
      - Son 2 sn içinde görülen en yakın işçi (<200px) → mevcut ID
      - Yoksa → yeni ID (next_worker_id++)
              │
    Önceki state ile karşılaştır (previous_violation_states)
      - Yeni başlayan ihlal → violations_to_save listesine ekle
```

Yalnızca **yeni başlayan** ihlaller kaydedilir. Süregelen ihlaller tekrar kaydedilmez (DB şişmesi önlenir). Aynı mantık `fallen` için de kamera runner'da uygulanır: `state_controller.process_detections` yanı sıra `is_fallen` kontrolü direkt `canonical_class` üzerinden yapılır.

### 5.5 Tespit Sınıfı Normalizasyonu

YOLO modellerinin farklı class adları kullanması nedeniyle bir canonical map uygulanır:

```python
canonical_map = {
    'person': 'person', 'worker': 'person', 'insan': 'person',
    'helmet': 'helmet', 'hardhat': 'helmet', 'baret': 'helmet', 'kask': 'helmet',
    'vest': 'vest', 'yelek': 'vest',
    'head': 'head', 'kafa': 'head',
    'fallen': 'fallen', 'fall': 'fallen',
    'sitting': 'sitting', 'standing': 'standing',
}
```

### 5.6 Violation Pipeline (Thread → Async Köprüsü)

Kamera thread'i asyncio loop'u bilmez. `loop.call_soon_threadsafe(queue.put_nowait, payload)` ile thread-safe şekilde asyncio kuyruğuna payload bırakılır. Ana async loop'ta çalışan `violation_consumer_task` kuyruğu sürekli dinler ve DB'ye yazar.

---

## 6. Gerçek Zamanlı Bildirim Sistemi

### 6.1 WebSocket Yöneticisi

`WebSocketManager` sınıfı, aktif bağlantıları `dict[int, set[WebSocket]]` yapısında şirket ID'sine göre tutar. İhlal tespit edildiğinde `broadcast_to_company` metodu şirketin tüm açık bağlantılarına JSON payload gönderir. Kopuk bağlantılar (`dead` listesi) gönderim sonrası temizlenir.

WebSocket mesaj formatı:
```json
{
  "event": "violation",
  "company_id": 1,
  "violation_type": "head",
  "camera_id": 3,
  "camera_location": "Bölge 1",
  "snapshot_path": null,
  "timestamp": "2026-05-10T14:32:11Z"
}
```

### 6.2 FCM Push Bildirimleri

`_send_fcm` fonksiyonu `messaging.MulticastMessage` ile toplu gönderim yapar. `run_in_executor` ile senkron Firebase SDK çağrısı async loop'u bloklamaz. Gönderim sonrası:

- `registration-token-not-registered` veya `invalid-argument` kodu dönen tokenlar `invalid` listesine alınır
- Bu tokenların DB'deki ID'leri bulunur
- `DELETE WHERE id IN (...)` ile toplu silinir

Bildirim mesaj şablonu:
```
Başlık: "Safety Violation Alert"
Gövde:  "No Helmet Detected — Camera: Bölge 1"
Data:   { company_id, violation_type, camera_id, timestamp }
```

### 6.3 Web İstemcisi — `useViolationSocket` Hook

React'ta WebSocket yaşam döngüsünü yöneten özel hook:

| Özellik | Davranış |
|---------|----------|
| Bağlantı | `company_code` + token ile bağlanır; ilk mesaj olarak JWT gönderilir |
| Bildirim kuyruğu | Maksimum 5 bildirim tutulur; yeni gelenler eski en küçük ID'liyi iter |
| Otomatik dismiss | Her bildirim 6 saniye sonra otomatik kapanır |
| Reconnect | Bağlantı koptuğunda 5 saniye sonra yeniden bağlanmayı dener |
| Cleanup | Component unmount'ta `ws.close()` çağrılır; memory leak önlenir |

---

## 7. Web Frontend — React 19

### 7.1 Teknoloji Stack

| Paket | Versiyon | Kullanım |
|-------|----------|----------|
| React | 19.2.0 | UI framework (Concurrent Mode) |
| Vite | 7.2.4 | Build tool + HMR dev server |
| Material-UI (MUI) | 7.3.6 | Component kütüphanesi |
| Tailwind CSS | 3.4.17 | Utility-first CSS |
| Axios | 1.13.2 | HTTP istemcisi |
| Recharts | 3.5.1 | Grafik kütüphanesi |
| jsPDF | 4.2.1 | Tarayıcı tarafında PDF üretimi |
| Lucide React | 0.556.0 | İkon seti |

### 7.2 Sayfa ve Bileşenler

| Bileşen | Açıklama |
|---------|----------|
| `LoginPage.jsx` | Şirket kodu + e-posta + şifre ile giriş |
| `Dashboard.jsx` | KPI kartları (bugün / bu hafta / aktif kamera), 7 günlük ihlal çizgi grafiği, sistem durumu |
| `Cameras.jsx` | Kamera listesi, ekle/sil, canlı stream görüntüsü, 10 sn polling ile durum güncelleme |
| `Violations.jsx` | İhlal tablosu; tür, durum ve tarih aralığı filtreleri; satır bazında durum güncelleme |
| `Reporting.jsx` | Dönem filtreleri, ihlal dağılım grafiği, PDF/CSV/Excel export, e-posta gönder |
| `Models.jsx` + `ModelManagement.jsx` | Model yükleme (admin), şirkete ve kameraya atama |
| `Companies.jsx` | Şirket listesi (yalnızca admin) |
| `Settings.jsx` | Push bildirim açma/kapama, rapor periyodu ve formatı ayarlama |
| `Sidebar.jsx` + `TopNav.jsx` | Sol navigasyon, üst bar — admin için şirket seçici, ihlal sayaçları |
| `ViolationToast.jsx` | WebSocket'ten gelen gerçek zamanlı ihlal bildirimleri |
| `LiveCameraFeed.jsx` | Backend `/api/camera/{id}/stream` endpoint'inden MJPEG akışı |

### 7.3 State Yönetimi

**Context API:**

- `AuthContext.jsx` — JWT token, kullanıcı rol bilgisi, `activeCompanyCode` (admin için seçilen şirket), login/logout işlemleri. Token `localStorage`'da tutulur. Uygulama açılışında token doğrulanır; geçersizse `setLoading(false)` çağrılarak sonsuz spinner engellenir.
- `AppearanceContext.jsx` — Dark/light mode, tema rengi. `localStorage`'da persist edilir.

**Özel Hook:**

- `useViolationSocket.js` — WebSocket bağlantısı, bildirim kuyruğu yönetimi (detaylar §6.3'te)

### 7.4 API Katmanı (`src/utils/api.js`)

| Yardımcı | Açıklama |
|----------|----------|
| `apiClient` (Axios instance) | Her isteğe otomatik `Authorization: Bearer <token>` ekler; 401'de `localStorage` temizler ve `/login`'e yönlendirir |
| `apiCall` (fetch wrapper) | Alternatif HTTP helper; aynı 401 mantığı |
| `addCompanyCodeToUrl` | Şirkete özel endpoint'lere `?company_code=` query param ekler |
| `uploadFile` | Model dosyası için `multipart/form-data` — `Content-Type` header'ı otomatik bırakılır (browser boundary ayarlar) |

---

## 8. Mobil Uygulama — Flutter

### 8.1 Teknoloji Stack

| Paket | Versiyon | Kullanım |
|-------|----------|----------|
| Flutter SDK | ^3.9.2 | Cross-platform framework |
| `http` | ^1.6.0 | REST API istekleri |
| `shared_preferences` | ^2.3.0 | Token ve oturum verisi yerel depolama |
| `firebase_core` | ^3.0.0 | Firebase entegrasyonu |
| `firebase_messaging` | ^15.0.0 | FCM push bildirimleri |
| `flutter_local_notifications` | ^17.0.0 | Ön plan bildirim gösterimi |
| `fl_chart` | ^0.69.0 | Dashboard grafikleri |
| `webview_flutter` | ^4.10.0 | Kamera stream görüntüsü |

### 8.2 Ekran Yapısı

`HomePage` merkezi bir `BottomNavigationBar` hub'ı olarak tasarlanmıştır. 5 ana sekme arasında state kaybolmadan gezinme sağlanır.

| Ekran | Açıklama |
|-------|----------|
| `LoginPage` | Animasyonlu logo, şirket kodu + e-posta + şifre girişi |
| `DashboardPage` | İhlal özeti kartları, fl_chart grafikleri, admin için şirket filtresi |
| `ViolationPage` | İhlal listesi (sayfalama: 10/sayfa), tarih aralığı ve kamera filtresi |
| `ViolationDetailPage` | Snapshot görüntüsü, ihlal bilgileri, `pending → approved / rejected` durum güncelleme |
| `CamerasPage` | Kamera listesi, ekle/sil/başlat/durdur, WebView ile canlı stream |
| `UsersPage` | Admin kullanıcı yönetimi — oluştur, güncelle, sil, ada göre ara |
| `CompaniesPage` | Admin şirket listesi |
| `ReportsPage` | Analitik, dönem filtreleri (günlük/haftalık/aylık/özel tarih) |
| `SettingsPage` | Çıkış, rol bazlı admin menüsü |

### 8.3 Servis Katmanı

| Servis | Sorumluluk |
|--------|------------|
| `AuthService` | Login (HTTP POST), session kaydet/yükle/temizle (SharedPreferences) |
| `ViolationService` | İhlal listesi getir (GET + query params), durum güncelle (PATCH) |
| `CameraService` | Kamera CRUD, start/stop, stream URL üretimi |
| `UserManagementService` | Admin kullanıcı CRUD (GET/POST/PUT/DELETE) |
| `CompanyService` | Şirket listesi (admin, GET) |
| `NotificationService` | FCM token kayıt/silme, ön plan bildirim gösterimi |

Tüm servis metotlarına opsiyonel `http.Client?` parametresi eklenmiştir. Bu, production kodunu değiştirmeden test edilebilirliği sağlar:

```dart
static Future<UserModel?> login(
  String companyCode, String email, String password,
  {http.Client? httpClient}
) async {
  final client = httpClient ?? http.Client();
  // ...
}
```

### 8.4 Veri Modelleri

```dart
UserModel {
  token: String,
  role: String,          // "admin" | "user"
  companyCode: String
}

ViolationModel {
  id: int,
  type: String,          // "head" | "vest" | "fallen"
  camera: String,
  timestamp: DateTime,
  status: String,        // "pending" | "approved" | "rejected"
  snapshotPath: String?
} + copyWith()

CameraModel {
  id: int,
  name: String,
  source: String,        // RTSP URL veya lokal kaynak
  location: String,
  isActive: bool,
  companyCode: String
}

AdminUserModel {
  id: int,
  email: String,
  role: String,
  isActive: bool,
  companyCode: String
}
```

### 8.5 Push Bildirim Akışı

1. Uygulama başlatıldığında FCM token alınır
2. Token `POST /api/devices/` ile backend'e kaydedilir
3. İhlal tespit edildiğinde backend FCM multicast gönderir
4. Uygulama arka plandayken sistem bildirim tepsisine düşer
5. Uygulama ön plandayken `flutter_local_notifications` ile gösterilir
6. Token geçersiz hale gelirse backend otomatik siler (§6.2)

---

## 9. Raporlama Sistemi

### 9.1 Manuel Export (Web ve Mobil)

Kullanıcı tarih aralığı ve ihlal türü seçerek üç formatta rapor indirebilir:

| Format | Kütüphane | İçerik |
|--------|-----------|--------|
| **PDF** | jsPDF (web) / backend `generate_pdf` | Logo, şirket bilgisi, ihlal tablosu, özet istatistikler |
| **CSV** | `generate_csv` | Ham ihlal verisinin düz metin çıktısı |
| **Excel** | `generate_excel` (openpyxl veya xlsxwriter) | Biçimlendirilmiş hücre tablosu, başlık satırı |

### 9.2 Zamanlanmış Otomatik Raporlar

`APScheduler` ile üç ayrı cron görevi çalışır. Tüm görevler 14:30 UTC'de (17:30 Türkiye saati) tetiklenir:

| Görev | Zamanlama | Kapsadığı Dönem |
|-------|-----------|-----------------|
| `send_daily_reports` | Her gün 14:30 UTC | Güncel gün |
| `send_weekly_reports` | Her Cuma 14:30 UTC | Pazartesi — Cuma |
| `send_monthly_reports` | Her ayın son günü 14:30 UTC | 1. gün — son gün |

### 9.3 E-posta Teslimi

`smtplib` + `ssl.create_default_context()` ile STARTTLS üzerinden gönderilir. `.env` dosyasından alınan `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` değişkenleriyle yapılandırılır. `email_enabled = True` ve `report_period` eşleşen şirketlerin tüm aktif kullanıcıları alıcı listesine eklenir.

---

## 10. Test Suite

### 10.1 Web Testleri (React + Vitest)

**Test altyapısı:**

| Araç | Kullanım |
|------|----------|
| Vitest 4.1 | Test runner ve assertion kütüphanesi |
| @testing-library/react | Component render ve DOM sorgulama |
| @testing-library/user-event | Kullanıcı etkileşimi simülasyonu (click, type, submit) |
| @testing-library/jest-dom | Genişletilmiş DOM assertion'ları |
| MSW (Mock Service Worker) 2.14 | HTTP ve WebSocket mock sunucu (Node.js interceptor) |
| jsdom 29 | Tarayıcı ortamı simülasyonu |

**Test dosyaları ve kapsamı:**

| Dosya | Test Sayısı | Kapsanan Konular |
|-------|-------------|-----------------|
| `src/utils/api.test.js` | 12 | Axios interceptor (token ekleme, 401 yönlendirme), `apiCall` fetch wrapper, `addCompanyCodeToUrl`, `logout` localStorage temizliği |
| `src/context/AuthContext.test.jsx` | 9 | Login başarı/hata akışları, token localStorage kaydetme, session restore (geçerli / geçersiz token), logout temizliği, admin vs user `activeCompanyCode` mantığı |
| `src/hooks/useViolationSocket.test.js` | 10 | WebSocket bağlantısı, JWT token gönderimi, mesaj parse etme, yalnızca `violation` event'i işleme, max-5 kuyruk, 6 sn otomatik dismiss, `dismiss()` fonksiyonu, 5 sn reconnect, token yokken bağlanmama, unmount cleanup |
| `src/components/Violations.test.jsx` | 6 | Admin şirket uyarısı, violations listesi fetch, stats hesabı, PATCH çağrısı ve payload doğrulama, optimistic update, hata durumunda rollback |
| `src/components/Cameras.test.jsx` | 7 | Admin uyarısı, kamera listesi çekme, "Add Camera" butonu, form gösterimi, isim validasyonu, kamera oluşturma (POST), kamera silme (DELETE + confirm dialog) |
| **Toplam** | **44** | |

**Test çalıştırma:**
```bash
cd frontend
npm test          # tek seferlik
npm run test:watch # izleme modu
```

**Test sürecinde bulunan bug:**

`AuthContext.jsx`'te geçersiz token saklandığında `setLoading(false)` çağrılmıyordu. Bu, uygulama açılışında sonsuz yükleme spinnerına yol açıyordu:

```js
// HATALI — spinner sonsuz dönerdi
if (!tokenIsValid) {
  if (isMounted) clearStoredAuth();
  return; // ← setLoading(false) çağrılmadan çıkılıyor
}

// DÜZELTME
if (!tokenIsValid) {
  if (isMounted) {
    clearStoredAuth();
    setLoading(false); // ← eklendi
  }
  return;
}
```

### 10.2 Flutter Testleri

**Test altyapısı:**

| Araç | Kullanım |
|------|----------|
| `flutter_test` (built-in) | Test runner, widget testing |
| `MockClient` (http/testing.dart) | HTTP istek interceptor |
| `SharedPreferences.setMockInitialValues` | Platform channel mock |

**Test dosyaları ve kapsamı:**

| Dosya | Test Sayısı | Kapsanan Konular |
|-------|-------------|-----------------|
| `test/models/violation_model_test.dart` | 6 | `fromJson` (tüm alanlar, `review_status` önceliği, fallback status, boş JSON), `copyWith` (status güncelleme, orijinal değişmezliği) |
| `test/models/camera_model_test.dart` | 3 | `fromJson` (tüm alanlar, varsayılan değerler, `is_active: false`) |
| `test/models/user_model_test.dart` | 3 | `fromJson` (token/role/companyCode, varsayılanlar, user role) |
| `test/services/auth_service_test.dart` | 9 | Login 200/401/network error, request body doğrulama, `saveSession`, `loadSession` (var/yok/boş token), `clearSession` |
| `test/services/violation_service_test.dart` | 8 | `getViolations` 200/401/network, Authorization header + URL query param, `updateStatus` 200/404/network, PATCH method + endpoint + body |
| `test/services/camera_service_test.dart` | 17 | `getCameras` 200/401/network, auth header + URL, `createCamera` 200/201/422, request body payload, `deleteCamera` 200/204/404, DELETE method + URL, `streamUrl` format, `startCamera`/`stopCamera` endpoint ve HTTP method |
| `test/widget_test.dart` | 3 | Model instantiation smoke testleri |
| **Toplam** | **49** | |

**Test çalıştırma:**
```bash
cd work_safety_mobile
flutter test               # tüm testler
flutter test --coverage    # coverage raporu ile
```

**Toplam test sayısı: 93 (44 web + 49 Flutter)**

---

## 11. Dağıtım

### 11.1 Backend — Docker + Render.com / Vercel

```dockerfile
FROM python:3.11-slim

# OpenCV headless için sistem bağımlılıkları
RUN apt-get update && apt-get install -y \
    libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

# Uygulama bağımlılıkları
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Uvicorn standard (WebSocket desteği için)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

`opencv-python-headless` kullanılır; GUI bağımlılıkları (`libgtk`, `libx11` vb.) gereksizdir. `uvicorn[standard]` WebSocket ve HTTP/2 desteği için gereklidir.

**Ortam değişkenleri:**

| Değişken | Açıklama |
|----------|----------|
| `DATABASE_URL` | PostgreSQL bağlantı URL'i |
| `SECRET_KEY` | JWT imzalama anahtarı |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase servis hesabı JSON (env var olarak) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | E-posta gönderimi |

### 11.2 Web Frontend

Vite ile static build (`npm run build`) alınır. `VITE_API_URL` ortam değişkeni ile API adresi yapılandırılır. Vercel veya herhangi bir static hosting platformunda servis edilebilir.

### 11.3 Mobil Uygulama

Flutter ile iOS (`flutter build ios`) ve Android (`flutter build apk / appbundle`) için build alınır. API base URL `AuthService.baseUrl` sabiti üzerinden yapılandırılır. Firebase konfigürasyonu `google-services.json` (Android) ve `GoogleService-Info.plist` (iOS) dosyalarıyla sağlanır.

---

## 12. Teknik Kararlar ve Gerekçeleri

| Karar | Gerekçe |
|-------|---------|
| **FastAPI async** | Kamera stream okuma, DB sorguları ve HTTP çağrıları I/O-bound işlemler. Async mimarisi thread başına istek yerine coroutine başına istek modeli sunar; yüksek eş zamanlılık düşük kaynak kullanımıyla sağlanır |
| **SQLAlchemy async ORM** | Senkron ORM ile DB sorguları event loop'u bloke eder. Async session ile tüm DB işlemleri non-blocking çalışır |
| **`asyncio.Queue` violation pipeline** | Camera thread ile notification service katmanlarını ayırır. Thread kuyruğa bırakır ve işine devam eder; consumer async olarak tüketir. Kamera thread'i DB yazımı veya FCM çağrısı için beklemeye girmez |
| **Multi-tenant şema** | Tek deployment ile birden fazla şirket desteklenir. Her şirket kendi veri izolasyonuna sahip; yatay ölçekleme kolaylaşır |
| **Tespit öncelik sistemi** | Her frame her tespiti kaydetmek DB'yi dakikalar içinde şişirir. Öncelik sistemi ile minimum kayıt aralığı belirlenerek hem depolama hem performans optimize edilir |
| **`http.Client` injection (Flutter)** | Test edilebilirlik için dependency injection uygulandı. Production kodu değişmeden `MockClient` ile HTTP katmanı test edilebilir hale geldi |
| **MSW (Mock Service Worker)** | Frontend testlerinde gerçek Axios/fetch mantığı test edilir. API mock'u test dosyasından ayrıldığı için test kodu daha okunabilir ve bakımı kolay |
| **Her 5. frame'de inference** | CPU'da YOLOv8 inference yaklaşık 100–300ms sürer. Her frame'de inference yapılsa kamera akışı donar. 5 frame atlayarak akış görsel olarak akıcı kalır, tespitler yeterli sıklıkta yapılır |
| **`HttpMjpegCapture` özel sınıfı** | cv2/FFmpeg belirli IP kamera uygulamalarının MJPEG akışını açamıyor. `requests` tabanlı özel okuyucu JPEG frame başlangıç/bitiş byte'larını (`0xFFD8`/`0xFFD9`) manuel ayıklayarak bu sorunu aşar |
| **Stale FCM token otomatik silme** | Gönderim başarısızlık kodu analiz edilir; kayıtsız/geçersiz tokenlar hemen DB'den silinir. Böylece sonraki gönderimler gereksiz tokenlar içermez, FCM kota ve latency optimize edilir |

---

## 13. Proje İstatistikleri

| Metrik | Değer |
|--------|-------|
| Toplam git commit | ~92 |
| Backend Python satır sayısı | ~4.000+ satır |
| Frontend JS/JSX satır sayısı | ~5.400 satır |
| Flutter Dart satır sayısı | ~5.100 satır |
| **Toplam kod tabanı** | **~14.500+ satır** |
| Backend API endpoint sayısı | 35+ |
| Veritabanı tablo sayısı | 10 |
| Web bileşen sayısı | 16 |
| Flutter ekran sayısı | 9 |
| Flutter servis sayısı | 6 |
| Web test sayısı | 44 |
| Flutter test sayısı | 49 |
| **Toplam test sayısı** | **93** |
| Desteklenen platform sayısı | 3 (Web, iOS, Android) |
| Desteklenen kamera kaynak türü | 4 (RTSP, HTTP-MJPEG, Lokal, HttpMjpegCapture) |
| Desteklenen rapor formatı | 3 (PDF, CSV, Excel) |
| Otomatik rapor periyodu | 3 (Günlük, Haftalık, Aylık) |
| Desteklenen ihlal türü | 3 (Baret, Yelek, Düşme) |

---

## 14. Gelecek Geliştirmeler

| Öncelik | Geliştirme |
|---------|------------|
| Yüksek | Backend için pytest test suite (servis ve route katmanı) |
| Yüksek | CI/CD pipeline — GitHub Actions: test → build → deploy |
| Orta | Flutter integration testleri (gerçek HTTP/FCM akışı) |
| Orta | Kamera başına ihlal ısı haritası (heatmap görselleştirme) |
| Orta | WebSocket'e bağlı aktif kullanıcı sayısı göstergesi |
| Düşük | Daha fazla ML model desteği (hardhat rengi, yelek rengi bazında filtreleme) |
| Düşük | Mobil uygulama offline modu (SQLite önbellek) |
| Düşük | Rol tabanlı dashboard özelleştirmesi |
| Düşük | Kamera başına anlık FPS ve model latency metrikleri |

---
