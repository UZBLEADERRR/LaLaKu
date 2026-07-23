import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models.dart';
import '../services/auth_provider.dart';
import '../services/notification_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// AI moliyaviy yordamchi ekrani — shaxsiy maslahatlar + bildirishnomalar.
class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});
  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  Advice? _advice;
  bool _loading = true;
  String? _error;
  bool _notify = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = context.read<AuthProvider>().api;
    final sp = await SharedPreferences.getInstance();
    _notify = sp.getBool('ai_notify') ?? false;
    try {
      final adv = await api.advice('uz');
      if (!mounted) return;
      setState(() {
        _advice = adv;
        _loading = false;
      });
      _maybeDailyNotification(adv);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = '$e';
          _loading = false;
        });
      }
    }
  }

  /// Kuniga bir marta eng muhim maslahatni bildirishnoma qilib yuboradi.
  Future<void> _maybeDailyNotification(Advice adv) async {
    if (!_notify || adv.tips.isEmpty) return;
    final sp = await SharedPreferences.getInstance();
    final today = DateTime.now().toIso8601String().substring(0, 10);
    if (sp.getString('ai_notify_last') == today) return;
    final tip = adv.tips.firstWhere((t) => t.severity == 'warn', orElse: () => adv.tips.first);
    await NotificationService.showNow(id: 1001, title: '✨ AlbaFit yordamchi', body: '${tip.icon} ${tip.text}');
    await sp.setString('ai_notify_last', today);
  }

  Future<void> _toggleNotify(bool v) async {
    final sp = await SharedPreferences.getInstance();
    if (v) {
      final granted = await NotificationService.requestPermissions();
      if (!granted) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Bildirishnomaga ruxsat berilmadi')),
          );
        }
        return;
      }
    }
    await sp.setBool('ai_notify', v);
    setState(() => _notify = v);
    if (v && _advice != null) {
      await sp.remove('ai_notify_last');
      _maybeDailyNotification(_advice!);
    }
  }

  Color _sevColor(String s) => switch (s) {
        'good' => AppColors.success,
        'warn' => AppColors.warning,
        _ => AppColors.primary,
      };

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gap.md, Gap.lg, Gap.md, Gap.xl),
        children: [
          // Gradient sarlavha
          Container(
            padding: const EdgeInsets.all(Gap.lg),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF7C5CFF), Color(0xFF9B7DFF)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(Gap.radius),
              boxShadow: [BoxShadow(color: AppColors.primary.withOpacity(0.35), blurRadius: 24, offset: const Offset(0, 10))],
            ),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(15)),
                  child: const Center(child: Text('✨', style: TextStyle(fontSize: 24))),
                ),
                const SizedBox(width: Gap.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('AI yordamchi', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
                      Text(
                        _advice?.greeting ?? 'Moliyaviy maslahatchingiz',
                        style: TextStyle(color: Colors.white.withOpacity(0.9), fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
                if (_advice?.aiPowered ?? false)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: Colors.white.withOpacity(0.25), borderRadius: BorderRadius.circular(8)),
                    child: const Text('AI', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.5)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: Gap.md),

          if (_loading) ...const [
            Skeleton(height: 90, radius: Gap.radius),
            SizedBox(height: Gap.md),
            Skeleton(height: 64, radius: Gap.radius),
            SizedBox(height: Gap.sm),
            Skeleton(height: 64, radius: Gap.radius),
          ] else if (_error != null) ...[
            AppCard(child: Text('Xatolik: $_error', style: const TextStyle(color: AppColors.danger))),
          ] else if (_advice != null) ...[
            // Xulosa
            AppCard(
              padding: const EdgeInsets.all(Gap.lg),
              child: Text(
                _advice!.summary,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, height: 1.5),
              ),
            ),
            const SizedBox(height: Gap.md),

            // Bildirishnoma toggle
            AppCard(
              child: Row(
                children: [
                  const Icon(Icons.notifications_active_rounded, color: AppColors.primary),
                  const SizedBox(width: Gap.md),
                  const Expanded(
                    child: Text('Kunlik maslahat bildirishnomasi', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
                  ),
                  Switch(value: _notify, activeColor: AppColors.primary, onChanged: _toggleNotify),
                ],
              ),
            ),
            const SizedBox(height: Gap.md),

            const Label('Maslahatlar'),
            const SizedBox(height: Gap.sm),
            ..._advice!.tips.map((tip) => Padding(
                  padding: const EdgeInsets.only(bottom: Gap.sm),
                  child: Container(
                    padding: const EdgeInsets.all(Gap.md),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(Gap.radiusSm),
                      border: Border(left: BorderSide(color: _sevColor(tip.severity), width: 3)),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tip.icon, style: const TextStyle(fontSize: 18)),
                        const SizedBox(width: Gap.md),
                        Expanded(
                          child: Text(tip.text, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, height: 1.4)),
                        ),
                      ],
                    ),
                  ),
                )),
          ],
        ],
      ),
    );
  }
}
