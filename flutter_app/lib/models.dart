/// Backend JSON'iga mos data modellari.

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
  });

  factory Me.fromJson(Map<String, dynamic> j) => Me(
        id: j['id'] as int,
        name: (j['name'] ?? '') as String,
        email: (j['email'] ?? '') as String,
        type: (j['type'] ?? 'worker') as String,
        phone: (j['phone'] ?? '') as String,
        active: (j['active'] ?? true) as bool,
        daysLeft: (j['daysLeft'] ?? 0) as int,
        hourlyRate: ((j['hourlyRate'] ?? 0) as num).toDouble(),
        taxPercent: ((j['taxPercent'] ?? 0) as num).toDouble(),
      );
}

/// /api/my/status — hozir ishdami?
class WorkStatus {
  final bool checkedIn;
  final String? since; // "09:00"
  final String? sinceIso; // ISO — jonli taймер uchun
  final String? orgName;
  final int? jobId;

  WorkStatus({
    required this.checkedIn,
    this.since,
    this.sinceIso,
    this.orgName,
    this.jobId,
  });

  factory WorkStatus.fromJson(Map<String, dynamic> j) => WorkStatus(
        checkedIn: (j['checkedIn'] ?? false) as bool,
        since: j['since'] as String?,
        sinceIso: j['sinceIso'] as String?,
        orgName: j['orgName'] as String?,
        jobId: j['jobId'] as int?,
      );
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

  factory Workplace.fromJson(Map<String, dynamic> j) => Workplace(
        id: j['id'] as int,
        orgId: j['orgId'] as int?,
        name: (j['name'] ?? '') as String,
        rate: ((j['rate'] ?? 0) as num).toDouble(),
        taxPercent: ((j['taxPercent'] ?? 0) as num).toDouble(),
        payType: (j['payType'] ?? 'hourly') as String,
      );
}

/// /api/my/summary — oylik jamlanma (kun -> daqiqa).
class MonthSummary {
  final int totalMinutes;
  final int daysWorked;
  final Map<String, int> minutesByDay; // "2026-07-22" -> 473

  MonthSummary({
    required this.totalMinutes,
    required this.daysWorked,
    required this.minutesByDay,
  });

  factory MonthSummary.fromJson(Map<String, dynamic> j) {
    final days = <String, int>{};
    final raw = (j['days'] ?? {}) as Map<String, dynamic>;
    raw.forEach((k, v) => days[k] = ((v['minutes'] ?? 0) as num).toInt());
    return MonthSummary(
      totalMinutes: ((j['totalMinutes'] ?? 0) as num).toInt(),
      daysWorked: ((j['daysWorked'] ?? 0) as num).toInt(),
      minutesByDay: days,
    );
  }
}
