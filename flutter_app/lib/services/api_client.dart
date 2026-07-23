import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import '../models.dart';

class ApiException implements Exception {
  final String message;
  final String? code;
  ApiException(this.message, [this.code]);
  @override
  String toString() => message;
}

/// Mavjud backend bilan ishlaydigan klient.
/// Autentifikatsiya: login/register javobidagi `token` — `Authorization: Bearer` sifatida yuboriladi.
class ApiClient {
  String? _token;
  String? _baseUrl; // sozlamalardan (bo'lmasa AppConfig)

  String get baseUrl => _baseUrl ?? AppConfig.apiBaseUrl;

  Future<void> loadToken() async {
    final sp = await SharedPreferences.getInstance();
    _token = sp.getString('token');
    final saved = sp.getString('server_url');
    if (saved != null && saved.trim().isNotEmpty) _baseUrl = saved.trim();
  }

  Future<void> setBaseUrl(String url) async {
    final clean = url.trim().replaceAll(RegExp(r'/+$'), '');
    _baseUrl = clean.isEmpty ? null : clean;
    final sp = await SharedPreferences.getInstance();
    if (_baseUrl == null) {
      await sp.remove('server_url');
    } else {
      await sp.setString('server_url', _baseUrl!);
    }
  }

  bool get isLoggedIn => _token != null;

  Future<void> _saveToken(String? t) async {
    _token = t;
    final sp = await SharedPreferences.getInstance();
    if (t == null) {
      await sp.remove('token');
    } else {
      await sp.setString('token', t);
    }
  }

  Uri _u(String path) => Uri.parse('$baseUrl$path');

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  dynamic _parse(http.Response r) {
    final body = r.body.isEmpty ? null : jsonDecode(r.body);
    if (r.statusCode >= 400) {
      final m = body is Map ? body : const {};
      throw ApiException((m['error'] ?? 'Xatolik') as String, m['code'] as String?);
    }
    return body;
  }

  Future<Map<String, dynamic>> _get(String path) async =>
      (_parse(await http.get(_u(path), headers: _headers)) as Map).cast<String, dynamic>();

  Future<List<dynamic>> _getList(String path) async =>
      (_parse(await http.get(_u(path), headers: _headers)) as List);

  Future<Map<String, dynamic>> _post(String path, [Map<String, dynamic>? body]) async =>
      (_parse(await http.post(_u(path), headers: _headers, body: jsonEncode(body ?? {})) ) as Map).cast<String, dynamic>();

  Future<Map<String, dynamic>> _put(String path, [Map<String, dynamic>? body]) async =>
      (_parse(await http.put(_u(path), headers: _headers, body: jsonEncode(body ?? {})) ) as Map).cast<String, dynamic>();

  Future<void> _delete(String path) async => _parse(await http.delete(_u(path), headers: _headers));

  // ---- Auth ----
  /// Akkaunt bor-yo'qligini tekshirish: {exists, hasPassword, name}
  Future<Map<String, dynamic>> lookup(String phone) => _post('/api/auth/lookup', {'phone': phone});

  Future<Me> login({required String phone, String? birthdate, String? password}) async {
    final j = await _post('/api/login', {
      'phone': phone,
      if (birthdate != null && birthdate.isNotEmpty) 'birthdate': birthdate,
      if (password != null && password.isNotEmpty) 'password': password,
    });
    await _saveToken(j['token'] as String?);
    return Me.fromJson(j);
  }

  Future<Me> register({
    required String name,
    required String phone,
    required String birthdate,
    String type = 'worker',
    String? businessName,
    String? password,
  }) async {
    final j = await _post('/api/register', {
      'name': name,
      'phone': phone,
      'birthdate': birthdate,
      'type': type,
      if (businessName != null) 'businessName': businessName,
      if (password != null && password.isNotEmpty) 'password': password,
    });
    await _saveToken(j['token'] as String?);
    return Me.fromJson(j);
  }

  Future<void> logout() async {
    try {
      await _post('/api/logout');
    } catch (_) {}
    await _saveToken(null);
  }

  // ---- Data ----
  Future<Me> me() async => Me.fromJson(await _get('/api/me'));

  Future<WorkStatus> status() async => WorkStatus.fromJson(await _get('/api/my/status'));

  Future<MonthSummary> summary(int year, int month) async =>
      MonthSummary.fromJson(await _get('/api/my/summary?year=$year&month=$month'));

  Future<List<Workplace>> jobs() async {
    final list = await _getList('/api/jobs');
    return list.map((e) => Workplace.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Shaxsiy ish joyi qo'shish.
  Future<void> addJob({required String name, String payType = 'hourly', required num rate, num tax = 0}) =>
      _post('/api/jobs', {'name': name, 'payType': payType, 'rate': rate, 'taxPercent': tax});

  Future<void> updateJob(int id, {required String name, String payType = 'hourly', required num rate, num tax = 0}) =>
      _put('/api/jobs/$id', {'name': name, 'payType': payType, 'rate': rate, 'taxPercent': tax});

  Future<void> deleteJob(int id) => _delete('/api/jobs/$id');

  /// Boshlash/tugatish. Ochiq yozuv bo'lsa — checkout (bo'sh body).
  Future<String> punch({int? jobId, int? orgId, double? lat, double? lng}) async {
    final j = await _post('/api/punch', {
      if (jobId != null) 'jobId': jobId,
      if (orgId != null) 'orgId': orgId,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
    });
    return (j['action'] ?? '') as String; // "in" | "out"
  }

  // ---- Moliya ----
  Future<List<FinanceItem>> finance() async {
    final list = await _getList('/api/finance');
    return list.map((e) => FinanceItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> addFinance({required String kind, required String title, required num amount, int? dueDay, String? dueDate}) =>
      _post('/api/finance', {'kind': kind, 'title': title, 'amount': amount, if (dueDay != null) 'dueDay': dueDay, if (dueDate != null) 'dueDate': dueDate});

  Future<void> payFinance(int id, {num? amount, bool full = false}) =>
      _post('/api/finance/$id/pay', {if (full) 'full': true, if (amount != null) 'amount': amount});

  Future<void> deleteFinance(int id) => _delete('/api/finance/$id');

  // ---- Maqsadlar ----
  Future<List<Goal>> goals() async {
    final list = await _getList('/api/goals');
    return list.map((e) => Goal.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> addGoal(String title, num target) => _post('/api/goals', {'title': title, 'target': target});
  Future<void> updateGoal(int id, {String? title, num? target}) => _put('/api/goals/$id', {if (title != null) 'title': title, if (target != null) 'target': target});
  Future<void> addToGoal(int id, num amount) => _put('/api/goals/$id', {'add': amount});
  Future<void> deleteGoal(int id) => _delete('/api/goals/$id');

  // ---- Kun izohlari ----
  Future<Map<String, String>> notes(int year, int month) async {
    final list = await _getList('/api/my/notes?year=$year&month=$month');
    final out = <String, String>{};
    for (final e in list) {
      final m = e as Map<String, dynamic>;
      out[m['date'] as String] = m['text'] as String;
    }
    return out;
  }

  Future<void> setNote(String date, String text) => _put('/api/my/notes/$date', {'text': text});

  // ---- Kun yozuvi (qo'lda qo'shish/tahrirlash) ----
  Future<void> addEntry({required String date, required String inTime, String? outTime, int? jobId}) =>
      _post('/api/my/entries', {'date': date, 'in': inTime, if (outTime != null) 'out': outTime, if (jobId != null) 'jobId': jobId});

  Future<void> updateEntry(int id, {required String inTime, String? outTime}) =>
      _put('/api/my/entries/$id', {'in': inTime, if (outTime != null) 'out': outTime});

  Future<void> deleteEntry(int id) => _delete('/api/my/entries/$id');

  // ---- Valyuta kurslari (KRW bazasi) ----
  Future<Map<String, double>> rates() async {
    final j = await _get('/api/rates');
    final raw = (j['rates'] ?? const {}) as Map<String, dynamic>;
    return raw.map((k, v) => MapEntry(k, (v is num) ? v.toDouble() : double.tryParse('$v') ?? 1));
  }

  // ---- AI moliyaviy yordamchi ----
  Future<Advice> advice(String lang) async => Advice.fromJson(await _get('/api/ai/advice?lang=$lang'));

  Future<String> chat({required String message, required List<Map<String, String>> history, required String lang}) async {
    final j = await _post('/api/ai/chat', {'message': message, 'history': history, 'lang': lang});
    return (j['reply'] ?? '') as String;
  }

  // ---- Obuna (Google Play / App Store) ----
  Future<Map<String, dynamic>> verifyPurchase({required String platform, required String productId, required String purchaseToken}) =>
      _post('/api/subscription/verify', {'platform': platform, 'productId': productId, 'purchaseToken': purchaseToken});
}
