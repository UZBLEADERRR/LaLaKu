import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../i18n.dart';
import '../models.dart';
import '../services/auth_provider.dart';
import '../services/settings_provider.dart';
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
  String _finKind = 'expense';

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
    context.watch<SettingsProvider>();
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
          Text(tr('finance'), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
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
                          Label(tr('stays')),
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
                _row(tr('earned_this_month'), fmtWon(income), AppColors.textPrimary),
                const Divider(color: AppColors.line, height: 20),
                if (expenses > 0) _row(tr('monthly_expenses'), '−${fmtWon(expenses)}', AppColors.danger),
                if (debts > 0) _row(tr('fin_debt'), '−${fmtWon(debts)}', AppColors.warning),
                const Divider(color: AppColors.line, height: 20),
                _row(tr('leftover'), fmtWon(leftover), leftover >= 0 ? AppColors.success : AppColors.danger, bold: true),
              ],
            ),
          ),
          const SizedBox(height: Gap.md),

          // Kirim / chiqim / qarz boshqaruvi
          _financeSection(),
          const SizedBox(height: Gap.md),

          // Maqsadlar
          SectionHeader('🎯 ${tr('goals')}', trailing: PillButton(label: '＋', onTap: _addGoal)),
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

  // Kirim / chiqim / qarz bo'limi (tab + ro'yxat + qo'shish)
  Widget _financeSection() {
    final list = _items.where((i) => i.kind == _finKind).toList();
    String label(String k) => k == 'expense' ? tr('fin_expense') : k == 'debt' ? tr('fin_debt') : tr('fin_income');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: SegmentedButton<String>(
                segments: [
                  ButtonSegment(value: 'expense', label: Text(tr('fin_expense'), style: const TextStyle(fontSize: 12))),
                  ButtonSegment(value: 'debt', label: Text(tr('fin_debt'), style: const TextStyle(fontSize: 12))),
                  ButtonSegment(value: 'income', label: Text(tr('fin_income'), style: const TextStyle(fontSize: 12))),
                ],
                selected: {_finKind},
                showSelectedIcon: false,
                onSelectionChanged: (s) => setState(() => _finKind = s.first),
              ),
            ),
            const SizedBox(width: Gap.sm),
            IconButton.filledTonal(icon: const Icon(Icons.add_rounded), onPressed: () => _addFinance(_finKind), tooltip: label(_finKind)),
          ],
        ),
        const SizedBox(height: Gap.sm),
        if (list.isEmpty)
          AppCard(child: Text(tr('fin_none'), style: const TextStyle(color: AppColors.textSecondary)))
        else
          ...list.map((i) => Padding(
                padding: const EdgeInsets.only(bottom: Gap.sm),
                child: AppCard(
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(i.title, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, decoration: i.active ? null : TextDecoration.lineThrough, color: i.active ? AppColors.textPrimary : AppColors.textSecondary)),
                            if (i.dueDay != null) Text('📅 ${i.dueDay}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12))
                            else if (i.dueDate != null) Text('📅 ${i.dueDate}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                          ],
                        ),
                      ),
                      Text(
                        '${_finKind == 'income' ? '+' : '−'}${fmtWon(_finKind == 'income' ? i.amount : i.remaining)}',
                        style: TextStyle(fontWeight: FontWeight.w800, color: _finKind == 'income' ? AppColors.success : AppColors.danger),
                      ),
                      if (_finKind != 'income' && i.active)
                        IconButton(icon: const Icon(Icons.check_circle_outline, color: AppColors.success), tooltip: tr('fin_pay'), onPressed: () => _payItem(i)),
                      IconButton(icon: const Icon(Icons.delete_outline, color: AppColors.textSecondary), onPressed: () => _deleteItem(i)),
                    ],
                  ),
                ),
              )),
      ],
    );
  }

  Future<void> _addFinance(String kind) async {
    final titleC = TextEditingController();
    final amountC = TextEditingController();
    final dueC = TextEditingController();
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(Gap.lg, Gap.lg, Gap.lg, Gap.lg + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('${tr('fin_add')} · ${kind == 'expense' ? tr('fin_expense') : kind == 'debt' ? tr('fin_debt') : tr('fin_income')}',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: Gap.md),
            TextField(controller: titleC, decoration: InputDecoration(hintText: tr('fin_title'))),
            const SizedBox(height: Gap.md),
            TextField(controller: amountC, keyboardType: TextInputType.number, decoration: InputDecoration(hintText: tr('fin_amount'))),
            if (kind != 'income') ...[
              const SizedBox(height: Gap.md),
              TextField(controller: dueC, keyboardType: TextInputType.number, decoration: InputDecoration(hintText: tr('fin_due'))),
            ],
            const SizedBox(height: Gap.lg),
            ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: Text(tr('save'))),
          ],
        ),
      ),
    );
    if (ok == true && titleC.text.trim().isNotEmpty) {
      final amount = num.tryParse(amountC.text.trim()) ?? 0;
      final dueDay = int.tryParse(dueC.text.trim());
      if (amount > 0) {
        try {
          await context.read<AuthProvider>().api.addFinance(kind: kind, title: titleC.text.trim(), amount: amount, dueDay: (dueDay != null && dueDay >= 1 && dueDay <= 31) ? dueDay : null);
          await _load();
        } catch (e) {
          if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
        }
      }
    }
  }

  Future<void> _payItem(FinanceItem i) async {
    try {
      await context.read<AuthProvider>().api.payFinance(i.id, full: true);
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _deleteItem(FinanceItem i) async {
    try {
      await context.read<AuthProvider>().api.deleteFinance(i.id);
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
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
