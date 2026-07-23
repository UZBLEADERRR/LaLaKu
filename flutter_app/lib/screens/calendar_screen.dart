import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../i18n.dart';
import '../models.dart';
import '../services/auth_provider.dart';
import '../services/settings_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// Kalendar — heatmap yoki jadval ko'rinishi + kun BottomSheet.
class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});
  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  MonthSummary? _summary;
  Map<String, String> _notes = const {};
  List<Workplace> _jobs = const [];
  Me? _me;
  bool _loading = true;
  bool _tableView = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final api = context.read<AuthProvider>().api;
    // Har bir so'rovni alohida: bittasi xato bersa (masalan notes) kalendar baribir ishlaydi.
    try { _summary = await api.summary(_month.year, _month.month); } catch (_) {}
    try { _notes = await api.notes(_month.year, _month.month); } catch (_) { _notes = const {}; }
    try { _jobs = await api.jobs(); } catch (_) {}
    try { _me = await api.me(); } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Color _heat(int minutes) {
    if (minutes <= 0) return AppColors.surface2;
    if (minutes <= 4 * 60) return AppColors.primary.withOpacity(0.28);
    if (minutes <= 8 * 60) return AppColors.primary.withOpacity(0.6);
    return AppColors.primary;
  }

  String _key(int d) =>
      '${_month.year.toString().padLeft(4, '0')}-${_month.month.toString().padLeft(2, '0')}-${d.toString().padLeft(2, '0')}';

  double _dayNet(DayInfo day) {
    double net = 0;
    for (final s in day.sessions) {
      double rate = _me?.hourlyRate ?? 0;
      double tax = _me?.taxPercent ?? 0;
      for (final j in _jobs) {
        if ((s.jobId != null && j.id == s.jobId) || (s.orgId != null && j.orgId == s.orgId)) {
          rate = j.rate;
          tax = j.taxPercent;
          break;
        }
      }
      net += (s.minutes / 60.0) * rate * (1 - tax / 100);
    }
    return net;
  }

  // Jadval ko'rinishi — ishlangan kunlar (Sana | Kun | Soat | Maosh)
  Widget _tableCard() {
    final dates = (_summary?.days.keys.toList() ?? [])..sort();
    const dowShort = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
    int totalMin = 0;
    double totalNet = 0;
    final rows = <Widget>[];
    Widget cell(String t, {int flex = 1, Color? color, FontWeight w = FontWeight.w600, TextAlign align = TextAlign.left}) => Expanded(
          flex: flex,
          child: Text(t, textAlign: align, style: TextStyle(fontSize: 13, fontWeight: w, color: color ?? AppColors.textPrimary)),
        );
    for (final d in dates) {
      final day = _summary!.days[d]!;
      if (day.minutes <= 0) continue;
      final net = _dayNet(day);
      totalMin += day.minutes;
      totalNet += net;
      final dt = DateTime.parse(d);
      final dow = dowShort[(dt.weekday + 6) % 7];
      rows.add(InkWell(
        onTap: () => _openDay(d),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 11),
          child: Row(children: [
            cell('${dt.day}', flex: 2, w: FontWeight.w800),
            cell(dow, flex: 2, color: AppColors.textSecondary),
            cell(fmtHm(day.minutes), flex: 3, color: AppColors.success, align: TextAlign.right),
            cell(net > 0 ? fmtWonShort(net) : '—', flex: 3, color: AppColors.primary, w: FontWeight.w800, align: TextAlign.right),
          ]),
        ),
      ));
      rows.add(const Divider(height: 1, color: AppColors.line));
    }
    return AppCard(
      child: Column(
        children: [
          Row(children: [
            cell(tr('col_date'), flex: 2, color: AppColors.textSecondary, w: FontWeight.w700),
            cell(tr('col_day'), flex: 2, color: AppColors.textSecondary, w: FontWeight.w700),
            cell(tr('worked'), flex: 3, color: AppColors.textSecondary, w: FontWeight.w700, align: TextAlign.right),
            cell(tr('salary'), flex: 3, color: AppColors.textSecondary, w: FontWeight.w700, align: TextAlign.right),
          ]),
          const Divider(height: 12, color: AppColors.line),
          if (rows.isEmpty)
            Padding(padding: const EdgeInsets.all(Gap.md), child: Text(tr('fin_none'), style: const TextStyle(color: AppColors.textSecondary)))
          else
            ...rows,
          if (rows.isNotEmpty) ...[
            const SizedBox(height: Gap.sm),
            Row(children: [
              cell(tr('col_total'), flex: 4, w: FontWeight.w800),
              cell(fmtHm(totalMin), flex: 3, color: AppColors.success, w: FontWeight.w800, align: TextAlign.right),
              cell(totalNet > 0 ? fmtWonShort(totalNet) : '—', flex: 3, color: AppColors.primary, w: FontWeight.w800, align: TextAlign.right),
            ]),
          ],
        ],
      ),
    );
  }

  void _openDay(String key) {
    final day = _summary?.days[key];
    final minutes = day?.minutes ?? 0;
    final net = day == null ? 0.0 : _dayNet(day);
    final note = _notes[key];
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.fromLTRB(Gap.lg, Gap.md, Gap.lg, Gap.lg + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.line, borderRadius: BorderRadius.circular(4)))),
            const SizedBox(height: Gap.md),
            Text(key, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: Gap.md),
            Row(
              children: [
                Expanded(child: StatTile(label: 'Worked', value: fmtHm(minutes), valueColor: AppColors.success, valueSize: 22)),
                Expanded(child: StatTile(label: 'Salary', value: net > 0 ? fmtWon(net) : '—', valueColor: AppColors.primary, valueSize: 22)),
              ],
            ),
            if (day != null && day.sessions.isNotEmpty) ...[
              const SizedBox(height: Gap.md),
              ...day.sessions.map((s) => Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('${s.inTime} → ${s.outTime ?? "..."}', style: const TextStyle(fontWeight: FontWeight.w600)),
                        Text(fmtHm(s.minutes), style: const TextStyle(color: AppColors.textSecondary)),
                      ],
                    ),
                  )),
            ],
            const SizedBox(height: Gap.md),
            if (note != null && note.isNotEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(Gap.md),
                margin: const EdgeInsets.only(bottom: Gap.sm),
                decoration: BoxDecoration(color: AppColors.warning.withOpacity(0.12), borderRadius: BorderRadius.circular(Gap.radiusSm)),
                child: Text('📝 $note', style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
            Align(
              alignment: Alignment.centerLeft,
              child: PillButton(
                label: (note != null && note.isNotEmpty) ? '✏️ Izohni tahrirlash' : '📝 Izoh qo\'shish',
                onTap: () {
                  Navigator.pop(context);
                  _editNote(key, note ?? '');
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _editNote(String key, String current) async {
    final c = TextEditingController(text: current);
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text(key),
        content: TextField(controller: c, maxLines: 3, decoration: const InputDecoration(hintText: 'Kun izohi (masalan: Boss praised me)')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Bekor')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Saqlash')),
        ],
      ),
    );
    if (ok == true) {
      try {
        await context.read<AuthProvider>().api.setNote(key, c.text.trim());
        await _load();
      } catch (e) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    context.watch<SettingsProvider>();
    final daysInMonth = DateTime(_month.year, _month.month + 1, 0).day;
    final firstWeekday = (DateTime(_month.year, _month.month, 1).weekday + 6) % 7; // Mon=0
    const dows = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

    return ListView(
      padding: const EdgeInsets.fromLTRB(Gap.md, Gap.lg, Gap.md, Gap.xl),
      children: [
        Row(
          children: [
            Text('${_month.year}-${_month.month.toString().padLeft(2, '0')}',
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            const Spacer(),
            // Heatmap / jadval almashtirish
            IconButton(
              icon: Icon(_tableView ? Icons.grid_view_rounded : Icons.table_rows_rounded, color: AppColors.textSecondary),
              tooltip: 'Ko\'rinish',
              onPressed: () => setState(() => _tableView = !_tableView),
            ),
            IconButton(
              icon: const Icon(Icons.chevron_left),
              onPressed: () => setState(() {
                _month = DateTime(_month.year, _month.month - 1);
                _load();
              }),
            ),
            IconButton(
              icon: const Icon(Icons.chevron_right),
              onPressed: () => setState(() {
                _month = DateTime(_month.year, _month.month + 1);
                _load();
              }),
            ),
          ],
        ),
        const SizedBox(height: Gap.sm),
        if (_loading)
          Center(child: Padding(padding: EdgeInsets.all(Gap.xl), child: CircularProgressIndicator(color: AppColors.primary)))
        else if (_tableView)
          _tableCard()
        else
          AppCard(
            padding: const EdgeInsets.all(Gap.md),
            child: Column(
              children: [
                Row(
                  children: dows
                      .map((d) => Expanded(child: Center(child: Text(d, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textSecondary)))))
                      .toList(),
                ),
                const SizedBox(height: 6),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: daysInMonth + firstWeekday,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 7,
                    mainAxisSpacing: 6,
                    crossAxisSpacing: 6,
                    childAspectRatio: 1,
                  ),
                  itemBuilder: (_, i) {
                    if (i < firstWeekday) return const SizedBox.shrink();
                    final d = i - firstWeekday + 1;
                    final key = _key(d);
                    final minutes = _summary?.minutesOn(key) ?? 0;
                    return InkWell(
                      borderRadius: BorderRadius.circular(10),
                      onTap: () => _openDay(key),
                      child: Container(
                        decoration: BoxDecoration(color: _heat(minutes), borderRadius: BorderRadius.circular(10)),
                        alignment: Alignment.center,
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text('$d', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: minutes > 4 * 60 ? Colors.white : AppColors.textSecondary)),
                            if (minutes > 0)
                              Text('${(minutes / 60).floor()}h',
                                  style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.w700, color: minutes > 4 * 60 ? Colors.white70 : AppColors.textSecondary)),
                          ],
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: Gap.md),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    const Text('Kam ', style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                    _legendBox(AppColors.surface2),
                    _legendBox(AppColors.primary.withOpacity(0.28)),
                    _legendBox(AppColors.primary.withOpacity(0.6)),
                    _legendBox(AppColors.primary),
                    const Text(' Ko\'p', style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                  ],
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _legendBox(Color c) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2),
        child: Container(width: 13, height: 13, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(4))),
      );
}
