import 'package:flutter/foundation.dart';

import '../models.dart';
import 'api_client.dart';

/// Global holat: kirish/chiqish va joriy foydalanuvchi.
class AuthProvider extends ChangeNotifier {
  final ApiClient api;
  AuthProvider(this.api);

  Me? me;
  bool loading = true;

  Future<void> bootstrap() async {
    await api.loadToken();
    if (api.isLoggedIn) {
      try {
        me = await api.me();
      } catch (_) {
        me = null;
      }
    }
    loading = false;
    notifyListeners();
  }

  Future<void> login({required String phone, String? birthdate, String? password}) async {
    me = await api.login(phone: phone, birthdate: birthdate, password: password);
    notifyListeners();
  }

  Future<void> register({required String name, required String phone, required String birthdate, String? password}) async {
    me = await api.register(name: name, phone: phone, birthdate: birthdate, password: password);
    notifyListeners();
  }

  Future<void> logout() async {
    await api.logout();
    me = null;
    notifyListeners();
  }

  /// /api/me ni qayta yuklaydi (masalan, premium yoqilgandan keyin).
  Future<void> refresh() async {
    try {
      me = await api.me();
      notifyListeners();
    } catch (_) {}
  }
}
