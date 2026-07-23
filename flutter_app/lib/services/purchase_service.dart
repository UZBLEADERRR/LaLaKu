import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:in_app_purchase/in_app_purchase.dart';

import 'api_client.dart';

/// Google Play / App Store obuna (premium) xizmati.
///
/// Play Console / App Store Connect'da quyidagi obuna mahsulotlarini yarating:
///   - albafit_premium_monthly (oylik)
///   - albafit_premium_yearly  (yillik)
/// Xarid muvaffaqiyatli bo'lgach, token backend'ga (`/api/subscription/verify`)
/// yuboriladi va foydalanuvchi premiumga o'tkaziladi.
class PurchaseService extends ChangeNotifier {
  static const monthlyId = 'albafit_premium_monthly';
  static const yearlyId = 'albafit_premium_yearly';
  static const _ids = {monthlyId, yearlyId};

  final ApiClient api;
  final InAppPurchase _iap = InAppPurchase.instance;
  StreamSubscription<List<PurchaseDetails>>? _sub;

  bool available = false;
  bool loading = true;
  bool purchasing = false;
  String? error;
  List<ProductDetails> products = const [];

  /// Xarid tasdiqlanib premium yoqilganda chaqiriladi.
  void Function()? onActivated;

  PurchaseService(this.api);

  Future<void> init() async {
    loading = true;
    notifyListeners();
    try {
      available = await _iap.isAvailable();
      if (available) {
        _sub = _iap.purchaseStream.listen(_onPurchaseUpdates, onError: (e) {
          error = '$e';
          notifyListeners();
        });
        final resp = await _iap.queryProductDetails(_ids);
        products = resp.productDetails..sort((a, b) => a.rawPrice.compareTo(b.rawPrice));
      }
    } catch (e) {
      error = '$e';
    }
    loading = false;
    notifyListeners();
  }

  Future<void> buy(ProductDetails product) async {
    purchasing = true;
    error = null;
    notifyListeners();
    final param = PurchaseParam(productDetails: product);
    try {
      // Obuna — buyNonConsumable orqali sotib olinadi.
      await _iap.buyNonConsumable(purchaseParam: param);
    } catch (e) {
      error = '$e';
      purchasing = false;
      notifyListeners();
    }
  }

  Future<void> restore() async {
    try {
      await _iap.restorePurchases();
    } catch (e) {
      error = '$e';
      notifyListeners();
    }
  }

  Future<void> _onPurchaseUpdates(List<PurchaseDetails> purchases) async {
    for (final p in purchases) {
      switch (p.status) {
        case PurchaseStatus.pending:
          purchasing = true;
          notifyListeners();
          break;
        case PurchaseStatus.error:
          error = p.error?.message ?? 'Xarid xatosi';
          purchasing = false;
          notifyListeners();
          break;
        case PurchaseStatus.canceled:
          purchasing = false;
          notifyListeners();
          break;
        case PurchaseStatus.purchased:
        case PurchaseStatus.restored:
          await _deliver(p);
          break;
      }
      if (p.pendingCompletePurchase) {
        await _iap.completePurchase(p);
      }
    }
  }

  Future<void> _deliver(PurchaseDetails p) async {
    try {
      await api.verifyPurchase(
        platform: Platform.isIOS ? 'ios' : 'android',
        productId: p.productID,
        purchaseToken: p.verificationData.serverVerificationData,
      );
      purchasing = false;
      error = null;
      notifyListeners();
      onActivated?.call();
    } catch (e) {
      error = '$e';
      purchasing = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
