# Türkçe mağaza metinleri — Kagemura: Ninja Clans

App Store ve Google Play için hazırlanan metinler (tr-TR); oyundaki dil ve terimlerle aynı (`locales/tr/TERMS.md`), oyundaki gibi samimi "sen" hitabıyla (hukuki sayfalar "siz" kullanır). Fiyatları ve satın alma ekranlarını her mağaza kendisi gösterir. Mağaza metinlerini ve ekran görüntülerini yüklemek yayın adımıdır, yerel derlemenin parçası değildir. Bu metinler henüz hiçbir mağaza paneline gönderilmedi ve anadili Türkçe olan biri tarafından gözden geçirilmedi.

- Ad: **Kagemura: Ninja Clans**
- App Store alt başlığı: **Dağlarda gizli bir ninja köyü**
- Google Play kısa açıklaması: **Gizli bir dağ köyü kur, ninja savaşçıları eğit, rakip klanlara baskın yap**
- Tanıtım metni: **Klanını Gölge Sınavları'nda, bitmeyen kale merdiveninde yönet. Duman, sabotaj ve iyi bir plan kaba kuvveti yener.**
- Anahtar kelimeler: `ninja,shinobi,klan,köy,strateji,baskın,savunma,kule,kale,savaş,ittifak,duman bombası`

## Açıklama

Bir ninja klanına liderlik et. Dağlarda gizli bir köy kur, elli çeşit savaşçı eğit, rakiplerini keşfet ve duman ile sabotajla baskın yap.

**Gizli köyünü kur**

- Klan Kalesi'ni 1. seviyeden 15. seviyeye yükselt; yeni binalar, duvarlar ve savunmalar aç.
- Her binanın bir görevi var: Sikke Darphanesi, Teras Tarlası, Hazine, Eğitim Dojosu, kuleler ve tuzaklar.
- Savunmalarını, akıncılar içlerinden geçmek zorunda kalacak şekilde yerleştir.

**Elli savaşçı eğit**

- Shinobi ve kunai atıcılardan Uçurtma Akıncılarına, Sabotajcılara ve Kuşatma Topçularına kadar her birinin kendi rolü var.
- Eğitim Dojosu'ndaki araştırmalar her savaşçıyı güçlendirir.

**Planlı baskın**

- Savaşçılar üsse yalnızca Sızma noktalarından girer: yolları ve onları koruyan kuleleri önceden keşfet.
- Savaşçıların kule menziline girerken Duman Bombası at, bir savunmayı kilitlemek için Sabotajcı gönder.
- Planlı bir saldırı büyük bir saldırıyı yener.

**Birlikte oyna** (çevrimiçi)

- Bir İttifaka katıl: sohbet et, savaşçı iste ve klan arkadaşlarına savaşçı gönder.
- Her hafta İttifak Savaşında çarpış.
- Arkadaş ekle, onlara Dostluk Düellosu teklif et ve Çete Savaşı için en fazla dört kişilik Çeteler kur.
- Onur liglerinde ve Güç sıralamasında yüksel.

**Gölge Sınavları**

- Bitmeyen bir kale merdiveni. Her kademe ödülünü yalnızca bir kez verir ve giderek zorlaşır.

**Adil oyun**

- Ücretsiz günlük sandık; açmadan önce olasılıkları gösterilir. Rastgele hiçbir şey satılmaz.
- Bilgisayarın oluşturduğu rakipler her zaman öyle etiketlenir.
- 18 yaş altı oyuncular için harcama sınırı ve yalnızca senin seçtiğin hatırlatmalar (sen açana kadar kapalı).

Kagemura'yı indirmek ve oynamak ücretsizdir: her bina, savaşçı, Kale seviyesi ve oyun modu ödeme yapmadan açılabilir, reklam yoktur. Premium para birimi Yeşim, oynayarak azar azar kazanılır (başarımlar, ligler, günlük sandık ve Sezon Parşömeni'nin ücretsiz yolu) ve satın da alınabilir. Bazı şeyler yalnızca gerçek parayla satılır: Sezon Parşömeni'nin premium yolu (ek ödüller, sezon boyunca daha hızlı inşa ve "Fener Şenliği" Kale görünümü) ve süreli Yeşim ve kaynak paketleri.

## Yayın bağlantıları

Yayımlanan oyun adresine `/tr/support.html`, `/tr/privacy.html` ve `/tr/community.html` ekleyerek kullan. Sunucu formu `/account/delete?lang=tr` adresini destekler. Japon yasal sayfalarının Türkçe çevirisi `/tr/tokushoho.html` ve `/tr/shikin-kessai.html` adresindedir. Hizmet şartları ve yasal sayfalar, yayıncı bilgilerini doldurup yürürlüğe koyana kadar taslak kalır. Yayın kuralları [RELEASE.md](../RELEASE.md) dosyasındadır.

## Sürüm notları

Kagemura artık Türkçe. Ekranlar, eğitim, binalar, savaşçılar, savaşlar, bildirimler ve yardım sayfaları Türkçe. Dili Ayarlar → Dil bölümünden değiştirebilirsin. Köyün ve oyuncu adları aynı kalır.

Türkçe ekran görüntüleri: `npm run build && npm run store:screenshots -- --language=tr` (Playwright, Chromium ve ğ ş İ harflerini içeren bir yazı tipi gerekir; program `CHROMIUM_PATH` ile belirtilebilir).
