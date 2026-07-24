import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../i18n.dart';
import '../models.dart';
import '../services/auth_provider.dart';
import '../services/settings_provider.dart';
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
    // Har bir so'rovni alohida: bittasi xato bersa qolganlari baribir ko'rinadi.
    Me? me;
    WorkStatus? st;
    MonthSummary? sm;
    List<Workplace> jobs = const [];
    try { me = await api.me(); } catch (_) {}
    try { st = await api.status(); } catch (_) {}
    try { sm = await api.summary(now.year, now.month); } catch (_) {}
    try { jobs = await api.jobs(); } catch (_) {}

    DateTime? bs;
    int bt = 0;
    if (me != null) {
      final sp = await SharedPreferences.getInstance();
      final raw = sp.getString('break_${me.id}');
      if (raw != null) {
        final parts = raw.split('|');
        bt = int.tryParse(parts[0]) ?? 0;
        if (parts.length > 1 && parts[1].isNotEmpty) bs = DateTime.tryParse(parts[1]);
      }
    }
    if (!mounted) return;
    setState(() {
      if (me != null) _me = me;
      if (st != null) _status = st;
      if (sm != null) _summary = sm;
      _jobs = jobs;
      _breakStart = bs;
      _breakTotalSec = bt;
      _loading = false;
    });
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

  int get _closedTodaySec {
    final d = _summary?.days[_todayKey];
    if (d == null) return 0;
    return d.sessions.where((s) => s.outTime != null).fold(0, (a, s) => a + s.minutes * 60);
  }

  int get _todaySeconds {
    var base = (_summary?.minutesOn(_todayKey) ?? 0) * 60;
    final since = _status?.sinceTime;
    if ((_status?.checkedIn ?? false) && since != null) {
      base = _closedTodaySec + DateTime.now().difference(since).inSeconds;
    }
    return base;
  }

  /// Ko'rsatiladigan ish joylari: jamoalar (a'zoliklar) + shaxsiy ishlar.
  List<_WP> get _wps {
    final teams = (_me?.memberships ?? const <Membership>[]).map((m) {
      Workplace? tj;
      for (final j in _jobs) {
        if (j.orgId == m.orgId) {
          tj = j;
          break;
        }
      }
      return _WP(name: m.orgName, rate: tj?.rate ?? 0, payType: tj?.payType ?? 'hourly', isTeam: true, orgId: m.orgId, checkMode: m.checkMode);
    }).toList();
    final personal = _jobs.where((j) => j.orgId == null).map((j) => _WP(name: j.name, rate: j.rate, payType: j.payType, isTeam: false, jobId: j.id)).toList();
    return [...teams, ...personal];
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

  double get _todayEarnings => _todaySeconds * _liveRatePerSec;

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return '${tr('good_morning')} 👋';
    if (h < 18) return '${tr('good_afternoon')} 👋';
    return '${tr('good_evening')} 👋';
  }

  Future<void> _startWorkplace(_WP w) async {
    try {
      await context.read<AuthProvider>().api.punch(jobId: w.isTeam ? null : w.jobId, orgId: w.isTeam ? w.orgId : null);
      await _load();
    } catch (e) {
      _snack('$e');
    }
  }

  Future<void> _stop() async {
    try {
      await context.read<AuthProvider>().api.punch();
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
      backgroundColor: AppColors.surface,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(padding: const EdgeInsets.all(Gap.md), child: Label(tr('pick_workplace'))),
            ..._wps.map((j) => ListTile(
                  leading: CircleAvatar(backgroundColor: AppColors.primary.withOpacity(0.18), child: Text(j.isTeam ? '🍽' : (j.name.isNotEmpty ? j.name[0].toUpperCase() : '?'))),
                  title: Text(j.name),
                  subtitle: Text(j.rate > 0 ? '${fmtWon(j.rate)}/${j.payType == 'daily' ? tr('per_day') : tr('per_hour')}' : (j.isTeam ? 'Jamoa' : '')),
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

  /// Ish joyi qo'shish oynasi.
  Future<void> _addWorkplace() async {
    final nameC = TextEditingController();
    final rateC = TextEditingController();
    final taxC = TextEditingController(text: '0');
    String payType = 'hourly';
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          padding: EdgeInsets.fromLTRB(Gap.lg, Gap.lg, Gap.lg, Gap.lg + MediaQuery.of(ctx).viewInsets.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(tr('add_workplace'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: Gap.md),
              TextField(controller: nameC, decoration: InputDecoration(hintText: tr('job_name'))),
              const SizedBox(height: Gap.md),
              SegmentedButton<String>(
                segments: [
                  ButtonSegment(value: 'hourly', label: Text(tr('hourly'))),
                  ButtonSegment(value: 'daily', label: Text(tr('daily'))),
                ],
                selected: {payType},
                onSelectionChanged: (s) => setSheet(() => payType = s.first),
              ),
              const SizedBox(height: Gap.md),
              Row(
                children: [
                  Expanded(child: TextField(controller: rateC, keyboardType: TextInputType.number, decoration: InputDecoration(hintText: tr('rate')))),
                  const SizedBox(width: Gap.md),
                  SizedBox(width: 110, child: TextField(controller: taxC, keyboardType: TextInputType.number, decoration: InputDecoration(hintText: tr('tax')))),
                ],
              ),
              const SizedBox(height: Gap.lg),
              ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr('save'))),
            ],
          ),
        ),
      ),
    );
    if (ok == true && nameC.text.trim().isNotEmpty) {
      final rate = num.tryParse(rateC.text.trim()) ?? 0;
      final tax = num.tryParse(taxC.text.trim()) ?? 0;
      try {
        await context.read<AuthProvider>().api.addJob(name: nameC.text.trim(), payType: payType, rate: rate, tax: tax);
        await _load();
      } catch (e) {
        _snack('$e');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    context.watch<SettingsProvider>();
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

          // Premium jonli maosh hero
          Container(
            padding: const EdgeInsets.all(Gap.lg),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: checkedIn
                    ? [const Color(0xFF2A2350), const Color(0xFF171A22)]
                    : [const Color(0xFF20232E), const Color(0xFF171A22)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(Gap.radius),
              border: Border.all(color: checkedIn ? AppColors.primary.withOpacity(0.35) : AppColors.line),
              boxShadow: checkedIn
                  ? [BoxShadow(color: AppColors.primary.withOpacity(0.25), blurRadius: 30, offset: const Offset(0, 12))]
                  : const [BoxShadow(color: Color(0x33000000), blurRadius: 22, offset: Offset(0, 8))],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Label(tr('todays_earnings')),
                    const Spacer(),
                    if (checkedIn) _LiveDot(active: true),
                  ],
                ),
                const SizedBox(height: Gap.xs),
                Text(fmtWon(_todayEarnings),
                    style: TextStyle(fontSize: 38, fontWeight: FontWeight.w800, letterSpacing: -1, color: AppColors.primary, fontFeatures: [FontFeature.tabularFigures()])),
                const SizedBox(height: Gap.lg),
                Row(
                  children: [
                    Expanded(child: StatTile(label: tr('worked'), value: fmtClock(_todaySeconds), valueSize: 22)),
                    Container(width: 1, height: 36, color: AppColors.line),
                    const SizedBox(width: Gap.md),
                    Expanded(child: StatTile(label: tr('this_month'), value: fmtHm(_summary?.totalMinutes ?? 0), valueSize: 22)),
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
                        checkedIn ? (_activeJob?.name ?? _status?.orgName ?? tr('current_shift')) : tr('not_working'),
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (checkedIn && _status?.since != null)
                      Text('${_status!.since}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
                  ],
                ),
                if (checkedIn) ...[
                  const SizedBox(height: Gap.md),
                  PillButton(
                    label: breaking ? '${tr('break')} ${fmtClock(breakSec)}' : (breakSec > 0 ? '${tr('break')} · ${fmtClock(breakSec)}' : tr('break')),
                    icon: breaking ? Icons.play_arrow_rounded : Icons.coffee_rounded,
                    color: breaking ? AppColors.warning.withOpacity(0.18) : AppColors.surface2,
                    textColor: breaking ? AppColors.warning : AppColors.textPrimary,
                    onTap: _toggleBreak,
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
                    label: Text(checkedIn ? tr('stop_timer') : tr('start_timer')),
                    onPressed: () {
                      final wps = _wps;
                      if (checkedIn) {
                        _stop();
                      } else if (wps.isEmpty) {
                        _addWorkplace();
                      } else if (wps.length == 1) {
                        _startWorkplace(wps.first);
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

          SectionHeader(
            tr('workplaces'),
            trailing: PillButton(label: '＋', icon: Icons.add_rounded, color: AppColors.primary.withOpacity(0.16), textColor: AppColors.primary, onTap: _addWorkplace),
          ),
          if (_wps.isEmpty)
            _EmptyWorkplaces(onAdd: _addWorkplace)
          else
            ..._wps.map((j) => Padding(
                  padding: const EdgeInsets.only(bottom: Gap.sm),
                  child: AppCard(
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 22,
                          backgroundColor: AppColors.primary.withOpacity(0.18),
                          child: Text(j.isTeam ? '🍽' : (j.name.isNotEmpty ? j.name[0].toUpperCase() : '?'), style: const TextStyle(fontWeight: FontWeight.w800)),
                        ),
                        const SizedBox(width: Gap.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Flexible(child: Text(j.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5))),
                                  if (j.isTeam) Container(
                                    margin: const EdgeInsets.only(left: 6),
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(color: AppColors.primary.withOpacity(0.16), borderRadius: BorderRadius.circular(6)),
                                    child: Text('Jamoa', style: TextStyle(color: AppColors.primary, fontSize: 10, fontWeight: FontWeight.w800)),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 2),
                              Text(j.rate > 0 ? '${fmtWon(j.rate)}/${j.payType == 'daily' ? tr('per_day') : tr('per_hour')}' : '—', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
                            ],
                          ),
                        ),
                        if (!checkedIn)
                          IconButton.filledTonal(icon: const Icon(Icons.play_arrow_rounded), onPressed: () => _startWorkplace(j)),
                      ],
                    ),
                  ),
                )),
        ],
      ),
    );
  }
}

/// Ko'rsatiladigan ish joyi (jamoa yoki shaxsiy) — birlashtirilgan.
class _WP {
  final String name;
  final double rate;
  final String payType;
  final bool isTeam;
  final int? jobId;
  final int? orgId;
  final String checkMode;
  _WP({required this.name, required this.rate, required this.payType, required this.isTeam, this.jobId, this.orgId, this.checkMode = 'button'});
}

class _EmptyWorkplaces extends StatelessWidget {
  final VoidCallback onAdd;
  const _EmptyWorkplaces({required this.onAdd});
  @override
  Widget build(BuildContext context) {
    return DottedCard(
      child: Column(
        children: [
          const Icon(Icons.work_outline_rounded, size: 36, color: AppColors.textSecondary),
          const SizedBox(height: Gap.sm),
          Text(tr('no_workplaces'), style: const TextStyle(color: AppColors.textSecondary)),
          const SizedBox(height: Gap.md),
          ElevatedButton.icon(onPressed: onAdd, icon: const Icon(Icons.add_rounded), label: Text(tr('add_workplace'))),
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
    if (!widget.active) return const Icon(Icons.circle, size: 10, color: AppColors.textSecondary);
    return FadeTransition(opacity: Tween(begin: 0.4, end: 1.0).animate(_c), child: const Icon(Icons.circle, size: 10, color: AppColors.success));
  }
}
