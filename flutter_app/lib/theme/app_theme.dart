import 'package:flutter/material.dart';
import 'app_colors.dart';

/// 8px spacing tizimi — barcha bo'shliqlar shu qadamlarda.
abstract class Gap {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 16.0;
  static const lg = 24.0;
  static const xl = 32.0;
  static const radius = 24.0; // kartalar radiusi
  static const radiusSm = 16.0;
}

/// Material 3, dark, bitta accent. Yumshoq soyalar, keng bo'shliq, toza tipografiya.
class AppTheme {
  static ThemeData get dark {
    final scheme = const ColorScheme.dark(
      primary: AppColors.primary,
      secondary: AppColors.primary,
      surface: AppColors.surface,
      error: AppColors.danger,
      onPrimary: Colors.white,
      onSurface: AppColors.textPrimary,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: AppColors.bg,
      colorScheme: scheme,
      fontFamily: 'SF Pro Display', // fallback tizim shrifti; keyin custom shrift ulanadi
      splashFactory: InkRipple.splashFactory,
      textTheme: const TextTheme(
        headlineLarge: TextStyle(fontWeight: FontWeight.w800, letterSpacing: -0.5, color: AppColors.textPrimary),
        titleLarge: TextStyle(fontWeight: FontWeight.w700, color: AppColors.textPrimary),
        bodyMedium: TextStyle(color: AppColors.textSecondary, height: 1.35),
        labelLarge: TextStyle(fontWeight: FontWeight.w700),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(52),
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Gap.radiusSm)),
          textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface2,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(Gap.radiusSm),
          borderSide: BorderSide.none,
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      ),
      dividerColor: AppColors.line,
    );
  }

  /// Yorug' tema (System/Light tanlansa). Bir xil accent (#7C5CFF).
  static ThemeData get light {
    final scheme = const ColorScheme.light(
      primary: AppColors.primary,
      secondary: AppColors.primary,
      surface: Colors.white,
      error: AppColors.danger,
      onPrimary: Colors.white,
      onSurface: Color(0xFF14161F),
    );
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: const Color(0xFFF4F5FA),
      colorScheme: scheme,
      splashFactory: InkRipple.splashFactory,
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(52),
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Gap.radiusSm)),
          textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFFECEEF5),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(Gap.radiusSm), borderSide: BorderSide.none),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      dividerColor: const Color(0xFFECEEF5),
    );
  }
}
