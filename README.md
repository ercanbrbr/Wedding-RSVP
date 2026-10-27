# Wedding

## Davetiye tasarımı

Yönetim panelindeki **Tasarım Düzenleyici** ekranı, ayarları ve canlı davetiye önizlemesini yan yana gösterir. Telefonda önizleme üstte, ayarlar altta kalır. Tema, renkler, yazı tipleri, amblem, görsel, program ve form seçenekleri kaydetmeden görüntülenir. **İptal** taslağı bırakır; **Tasarımı Kaydet** değişiklikleri yayımlar. **Telefon** dar ekran önizlemesini, **Zarfı dene** açılış animasyonunu gösterir.

**Davetiye Müziği** bölümüne bilgisayarınızdaki MP3, WAV veya OGG dosyasını yükleyebilirsiniz (en fazla 20 MB). Varsayılan ses düzeyi %15'tir. Müzik zarf açma dokunuşuyla başlar ve tekrar eder. Misafir müziği durdurup yeniden başlatabilir. Bazı mobil tarayıcılarda ses düzeyini cihazın ses ayarı belirler.

Yüklediğiniz davetiye görseli zarfın içinden çıkar. Görsel yoksa isimlerinizin bulunduğu kart gösterilir. Düzenleyici genel görünüm, zarf açılışı, logo, isimler, alt yazı, mesaj, giyim kodu, program ve katılım formu sırasını izler.

Çift isimleri ve logo için 32 açık lisanslı, ücretsiz font hazırdır. Fontlar siteyle birlikte sunulur; font yükleme veya harici font servisi gerekmez. Kaynak ve lisans bilgileri [font açıklamasında](public/fonts/README.md) bulunur.

## Paylaşım önizlemesi

**Tasarım Düzenleyici → Paylaşım önizlemesi** bölümünde link kartının başlığını, açıklamasını ve görselini düzenleyebilirsiniz. Ayrı görsel yükleyebilir veya bağlantı girebilirsiniz. Boş alanlarda çift isimleri, varsayılan davet mesajı ve davetiye görseli kullanılır. **Tasarımı Kaydet** ile yayımlanır; iptal edilen görsel taslakları davetiyeyi değiştirmez.

Davetiye bağlantısı `/e/:publicToken`, paylaşım bilgilerini [Open Graph](https://ogp.me/) meta etiketleriyle sunucu tarafında sunar. Mevcut veritabanına paylaşım sütunları uygulama başlatılırken eklenir. Paylaşım uygulamaları eski kartı önbellekte tutabildiğinden değişiklikler her uygulamada hemen görünmeyebilir.

## Doğrulama

`node --test tests/design-experience.test.js` komutu geçici bir veritabanıyla müzik yüklemeyi, erişim denetimini, taslak/kayıt ayrımını, fontları ve mevcut veritabanına yeni sütunların eklenmesini sınar. Gerçek etkinlik verisini değiştirmez.
