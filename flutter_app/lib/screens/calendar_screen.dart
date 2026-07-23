import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models.dart';
import '../services/auth_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// Kalendar — GitHub contribution graph uslubidagi heatmap.
/// Kun bosilganda BottomSheet ochiladi (worked / salary / notes).
class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});
  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  MonthSummary? _summary;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final api = context.read<AuthProvider>().api;
    try {
      _summary = await api.summary(_month.year, _month.month);
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Color _heat(int minutes) {
    if (minutes <= 0) return AppColors.heat0;
    if (minutes < 4 * 60) return AppColors.heat1;
    if (minutes < 8 * 60) return AppColors.heat2;
    return AppColors.heat3;
  }

  void _openDay(String key, int minutes) {
    showModalBottomSheet(
      context: context,
      builder: (_) => Padding(
        padding: const EdgeInsets.all(Gap.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(key, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: Gap.md),
            Row(
              children: [
                Expanded(child: StatTile(label: 'Worked', value: fmtHm(minutes))),
                // TODO: shu kun uchun maosh, notes, edit/delete (backend /api/my/summary day sessions)
                const Expanded(child: StatTile(label: 'Salary', value: '—', valueColor: AppColors.success)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final daysInMonth = DateTime(_month.year, _month.month + 1, 0).day;
    return ListView(
      padding: const EdgeInsets.fromLTRB(Gap.md, Gap.lg, Gap.md, Gap.xl),
      children: [
        Row(
          children: [
            Text('${_month.year}-${_month.month.toString().padLeft(2, '0')}',
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            const Spacer(),
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
        const SizedBox(height: Gap.md),
        if (_loading)
          const Center(child: Padding(padding: EdgeInsets.all(Gap.xl), child: CircularProgressIndicator()))
        else
          AppCard(
            padding: const EdgeInsets.all(Gap.md),
            child: GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: daysInMonth,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 7,
                mainAxisSpacing: 6,
                crossAxisSpacing: 6,
                childAspectRatio: 1,
              ),
              itemBuilder: (_, i) {
                final d = i + 1;
                final key = '${_month.year.toString().padLeft(4, '0')}-${_month.month.toString().padLeft(2, '0')}-${d.toString().padLeft(2, '0')}';
                final minutes = _summary?.minutesOn(key) ?? 0;
                return InkWell(
                  borderRadius: BorderRadius.circular(8),
                  onTap: () => _openDay(key, minutes),
                  child: Container(
                    decoration: BoxDecoration(color: _heat(minutes), borderRadius: BorderRadius.circular(8)),
                    alignment: Alignment.center,
                    child: Text('$d', style: TextStyle(fontSize: 11, color: minutes > 0 ? Colors.white : AppColors.textSecondary)),
                  ),
                );
              },
            ),
          ),
        const SizedBox(height: Gap.md),
        const Text('⬜ 0   🟩 1–4h   🟨 4–8h   🟦 8h+', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
      ],
    );
  }
}
