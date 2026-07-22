import 'package:flutter/material.dart';

/// AlbaFit dizayn palitrasi — premium fintech, qora (Linear / Revolut uslubi).
/// Bitta accent rang (#7C5CFF), yumshoq soyalar, glassmorphismsiz.
abstract class AppColors {
  static const bg = Color(0xFF0F1117); // Background
  static const surface = Color(0xFF171A22); // Surface (kartalar)
  static const surface2 = Color(0xFF1E222C); // ko'tarilgan yuza
  static const primary = Color(0xFF7C5CFF); // Primary accent
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
