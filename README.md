# Wedding

## Davetiye tasarımı

Yönetim panelindeki **Tasarım Düzenleyici** ekranı, ayarları ve canlı davetiye önizlemesini yan yana gösterir. Telefonda önizleme üstte, ayarlar altta kalır. Tema, renkler, yazı tipleri, amblem, görsel, program ve form seçenekleri kaydetmeden görüntülenir. **İptal** taslağı bırakır; **Tasarımı Kaydet** değişiklikleri yayımlar. **Telefon** dar ekran önizlemesini, **Zarfı dene** açılış animasyonunu gösterir.

**Davetiye Müziği** bölümüne bilgisayarınızdaki MP3, WAV veya OGG dosyasını yükleyebilirsiniz (en fazla 20 MB). Varsayılan ses düzeyi %15'tir. Müzik zarf açma dokunuşuyla başlar ve tekrar eder. Misafir müziği durdurup yeniden başlatabilir. Bazı mobil tarayıcılarda ses düzeyini cihazın ses ayarı belirler.

Libra Serif Modern projeye lisansıyla birlikte eklenmiştir. Sloop Script Pro seçeneğinin etkinleşmesi için kendi sunucunuzda kullanıma uygun lisanslı font dosyası gerekir; kurulum ayrıntıları [font açıklamasında](public/fonts/README.md) bulunur.

## Doğrulama

`node --test tests/design-experience.test.js` komutu geçici bir veritabanıyla müzik yüklemeyi, erişim denetimini, taslak/kayıt ayrımını, fontları ve mevcut veritabanına yeni sütunların eklenmesini sınar. Gerçek etkinlik verisini değiştirmez.
