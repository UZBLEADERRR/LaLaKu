import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../i18n.dart';
import '../widgets/ui.dart';
import 'api_client.dart';

/// Til, valyuta, mavzu va server manzili — barcha ilova sozlamalari.
class SettingsProvider extends ChangeNotifier {
  final ApiClient api;
  SettingsProvider(this.api);

  static const currencySymbols = {
    'KRW': '₩', 'USD': '\$', 'UZS': "so'm", 'RUB': '₽', 'VND': '₫',
    'INR': '₹', 'CNY': '¥', 'KZT': '₸',
  };

  String lang = 'uz';
  String currency = 'KRW';
  ThemeMode themeMode = ThemeMode.dark;
  String serverUrl = '';
  Map<String, double> rates = const {'KRW': 1};

  ThemeMode get theme => themeMode;

  Future<void> load() async {
    final sp = await SharedPreferences.getInstance();
    lang = sp.getString('lang') ?? 'uz';
    currency = sp.getString('currency') ?? 'KRW';
    themeMode = (sp.getString('theme') == 'light') ? ThemeMode.light : ThemeMode.dark;
    serverUrl = sp.getString('server_url') ?? '';
    I18n.lang = lang;
    _applyMoney();
    notifyListeners();
    _refreshRates();
  }

  Future<void> _refreshRates() async {
    try {
      rates = await api.rates();
      _applyMoney();
      notifyListeners();
    } catch (_) {}
  }

  void _applyMoney() {
    Money.set(currencySymbols[currency] ?? currency, rates[currency] ?? 1);
  }

  Future<void> setLang(String v) async {
    lang = v;
    I18n.lang = v;
    (await SharedPreferences.getInstance()).setString('lang', v);
    notifyListeners();
  }

  Future<void> setCurrency(String v) async {
    currency = v;
    (await SharedPreferences.getInstance()).setString('currency', v);
    _applyMoney();
    notifyListeners();
  }

  Future<void> setTheme(ThemeMode m) async {
    themeMode = m;
    (await SharedPreferences.getInstance()).setString('theme', m == ThemeMode.light ? 'light' : 'dark');
    notifyListeners();
  }

  Future<void> setServerUrl(String url) async {
    serverUrl = url.trim();
    await api.setBaseUrl(serverUrl);
    notifyListeners();
  }
}
