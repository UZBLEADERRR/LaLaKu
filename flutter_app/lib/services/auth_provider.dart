import 'package:flutter/foundation.dart';

import '../models.dart';
import 'api_client.dart';

/// Global holat: kirish/chiqish va joriy foydalanuvchi.
class AuthProvider extends ChangeNotifier {
  final ApiClient api = ApiClient();

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

  Future<void> login(String phone, String birthdate) async {
    me = await api.login(phone: phone, birthdate: birthdate);
    notifyListeners();
  }

  Future<void> register(String name, String phone, String birthdate) async {
    me = await api.register(name: name, phone: phone, birthdate: birthdate);
    notifyListeners();
  }

  Future<void> logout() async {
    await api.logout();
    me = null;
    notifyListeners();
  }
}
