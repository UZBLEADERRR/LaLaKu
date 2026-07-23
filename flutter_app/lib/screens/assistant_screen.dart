import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../i18n.dart';
import '../models.dart';
import '../services/auth_provider.dart';
import '../services/settings_provider.dart';
import '../services/notification_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// AI yordamchi — chatbot (savol-javob + maslahatlar + bildirishnoma).
class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});
  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _ChatMsg {
  final String role; // 'user' | 'assistant'
  final String text;
  _ChatMsg(this.role, this.text);
  Map<String, String> toJson() => {'role': role, 'text': text};
  factory _ChatMsg.fromJson(Map<String, dynamic> j) => _ChatMsg(j['role'] as String, j['text'] as String);
}

class _AssistantScreenState extends State<AssistantScreen> {
  final List<_ChatMsg> _msgs = [];
  final _input = TextEditingController();
  final _scroll = ScrollController();
  bool _loading = true;
  bool _sending = false;
  bool _notify = false;
  int _meId = 0;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  String get _histKey => 'chat_hist_$_meId';

  Future<void> _boot() async {
    final api = context.read<AuthProvider>().api;
    final sp = await SharedPreferences.getInstance();
    _notify = sp.getBool('ai_notify') ?? false;
    try {
      final me = await api.me();
      _meId = me.id;
    } catch (_) {}
    // Saqlangan tarix bo'lsa yuklaymiz, aks holda maslahatlar bilan boshlaymiz.
    final saved = sp.getString(_histKey);
    if (saved != null) {
      try {
        final list = (jsonDecode(saved) as List).map((e) => _ChatMsg.fromJson(e as Map<String, dynamic>)).toList();
        _msgs.addAll(list);
      } catch (_) {}
    }
    if (_msgs.isEmpty) {
      try {
        final Advice adv = await api.advice(I18n.lang);
        _msgs.add(_ChatMsg('assistant', adv.greeting.isEmpty ? tr('ai_assistant') : adv.greeting));
        _msgs.add(_ChatMsg('assistant', adv.summary));
        for (final t in adv.tips.take(4)) {
          _msgs.add(_ChatMsg('assistant', '${t.icon} ${t.text}'));
        }
        _maybeNotify(adv);
      } catch (_) {
        _msgs.add(_ChatMsg('assistant', tr('connection_error')));
      }
    }
    if (mounted) setState(() => _loading = false);
    _scrollDown();
  }

  Future<void> _maybeNotify(Advice adv) async {
    if (!_notify || adv.tips.isEmpty) return;
    final sp = await SharedPreferences.getInstance();
    final today = DateTime.now().toIso8601String().substring(0, 10);
    if (sp.getString('ai_notify_last') == today) return;
    final tip = adv.tips.firstWhere((t) => t.severity == 'warn', orElse: () => adv.tips.first);
    await NotificationService.showNow(id: 1001, title: '✨ AlbaFit', body: '${tip.icon} ${tip.text}');
    await sp.setString('ai_notify_last', today);
  }

  Future<void> _save() async {
    final sp = await SharedPreferences.getInstance();
    // Faqat oxirgi 40 xabarni saqlaymiz
    final tail = _msgs.length > 40 ? _msgs.sublist(_msgs.length - 40) : _msgs;
    await sp.setString(_histKey, jsonEncode(tail.map((m) => m.toJson()).toList()));
  }

  void _scrollDown() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    });
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    _input.clear();
    setState(() {
      _msgs.add(_ChatMsg('user', text));
      _sending = true;
    });
    _scrollDown();
    final api = context.read<AuthProvider>().api;
    // Backendga oxirgi kontekstni yuboramiz (yangi xabardan oldingi)
    final history = _msgs.where((m) => m.role == 'user' || m.role == 'assistant').map((m) => {'role': m.role, 'text': m.text}).toList();
    history.removeLast(); // hozirgi user xabari alohida yuboriladi
    try {
      final reply = await api.chat(message: text, history: history, lang: I18n.lang);
      if (!mounted) return;
      setState(() => _msgs.add(_ChatMsg('assistant', reply)));
    } catch (e) {
      if (mounted) setState(() => _msgs.add(_ChatMsg('assistant', tr('connection_error'))));
    } finally {
      if (mounted) setState(() => _sending = false);
      _save();
      _scrollDown();
    }
  }

  Future<void> _toggleNotify() async {
    final sp = await SharedPreferences.getInstance();
    final next = !_notify;
    if (next) {
      final granted = await NotificationService.requestPermissions();
      if (!granted) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Ruxsat berilmadi')));
        return;
      }
    }
    await sp.setBool('ai_notify', next);
    setState(() => _notify = next);
  }

  @override
  Widget build(BuildContext context) {
    context.watch<SettingsProvider>();
    return Column(
      children: [
        // Sarlavha
        Container(
          padding: const EdgeInsets.fromLTRB(Gap.md, Gap.md, Gap.sm, Gap.md),
          child: Row(
            children: [
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(gradient: const LinearGradient(colors: [AppColors.primary, Color(0xFF9B7DFF)]), borderRadius: BorderRadius.circular(13)),
                child: const Center(child: Text('✨', style: TextStyle(fontSize: 20))),
              ),
              const SizedBox(width: Gap.sm),
              Expanded(child: Text(tr('ai_assistant'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
              IconButton(
                icon: Icon(_notify ? Icons.notifications_active_rounded : Icons.notifications_none_rounded,
                    color: _notify ? AppColors.primary : AppColors.textSecondary),
                tooltip: tr('ai_daily'),
                onPressed: _toggleNotify,
              ),
            ],
          ),
        ),
        const Divider(height: 1, color: AppColors.line),

        // Xabarlar
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
              : ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.all(Gap.md),
                  itemCount: _msgs.length + (_sending ? 1 : 0),
                  itemBuilder: (_, i) {
                    if (i >= _msgs.length) return const _Bubble(role: 'assistant', text: '…');
                    final m = _msgs[i];
                    return _Bubble(role: m.role, text: m.text);
                  },
                ),
        ),

        // Kiritish
        Container(
          padding: const EdgeInsets.fromLTRB(Gap.md, Gap.sm, Gap.md, Gap.sm),
          decoration: const BoxDecoration(border: Border(top: BorderSide(color: AppColors.line))),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _input,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                  decoration: InputDecoration(hintText: tr('ai_ask')),
                ),
              ),
              const SizedBox(width: Gap.sm),
              Material(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(14),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: _sending ? null : _send,
                  child: const SizedBox(width: 50, height: 50, child: Icon(Icons.arrow_upward_rounded, color: Colors.white)),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Bubble extends StatelessWidget {
  final String role;
  final String text;
  const _Bubble({required this.role, required this.text});
  @override
  Widget build(BuildContext context) {
    final isUser = role == 'user';
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
        margin: const EdgeInsets.only(bottom: Gap.sm),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isUser ? AppColors.primary : AppColors.surface,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(isUser ? 16 : 5),
            bottomRight: Radius.circular(isUser ? 5 : 16),
          ),
        ),
        child: Text(text, style: TextStyle(color: isUser ? Colors.white : AppColors.textPrimary, fontSize: 14, height: 1.4, fontWeight: FontWeight.w600)),
      ),
    );
  }
}
