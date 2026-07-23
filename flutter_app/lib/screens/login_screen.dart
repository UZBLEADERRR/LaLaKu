import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../i18n.dart';
import '../services/auth_provider.dart';
import '../services/settings_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// Sodda kirish: telefon + tug'ilgan kun. Server manzilini sozlash imkoni bilan
/// (ma'lumot sinxronlanishi uchun to'g'ri backend manzili muhim).
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
  DateTime? _birth;
  bool _signup = false;
  final _name = TextEditingController();
  String? _error;
  bool _busy = false;

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _busy = true;
    });
    final auth = context.read<AuthProvider>();
    final bd = _birth == null
        ? ''
        : '${_birth!.year.toString().padLeft(4, '0')}-${_birth!.month.toString().padLeft(2, '0')}-${_birth!.day.toString().padLeft(2, '0')}';
    try {
      if (_signup) {
        await auth.register(_name.text.trim(), _phone.text.trim(), bd);
      } else {
        await auth.login(_phone.text.trim(), bd);
      }
    } catch (e) {
      final msg = e.toString();
      // Tarmoq xatosi bo'lsa aniqroq ko'rsatamiz
      final network = msg.contains('SocketException') || msg.contains('Failed host') || msg.contains('Connection');
      setState(() => _error = network ? tr('connection_error') : msg);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _serverSettings() async {
    final settings = context.read<SettingsProvider>();
    final c = TextEditingController(text: settings.serverUrl.isEmpty ? settings.api.baseUrl : settings.serverUrl);
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(Gap.lg, Gap.lg, Gap.lg, Gap.lg + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(tr('server'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: Gap.sm),
            Text(tr('server_hint'), style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
            const SizedBox(height: Gap.md),
            TextField(controller: c, keyboardType: TextInputType.url, decoration: const InputDecoration(hintText: 'https://...')),
            const SizedBox(height: Gap.md),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () async {
                  await settings.setServerUrl(c.text.trim());
                  if (ctx.mounted) Navigator.pop(ctx);
                  if (mounted) setState(() {});
                },
                child: Text(tr('save_server')),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Gap.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const SizedBox(width: 40),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.dns_outlined, color: AppColors.textSecondary),
                    tooltip: tr('server'),
                    onPressed: _serverSettings,
                  ),
                ],
              ),
              const SizedBox(height: Gap.sm),
              const Text('AlbaFit', style: TextStyle(fontSize: 34, fontWeight: FontWeight.w800, letterSpacing: -1)),
              const SizedBox(height: Gap.sm),
              Text(tr('tagline'), style: const TextStyle(color: AppColors.textSecondary)),
              const SizedBox(height: Gap.xl),
              if (_signup) ...[
                TextField(controller: _name, decoration: InputDecoration(hintText: tr('name'))),
                const SizedBox(height: Gap.md),
              ],
              TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(hintText: '010-1234-5678')),
              const SizedBox(height: Gap.md),
              InkWell(
                onTap: () async {
                  final d = await showDatePicker(
                    context: context,
                    initialDate: DateTime(2000),
                    firstDate: DateTime(1940),
                    lastDate: DateTime.now(),
                  );
                  if (d != null) setState(() => _birth = d);
                },
                child: InputDecorator(
                  decoration: const InputDecoration(),
                  child: Text(
                    _birth == null ? tr('birthdate') : '${_birth!.year}-${_birth!.month}-${_birth!.day}',
                    style: TextStyle(color: _birth == null ? AppColors.textSecondary : AppColors.textPrimary),
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: Gap.md),
                Text(_error!, style: const TextStyle(color: AppColors.danger)),
              ],
              const SizedBox(height: Gap.lg),
              ElevatedButton(
                onPressed: _busy ? null : _submit,
                child: Text(_busy ? '...' : (_signup ? tr('signup') : tr('login'))),
              ),
              const SizedBox(height: Gap.sm),
              TextButton(
                onPressed: () => setState(() => _signup = !_signup),
                child: Text(_signup ? tr('have_account') : tr('no_account')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
