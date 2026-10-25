# Yakınımda

Çevrendeki restoran ve fast-food mekânlarını fiyata, puana ve mesafeye göre karşılaştıran statik web sitesi.

- Harita: MapLibre GL + OpenFreeMap (ücretsiz, API anahtarı gerekmez)
- Mekân verisi: OpenStreetMap (Overpass API) ve harita verisi
- Yer arama: Photon, yedek olarak Nominatim
- Fiyat ve puanlar şimdilik her kullanıcının kendi tarayıcısında saklanır (ortak veri için sunucu gerekir)

## Yerelde çalıştırma

Klasörün içinde bir terminal açıp şunu çalıştır, sonra tarayıcıda `http://localhost:8000` adresine git:

```
python -m http.server 8000
```

`index.html` dosyasına çift tıklayarak açma, konum ve veri servisleri düzgün çalışmayabilir.

## Dosyalar

- `index.html`: sayfa yapısı
- `style.css`: tasarım (aydınlık ve karanlık mod)
- `app.js`: veri yükleme, filtreler, harita, kartlar
- `ui.js`: tema düğmesi ve hızlı sıralama düğmeleri
- `maplibre-gl.js`, `maplibre-gl.css`: harita kütüphanesi (BSD-3 lisanslı)

## Notlar

Harita ve mekân verisi © OpenStreetMap katkıcıları, OpenFreeMap. Genel Overpass sunucuları adil kullanım ister; yoğun trafikte kendi sunucunu ya da önbellek katmanını düşün.