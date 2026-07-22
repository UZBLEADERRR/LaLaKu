import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// Moliya — skeleton. Keyingi bosqichda: income/expenses/remaining grafiklari
/// (fl_chart donut/bar), qarzlar (oyma-oy), maqsadlar (goals), prognoz.
class FinanceScreen extends StatelessWidget {
  const FinanceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(Gap.md, Gap.lg, Gap.md, Gap.xl),
      children: [
        const Text('Finance', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
        const SizedBox(height: Gap.lg),
        AppCard(
          padding: const EdgeInsets.all(Gap.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: const [
              _Bar(label: 'Income', value: 1.0, color: AppColors.success),
              SizedBox(height: Gap.md),
              _Bar(label: 'Expenses', value: 0.35, color: AppColors.danger),
              SizedBox(height: Gap.md),
              _Bar(label: 'Remaining', value: 0.65, color: AppColors.primary),
            ],
          ),
        ),
        const SizedBox(height: Gap.md),
        // TODO: /api/finance dan real ma'lumot; donut chart; goals; qarz guruhlash.
        const _EmptyState(icon: Icons.pie_chart_outline, text: 'Grafiklar keyingi bosqichda (fl_chart)'),
      ],
    );
  }
}

class _Bar extends StatelessWidget {
  final String label;
  final double value;
  final Color color;
  const _Bar({required this.label, required this.value, required this.color});
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Label(label),
        const SizedBox(height: Gap.sm),
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: LinearProgressIndicator(
            value: value,
            minHeight: 12,
            backgroundColor: AppColors.surface2,
            valueColor: AlwaysStoppedAnimation(color),
          ),
        ),
      ],
    );
  }
}

class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String text;
  const _EmptyState({required this.icon, required this.text});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Gap.xl),
      child: Column(
        children: [
          Icon(icon, size: 40, color: AppColors.textSecondary),
          const SizedBox(height: Gap.md),
          Text(text, style: const TextStyle(color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}
