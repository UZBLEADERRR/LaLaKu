import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models.dart';
import '../services/auth_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// Moliya — donut grafik (chiqim taqsimoti), daromad/chiqim/qolgan, maqsadlar, AI karta.
class FinanceScreen extends StatefulWidget {
  const FinanceScreen({super.key});
  @override
  State<FinanceScreen> createState() => _FinanceScreenState();
}

class _FinanceScreenState extends State<FinanceScreen> {
  List<FinanceItem> _items = const [];
  List<Goal> _goals = const [];
  MonthSummary? _summary;
  Me? _me;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = context.read<AuthProvider>().api;
    final now = DateTime.now();
    try {
      final res = await Future.wait([
        api.finance(),
        api.goals(),
        api.summary(now.year, now.month),
        api.me(),
      ]);
      if (!mounted) return;
      setState(() {
        _items = res[0] as List<FinanceItem>;
        _goals = res[1] as List<Goal>;
        _summary = res[2] as MonthSummary;
        _me = res[3] as Me;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  double get _netEarnings {
    final min = _summary?.totalMinutes ?? 0;
    final rate = _me?.hourlyRate ?? 0;
    final tax = _me?.taxPercent ?? 0;
    return (min / 60.0) * rate * (1 - tax / 100);
  }

  double _sum(String kind) => _items.where((i) => i.active && i.kind == kind).fold(0.0, (a, i) => a + (kind == 'income' ? i.amount : i.remaining));

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(Gap.md, Gap.lg, Gap.md, Gap.xl),
        children: const [Skeleton(height: 30, width: 140), SizedBox(height: Gap.lg), Skeleton(height: 200, radius: Gap.radius), SizedBox(height: Gap.md), Skeleton(height: 120, radius: Gap.radius)],
      );
    }
    final income = _netEarnings + _sum('income');
    final expenses = _sum('expense');
    final debts = _sum('debt');
    final leftover = income - expenses - debts;

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gap.md, Gap.lg, Gap.md, Gap.xl),
        children: [
          const Text('Finance', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
          const SizedBox(height: Gap.lg),

          // Donut: qoladigan vs xarajat vs qarz
          AppCard(
            padding: const EdgeInsets.all(Gap.lg),
            child: Column(
              children: [
                SizedBox(
                  height: 180,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      PieChart(PieChartData(
                        sectionsSpace: 3,
                        centerSpaceRadius: 58,
                        sections: [
                          if (leftover > 0) PieChartSectionData(value: leftover, color: AppColors.primary, radius: 20, showTitle: false),
                          if (expenses > 0) PieChartSectionData(value: expenses, color: AppColors.danger, radius: 20, showTitle: false),
                          if (debts > 0) PieChartSectionData(value: debts, color: AppColors.warning, radius: 20, showTitle: false),
                          if (leftover <= 0 && expenses <= 0 && debts <= 0)
                            PieChartSectionData(value: 1, color: AppColors.surface2, radius: 20, showTitle: false),
                        ],
                      )),
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Label('Qoladi'),
                          Text(fmtWonShort(leftover),
                              style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: leftover >= 0 ? AppColors.primary : AppColors.danger)),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: Gap.md),
                _legend(income, expenses, debts),
              ],
            ),
          ),
          const SizedBox(height: Gap.md),

          // Breakdown
          AppCard(
            child: Column(
              children: [
                _row('Bu oy topilgan', fmtWon(income), AppColors.textPrimary),
                const Divider(color: AppColors.line, height: 20),
                if (expenses > 0) _row('Doimiy chiqim', '−${fmtWon(expenses)}', AppColors.danger),
                if (debts > 0) _row('Qarzlar', '−${fmtWon(debts)}', AppColors.warning),
                const Divider(color: AppColors.line, height: 20),
                _row('Qoladigan summa', fmtWon(leftover), leftover >= 0 ? AppColors.success : AppColors.danger, bold: true),
              ],
            ),
          ),
          const SizedBox(height: Gap.md),

          // Maqsadlar
          SectionHeader('🎯 Maqsadlar', trailing: PillButton(label: '＋', onTap: _addGoal)),
          if (_goals.isEmpty)
            const AppCard(child: Text('Maqsad qo\'shing — masalan noutbuk uchun jamg\'arma.', style: TextStyle(color: AppColors.textSecondary)))
          else
            ..._goals.map((g) => Padding(
                  padding: const EdgeInsets.only(bottom: Gap.sm),
                  child: AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(child: Text(g.title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
                            Text('${(g.progress * 100).round()}%',
                                style: TextStyle(fontWeight: FontWeight.w800, color: g.progress >= 1 ? AppColors.success : AppColors.primary)),
                          ],
                        ),
                        const SizedBox(height: Gap.sm),
                        ProgressBar(value: g.progress, color: g.progress >= 1 ? AppColors.success : AppColors.primary),
                        const SizedBox(height: Gap.sm),
                        Row(
                          children: [
                            Text('${fmtWonShort(g.saved)} / ${fmtWonShort(g.target)}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
                            const Spacer(),
                            PillButton(label: '＋ pul', onTap: () => _addToGoal(g)),
                          ],
                        ),
                      ],
                    ),
                  ),
                )),
        ],
      ),
    );
  }

  Widget _legend(double income, double expenses, double debts) {
    Widget dot(Color c, String label, double v) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 10, height: 10, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(3))),
            const SizedBox(width: 6),
            Text('$label ${fmtWonShort(v)}', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary, fontWeight: FontWeight.w600)),
          ],
        );
    return Wrap(
      spacing: Gap.md,
      runSpacing: Gap.sm,
      alignment: WrapAlignment.center,
      children: [
        dot(AppColors.success, 'Daromad', income),
        dot(AppColors.danger, 'Chiqim', expenses),
        if (debts > 0) dot(AppColors.warning, 'Qarz', debts),
      ],
    );
  }

  Widget _row(String label, String value, Color color, {bool bold = false}) {
    return Row(
      children: [
        Expanded(child: Text(label, style: TextStyle(color: AppColors.textSecondary, fontWeight: bold ? FontWeight.w800 : FontWeight.w600, fontSize: bold ? 15 : 14))),
        Text(value, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: bold ? 17 : 15, fontFeatures: const [FontFeature.tabularFigures()])),
      ],
    );
  }

  Future<void> _addGoal() async {
    final titleC = TextEditingController();
    final targetC = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Yangi maqsad'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: titleC, decoration: const InputDecoration(hintText: 'Nomi (masalan: Noutbuk)')),
            const SizedBox(height: Gap.sm),
            TextField(controller: targetC, keyboardType: TextInputType.number, decoration: const InputDecoration(hintText: 'Summa (₩)')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Bekor')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Saqlash')),
        ],
      ),
    );
    if (ok == true && titleC.text.trim().isNotEmpty) {
      final target = num.tryParse(targetC.text.trim()) ?? 0;
      if (target > 0) {
        try {
          await context.read<AuthProvider>().api.addGoal(titleC.text.trim(), target);
          await _load();
        } catch (e) {
          if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
        }
      }
    }
  }

  Future<void> _addToGoal(Goal g) async {
    final c = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text('"${g.title}" ga pul qo\'shish'),
        content: TextField(controller: c, keyboardType: TextInputType.number, decoration: const InputDecoration(hintText: 'Summa (₩, manfiy = ayirish)')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Bekor')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Qo\'shish')),
        ],
      ),
    );
    if (ok == true) {
      final amt = num.tryParse(c.text.trim());
      if (amt != null) {
        try {
          await context.read<AuthProvider>().api.addToGoal(g.id, amt);
          await _load();
        } catch (e) {
          if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
        }
      }
    }
  }
}
