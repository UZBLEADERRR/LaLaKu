import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../i18n.dart';
import '../models.dart';
import '../services/auth_provider.dart';
import '../services/settings_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// CV / Rezyume — foydalanuvchi rasm yuklaydi, ma'lumot kiritadi va professional
/// PDF rezyume yoki daromad hisobotini eksport qiladi. Rasm/matn lokal saqlanadi
/// (shared_preferences) — hozirgi serverda fayl saqlash yo'q.
class CvScreen extends StatefulWidget {
  const CvScreen({super.key});
  @override
  State<CvScreen> createState() => _CvScreenState();
}

class _CvScreenState extends State<CvScreen> {
  final _name = TextEditingController();
  final _position = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _address = TextEditingController();
  final _about = TextEditingController();
  final _skills = TextEditingController();

  Me? _me;
  List<Workplace> _jobs = [];
  int _totalMinutes = 0; // oxirgi 3 oy
  Uint8List? _photo;
  bool _loading = true;
  bool _busy = false;
  int _meId = 0;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  @override
  void dispose() {
    _save();
    _name.dispose();
    _position.dispose();
    _email.dispose();
    _phone.dispose();
    _address.dispose();
    _about.dispose();
    _skills.dispose();
    super.dispose();
  }

  Future<void> _boot() async {
    final api = context.read<AuthProvider>().api;
    try {
      _me = await api.me();
      _meId = _me!.id;
    } catch (_) {}
    try {
      _jobs = await api.jobs();
    } catch (_) {}
    // Oxirgi 3 oy ish soati (tajriba uchun).
    final now = DateTime.now();
    for (int i = 0; i < 3; i++) {
      final d = DateTime(now.year, now.month - i, 1);
      try {
        final s = await api.summary(d.year, d.month);
        _totalMinutes += s.totalMinutes;
      } catch (_) {}
    }
    await _load();
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _load() async {
    final sp = await SharedPreferences.getInstance();
    final raw = sp.getString('cv_$_meId');
    Map<String, dynamic> m = {};
    if (raw != null) {
      try {
        m = jsonDecode(raw) as Map<String, dynamic>;
      } catch (_) {}
    }
    _name.text = (m['name'] as String?)?.isNotEmpty == true ? m['name'] : (_me?.name ?? '');
    _position.text = (m['position'] as String?) ?? '';
    _email.text = (m['email'] as String?)?.isNotEmpty == true ? m['email'] : (_me?.email ?? '');
    _phone.text = (m['phone'] as String?)?.isNotEmpty == true ? m['phone'] : (_me?.phone ?? '');
    _address.text = (m['address'] as String?) ?? '';
    _about.text = (m['about'] as String?) ?? '';
    _skills.text = (m['skills'] as String?) ?? '';
    final photo = sp.getString('cv_photo_$_meId');
    if (photo != null && photo.isNotEmpty) {
      try {
        _photo = base64Decode(photo);
      } catch (_) {}
    }
  }

  Future<void> _save() async {
    final sp = await SharedPreferences.getInstance();
    await sp.setString(
      'cv_$_meId',
      jsonEncode({
        'name': _name.text.trim(),
        'position': _position.text.trim(),
        'email': _email.text.trim(),
        'phone': _phone.text.trim(),
        'address': _address.text.trim(),
        'about': _about.text.trim(),
        'skills': _skills.text.trim(),
      }),
    );
    if (_photo != null) await sp.setString('cv_photo_$_meId', base64Encode(_photo!));
  }

  Future<void> _pickPhoto() async {
    try {
      final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 600, maxHeight: 600, imageQuality: 82);
      if (x == null) return;
      final bytes = await x.readAsBytes();
      setState(() => _photo = bytes);
      await _save();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  double _dayNet(DayInfo day) {
    double net = 0;
    for (final s in day.sessions) {
      double rate = _me?.hourlyRate ?? 0;
      double tax = _me?.taxPercent ?? 0;
      for (final j in _jobs) {
        if ((s.jobId != null && j.id == s.jobId) || (s.orgId != null && j.orgId == s.orgId)) {
          rate = j.rate;
          tax = j.taxPercent;
          break;
        }
      }
      net += (s.minutes / 60.0) * rate * (1 - tax / 100);
    }
    return net;
  }

  // ---------------- PDF: CV ----------------
  Future<void> _exportCv() async {
    await _save();
    setState(() => _busy = true);
    try {
      final bytes = await _buildCvPdf();
      await Printing.sharePdf(bytes: bytes, filename: 'CV_${_name.text.trim().replaceAll(' ', '_')}.pdf');
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<pw.Font?> _tryFont(Future<pw.Font> Function() f) async {
    try {
      return await f();
    } catch (_) {
      return null;
    }
  }

  Future<Uint8List> _buildCvPdf() async {
    final accent = PdfColor.fromInt(Palette.accent.value | 0xFF000000);
    final base = await _tryFont(PdfGoogleFonts.notoSansRegular);
    final bold = await _tryFont(PdfGoogleFonts.notoSansBold);
    final theme = (base != null && bold != null) ? pw.ThemeData.withFont(base: base, bold: bold) : null;
    final doc = pw.Document(theme: theme);

    final skills = _skills.text.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    final contact = <List<String>>[
      if (_phone.text.trim().isNotEmpty) ['Tel', _phone.text.trim()],
      if (_email.text.trim().isNotEmpty) ['Email', _email.text.trim()],
      if (_me?.hourlyRate != null && _me!.hourlyRate > 0) ['Stavka', fmtWon(_me!.hourlyRate)],
      if (_address.text.trim().isNotEmpty) ['Manzil', _address.text.trim()],
      ['Tajriba', '${(_totalMinutes / 60).round()} ${tr('total_hours').toLowerCase()}'],
    ];

    pw.Widget sideLabel(String s) => pw.Padding(
          padding: const pw.EdgeInsets.only(top: 14, bottom: 4),
          child: pw.Text(s.toUpperCase(),
              style: pw.TextStyle(color: PdfColors.white, fontWeight: pw.FontWeight.bold, fontSize: 9, letterSpacing: 1)),
        );

    doc.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        margin: pw.EdgeInsets.zero,
        build: (ctx) => pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.stretch,
          children: [
            // Chap panel (accent)
            pw.Container(
              width: 190,
              color: accent,
              padding: const pw.EdgeInsets.all(20),
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Center(
                    child: pw.Container(
                      width: 110,
                      height: 110,
                      decoration: pw.BoxDecoration(
                        shape: pw.BoxShape.circle,
                        color: PdfColors.white,
                        border: pw.Border.all(color: PdfColors.white, width: 3),
                      ),
                      child: _photo != null
                          ? pw.ClipOval(child: pw.Image(pw.MemoryImage(_photo!), fit: pw.BoxFit.cover))
                          : pw.Center(
                              child: pw.Text(
                                _name.text.trim().isNotEmpty ? _name.text.trim()[0].toUpperCase() : '?',
                                style: pw.TextStyle(color: accent, fontSize: 46, fontWeight: pw.FontWeight.bold),
                              ),
                            ),
                    ),
                  ),
                  sideLabel(tr('contact')),
                  ...contact.map((c) => pw.Padding(
                        padding: const pw.EdgeInsets.only(bottom: 6),
                        child: pw.Column(
                          crossAxisAlignment: pw.CrossAxisAlignment.start,
                          children: [
                            pw.Text(c[0], style: const pw.TextStyle(color: PdfColors.grey200, fontSize: 8)),
                            pw.Text(c[1], style: const pw.TextStyle(color: PdfColors.white, fontSize: 10)),
                          ],
                        ),
                      )),
                  if (skills.isNotEmpty) sideLabel(_skillsHeader()),
                  ...skills.map((s) => pw.Padding(
                        padding: const pw.EdgeInsets.only(bottom: 4),
                        child: pw.Row(children: [
                          pw.Container(width: 4, height: 4, margin: const pw.EdgeInsets.only(right: 6, top: 4),
                              decoration: const pw.BoxDecoration(color: PdfColors.white, shape: pw.BoxShape.circle)),
                          pw.Expanded(child: pw.Text(s, style: const pw.TextStyle(color: PdfColors.white, fontSize: 10))),
                        ]),
                      )),
                ],
              ),
            ),
            // O'ng panel
            pw.Expanded(
              child: pw.Padding(
                padding: const pw.EdgeInsets.all(28),
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(_name.text.trim().isEmpty ? 'AlbaFit' : _name.text.trim(),
                        style: pw.TextStyle(fontSize: 26, fontWeight: pw.FontWeight.bold, color: PdfColors.grey900)),
                    if (_position.text.trim().isNotEmpty)
                      pw.Padding(
                        padding: const pw.EdgeInsets.only(top: 2),
                        child: pw.Text(_position.text.trim(), style: pw.TextStyle(fontSize: 13, color: accent, fontWeight: pw.FontWeight.bold)),
                      ),
                    pw.SizedBox(height: 4),
                    pw.Container(height: 2, width: 48, color: accent),
                    if (_about.text.trim().isNotEmpty) ...[
                      pw.SizedBox(height: 18),
                      pw.Text(tr('cv_about').toUpperCase(),
                          style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: accent, letterSpacing: 1)),
                      pw.SizedBox(height: 6),
                      pw.Text(_about.text.trim(), style: const pw.TextStyle(fontSize: 10.5, lineSpacing: 2, color: PdfColors.grey800)),
                    ],
                    pw.SizedBox(height: 18),
                    pw.Text(tr('cv_experience').toUpperCase(),
                        style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: accent, letterSpacing: 1)),
                    pw.SizedBox(height: 8),
                    if (_workplaceLines().isEmpty)
                      pw.Text(tr('cv_no_exp'), style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey500))
                    else
                      ..._workplaceLines().map((w) => pw.Padding(
                            padding: const pw.EdgeInsets.only(bottom: 10),
                            child: pw.Row(
                              crossAxisAlignment: pw.CrossAxisAlignment.start,
                              children: [
                                pw.Container(width: 6, height: 6, margin: const pw.EdgeInsets.only(right: 8, top: 4),
                                    decoration: pw.BoxDecoration(color: accent, shape: pw.BoxShape.circle)),
                                pw.Expanded(
                                  child: pw.Column(
                                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                                    children: [
                                      pw.Text(w[0], style: pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold, color: PdfColors.grey900)),
                                      pw.Text(w[1], style: const pw.TextStyle(fontSize: 9.5, color: PdfColors.grey600)),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          )),
                    pw.Spacer(),
                    pw.Divider(color: PdfColors.grey300),
                    pw.Text('AlbaFit · ${DateTime.now().toIso8601String().substring(0, 10)}',
                        style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey500)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
    return doc.save();
  }

  String _skillsHeader() =>
      I18n.lang == 'en' ? 'Skills' : (I18n.lang == 'ko' ? '역량' : 'Ko\'nikmalar');

  String _dateHeader() =>
      I18n.lang == 'en' ? 'Date' : (I18n.lang == 'ko' ? '날짜' : 'Sana');

  /// Ish joylari: [nom, tafsilot].
  List<List<String>> _workplaceLines() {
    return _jobs.map((j) {
      final pay = j.payType == 'daily' ? tr('daily') : tr('hourly');
      final r = j.rate > 0 ? ' · ${fmtWon(j.rate)}/${j.payType == 'daily' ? tr('per_day') : tr('per_hour')}' : '';
      final team = j.isTeam ? ' · ${tr('workplaces')}' : '';
      return [j.name, '$pay$r$team'];
    }).toList();
  }

  // ---------------- PDF: Daromad hisoboti ----------------
  Future<void> _exportReport() async {
    setState(() => _busy = true);
    try {
      final api = context.read<AuthProvider>().api;
      final now = DateTime.now();
      final summary = await api.summary(now.year, now.month);
      final bytes = await _buildReportPdf(now, summary);
      await Printing.sharePdf(bytes: bytes, filename: 'Hisobot_${now.year}_${now.month}.pdf');
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<Uint8List> _buildReportPdf(DateTime month, MonthSummary summary) async {
    final accent = PdfColor.fromInt(Palette.accent.value | 0xFF000000);
    final base = await _tryFont(PdfGoogleFonts.notoSansRegular);
    final bold = await _tryFont(PdfGoogleFonts.notoSansBold);
    final theme = (base != null && bold != null) ? pw.ThemeData.withFont(base: base, bold: bold) : null;
    final doc = pw.Document(theme: theme);

    final dates = summary.days.keys.toList()..sort();
    double totalNet = 0;
    final rows = <List<String>>[];
    for (final d in dates) {
      final info = summary.days[d]!;
      if (info.minutes <= 0) continue;
      final net = _dayNet(info);
      totalNet += net;
      rows.add([d, fmtHm(info.minutes), net > 0 ? fmtWon(net) : '—']);
    }

    doc.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(32),
        build: (ctx) => [
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
                pw.Text(tr('report_title'), style: pw.TextStyle(fontSize: 22, fontWeight: pw.FontWeight.bold, color: accent)),
                pw.Text(_name.text.trim().isEmpty ? (_me?.name ?? '') : _name.text.trim(),
                    style: const pw.TextStyle(fontSize: 12, color: PdfColors.grey700)),
              ]),
              pw.Text('${month.year}-${month.month.toString().padLeft(2, '0')}',
                  style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold, color: PdfColors.grey800)),
            ],
          ),
          pw.SizedBox(height: 4),
          pw.Container(height: 2, width: 60, color: accent),
          pw.SizedBox(height: 16),
          pw.TableHelper.fromTextArray(
            headers: [_dateHeader(), tr('worked'), tr('salary')],
            data: rows.isEmpty ? [['—', '—', '—']] : rows,
            border: null,
            headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: PdfColors.white, fontSize: 10),
            headerDecoration: pw.BoxDecoration(color: accent),
            cellStyle: const pw.TextStyle(fontSize: 10),
            rowDecoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(color: PdfColors.grey200))),
            cellAlignments: {0: pw.Alignment.centerLeft, 1: pw.Alignment.centerRight, 2: pw.Alignment.centerRight},
            headerAlignments: {0: pw.Alignment.centerLeft, 1: pw.Alignment.centerRight, 2: pw.Alignment.centerRight},
          ),
          pw.SizedBox(height: 14),
          pw.Container(
            padding: const pw.EdgeInsets.all(14),
            decoration: pw.BoxDecoration(color: PdfColors.grey100, borderRadius: pw.BorderRadius.circular(8)),
            child: pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
                  pw.Text(tr('total_hours'), style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey600)),
                  pw.Text(fmtHm(summary.totalMinutes), style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold)),
                ]),
                pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
                  pw.Text(tr('salary'), style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey600)),
                  pw.Text(fmtWon(totalNet), style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold, color: accent)),
                ]),
              ],
            ),
          ),
          pw.SizedBox(height: 20),
          pw.Text('AlbaFit · ${DateTime.now().toIso8601String().substring(0, 10)}',
              style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey500)),
        ],
      ),
    );
    return doc.save();
  }

  @override
  Widget build(BuildContext context) {
    context.watch<SettingsProvider>();
    return Scaffold(
      appBar: AppBar(title: Text(tr('cv')), backgroundColor: Colors.transparent),
      body: _loading
          ? const DashboardSkeleton()
          : ListView(
              padding: const EdgeInsets.fromLTRB(Gap.md, Gap.sm, Gap.md, Gap.xl),
              children: [
                // Rasm
                Center(
                  child: GestureDetector(
                    onTap: _pickPhoto,
                    child: Stack(
                      alignment: Alignment.bottomRight,
                      children: [
                        CircleAvatar(
                          radius: 52,
                          backgroundColor: AppColors.primary.withOpacity(0.18),
                          backgroundImage: _photo != null ? MemoryImage(_photo!) : null,
                          child: _photo == null
                              ? Text(
                                  _name.text.trim().isNotEmpty ? _name.text.trim()[0].toUpperCase() : '?',
                                  style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w800),
                                )
                              : null,
                        ),
                        Container(
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(color: AppColors.primary, shape: BoxShape.circle, border: Border.all(color: AppColors.bg, width: 2)),
                          child: const Icon(Icons.photo_camera_rounded, size: 16, color: Colors.white),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: Gap.xs),
                Center(child: TextButton(onPressed: _pickPhoto, child: Text(tr('cv_pick_photo')))),
                const SizedBox(height: Gap.sm),

                _field(_name, tr('full_name'), Icons.person_outline),
                _field(_position, tr('cv_position'), Icons.badge_outlined),
                _field(_phone, tr('phone'), Icons.phone_outlined, keyboard: TextInputType.phone),
                _field(_email, tr('cv_email'), Icons.mail_outline, keyboard: TextInputType.emailAddress),
                _field(_address, tr('cv_address'), Icons.location_on_outlined),
                _field(_about, tr('cv_about'), Icons.notes_outlined, lines: 3),
                _field(_skills, tr('cv_skills'), Icons.star_outline, lines: 2),

                const SizedBox(height: Gap.sm),
                SectionHeader(tr('cv_experience')),
                AppCard(
                  child: _workplaceLines().isEmpty
                      ? Text(tr('cv_no_exp'), style: const TextStyle(color: AppColors.textSecondary))
                      : Column(
                          children: [
                            for (final w in _workplaceLines())
                              Padding(
                                padding: const EdgeInsets.symmetric(vertical: 6),
                                child: Row(
                                  children: [
                                    Container(width: 8, height: 8, decoration: BoxDecoration(color: AppColors.primary, shape: BoxShape.circle)),
                                    const SizedBox(width: Gap.sm),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(w[0], style: const TextStyle(fontWeight: FontWeight.w700)),
                                          Text(w[1], style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            const Divider(height: Gap.lg, color: AppColors.line),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(tr('total_hours'), style: const TextStyle(color: AppColors.textSecondary)),
                                Text('${(_totalMinutes / 60).round()} ${tr('per_hour')}',
                                    style: const TextStyle(fontWeight: FontWeight.w800)),
                              ],
                            ),
                          ],
                        ),
                ),
                const SizedBox(height: Gap.lg),

                ElevatedButton.icon(
                  onPressed: _busy ? null : _exportCv,
                  icon: _busy
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.picture_as_pdf_rounded),
                  label: Text(_busy ? tr('cv_generating') : tr('cv_export')),
                ),
                const SizedBox(height: Gap.sm),
                OutlinedButton.icon(
                  onPressed: _busy ? null : _exportReport,
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                    side: const BorderSide(color: AppColors.line),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Gap.radiusSm)),
                  ),
                  icon: const Icon(Icons.assessment_outlined),
                  label: Text(tr('cv_report')),
                ),
              ],
            ),
    );
  }

  Widget _field(TextEditingController c, String label, IconData icon, {TextInputType? keyboard, int lines = 1}) => Padding(
        padding: const EdgeInsets.only(bottom: Gap.sm),
        child: TextField(
          controller: c,
          keyboardType: keyboard,
          minLines: lines,
          maxLines: lines,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: label, prefixIcon: Icon(icon, size: 20)),
        ),
      );
}
