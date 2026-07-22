/// Ilova sozlamalari. Backend — mavjud Node/Express serveri (o'zgarmaydi).
abstract class AppConfig {
  /// Ishlab chiqarish backendi. Kerak bo'lsa o'zingiznikiga almashtiring.
  /// Lokal test uchun: Android emulyatorda http://10.0.2.2:3000
  static const String apiBaseUrl = 'https://lalaku-production.up.railway.app';

  static const String appName = 'AlbaFit';
}
