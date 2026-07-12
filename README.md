# ⏱ LaLaKu Vaqt — ish vaqti va moliya SaaS platformasi

Koreyada ishlaydiganlar uchun: ish vaqtini hisoblash, jonli maosh hisobi (soliq ayrilgan holda),
qarz-chiqimlar nazorati va oshxonalar uchun jamoa boshqaruvi. 10 tilda: o'zbek / English / Русский / 한국어 / Tiếng Việt / မြန်မာ / हिन्दी / 中文 / Қазақша / Кыргызча. Valyutani jonli aylantirish (KRW→USD/UZS/...).

## Akkaunt turlari

**👷 Ishchi — ₩990/oy** (15 kun bepul sinov)
- QR skanerlash (jamoada bo'lsa) yoki qo'lda «boshladim/tugatdim» tugmasi
- Bir nechta ish joyi (har biriga alohida stavka) — 2-3 joyda ishlaydiganlar uchun
- Soatlik **yoki kunlik** maosh + soliq foizi → oylik daromad jonli hisoblanadi
- 💳 Moliya: qarzlar, doimiy chiqimlar (uy, sug'urta...), qo'shimcha daromadlar —
  muddat eslatmalari va «oy oxirida qancha qoladi» hisobi
- 🔮 Oylik prognoz: taxminiy kun/soat kiritib bo'lajak maoshni ko'rish
- 📋 Ish vaqtlari ro'yxatini nusxalash (boshliqqa SMS orqali yuborish uchun)
- Oylik kalendar, tungi smena (17:30→01:00) to'g'ri hisoblanadi

**🍽 Oshxona / Biznes — ₩2 900/oy** (15 kun bepul sinov)
- Filiallar, har biriga chop etiladigan QR kod
- 🔗 **Taklif havolasi**: ishchiga yuborasiz → u ro'yxatdan o'tib jamoaga qo'shiladi
- Davomat usuli tanlovi: QR skaner yoki oddiy tugma; GPS tekshiruvi (ish joyidan
  50 m uzoqdan belgilash qabul qilinmaydi — filial joylashuvi saqlansa)
- Har ishchiga stavka belgilab, kim qancha ishlagani va daromadini ko'rish
- Jamoani boshqarish: chiqarish, vaqtlarini tahrirlash, qo'lda yozuv qo'shish
- Bugungi jonli davomat va oylik jadval (barcha ishchilar × kunlar, jami soatlar)

Mavzu ranglari: Klassik / KakaoTalk (sariq, minimalist) / Mint / Tungi (dark).

## To'lov tizimi

Foydalanuvchi 토스뱅크 (Toss Bank) **1000-8922-1696** hisobiga o'tkazma qiladi,
ilovada skrinshot yoki to'lov havolasini yuboradi. Platforma egasi **admin panelda**
to'lovni ko'rib chiqib tasdiqlaydi — obuna +30 kunga uzayadi.

Admin panel: bosh sahifadagi «Platforma admini» tugmasi, parol — `ADMIN_PASSWORD` env.
U yerda: kutilayotgan to'lovlar (chek rasmi bilan), foydalanuvchilar ro'yxati,
qo'lda muddat qo'shish (+30/+365 kun) yoki o'chirish.

## Railway'ga o'rnatish

1. Railway'da yangi loyiha → bu GitHub repo'ni ulang
2. `+ New` → `Database` → **PostgreSQL**
3. Ilova servisiga env:
   - `DATABASE_URL` → `${{Postgres.DATABASE_URL}}`
   - `ADMIN_PASSWORD` → platforma admin paroli (siz uchun)
   - `NODE_ENV` → `production`
4. `Settings` → `Networking` → `Generate Domain`

> Standart vaqt zonasi — `Asia/Seoul`. Har bir foydalanuvchi profilida o'zi o'zgartira oladi.

## APK / telefon ilovasi

PWA: Chrome'da ochib «Bosh ekranga qo'shish» — ilova kabi o'rnatiladi.
Haqiqiy APK kerak bo'lsa: [PWABuilder](https://www.pwabuilder.com) ga domenni kiriting.

## Texnologiyalar

- Node.js + Express + PostgreSQL (`pg`)
- Vanilla JS SPA + PWA, jsQR (kamera skaneri), `qrcode` (QR yaratish)
- bcrypt parollar, HMAC-imzoli sessiya cookie, login rate-limit
- Vaqtlar UTC'da saqlanadi, har bir foydalanuvchining o'z vaqt zonasida ko'rsatiladi
- Eski (v1) versiya ma'lumotlari avtomatik ko'chiriladi: ishchilar
  `ism.familiya@lalaku.local` email bilan akkauntga aylanadi (parollari o'sha-o'sha)

## Lokal ishga tushirish

```bash
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/lalaku npm start
# http://localhost:3000
```
