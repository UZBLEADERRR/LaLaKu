import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../i18n.dart';
import '../services/auth_provider.dart';
import '../services/settings_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// Adaptiv kirish: telefon + to'liq ism → akkaunt bor bo'lsa kiradi
/// (parol qo'ygan bo'lsa parol so'raydi), yo'q bo'lsa ochadi.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  DateTime? _birth;

  int _step = 0; // 0: telefon+ism, 1: kirish/ro'yxat
  bool _exists = false;
  bool _hasPassword = false;
  String? _knownName;
  String? _error;
  bool _busy = false;

  String? get _bd => _birth == null
      ? null
      : '${_birth!.year.toString().padLeft(4, '0')}-${_birth!.month.toString().padLeft(2, '0')}-${_birth!.day.toString().padLeft(2, '0')}';

  String _humanError(Object e) {
    final m = e.toString();
    if (m.contains('SocketException') || m.contains('Failed host') || m.contains('Connection') || m.contains('ClientException')) {
      return tr('connection_error');
    }
    return m;
  }

  Future<void> _continue() async {
    if (_name.text.trim().isEmpty) {
      setState(() => _error = tr('name_required'));
      return;
    }
    if (_phone.text.trim().isEmpty) {
      setState(() => _error = tr('phone_required'));
      return;
    }
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      final r = await context.read<AuthProvider>().api.lookup(_phone.text.trim());
      setState(() {
        _exists = (r['exists'] ?? false) as bool;
        _hasPassword = (r['hasPassword'] ?? false) as bool;
        _knownName = r['name'] as String?;
        _step = 1;
      });
    } catch (e) {
      setState(() => _error = _humanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _busy = true;
    });
    final auth = context.read<AuthProvider>();
    try {
      if (_exists) {
        await auth.login(phone: _phone.text.trim(), birthdate: _bd, password: _password.text);
      } else {
        if (_bd == null) {
          setState(() {
            _error = tr('birthdate');
            _busy = false;
          });
          return;
        }
        await auth.register(name: _name.text.trim(), phone: _phone.text.trim(), birthdate: _bd!, password: _password.text);
      }
    } catch (e) {
      setState(() => _error = _humanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickBirth() async {
    final d = await showDatePicker(context: context, initialDate: DateTime(2000), firstDate: DateTime(1940), lastDate: DateTime.now());
    if (d != null) setState(() => _birth = d);
  }

  void _forgot() {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text(tr('forgot_password')),
        content: Text(tr('forgot_help')),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))],
      ),
    );
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
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Gap.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  if (_step == 1)
                    IconButton(
                      icon: const Icon(Icons.arrow_back, color: AppColors.textSecondary),
                      onPressed: () => setState(() {
                        _step = 0;
                        _error = null;
                        _password.clear();
                      }),
                    )
                  else
                    const SizedBox(width: 40),
                  const Spacer(),
                  IconButton(icon: const Icon(Icons.dns_outlined, color: AppColors.textSecondary), tooltip: tr('server'), onPressed: _serverSettings),
                ],
              ),
              const SizedBox(height: Gap.sm),
              const Text('AlbaFit', style: TextStyle(fontSize: 34, fontWeight: FontWeight.w800, letterSpacing: -1)),
              const SizedBox(height: Gap.sm),
              Text(tr('tagline'), style: const TextStyle(color: AppColors.textSecondary)),
              const SizedBox(height: Gap.xl),

              if (_step == 0) ..._stepPhone() else ..._stepCred(),

              if (_error != null) ...[
                const SizedBox(height: Gap.md),
                Text(_error!, style: const TextStyle(color: AppColors.danger)),
              ],
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _stepPhone() => [
        TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: InputDecoration(hintText: tr('full_name'), prefixIcon: const Icon(Icons.badge_outlined))),
        const SizedBox(height: Gap.md),
        TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(hintText: '010-1234-5678', prefixIcon: Icon(Icons.phone_outlined))),
        const SizedBox(height: Gap.lg),
        ElevatedButton(onPressed: _busy ? null : _continue, child: Text(_busy ? '...' : tr('continue'))),
      ];

  List<Widget> _stepCred() {
    final greetName = _exists ? (_knownName ?? _name.text.trim()) : _name.text.trim();
    return [
      Text(_exists ? '${tr('welcome_back')}, $greetName 👋' : tr('create_account'),
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
      const SizedBox(height: Gap.sm),
      Text(_exists ? tr('cred_hint') : tr('set_password_hint'), style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
      const SizedBox(height: Gap.md),

      // Tug'ilgan kun (ro'yxatda majburiy; kirishda parol yo'q bo'lsa kerak)
      InkWell(
        onTap: _pickBirth,
        child: InputDecorator(
          decoration: const InputDecoration(prefixIcon: Icon(Icons.cake_outlined)),
          child: Text(_birth == null ? tr('birthdate') : (_bd ?? ''),
              style: TextStyle(color: _birth == null ? AppColors.textSecondary : AppColors.textPrimary)),
        ),
      ),
      const SizedBox(height: Gap.md),

      // Parol (kirishda: agar qo'ygan bo'lsa; ro'yxatda: ixtiyoriy)
      TextField(
        controller: _password,
        obscureText: true,
        decoration: InputDecoration(
          hintText: _exists ? tr('password_if_set') : tr('password_optional'),
          prefixIcon: const Icon(Icons.lock_outline),
        ),
      ),

      if (_exists) ...[
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(onPressed: _forgot, child: Text(tr('forgot_password'), style: const TextStyle(color: AppColors.textSecondary))),
        ),
      ],
      const SizedBox(height: Gap.md),
      ElevatedButton(onPressed: _busy ? null : _submit, child: Text(_busy ? '...' : (_exists ? tr('login') : tr('signup')))),
    ];
  }
}
