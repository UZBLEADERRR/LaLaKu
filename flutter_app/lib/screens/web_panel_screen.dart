import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../theme/app_colors.dart';

/// Web ilovani WebView'da ochadi — oshxona (business) paneli uchun.
/// To'liq biznes funksiyalari web'da mavjud; foydalanuvchi shu yerda kiradi.
class WebPanelScreen extends StatefulWidget {
  final String url;
  final String title;
  const WebPanelScreen({super.key, required this.url, this.title = ''});
  @override
  State<WebPanelScreen> createState() => _WebPanelScreenState();
}

class _WebPanelScreenState extends State<WebPanelScreen> {
  late final WebViewController _controller;
  int _progress = 0;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(AppColors.bg)
      ..setNavigationDelegate(NavigationDelegate(
        onProgress: (p) => setState(() => _progress = p),
        onPageFinished: (_) => setState(() => _progress = 100),
      ))
      ..loadRequest(Uri.parse(widget.url));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title.isEmpty ? 'Oshxona paneli' : widget.title),
        backgroundColor: AppColors.surface,
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: () => _controller.reload()),
        ],
        bottom: _progress < 100
            ? PreferredSize(
                preferredSize: const Size.fromHeight(2),
                child: LinearProgressIndicator(value: _progress / 100, minHeight: 2, backgroundColor: AppColors.surface, color: AppColors.primary),
              )
            : null,
      ),
      body: SafeArea(child: WebViewWidget(controller: _controller)),
    );
  }
}
