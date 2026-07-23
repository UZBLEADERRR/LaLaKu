import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../i18n.dart';
import '../services/auth_provider.dart';
import '../services/settings_provider.dart';
import '../services/notification_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'paywall_screen.dart';
import 'web_panel_screen.dart';

/// Profil — ishlaydigan sozlamalar: Server, Til, Valyuta, Bildirishnoma, Premium.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final settings = context.watch<SettingsProvider>();
    final me = auth.me;
    final isPremium = (me?.active ?? false) && (me?.daysLeft ?? 0) > 7;

    return ListView(
      padding: const EdgeInsets.fromLTRB(Gap.md, Gap.lg, Gap.md, Gap.xl),
      children: [
        Row(
          children: [
            CircleAvatar(
              radius: 28,
              backgroundColor: AppColors.primary.withOpacity(0.2),
              child: Text(
                (me?.name.isNotEmpty ?? false) ? me!.name[0].toUpperCase() : '?',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
              ),
            ),
            const SizedBox(width: Gap.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(me?.name ?? '', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                  Text(me?.phone ?? '', style: const TextStyle(color: AppColors.textSecondary)),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: Gap.lg),

        // Premium karta
        AppCard(
          onTap: () async {
            final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const PaywallScreen()));
            if (ok == true) auth.refresh();
          },
          gradient: LinearGradient(
            colors: isPremium ? [AppColors.success.withOpacity(0.22), AppColors.surface] : [AppColors.primary.withOpacity(0.22), AppColors.surface],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          child: Row(
            children: [
              Text(isPremium ? '👑' : '✨', style: const TextStyle(fontSize: 26)),
              const SizedBox(width: Gap.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(isPremium ? tr('premium_active') : tr('premium_title'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                    Text(isPremium ? '${me?.daysLeft ?? 0} ${tr('days_left')}' : tr('premium_sub'),
                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.textSecondary),
            ],
          ),
        ),
        const SizedBox(height: Gap.lg),

        // Akkauntlar
        SectionHeader(tr('accounts'), trailing: PillButton(label: '＋', icon: Icons.person_add_alt_1_rounded, color: AppColors.primary.withOpacity(0.16), textColor: AppColors.primary, onTap: () => auth.addAccountFlow())),
        AppCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (int i = 0; i < auth.accounts.length; i++) ...[
                if (i > 0) _divider(),
                ListTile(
                  leading: CircleAvatar(
                    radius: 18,
                    backgroundColor: AppColors.primary.withOpacity(0.18),
                    child: Text(
                      (auth.accounts[i]['type'] == 'business') ? '🍽' : ((auth.accounts[i]['name'] as String?)?.isNotEmpty == true ? (auth.accounts[i]['name'] as String)[0].toUpperCase() : '?'),
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
                    ),
                  ),
                  title: Text('${auth.accounts[i]['name'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(auth.accounts[i]['type'] == 'business' ? '🍽 ${tr('kitchen_panel').split(' ').first}' : ''),
                  trailing: i == auth.activeIndex
                      ? const Text('✓', style: TextStyle(color: AppColors.success, fontWeight: FontWeight.w800, fontSize: 18))
                      : TextButton(onPressed: () => auth.switchAccount(i), child: Text(tr('switch_acc'))),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: Gap.lg),

        AppCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              _row(Icons.storefront_outlined, tr('kitchen_panel'), '', () {
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => WebPanelScreen(url: settings.api.baseUrl, title: tr('kitchen_panel'))));
              }),
              _divider(),
              _row(Icons.language, tr('language'), I18n.supported[settings.lang] ?? settings.lang, () => _pickLanguage(context, settings)),
              _divider(),
              _row(Icons.currency_exchange, tr('currency'), settings.currency, () => _pickCurrency(context, settings)),
              _divider(),
              _appearanceRow(context, settings),
              _divider(),
              _row(Icons.notifications_none, tr('notifications'), '', () => _notifications(context)),
              _divider(),
              _row(Icons.dns_outlined, tr('server'), '', () => _serverUrl(context, settings)),
              _divider(),
              _row(Icons.info_outline, tr('about'), 'v1.0.0', () => _about(context, settings)),
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
          child: Text(tr('logout')),
        ),
      ],
    );
  }

  Widget _row(IconData icon, String title, String value, VoidCallback onTap) => ListTile(
        leading: Icon(icon, color: AppColors.textSecondary),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
          if (value.isNotEmpty) Text(value, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          const SizedBox(width: 4),
          const Icon(Icons.chevron_right, color: AppColors.textSecondary),
        ]),
        onTap: onTap,
      );

  Widget _divider() => const Divider(height: 1, color: AppColors.line, indent: 56);

  void _sheet(BuildContext context, String title, List<Widget> children) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(Gap.lg, Gap.lg, Gap.lg, Gap.lg + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: Gap.md),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _appearanceRow(BuildContext context, SettingsProvider s) => ListTile(
        leading: const Icon(Icons.palette_outlined, color: AppColors.textSecondary),
        title: Text(tr('appearance'), style: const TextStyle(fontWeight: FontWeight.w600)),
        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 18, height: 18, decoration: BoxDecoration(color: s.accent, shape: BoxShape.circle)),
          const SizedBox(width: 8),
          const Icon(Icons.chevron_right, color: AppColors.textSecondary),
        ]),
        onTap: () => _pickAppearance(context, s),
      );

  void _pickAppearance(BuildContext context, SettingsProvider s) {
    _sheet(context, tr('appearance'), [
      // Mavzu (qorong'i / yorug')
      Text(tr('theme'), style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5, fontWeight: FontWeight.w700)),
      const SizedBox(height: Gap.sm),
      StatefulBuilder(
        builder: (ctx, setSt) => Row(
          children: [
            for (final m in [ThemeMode.dark, ThemeMode.light])
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(right: m == ThemeMode.dark ? Gap.sm : 0),
                  child: GestureDetector(
                    onTap: () {
                      s.setTheme(m);
                      setSt(() {});
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      decoration: BoxDecoration(
                        color: AppColors.surface2,
                        borderRadius: BorderRadius.circular(Gap.radiusSm),
                        border: Border.all(color: s.themeMode == m ? AppColors.primary : AppColors.line, width: s.themeMode == m ? 2 : 1),
                      ),
                      child: Center(
                        child: Text(m == ThemeMode.dark ? '🌙  ${tr('theme_dark')}' : '☀️  ${tr('theme_light')}',
                            style: const TextStyle(fontWeight: FontWeight.w700)),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
      const SizedBox(height: Gap.lg),
      // Accent ranglar
      Text(tr('theme'), style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5, fontWeight: FontWeight.w700)),
      const SizedBox(height: Gap.sm),
      StatefulBuilder(
        builder: (ctx, setSt) => Wrap(
          spacing: 14,
          runSpacing: 14,
          children: SettingsProvider.accentPresets.values.map((c) {
            final selected = s.accent.value == c.value;
            return GestureDetector(
              onTap: () {
                s.setAccent(c);
                setSt(() {});
              },
              child: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: c,
                  shape: BoxShape.circle,
                  border: Border.all(color: selected ? Colors.white : Colors.transparent, width: 3),
                  boxShadow: [BoxShadow(color: c.withOpacity(0.5), blurRadius: 10)],
                ),
                child: selected ? const Icon(Icons.check, color: Colors.white, size: 22) : null,
              ),
            );
          }).toList(),
        ),
      ),
    ]);
  }

  void _pickLanguage(BuildContext context, SettingsProvider s) {
    _sheet(context, tr('language'), I18n.supported.entries.map((e) => ListTile(
          title: Text(e.value),
          trailing: s.lang == e.key ? Icon(Icons.check, color: AppColors.primary) : null,
          onTap: () {
            s.setLang(e.key);
            Navigator.pop(context);
          },
        )).toList());
  }

  void _pickCurrency(BuildContext context, SettingsProvider s) {
    _sheet(context, tr('currency'), SettingsProvider.currencySymbols.entries.map((e) => ListTile(
          leading: Text(e.value, style: const TextStyle(fontSize: 18)),
          title: Text(e.key),
          trailing: s.currency == e.key ? Icon(Icons.check, color: AppColors.primary) : null,
          onTap: () {
            s.setCurrency(e.key);
            Navigator.pop(context);
          },
        )).toList());
  }

  void _notifications(BuildContext context) {
    _sheet(context, tr('notifications'), [
      const Text('AlbaFit smena, maosh kuni va AI maslahatlari uchun bildirishnoma yuboradi.',
          style: TextStyle(color: AppColors.textSecondary)),
      const SizedBox(height: Gap.md),
      SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          icon: const Icon(Icons.notifications_active_rounded),
          label: Text(tr('notifications')),
          onPressed: () async {
            final ok = await NotificationService.requestPermissions();
            if (context.mounted) {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(ok ? 'Bildirishnoma yoqildi ✅' : 'Ruxsat berilmadi')),
              );
            }
          },
        ),
      ),
    ]);
  }

  void _serverUrl(BuildContext context, SettingsProvider s) {
    final c = TextEditingController(text: s.serverUrl.isEmpty ? s.api.baseUrl : s.serverUrl);
    _sheet(context, tr('server'), [
      Text(tr('server_hint'), style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
      const SizedBox(height: Gap.md),
      TextField(controller: c, keyboardType: TextInputType.url, decoration: const InputDecoration(hintText: 'https://...')),
      const SizedBox(height: Gap.md),
      SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          onPressed: () async {
            await s.setServerUrl(c.text.trim());
            if (context.mounted) {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saqlandi — ilovani qayta oching')));
            }
          },
          child: Text(tr('save_server')),
        ),
      ),
    ]);
  }

  void _about(BuildContext context, SettingsProvider s) {
    _sheet(context, tr('about'), [
      Center(
        child: Column(
          children: [
            Container(
              width: 64, height: 64,
              decoration: BoxDecoration(gradient: LinearGradient(colors: [AppColors.primary, Color(0xFF9B7DFF)]), borderRadius: BorderRadius.circular(20)),
              child: const Center(child: Text('⏱', style: TextStyle(fontSize: 30))),
            ),
            const SizedBox(height: Gap.md),
            const Text('AlbaFit', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(tr('tagline'), style: const TextStyle(color: AppColors.textSecondary), textAlign: TextAlign.center),
            const SizedBox(height: Gap.sm),
            Text('${s.lang.toUpperCase()} · ${s.currency} · v1.0.0', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
          ],
        ),
      ),
    ]);
  }
}
