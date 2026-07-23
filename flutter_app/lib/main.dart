import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'theme/app_theme.dart';
import 'services/api_client.dart';
import 'services/auth_provider.dart';
import 'services/settings_provider.dart';
import 'services/notification_service.dart';
import 'app_shell.dart';
import 'screens/login_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Edge-to-edge + shaffof tizim panellari (pastki insetlar to'g'ri hisoblansin).
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    systemNavigationBarColor: Colors.transparent,
    systemNavigationBarIconBrightness: Brightness.light,
  ));
  NotificationService.init();

  // Umumiy ApiClient — Auth va Settings uni baham ko'radi.
  final api = ApiClient();
  final settings = SettingsProvider(api);
  final auth = AuthProvider(api);
  await api.loadToken(); // token + saqlangan server manzilini yuklaydi
  await settings.load(); // til/valyuta/mavzu/kurslar
  auth.bootstrap();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: auth),
        ChangeNotifierProvider.value(value: settings),
      ],
      child: const AlbaFitApp(),
    ),
  );
}

class AlbaFitApp extends StatelessWidget {
  const AlbaFitApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Sozlamalar o'zgarganda til/valyuta yangilanishi uchun kuzatamiz.
    context.watch<SettingsProvider>();
    return MaterialApp(
      title: 'AlbaFit',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      home: const _Root(),
    );
  }
}

class _Root extends StatelessWidget {
  const _Root();
  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    if (auth.loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator(color: Color(0xFF7C5CFF))));
    }
    return auth.me == null ? const LoginScreen() : const AppShell();
  }
}
