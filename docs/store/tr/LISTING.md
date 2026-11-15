# Türkçe mağaza bilgileri — Kagemura: Ninja Clans

App Store ve Google Play (tr-TR) için hazırlanan metin; oyundakiyle aynı dil ve terimleri kullanır (`locales/tr/TERMS.md`). Fiyatları ve satın alma ekranlarını her mağaza kendisi gösterir. Mağaza bilgilerini ve ekran görüntülerini yüklemek yayın sırasında yapılır, yerel derlemenin parçası değildir. Bu metin henüz hiçbir mağazanın paneline gönderilmedi ve anadili Türkçe olan biri tarafından gözden geçirilmedi.

- Ad: **Kagemura: Ninja Clans**
- App Store alt başlığı: **Dağlarda gizli bir ninja köyü**
- Google Play kısa açıklaması: **Gizli köyünü kur, ninja savaşçıları eğit, rakip klanlara baskın yap**
- Tanıtım metni: **Klanını bitmeyen Gölge Sınavları'nda zirveye taşı. Duman, sabotaj ve iyi bir plan kaba gücü yener.**
- Anahtar kelimeler: `ninja,shinobi,klan,köy,strateji,baskın,savunma,kule,kale,savaş,ittifak,duman bombası`

## Açıklama

Bir ninja klanına liderlik et: dağlarda gizli bir köy kur, elli çeşit savaşçı eğit, rakiplerini keşfet ve onlara duman ve sabotajla baskın yap.

**Gizli köyünü kur**

- Klan Kalesi'ni 1. seviyeden 15. seviyeye yükselterek yeni binaların, surların ve savunmaların kilidini aç.
- Her binanın kendi görevi var: Sikke Darphanesi, Teras Tarlası, Hazine, Eğitim Dojosu, kuleler ve tuzaklar.
- Savunmalarını, baskıncılar içlerinden geçmek zorunda kalacak şekilde yerleştir.

**Elli çeşit savaşçı eğit**

- Shinobi ve Kunai Ustası'ndan Uçurtma Baskıncısı, Sabotajcı ve Kuşatma Topçusu'na kadar her birinin kendi rolü var.
- Eğitim Dojosu'ndaki araştırmalar her savaşçıyı güçlendirir.

**Planla, sonra baskın yap**

- Savaşçılar yalnızca Sızma Noktaları'ndan girebilir. Yolları ve onları koruyan kuleleri keşfet.
- Savaşçıların kule menziline girerken Duman Bombası at, bir savunmayı kilitlemek için Sabotajcı gönder.
- İyi planlanmış bir saldırı daha büyük bir orduyu yener.

**Birlikte oyna** (çevrim içi)

- Bir İttifak'a katıl: sohbet et, savaşçı iste ve klan arkadaşlarına savaşçı gönder.
- Her hafta İttifak Savaşı'nda çarpış.
- Arkadaş ekle, onlara Dostluk Düellosu teklif et ve en fazla 4 kişilik Çeteler kurup Çete Savaşı'na katıl.
- Şeref liglerinde ve Güç Sıralaması'nda yüksel.

**Gölge Sınavları**

- Bitmeyen bir kaleler dizisi. Her kat daha zordur ve ödülünü yalnızca bir kez verir.

**Adil oyun**

- Açmadan önce olasılıklarını gösteren ücretsiz günlük sandık; rastgele hiçbir şey satılmaz.
- Bilgisayar üretimi rakipler her zaman açıkça belirtilir.
- 18 yaşından küçük oyuncular için harcama sınırı; yalnızca senin seçtiğin hatırlatmalar var ve sen açana kadar kapalı kalırlar.

Kagemura'yı indirmek ve oynamak ücretsizdir. Her bina, savaşçı, Kale seviyesi ve oyun modu ödeme yapmadan açılabilir ve reklam yoktur. Premium para birimi Yeşim, oynayarak azar azar kazanılır (başarımlar, ligler, günlük sandık ve Sezon Parşömeni'nin ücretsiz yolu) ve satın da alınabilir. Bazı şeyler yalnızca gerçek parayla satılır: Sezon Parşömeni'nin premium yolu (ek ödüller, sezon boyunca daha hızlı inşa ve "Fener Şenliği" Kale görünümü) ve süreli Yeşim ve kaynak paketleri.

## Yayın bağlantıları

Yayımlanan oyunun adresini kullan ve sonuna `/tr/support.html`, `/tr/privacy.html` ve `/tr/community.html` ekle. Sunucunun formu `/account/delete?lang=tr` adresini destekler. Japonya'nın yasal sayfalarının Türkçe çevirileri `/tr/tokushoho.html` ve `/tr/shikin-kessai.html` adreslerindedir. Hizmet koşulları ve yasal sayfalar, işletmeci bilgilerini doldurup yürürlüğe koyana kadar taslak olarak kalır. Yayın kuralları [RELEASE.md](../RELEASE.md) dosyasındadır.

## Sürüm notları

Kagemura artık Türkçe. Ekranlar, eğitim, binalar, savaşçılar, savaşlar, bildirimler ve yardım sayfaları Türkçe görünür. Dili Ayarlar → Dil bölümünden değiştirebilirsin. Köyün ve oyuncu adın aynı kalır.

Türkçe ekran görüntüleri: `npm run build && npm run store:screenshots -- --language=tr` (Playwright, Chromium ve Türkçe harfleri (ğ, ı, ş, İ) içeren bir yazı tipi gerekir; programı `CHROMIUM_PATH` ile belirtebilirsin)
