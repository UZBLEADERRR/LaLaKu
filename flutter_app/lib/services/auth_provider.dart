import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models.dart';
import 'api_client.dart';

/// Global holat: kirish/chiqish, joriy foydalanuvchi va bir nechta akkaunt.
class AuthProvider extends ChangeNotifier {
  final ApiClient api;
  AuthProvider(this.api);

  Me? me;
  bool loading = true;

  /// Saqlangan akkauntlar: [{id, name, type, token}]
  List<Map<String, dynamic>> accounts = [];
  int activeIndex = 0;

  Future<void> _loadAccounts() async {
    final sp = await SharedPreferences.getInstance();
    try {
      final raw = sp.getString('accounts');
      accounts = raw == null ? [] : (jsonDecode(raw) as List).map((e) => (e as Map).cast<String, dynamic>()).toList();
    } catch (_) {
      accounts = [];
    }
    activeIndex = sp.getInt('active_account') ?? 0;
    if (activeIndex >= accounts.length) activeIndex = 0;
  }

  Future<void> _saveAccounts() async {
    final sp = await SharedPreferences.getInstance();
    await sp.setString('accounts', jsonEncode(accounts));
    await sp.setInt('active_account', activeIndex);
  }

  /// Kirish/ro'yxatdan keyin joriy akkauntni saqlaydi.
  Future<void> _upsertActive(Me m) async {
    final entry = {'id': m.id, 'name': m.name, 'type': m.type, 'token': api.token};
    final i = accounts.indexWhere((a) => a['id'] == m.id);
    if (i >= 0) {
      accounts[i] = entry;
      activeIndex = i;
    } else {
      accounts.add(entry);
      activeIndex = accounts.length - 1;
    }
    await _saveAccounts();
  }

  Future<void> bootstrap() async {
    await api.loadToken();
    await _loadAccounts();
    if (api.isLoggedIn) {
      try {
        me = await api.me();
        if (me != null) await _upsertActive(me!);
      } catch (_) {
        me = null;
      }
    }
    loading = false;
    notifyListeners();
  }

  Future<void> login({required String phone, String? birthdate, String? password}) async {
    me = await api.login(phone: phone, birthdate: birthdate, password: password);
    await _upsertActive(me!);
    notifyListeners();
  }

  Future<void> register({required String name, required String phone, required String birthdate, String? password}) async {
    me = await api.register(name: name, phone: phone, birthdate: birthdate, password: password);
    await _upsertActive(me!);
    notifyListeners();
  }

  /// Boshqa saqlangan akkauntga o'tish.
  Future<void> switchAccount(int i) async {
    if (i < 0 || i >= accounts.length) return;
    activeIndex = i;
    await api.setToken(accounts[i]['token'] as String?);
    await _saveAccounts();
    loading = true;
    notifyListeners();
    try {
      me = await api.me();
    } catch (_) {
      me = null;
    }
    loading = false;
    notifyListeners();
  }

  /// Yangi akkaunt qo'shish uchun — joriy sessiyani tark etmasdan login ekraniga.
  /// (LoginScreen'da yangi kirish yangi akkauntni qo'shadi.)
  void addAccountFlow() {
    me = null; // login ekraniga o'tkazadi; kirilgach _upsertActive yangi akkaunt qo'shadi
    notifyListeners();
  }

  Future<void> logout() async {
    await api.logout();
    // Joriy akkauntni ro'yxatdan olib tashlaymiz
    if (activeIndex < accounts.length) accounts.removeAt(activeIndex);
    activeIndex = 0;
    await _saveAccounts();
    if (accounts.isNotEmpty) {
      // Boshqa akkaunt qolgan bo'lsa — unga o'tamiz
      await api.setToken(accounts[0]['token'] as String?);
      try {
        me = await api.me();
      } catch (_) {
        me = null;
      }
    } else {
      me = null;
    }
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
