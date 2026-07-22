import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// Umumiy formatlash yordamchilari.
String fmtWon(num v) => '₩${NumberFormat('#,###').format(v.round())}';

String fmtHm(int minutes) {
  final h = minutes ~/ 60;
  final m = minutes % 60;
  return '${h}h ${m.toString().padLeft(2, '0')}m';
}

/// Sarlavha ustidagi kichik yorliq.
class Label extends StatelessWidget {
  final String text;
  const Label(this.text, {super.key});
  @override
  Widget build(BuildContext context) => Text(
        text.toUpperCase(),
        style: const TextStyle(
          color: AppColors.textSecondary,
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.6,
        ),
      );
}

/// Toza surface karta (soft shadow, 24px radius).
class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  const AppCard({super.key, required this.child, this.padding = const EdgeInsets.all(Gap.md), this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(Gap.radius),
      child: InkWell(
        borderRadius: BorderRadius.circular(Gap.radius),
        onTap: onTap,
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

/// Bitta statistika bloki (Today's earnings, Worked, This month...).
class StatTile extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  const StatTile({super.key, required this.label, required this.value, this.valueColor});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Label(label),
        const SizedBox(height: Gap.xs),
        Text(
          value,
          style: TextStyle(
            fontSize: 26,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
            color: valueColor ?? AppColors.textPrimary,
          ),
        ),
      ],
    );
  }
}
