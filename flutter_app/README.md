# AlbaFit — Flutter ilova (skeleton)

Bu — **AlbaFit** ilovasining Flutter (iOS + Android) skeletoni. Backend sifatida
loyihaning mavjud Node/Express serveri ishlatiladi (o'zgarmaydi). Bu skeleton
**dizayn tizimi + arxitektura + asosiy ekranlarni** o'z ichiga oladi; qolgan
funksiyalar bosqichma-bosqich to'ldiriladi.

> Eslatma: iOS build faqat macOS + Xcode'da bo'ladi. Store'da premium (obuna)
> uchun Apple/Google developer akkauntlari va native billing kerak (pastda).

## Ishga tushirish

```bash
# 1) Flutter SDK o'rnatilgan bo'lsin (>=3.19)
flutter --version

# 2) Platforma papkalarini yaratish (android/ios/web) — bu repo'da yo'q:
cd flutter_app
flutter create .

# 3) Paketlar
flutter pub get

# 4) Backend manzilini sozlash: lib/config.dart -> apiBaseUrl
#    (Android emulyatorda lokal server: http://10.0.2.2:3000)

# 5) Ishga tushirish
flutter run
```

## Dizayn tizimi (spetsifikatsiya)

`lib/theme/app_colors.dart` va `lib/theme/app_theme.dart`:

| Token            | Rang      |
|------------------|-----------|
| Background       | #0F1117   |
| Surface          | #171A22   |
| Primary (accent) | #7C5CFF   |
| Success          | #24D17E   |
| Danger           | #FF5C7A   |
| Warning          | #FFB547   |
| Text primary     | #FFFFFF   |
| Text secondary   | #A2A8B5   |

- Radius 24px (kartalar), 16px (tugma/input)
- 8px spacing tizimi (`Gap` — `lib/theme/app_theme.dart`)
- Yumshoq soyalar, glassmorphismsiz, bitta accent — Linear/Revolut uslubi
- Material 3, dark

## Struktura

```
lib/
  config.dart                 # apiBaseUrl, ilova nomi
  main.dart                   # kirish nuqtasi + tema + routing
  app_shell.dart              # pastki NavigationBar (Home/Calendar/Finance/Profile)
  models.dart                 # Me, WorkStatus, Workplace, MonthSummary
  theme/
    app_colors.dart           # palitra
    app_theme.dart            # Material 3 dark tema + Gap (spacing)
  services/
    api_client.dart           # backend API (Bearer token)
    auth_provider.dart        # ChangeNotifier holat (login/me/logout)
  widgets/
    ui.dart                   # AppCard, StatTile, Label, fmtWon/fmtHm
  screens/
    login_screen.dart         # telefon + tug'ilgan kun
    dashboard_screen.dart     # ✅ jonli maosh hisoblagichi (har sekund)
    calendar_screen.dart      # ✅ heatmap kalendar + BottomSheet
    finance_screen.dart       # skeleton (grafiklar keyin)
    profile_screen.dart       # bo'limlarga ajratilgan
```

## Backend API (mavjud server)

Autentifikatsiya: `/api/login` (yoki `/api/register`) javobidagi `token` —
`Authorization: Bearer <token>` sifatida yuboriladi. Ishlatilayotgan endpointlar:

- `POST /api/login` `{ phone, birthdate }`
- `POST /api/register` `{ name, phone, birthdate, type }`
- `GET /api/me`, `GET /api/my/status`, `GET /api/my/summary?year=&month=`, `GET /api/jobs`
- `POST /api/punch` `{ jobId | orgId | (bo'sh=checkout) }`

## Funksiyalar → fayllar (yo'l xaritasi)

| Funksiya                         | Holat  | Qayerda |
|----------------------------------|--------|---------|
| Jonli maosh hisoblagichi         | ✅ bor | `dashboard_screen.dart` (Timer.periodic) |
| Shift start/stop                 | ✅ bor | `dashboard_screen.dart` + `api.punch` |
| Heatmap kalendar + BottomSheet   | ✅ bor | `calendar_screen.dart` |
| Pastki navbar                    | ✅ bor | `app_shell.dart` |
| Break timer                      | ⬜ TODO | yangi ekran + lokal state |
| Monthly prediction / Overtime / Tax | ⬜ TODO | dashboard/analytics hisob-kitob |
| Finance grafiklari (donut/bar)   | ⬜ TODO | `finance_screen.dart` + `fl_chart` |
| Goals / Statistics / Analytics   | ⬜ TODO | yangi ekranlar |
| Export (PDF/Excel/Image)         | ⬜ TODO | `printing` / `pdf` paketlari |
| Push/lokal eslatmalar + haptika  | ⬜ TODO | `flutter_local_notifications`, `HapticFeedback` |
| Home widget                      | ⬜ TODO | `home_widget` |
| Google Drive backup              | ⬜ TODO | `google_sign_in` + Drive API |
| **Premium (Play/App Store)**     | ⬜ TODO | `in_app_purchase` — pastga qarang |

## Premium (Google Play / App Store)

Store obunasi native billing orqali bo'ladi:

1. `in_app_purchase` paketini qo'shing.
2. Play Console / App Store Connect'da obuna mahsulotlarini yarating
   (masalan `albafit_premium_monthly`).
3. Xaridni tekshirish uchun backendda endpoint qo'shing (server-side receipt
   validation) va foydalanuvchining `paid_until`/premium holatini yangilang.
4. Ilovada premium ekran/paywall'ni shu holatga bog'lang.

Hozirgi veb ilovadagi "Premium yoqish/o'chirish" admin sozlamasi shu holatni
boshqarish uchun ishlatilishi mumkin.
