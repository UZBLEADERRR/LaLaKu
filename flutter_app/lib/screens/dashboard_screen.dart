import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models.dart';
import '../services/auth_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// Bosh dashboard — jonli maosh hisoblagichi bilan (har sekund yangilanadi).
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Me? _me;
  WorkStatus? _status;
  MonthSummary? _summary;
  List<Workplace> _jobs = const [];
  Timer? _ticker;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
    // Jonli hisoblagich — har sekund UI ni yangilaydi (ishda bo'lganda).
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && (_status?.checkedIn ?? false)) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final api = context.read<AuthProvider>().api;
    final now = DateTime.now();
    try {
      final results = await Future.wait([
        api.me(),
        api.status(),
        api.summary(now.year, now.month),
        api.jobs(),
      ]);
      if (!mounted) return;
      setState(() {
        _me = results[0] as Me;
        _status = results[1] as WorkStatus;
        _summary = results[2] as MonthSummary;
        _jobs = results[3] as List<Workplace>;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  String get _todayKey {
    final n = DateTime.now();
    return '${n.year.toString().padLeft(4, '0')}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
  }

  int get _todayMinutes {
    var base = _summary?.minutesByDay[_todayKey] ?? 0;
    // Ishda bo'lsa, joriy sessiya vaqtini qo'shamiz (jonli).
    if ((_status?.checkedIn ?? false) && _status?.sinceIso != null) {
      final since = DateTime.tryParse(_status!.sinceIso!);
      if (since != null) base += DateTime.now().difference(since).inMinutes;
    }
    return base;
  }

  double get _rate {
    final jid = _status?.jobId;
    if (jid != null) {
      for (final w in _jobs) {
        if (w.id == jid && w.rate > 0) return w.rate;
      }
    }
    return _me?.hourlyRate ?? 0;
  }

  double get _todayEarnings {
    final tax = _me?.taxPercent ?? 0;
    return (_todayMinutes / 60.0) * _rate * (1 - tax / 100);
  }

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning 👋';
    if (h < 18) return 'Good afternoon 👋';
    return 'Good evening 👋';
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final checkedIn = _status?.checkedIn ?? false;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gap.md, Gap.lg, Gap.md, Gap.xl),
        children: [
          Text(_greeting(), style: const TextStyle(color: AppColors.textSecondary, fontSize: 14)),
          Text(_me?.name ?? '', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
          const SizedBox(height: Gap.lg),

          // Jonli maosh + soat
          AppCard(
            padding: const EdgeInsets.all(Gap.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                StatTile(label: "Today's earnings", value: fmtWon(_todayEarnings), valueColor: AppColors.success),
                const SizedBox(height: Gap.lg),
                Row(
                  children: [
                    Expanded(child: StatTile(label: 'Worked', value: fmtHm(_todayMinutes))),
                    Expanded(child: StatTile(label: 'This month', value: fmtHm(_summary?.totalMinutes ?? 0))),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: Gap.md),

          // Joriy smena / boshlash-tugatish
          AppCard(
            padding: const EdgeInsets.all(Gap.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Label('Current shift'),
                const SizedBox(height: Gap.sm),
                Row(
                  children: [
                    Icon(Icons.circle, size: 10, color: checkedIn ? AppColors.success : AppColors.textSecondary),
                    const SizedBox(width: Gap.sm),
                    Text(
                      checkedIn ? (_status?.orgName ?? 'Ishda') : 'Hozir ishda emassiz',
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                    ),
                    const Spacer(),
                    if (checkedIn && _status?.since != null)
                      Text('Start ${_status!.since}', style: const TextStyle(color: AppColors.textSecondary)),
                  ],
                ),
                const SizedBox(height: Gap.lg),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: checkedIn ? AppColors.danger : AppColors.primary,
                    ),
                    onPressed: () async {
                      final api = context.read<AuthProvider>().api;
                      try {
                        if (checkedIn) {
                          await api.punch(); // checkout
                        } else if (_jobs.isNotEmpty) {
                          final j = _jobs.first;
                          await api.punch(jobId: j.orgId == null ? j.id : null, orgId: j.orgId);
                        }
                        await _load();
                      } catch (e) {
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
                        }
                      }
                    },
                    child: Text(checkedIn ? 'Stop timer' : 'Start timer'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: Gap.md),

          // Ish joylari
          const Padding(
            padding: EdgeInsets.fromLTRB(Gap.xs, Gap.sm, Gap.xs, Gap.sm),
            child: Label('Workplaces'),
          ),
          ..._jobs.map((j) => Padding(
                padding: const EdgeInsets.only(bottom: Gap.sm),
                child: AppCard(
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 22,
                        backgroundColor: AppColors.primary.withOpacity(0.18),
                        child: Text(j.orgId != null ? '🍽' : (j.name.isNotEmpty ? j.name[0] : '?')),
                      ),
                      const SizedBox(width: Gap.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(j.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5)),
                            const SizedBox(height: 2),
                            Text('${fmtWon(j.rate)}/hr', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              )),
        ],
      ),
    );
  }
}
