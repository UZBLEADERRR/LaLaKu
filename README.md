# ⏱ LaLaKu Vaqt — QR kod orqali ish vaqtini hisoblash

Ishchilar ishga kelganda va ketganda QR kodni skanerlaydi — vaqt minutigacha avtomatik yoziladi.
Oylik kalendarda har bir kun va jami ishlangan soatlar ko'rinib turadi.

## Imkoniyatlar

**Ishchi uchun:**
- Ismini tanlab, parol bilan kiradi
- «Ishga keldim» → QR skanerlash → kelish vaqti yoziladi
- «Ketish» → QR skanerlash → ketish vaqti yoziladi (tungi smena ham ishlaydi)
- Oylik kalendar: har kun necha soat ishlagani, oy jami
- Soatlik maosh va soliq foizini kiritib, oylik daromadni avtomatik hisoblash
- Til tanlash: o'zbek / ingliz / koreys
- Telefonga ilova sifatida o'rnatiladi (PWA)

**Admin uchun:**
- Ishchilarni qo'shish, parol berish/almashtirish, nofaol qilish, o'chirish
- Oylik kalendar: **barcha ishchilar × kunlar** jadvali, har birining jami soati, umumiy soat
- Katakni bosib kun tafsilotini ko'rish, vaqtni tahrirlash, qo'lda yozuv qo'shish (skaner unutilgan kunlar uchun)
- Ish joyi QR kodini chop etish va yangilash

## Railway'ga o'rnatish

1. Railway'da yangi loyiha yarating va bu GitHub repo'ni ulang
2. **PostgreSQL** qo'shing: `+ New` → `Database` → `PostgreSQL`
3. Ilova servisiga env o'zgaruvchilar qo'shing:
   - `DATABASE_URL` → `${{Postgres.DATABASE_URL}}` (Railway reference)
   - `ADMIN_PASSWORD` → o'zingizning maxfiy admin parolingiz
   - `NODE_ENV` → `production`
   - Vaqt zonasi admin paneldagi «Sozlamalar» bo'limidan tanlanadi (masalan Asia/Seoul)
4. Deploy bo'lgach, domen oching: `Settings` → `Networking` → `Generate Domain`

> Kamera (QR skaner) faqat HTTPS'da ishlaydi — Railway domenlari avtomatik HTTPS bo'ladi.

## Birinchi ishga tushirish

1. Saytga kiring → «Admin panelga kirish» → admin parol bilan kiring
2. «Ishchilar» bo'limida ishchilarni qo'shing (ism + parol)
3. «QR kod» bo'limida QR kodni chop etib, ish joyiga osing
4. Ishchi telefonida saytni ochadi → ismini tanlaydi → parolini kiritadi → QR skanerlaydi

## APK (Android ilova)

Ilova PWA — Android'da Chrome orqali ochib **«Bosh ekranga qo'shish»** deyilsa, oddiy ilova kabi o'rnatiladi va ishlaydi.

Haqiqiy APK fayl kerak bo'lsa (masalan Play Store uchun), [PWABuilder](https://www.pwabuilder.com) saytiga
Railway domeningizni kiriting — u tayyor APK yasab beradi (ilova PWA talablariga to'liq mos: manifest, service worker, ikonkalar bor).

## Lokal ishga tushirish

```bash
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/lalaku npm start
# http://localhost:3000
```

## Texnologiyalar

- **Backend:** Node.js + Express + PostgreSQL (`pg`)
- **Frontend:** vanilla JS SPA, PWA (service worker, manifest)
- **QR skaner:** jsQR (kamera orqali, kutubxona lokal joylashgan)
- **QR yaratish:** `qrcode` (server tomonda)
- Parollar `bcrypt` bilan xeshlanadi, sessiyalar HMAC-imzoli cookie'da
- Vaqtlar UTC'da saqlanadi, `Asia/Tashkent` bo'yicha ko'rsatiladi
