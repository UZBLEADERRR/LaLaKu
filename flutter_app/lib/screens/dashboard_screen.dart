import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models.dart';
import '../services/auth_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// Bosh dashboard — jonli maosh hisoblagichi, joriy smena, tanaffus, ish joylari.
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

  // Tanaffus holati (klientda, shared_preferences)
  DateTime? _breakStart;
  int _breakTotalSec = 0;

  @override
  void initState() {
    super.initState();
    _load();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && ((_status?.checkedIn ?? false) || _breakStart != null)) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  String get _breakKey => 'break_${_me?.id ?? 0}';

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
      final sp = await SharedPreferences.getInstance();
      final me = results[0] as Me;
      final raw = sp.getString('break_${me.id}');
      DateTime? bs;
      int bt = 0;
      if (raw != null) {
        final parts = raw.split('|');
        bt = int.tryParse(parts[0]) ?? 0;
        if (parts.length > 1 && parts[1].isNotEmpty) bs = DateTime.tryParse(parts[1]);
      }
      if (!mounted) return;
      setState(() {
        _me = me;
        _status = results[1] as WorkStatus;
        _summary = results[2] as MonthSummary;
        _jobs = results[3] as List<Workplace>;
        _breakStart = bs;
        _breakTotalSec = bt;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _saveBreak() async {
    final sp = await SharedPreferences.getInstance();
    sp.setString(_breakKey, '$_breakTotalSec|${_breakStart?.toIso8601String() ?? ''}');
  }

  void _toggleBreak() {
    setState(() {
      if (_breakStart != null) {
        _breakTotalSec += DateTime.now().difference(_breakStart!).inSeconds;
        _breakStart = null;
      } else {
        _breakStart = DateTime.now();
      }
    });
    _saveBreak();
  }

  String get _todayKey {
    final n = DateTime.now();
    return '${n.year.toString().padLeft(4, '0')}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
  }

  int get _todaySeconds {
    var base = (_summary?.minutesOn(_todayKey) ?? 0) * 60;
    final since = _status?.sinceTime;
    if ((_status?.checkedIn ?? false) && since != null) {
      // minutesOn ochiq sessiyani ham hisoblaydi, shuning uchun soniyalar aniqligi uchun qayta hisoblaymiz
      base = _closedTodaySec + DateTime.now().difference(since).inSeconds;
    }
    return base;
  }

  int get _closedTodaySec {
    final d = _summary?.days[_todayKey];
    if (d == null) return 0;
    return d.sessions.where((s) => s.outTime != null).fold(0, (a, s) => a + s.minutes * 60);
  }

  Workplace? get _activeJob {
    final jid = _status?.jobId;
    final oid = _status?.orgId;
    for (final w in _jobs) {
      if (jid != null && w.id == jid) return w;
      if (oid != null && w.orgId == oid) return w;
    }
    return null;
  }

  double get _rate {
    final j = _activeJob;
    if (j != null && j.rate > 0) return j.rate;
    return _me?.hourlyRate ?? 0;
  }

  double get _liveRatePerSec {
    final j = _activeJob;
    final tax = (j?.taxPercent ?? _me?.taxPercent ?? 0);
    if (j != null && j.payType == 'daily') return 0;
    return (_rate * (1 - tax / 100)) / 3600;
  }

  double get _todayEarnings => (_todaySeconds) * _liveRatePerSec;

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning 👋';
    if (h < 18) return 'Good afternoon 👋';
    return 'Good evening 👋';
  }

  Future<void> _startWorkplace(Workplace j) async {
    final api = context.read<AuthProvider>().api;
    try {
      await api.punch(jobId: j.orgId == null ? j.id : null, orgId: j.orgId);
      await _load();
    } catch (e) {
      _snack('$e');
    }
  }

  Future<void> _stop() async {
    final api = context.read<AuthProvider>().api;
    try {
      await api.punch();
      setState(() {
        _breakStart = null;
        _breakTotalSec = 0;
      });
      _saveBreak();
      await _load();
    } catch (e) {
      _snack('$e');
    }
  }

  void _snack(String m) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  void _pickWorkplace() {
    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(padding: EdgeInsets.all(Gap.md), child: Label('Boshlash uchun ish joyini tanlang')),
            ..._jobs.map((j) => ListTile(
                  leading: CircleAvatar(backgroundColor: AppColors.primary.withOpacity(0.18), child: Text(j.isTeam ? '🍽' : (j.name.isNotEmpty ? j.name[0] : '?'))),
                  title: Text(j.name),
                  subtitle: Text('${fmtWon(j.rate)}/hr'),
                  onTap: () {
                    Navigator.pop(context);
                    _startWorkplace(j);
                  },
                )),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const DashboardSkeleton();
    final checkedIn = _status?.checkedIn ?? false;
    final breaking = _breakStart != null;
    final breakSec = _breakTotalSec + (breaking ? DateTime.now().difference(_breakStart!).inSeconds : 0);

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gap.md, Gap.lg, Gap.md, Gap.xl),
        children: [
          Text(_greeting(), style: const TextStyle(color: AppColors.textSecondary, fontSize: 14, fontWeight: FontWeight.w600)),
          Text(_me?.name ?? '', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
          const SizedBox(height: Gap.lg),

          // Jonli maosh + soat
          AppCard(
            padding: const EdgeInsets.all(Gap.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                StatTile(label: "Today's earnings", value: fmtWon(_todayEarnings), valueColor: AppColors.primary, valueSize: 34),
                const SizedBox(height: Gap.lg),
                Row(
                  children: [
                    Expanded(child: StatTile(label: 'Worked', value: fmtClock(_todaySeconds), valueSize: 22)),
                    Expanded(child: StatTile(label: 'This month', value: fmtHm(_summary?.totalMinutes ?? 0), valueSize: 22)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: Gap.md),

          // Joriy smena
          AppCard(
            padding: const EdgeInsets.all(Gap.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _LiveDot(active: checkedIn),
                    const SizedBox(width: Gap.sm),
                    Expanded(
                      child: Text(
                        checkedIn ? (_activeJob?.name ?? _status?.orgName ?? 'Ishda') : 'Hozir ishda emassiz',
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (checkedIn && _status?.since != null)
                      Text('Start ${_status!.since}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
                  ],
                ),
                if (checkedIn) ...[
                  const SizedBox(height: Gap.md),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      PillButton(
                        label: breaking ? 'Break ${fmtClock(breakSec)}' : (breakSec > 0 ? 'Break · ${fmtClock(breakSec)}' : 'Break'),
                        icon: breaking ? Icons.play_arrow_rounded : Icons.coffee_rounded,
                        color: breaking ? AppColors.warning.withOpacity(0.18) : AppColors.surface2,
                        textColor: breaking ? AppColors.warning : AppColors.textPrimary,
                        onTap: _toggleBreak,
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: Gap.md),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: checkedIn ? AppColors.danger.withOpacity(0.16) : AppColors.primary,
                      foregroundColor: checkedIn ? AppColors.danger : Colors.white,
                    ),
                    icon: Icon(checkedIn ? Icons.stop_rounded : Icons.play_arrow_rounded),
                    label: Text(checkedIn ? 'Stop timer' : 'Start timer'),
                    onPressed: () {
                      if (checkedIn) {
                        _stop();
                      } else if (_jobs.isEmpty) {
                        _snack('Avval ish joyi qo\'shing');
                      } else if (_jobs.length == 1) {
                        _startWorkplace(_jobs.first);
                      } else {
                        _pickWorkplace();
                      }
                    },
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: Gap.md),

          const SectionHeader('Workplaces'),
          if (_jobs.isEmpty)
            const AppCard(child: Text('Hali ish joyi yo\'q.', style: TextStyle(color: AppColors.textSecondary)))
          else
            ..._jobs.map((j) => Padding(
                  padding: const EdgeInsets.only(bottom: Gap.sm),
                  child: AppCard(
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 22,
                          backgroundColor: AppColors.primary.withOpacity(0.18),
                          child: Text(j.isTeam ? '🍽' : (j.name.isNotEmpty ? j.name[0].toUpperCase() : '?'),
                              style: const TextStyle(fontWeight: FontWeight.w800)),
                        ),
                        const SizedBox(width: Gap.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(j.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5)),
                              const SizedBox(height: 2),
                              Text('${fmtWon(j.rate)}/${j.payType == 'daily' ? 'day' : 'hr'}',
                                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
                            ],
                          ),
                        ),
                        if (!checkedIn)
                          IconButton.filledTonal(
                            icon: const Icon(Icons.play_arrow_rounded),
                            onPressed: () => _startWorkplace(j),
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

class _LiveDot extends StatefulWidget {
  final bool active;
  const _LiveDot({required this.active});
  @override
  State<_LiveDot> createState() => _LiveDotState();
}

class _LiveDotState extends State<_LiveDot> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat(reverse: true);
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.active) {
      return const Icon(Icons.circle, size: 10, color: AppColors.textSecondary);
    }
    return FadeTransition(
      opacity: Tween(begin: 0.4, end: 1.0).animate(_c),
      child: const Icon(Icons.circle, size: 10, color: AppColors.success),
    );
  }
}
