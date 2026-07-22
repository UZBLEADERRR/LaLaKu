import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/auth_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// Profil — bo'limlarga ajratilgan (Account, Workplaces, Currency, Appearance,
/// Notifications, Security, About). Skeleton — har biri keyin to'ldiriladi.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final me = auth.me;
    final sections = <(IconData, String)>[
      (Icons.person_outline, 'Account'),
      (Icons.work_outline, 'Workplaces'),
      (Icons.currency_exchange, 'Currency'),
      (Icons.palette_outlined, 'Appearance'),
      (Icons.notifications_none, 'Notifications'),
      (Icons.lock_outline, 'Security'),
      (Icons.info_outline, 'About'),
    ];

    return ListView(
      padding: const EdgeInsets.fromLTRB(Gap.md, Gap.lg, Gap.md, Gap.xl),
      children: [
        Row(
          children: [
            CircleAvatar(
              radius: 28,
              backgroundColor: AppColors.primary.withOpacity(0.2),
              child: Text(
                (me?.name.isNotEmpty ?? false) ? me!.name[0] : '?',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
              ),
            ),
            const SizedBox(width: Gap.md),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(me?.name ?? '', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                Text(me?.phone ?? '', style: const TextStyle(color: AppColors.textSecondary)),
              ],
            ),
          ],
        ),
        const SizedBox(height: Gap.lg),
        AppCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (final s in sections)
                ListTile(
                  leading: Icon(s.$1, color: AppColors.textSecondary),
                  title: Text(s.$2, style: const TextStyle(fontWeight: FontWeight.w600)),
                  trailing: const Icon(Icons.chevron_right, color: AppColors.textSecondary),
                  onTap: () {}, // TODO: har bir bo'lim ekrani
                ),
            ],
          ),
        ),
        const SizedBox(height: Gap.lg),
        OutlinedButton(
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.danger,
            minimumSize: const Size.fromHeight(52),
            side: const BorderSide(color: AppColors.line),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Gap.radiusSm)),
          ),
          onPressed: () => auth.logout(),
          child: const Text('Chiqish'),
        ),
      ],
    );
  }
}
