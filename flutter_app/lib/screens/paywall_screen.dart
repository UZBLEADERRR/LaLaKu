import 'package:flutter/material.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:provider/provider.dart';

import '../services/auth_provider.dart';
import '../services/purchase_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// Premium obuna paywall — Google Play / App Store billing orqali.
class PaywallScreen extends StatefulWidget {
  const PaywallScreen({super.key});
  @override
  State<PaywallScreen> createState() => _PaywallScreenState();
}

class _PaywallScreenState extends State<PaywallScreen> {
  late final PurchaseService _service;

  static const _features = [
    ('✨', 'AI moliyaviy yordamchi', 'Shaxsiy maslahatlar va bildirishnomalar'),
    ('📊', 'To\'liq statistika va grafiklar', 'Prognoz, overtime, tahlil'),
    ('🎯', 'Cheksiz maqsadlar', 'Jamg\'arma rejalaringizni kuzating'),
    ('📄', 'Eksport (PDF / Excel / rasm)', 'Hisobotlarni ulashing'),
    ('⏰', 'Barcha eslatmalar', 'Smena, maosh kuni, to\'lovlar'),
  ];

  @override
  void initState() {
    super.initState();
    _service = PurchaseService(context.read<AuthProvider>().api)
      ..onActivated = _onActivated;
    _service.init();
  }

  @override
  void dispose() {
    _service.dispose();
    super.dispose();
  }

  Future<void> _onActivated() async {
    // Premium yoqildi — /api/me ni yangilaymiz.
    await context.read<AuthProvider>().refresh();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Premium faollashtirildi! 🎉'), backgroundColor: AppColors.success),
      );
      Navigator.of(context).pop(true);
    }
  }

  String _period(String id) => id.contains('yearly') ? 'yillik' : 'oylik';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          TextButton(onPressed: () => _service.restore(), child: const Text('Tiklash', style: TextStyle(color: AppColors.textSecondary))),
        ],
      ),
      body: AnimatedBuilder(
        animation: _service,
        builder: (context, _) {
          return ListView(
            padding: const EdgeInsets.fromLTRB(Gap.md, 0, Gap.md, Gap.xl),
            children: [
              // Sarlavha
              Center(
                child: Container(
                  width: 76,
                  height: 76,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [AppColors.primary, Color(0xFF9B7DFF)]),
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [BoxShadow(color: AppColors.primary.withOpacity(0.4), blurRadius: 24, offset: const Offset(0, 10))],
                  ),
                  child: const Center(child: Text('👑', style: TextStyle(fontSize: 38))),
                ),
              ),
              const SizedBox(height: Gap.md),
              const Center(child: Text('AlbaFit Premium', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.5))),
              const SizedBox(height: Gap.xs),
              const Center(child: Text('Barcha imkoniyatlarni oching', style: TextStyle(color: AppColors.textSecondary, fontSize: 14))),
              const SizedBox(height: Gap.xl),

              // Xususiyatlar
              ..._features.map((f) => Padding(
                    padding: const EdgeInsets.only(bottom: Gap.md),
                    child: Row(
                      children: [
                        Text(f.$1, style: const TextStyle(fontSize: 22)),
                        const SizedBox(width: Gap.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(f.$2, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                              Text(f.$3, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
                            ],
                          ),
                        ),
                        const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 22),
                      ],
                    ),
                  )),
              const SizedBox(height: Gap.lg),

              // Mahsulotlar
              if (_service.loading)
                const Center(child: Padding(padding: EdgeInsets.all(Gap.lg), child: CircularProgressIndicator(color: AppColors.primary)))
              else if (!_service.available)
                const AppCard(child: Text('Do\'kon hozircha mavjud emas. Keyinroq urinib ko\'ring.', style: TextStyle(color: AppColors.textSecondary)))
              else if (_service.products.isEmpty)
                const AppCard(
                  child: Text(
                    'Obuna mahsulotlari topilmadi.\nPlay Console\'da albafit_premium_monthly / _yearly sozlang.',
                    style: TextStyle(color: AppColors.textSecondary),
                  ),
                )
              else
                ..._service.products.map((p) => Padding(
                      padding: const EdgeInsets.only(bottom: Gap.sm),
                      child: AppCard(
                        onTap: _service.purchasing ? null : () => _service.buy(p),
                        border: Border.all(color: AppColors.primary.withOpacity(0.4)),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(p.title.isEmpty ? 'Premium ${_period(p.id)}' : p.title,
                                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5)),
                                  Text(_period(p.id), style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
                                ],
                              ),
                            ),
                            Text(p.price, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: AppColors.primary)),
                          ],
                        ),
                      ),
                    )),

              if (_service.purchasing) ...[
                const SizedBox(height: Gap.md),
                const Center(child: CircularProgressIndicator(color: AppColors.primary)),
              ],
              if (_service.error != null) ...[
                const SizedBox(height: Gap.md),
                Text(_service.error!, style: const TextStyle(color: AppColors.danger, fontSize: 12.5), textAlign: TextAlign.center),
              ],

              const SizedBox(height: Gap.lg),
              const Text(
                'Obuna Google Play / App Store orqali boshqariladi. Istalgan vaqtda bekor qilishingiz mumkin.',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 11.5),
                textAlign: TextAlign.center,
              ),
            ],
          );
        },
      ),
    );
  }
}
