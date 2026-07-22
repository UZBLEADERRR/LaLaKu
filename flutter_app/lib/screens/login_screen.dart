import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/auth_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// Sodda kirish: telefon + tug'ilgan kun (backend shu bo'yicha ishlaydi).
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
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
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
              const SizedBox(height: Gap.xl),
              const Text('AlbaFit', style: TextStyle(fontSize: 34, fontWeight: FontWeight.w800, letterSpacing: -1)),
              const SizedBox(height: Gap.sm),
              const Text('Ish vaqti va maoshingiz — bir joyda', style: TextStyle(color: AppColors.textSecondary)),
              const SizedBox(height: Gap.xl),
              if (_signup) ...[
                TextField(controller: _name, decoration: const InputDecoration(hintText: 'Ismingiz')),
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
                    _birth == null ? 'Tug\'ilgan kun' : '${_birth!.year}-${_birth!.month}-${_birth!.day}',
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
                child: Text(_busy ? '...' : (_signup ? 'Ro\'yxatdan o\'tish' : 'Kirish')),
              ),
              const SizedBox(height: Gap.sm),
              TextButton(
                onPressed: () => setState(() => _signup = !_signup),
                child: Text(_signup ? 'Akkauntim bor — kirish' : 'Akkauntim yo\'q — ro\'yxatdan o\'tish'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
