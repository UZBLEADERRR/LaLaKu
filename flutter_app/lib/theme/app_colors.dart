import 'package:flutter/material.dart';

/// Joriy accent rang (foydalanuvchi tanlashi mumkin) — runtime holder.
class Palette {
  static const defaultAccent = Color(0xFF7C5CFF);
  static Color accent = defaultAccent;
  /// Gradient ikkinchi rang — accent'dan biroz ochiqroq.
  static Color get accent2 => Color.lerp(accent, Colors.white, 0.22)!;
}

/// AlbaFit dizayn palitrasi — premium fintech, qora (Linear / Revolut uslubi).
/// `primary` — foydalanuvchi tanlagan accent (Palette).
abstract class AppColors {
  static const bg = Color(0xFF0F1117); // Background
  static const surface = Color(0xFF171A22); // Surface (kartalar)
  static const surface2 = Color(0xFF1E222C); // ko'tarilgan yuza
  static Color get primary => Palette.accent; // Primary accent (dinamik)
  static const success = Color(0xFF24D17E); // Success (maosh, +)
  static const danger = Color(0xFFFF5C7A); // Danger (chiqim, stop)
  static const warning = Color(0xFFFFB547); // Warning (overtime, kechikkan)
  static const textPrimary = Color(0xFFFFFFFF);
  static const textSecondary = Color(0xFFA2A8B5);
  static const line = Color(0xFF262B36); // ajratuvchi chiziq/border

  // Kalendar heatmap (ishlangan soatlarga qarab)
  static const heat0 = Color(0xFF1C2029); // ishlanmagan
  static const heat1 = Color(0xFF294B3B); // 1-4 soat
  static const heat2 = Color(0xFF2E6B49); // 4-8 soat
  static const heat3 = Color(0xFF24D17E); // 8+ soat
}
