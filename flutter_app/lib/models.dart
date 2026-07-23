/// Backend JSON'iga mos data modellari.

double _d(dynamic v) => (v is num) ? v.toDouble() : double.tryParse('$v') ?? 0;
int _i(dynamic v) => (v is num) ? v.toInt() : int.tryParse('$v') ?? 0;

/// Jamoa a'zoligi (worker biror oshxonaga qo'shilgan).
class Membership {
  final int orgId;
  final String orgName;
  final String checkMode; // qr | button
  Membership({required this.orgId, required this.orgName, required this.checkMode});
  factory Membership.fromJson(Map<String, dynamic> j) => Membership(
        orgId: _i(j['orgId']),
        orgName: (j['orgName'] ?? '') as String,
        checkMode: (j['checkMode'] ?? 'button') as String,
      );
}

class Me {
  final int id;
  final String name;
  final String email;
  final String type; // worker | business
  final String phone;
  final bool active;
  final int daysLeft;
  final double hourlyRate;
  final double taxPercent;
  final List<Membership> memberships;

  Me({
    required this.id,
    required this.name,
    required this.email,
    required this.type,
    required this.phone,
    required this.active,
    required this.daysLeft,
    required this.hourlyRate,
    required this.taxPercent,
    this.memberships = const [],
  });

  factory Me.fromJson(Map<String, dynamic> j) => Me(
        id: _i(j['id']),
        name: (j['name'] ?? '') as String,
        email: (j['email'] ?? '') as String,
        type: (j['type'] ?? 'worker') as String,
        phone: (j['phone'] ?? '') as String,
        active: (j['active'] ?? true) as bool,
        daysLeft: _i(j['daysLeft']),
        hourlyRate: _d(j['hourlyRate']),
        taxPercent: _d(j['taxPercent']),
        memberships: ((j['memberships'] ?? []) as List).map((e) => Membership.fromJson(e as Map<String, dynamic>)).toList(),
      );
}

/// /api/my/status — hozir ishdami?
class WorkStatus {
  final bool checkedIn;
  final String? since; // "09:00"
  final String? sinceIso; // ISO — jonli taймер uchun
  final String? orgName;
  final int? jobId;
  final int? orgId;

  WorkStatus({
    required this.checkedIn,
    this.since,
    this.sinceIso,
    this.orgName,
    this.jobId,
    this.orgId,
  });

  factory WorkStatus.fromJson(Map<String, dynamic> j) => WorkStatus(
        checkedIn: (j['checkedIn'] ?? false) as bool,
        since: j['since'] as String?,
        sinceIso: j['sinceIso'] as String?,
        orgName: j['orgName'] as String?,
        jobId: j['jobId'] == null ? null : _i(j['jobId']),
        orgId: j['orgId'] == null ? null : _i(j['orgId']),
      );

  DateTime? get sinceTime => sinceIso == null ? null : DateTime.tryParse(sinceIso!);
}

/// Ish joyi (shaxsiy job yoki jamoa).
class Workplace {
  final int id;
  final int? orgId;
  final String name;
  final double rate;
  final double taxPercent;
  final String payType;

  Workplace({
    required this.id,
    required this.orgId,
    required this.name,
    required this.rate,
    required this.taxPercent,
    required this.payType,
  });

  bool get isTeam => orgId != null;

  factory Workplace.fromJson(Map<String, dynamic> j) => Workplace(
        id: _i(j['id']),
        orgId: j['orgId'] == null ? null : _i(j['orgId']),
        name: (j['name'] ?? '') as String,
        rate: _d(j['rate']),
        taxPercent: _d(j['taxPercent']),
        payType: (j['payType'] ?? 'hourly') as String,
      );
}

/// Bir kundagi bitta ish sessiyasi.
class WorkSession {
  final int id;
  final int? jobId;
  final int? orgId;
  final String inTime;
  final String? outTime;
  final int minutes;

  WorkSession({required this.id, this.jobId, this.orgId, required this.inTime, this.outTime, required this.minutes});

  factory WorkSession.fromJson(Map<String, dynamic> j) => WorkSession(
        id: _i(j['id']),
        jobId: j['jobId'] == null ? null : _i(j['jobId']),
        orgId: j['orgId'] == null ? null : _i(j['orgId']),
        inTime: (j['in'] ?? '') as String,
        outTime: j['out'] as String?,
        minutes: _i(j['minutes']),
      );
}

/// Bir kun tafsiloti.
class DayInfo {
  final int minutes;
  final bool open;
  final List<WorkSession> sessions;
  DayInfo({required this.minutes, required this.open, required this.sessions});
}

/// /api/my/summary — oylik jamlanma.
class MonthSummary {
  final int totalMinutes;
  final int daysWorked;
  final Map<String, DayInfo> days;

  MonthSummary({required this.totalMinutes, required this.daysWorked, required this.days});

  int minutesOn(String date) => days[date]?.minutes ?? 0;

  factory MonthSummary.fromJson(Map<String, dynamic> j) {
    final days = <String, DayInfo>{};
    final raw = (j['days'] ?? {}) as Map<String, dynamic>;
    raw.forEach((k, v) {
      final m = v as Map<String, dynamic>;
      final sessions = ((m['sessions'] ?? []) as List)
          .map((e) => WorkSession.fromJson(e as Map<String, dynamic>))
          .toList();
      days[k] = DayInfo(minutes: _i(m['minutes']), open: (m['open'] ?? false) as bool, sessions: sessions);
    });
    return MonthSummary(
      totalMinutes: _i(j['totalMinutes']),
      daysWorked: _i(j['daysWorked']),
      days: days,
    );
  }
}

/// Moliyaviy yozuv (chiqim / qarz / daromad).
class FinanceItem {
  final int id;
  final String kind; // expense | debt | income
  final String title;
  final double amount;
  final double paidAmount;
  final bool active;
  final int? dueDay;
  final String? dueDate;

  FinanceItem({
    required this.id,
    required this.kind,
    required this.title,
    required this.amount,
    required this.paidAmount,
    required this.active,
    this.dueDay,
    this.dueDate,
  });

  double get remaining => (amount - paidAmount).clamp(0, double.infinity).toDouble();

  factory FinanceItem.fromJson(Map<String, dynamic> j) => FinanceItem(
        id: _i(j['id']),
        kind: (j['kind'] ?? 'expense') as String,
        title: (j['title'] ?? '') as String,
        amount: _d(j['amount']),
        paidAmount: _d(j['paidAmount']),
        active: (j['active'] ?? true) as bool,
        dueDay: j['dueDay'] == null ? null : _i(j['dueDay']),
        dueDate: j['dueDate'] as String?,
      );
}

/// Moliyaviy maqsad.
class Goal {
  final int id;
  final String title;
  final double target;
  final double saved;
  Goal({required this.id, required this.title, required this.target, required this.saved});

  double get progress => target > 0 ? (saved / target).clamp(0, 1).toDouble() : 0;

  factory Goal.fromJson(Map<String, dynamic> j) => Goal(
        id: _i(j['id']),
        title: (j['title'] ?? '') as String,
        target: _d(j['target']),
        saved: _d(j['saved']),
      );
}

/// AI maslahat bir donasi.
class AdviceTip {
  final String id;
  final String icon;
  final String severity; // good | warn | info
  final String text;
  AdviceTip({required this.id, required this.icon, required this.severity, required this.text});

  factory AdviceTip.fromJson(Map<String, dynamic> j) => AdviceTip(
        id: (j['id'] ?? '') as String,
        icon: (j['icon'] ?? '💡') as String,
        severity: (j['severity'] ?? 'info') as String,
        text: (j['text'] ?? '') as String,
      );
}

/// AI moliyaviy yordamchi javobi.
class Advice {
  final String greeting;
  final String summary;
  final List<AdviceTip> tips;
  final bool aiPowered;
  final Map<String, dynamic> stats;

  Advice({required this.greeting, required this.summary, required this.tips, required this.aiPowered, required this.stats});

  factory Advice.fromJson(Map<String, dynamic> j) => Advice(
        greeting: (j['greeting'] ?? '') as String,
        summary: (j['summary'] ?? '') as String,
        aiPowered: (j['aiPowered'] ?? false) as bool,
        stats: (j['stats'] ?? const <String, dynamic>{}) as Map<String, dynamic>,
        tips: ((j['tips'] ?? []) as List).map((e) => AdviceTip.fromJson(e as Map<String, dynamic>)).toList(),
      );
}
