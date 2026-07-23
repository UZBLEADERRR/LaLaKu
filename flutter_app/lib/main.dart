import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'theme/app_theme.dart';
import 'services/auth_provider.dart';
import 'services/notification_service.dart';
import 'app_shell.dart';
import 'screens/login_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Bildirishnomalarni fon rejimida ishga tushiramiz (bloklamaydi).
  NotificationService.init();
  runApp(
    ChangeNotifierProvider(
      create: (_) => AuthProvider()..bootstrap(),
      child: const AlbaFitApp(),
    ),
  );
}

class AlbaFitApp extends StatelessWidget {
  const AlbaFitApp({super.key});

  @override
  Widget build(BuildContext context) {
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
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return auth.me == null ? const LoginScreen() : const AppShell();
  }
}
