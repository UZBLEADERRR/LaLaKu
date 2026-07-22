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

  Future<void> loadToken() async {
    final sp = await SharedPreferences.getInstance();
    _token = sp.getString('token');
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

  Uri _u(String path) => Uri.parse('${AppConfig.apiBaseUrl}$path');

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  Future<Map<String, dynamic>> _decode(http.Response r) async {
    final data = r.body.isEmpty ? <String, dynamic>{} : jsonDecode(r.body) as Map<String, dynamic>;
    if (r.statusCode >= 400) {
      throw ApiException((data['error'] ?? 'Xatolik') as String, data['code'] as String?);
    }
    return data;
  }

  Future<Map<String, dynamic>> _get(String path) async =>
      _decode(await http.get(_u(path), headers: _headers));

  Future<Map<String, dynamic>> _post(String path, [Map<String, dynamic>? body]) async =>
      _decode(await http.post(_u(path), headers: _headers, body: jsonEncode(body ?? {})));

  // ---- Auth ----
  Future<Me> login({required String phone, required String birthdate}) async {
    final j = await _post('/api/login', {'phone': phone, 'birthdate': birthdate});
    await _saveToken(j['token'] as String?);
    return Me.fromJson(j);
  }

  Future<Me> register({
    required String name,
    required String phone,
    required String birthdate,
    String type = 'worker',
    String? businessName,
  }) async {
    final j = await _post('/api/register', {
      'name': name,
      'phone': phone,
      'birthdate': birthdate,
      'type': type,
      if (businessName != null) 'businessName': businessName,
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
    final r = await http.get(_u('/api/jobs'), headers: _headers);
    final list = jsonDecode(r.body) as List<dynamic>;
    return list.map((e) => Workplace.fromJson(e as Map<String, dynamic>)).toList();
  }

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
}
