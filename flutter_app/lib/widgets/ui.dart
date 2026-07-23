import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

// ---------------- Valyuta (global — sozlamalardan) ----------------
/// Barcha summalar KRW'da saqlanadi. Money joriy valyuta va kursni ushlaydi;
/// fmtWon/fmtWonShort avtomatik konvertatsiya qiladi (SettingsProvider yangilaydi).
class Money {
  static String symbol = '₩';
  static double rate = 1; // 1 KRW = `rate` tanlangan valyuta
  static void set(String sym, double r) {
    symbol = sym;
    rate = r > 0 ? r : 1;
  }
}

// ---------------- Formatlash ----------------
// Alifbo belgilari (so'm, сом) raqamdan keyin, ramzlar (₩ $ ¥) oldin.
bool _symAfter(String s) => RegExp(r'^[A-Za-zА-Яа-я]').hasMatch(s);
String _wrap(String num, String sign) {
  final s = Money.symbol;
  return _symAfter(s) ? '$sign$num $s' : '$sign$s$num';
}

String fmtWon(num v) {
  final val = (v * Money.rate).round();
  return _wrap(NumberFormat('#,###').format(val.abs()), v < 0 ? '−' : '');
}

/// Ixcham valyuta: ₩1.3M / ₩450K
String fmtWonShort(num v) {
  final a = (v.abs()) * Money.rate;
  final sign = v < 0 ? '−' : '';
  String n;
  if (a >= 1000000) {
    n = '${(a / 1000000).toStringAsFixed(a >= 10000000 ? 0 : 1)}M';
  } else if (a >= 1000) {
    n = '${(a / 1000).toStringAsFixed(0)}K';
  } else {
    n = '${a.round()}';
  }
  return _wrap(n, sign);
}

String fmtHm(int minutes) {
  final h = minutes ~/ 60;
  final m = minutes % 60;
  return '${h}h ${m.toString().padLeft(2, '0')}m';
}

String fmtClock(int seconds) {
  final h = seconds ~/ 3600;
  final m = (seconds % 3600) ~/ 60;
  final s = seconds % 60;
  return '$h:${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
}

// ---------------- Asosiy komponentlar ----------------

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

/// Bo'lim sarlavhasi + ixtiyoriy amal tugmasi.
class SectionHeader extends StatelessWidget {
  final String title;
  final Widget? trailing;
  const SectionHeader(this.title, {super.key, this.trailing});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(Gap.xs, Gap.sm, Gap.xs, Gap.sm),
        child: Row(
          children: [
            Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, letterSpacing: -0.3)),
            const Spacer(),
            if (trailing != null) trailing!,
          ],
        ),
      );
}

/// Toza surface karta (soft shadow, 24px radius).
class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  final Gradient? gradient;
  final Border? border;
  const AppCard({super.key, required this.child, this.padding = const EdgeInsets.all(Gap.md), this.onTap, this.gradient, this.border});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: gradient == null ? AppColors.surface : null,
        gradient: gradient,
        borderRadius: BorderRadius.circular(Gap.radius),
        border: border,
        boxShadow: const [
          BoxShadow(color: Color(0x33000000), blurRadius: 24, offset: Offset(0, 8)),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(Gap.radius),
        child: InkWell(
          borderRadius: BorderRadius.circular(Gap.radius),
          onTap: onTap,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

/// Bitta statistika bloki.
class StatTile extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  final double valueSize;
  const StatTile({super.key, required this.label, required this.value, this.valueColor, this.valueSize = 26});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Label(label),
        const SizedBox(height: Gap.xs),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: valueSize,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
            color: valueColor ?? AppColors.textPrimary,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }
}

/// Progress bar (maqsad, byudjet uchun).
class ProgressBar extends StatelessWidget {
  final double value; // 0..1
  final Color color;
  final double height;
  const ProgressBar({super.key, required this.value, this.color = AppColors.primary, this.height = 10});
  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(height),
      child: Stack(
        children: [
          Container(height: height, color: AppColors.surface2),
          FractionallySizedBox(
            widthFactor: value.clamp(0, 1),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 500),
              curve: Curves.easeOutCubic,
              height: height,
              decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(height)),
            ),
          ),
        ],
      ),
    );
  }
}

/// Yumaloq pill chip tugma.
class PillButton extends StatelessWidget {
  final String label;
  final VoidCallback? onTap;
  final Color? color;
  final Color? textColor;
  final IconData? icon;
  const PillButton({super.key, required this.label, this.onTap, this.color, this.textColor, this.icon});
  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.surface2;
    final tc = textColor ?? AppColors.textPrimary;
    return Material(
      color: c,
      borderRadius: BorderRadius.circular(30),
      child: InkWell(
        borderRadius: BorderRadius.circular(30),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[Icon(icon, size: 16, color: tc), const SizedBox(width: 6)],
              Text(label, style: TextStyle(color: tc, fontWeight: FontWeight.w700, fontSize: 13.5)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Skeleton (yuklanish) plashkasi — pulsatsiyalanuvchi.
class Skeleton extends StatefulWidget {
  final double height;
  final double? width;
  final double radius;
  const Skeleton({super.key, this.height = 16, this.width, this.radius = 12});
  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat(reverse: true);
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween(begin: 0.35, end: 0.75).animate(_c),
      child: Container(
        height: widget.height,
        width: widget.width,
        decoration: BoxDecoration(color: AppColors.surface2, borderRadius: BorderRadius.circular(widget.radius)),
      ),
    );
  }
}

/// Dashboard skeleton ekrani.
class DashboardSkeleton extends StatelessWidget {
  const DashboardSkeleton({super.key});
  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(Gap.md, Gap.lg, Gap.md, Gap.xl),
      children: const [
        Skeleton(height: 16, width: 120),
        SizedBox(height: Gap.sm),
        Skeleton(height: 30, width: 180),
        SizedBox(height: Gap.lg),
        Skeleton(height: 150, radius: Gap.radius),
        SizedBox(height: Gap.md),
        Skeleton(height: 140, radius: Gap.radius),
        SizedBox(height: Gap.md),
        Skeleton(height: 74, radius: Gap.radius),
      ],
    );
  }
}
