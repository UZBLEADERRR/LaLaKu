# AlbaFit — Flutter ilova (iOS + Android)

**AlbaFit** — part-time ishchilar uchun ish vaqti va maosh menejeri. Backend
sifatida loyihaning mavjud Node/Express serveri ishlatiladi (o'zgarmaydi).
Professional dizayn tizimi, jonli maosh hisoblagichi, AI moliyaviy yordamchi,
grafiklar va Google Play obunasi bilan.

## APK yasash (Android) — qadamma-qadam

```bash
# 1) Flutter SDK + Android Studio o'rnatilgan bo'lsin
flutter doctor            # hammasi ✓ bo'lsin
flutter doctor --android-licenses   # "y"

# 2) Repo va platforma papkalarini yaratish (android/ bu repo'da yo'q)
cd flutter_app
flutter create . --org com.albafit --project-name albafit

# 3) android/app/src/main/AndroidManifest.xml sozlash (pastdagi "Bildirishnomalar" bo'limi)

# 4) Backend manzili: lib/config.dart -> apiBaseUrl (Railway URL)
flutter pub get

# 5) Test / APK
flutter run                       # ulangan telefon yoki emulyatorda
flutter build apk --release       # -> build/app/outputs/flutter-apk/app-release.apk
```

> iOS build faqat macOS + Xcode'da. Store premium uchun Apple/Google developer
> akkaunti va native billing kerak (pastda).

## Bildirishnomalar (AndroidManifest.xml)

`flutter create` dan keyin `android/app/src/main/AndroidManifest.xml` da
`<manifest>` ichiga, `<application>` dan **oldin** quyidagilarni qo'shing:

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
```

`<application>` ichiga (rejalashtirilgan eslatmalar reboot'dan keyin ham ishlashi uchun):

```xml
<receiver android:exported="false" android:name="com.dexterous.flutterlocalnotifications.ScheduledNotificationBootReceiver">
  <intent-filter>
    <action android:name="android.intent.action.BOOT_COMPLETED"/>
  </intent-filter>
</receiver>
```

AI ekranidagi "Kunlik maslahat bildirishnomasi" tugmasi ruxsat so'raydi va har
kuni eng muhim moliyaviy maslahatni bildirishnoma qilib yuboradi.

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
| Shift start/stop + ish joyi tanlash | ✅ bor | `dashboard_screen.dart` + `api.punch` |
| Break timer (tanaffus)           | ✅ bor | `dashboard_screen.dart` (lokal state) |
| Skeleton loading + animatsiya    | ✅ bor | `widgets/ui.dart` |
| AI moliyaviy yordamchi ekrani    | ✅ bor | `assistant_screen.dart` + `/api/ai/advice` |
| Lokal bildirishnomalar           | ✅ bor | `notification_service.dart` (kunlik AI maslahati) |
| Heatmap kalendar + kun BottomSheet | ✅ bor | `calendar_screen.dart` (worked/salary/izoh) |
| Pastki navbar (5 tab)            | ✅ bor | `app_shell.dart` |
| Finance donut grafik + breakdown | ✅ bor | `finance_screen.dart` + `fl_chart` |
| Maqsadlar (Goals, progress)      | ✅ bor | `finance_screen.dart` |
| Kun izohlari (Notes)             | ✅ bor | `calendar_screen.dart` |
| Monthly prediction / Overtime / Tax | ⬜ TODO | analytics ekrani |
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
