/// Yengil i18n — global til holati. `tr('key')` orqali ishlatiladi.
/// Til SettingsProvider tomonidan o'zgartiriladi (I18n.lang).
class I18n {
  static String lang = 'uz';

  static const supported = {'uz': "O'zbekcha", 'en': 'English', 'ko': '한국어'};

  static String t(String k) => (_m[lang]?[k]) ?? (_m['en']?[k]) ?? k;

  static const Map<String, Map<String, String>> _m = {
    'uz': {
      'home': 'Bosh', 'calendar': 'Kalendar', 'finance': 'Moliya', 'ai': 'AI', 'profile': 'Profil',
      'good_morning': 'Xayrli tong', 'good_afternoon': 'Xayrli kun', 'good_evening': 'Xayrli kech',
      'todays_earnings': 'Bugungi daromad', 'worked': 'Ishlangan', 'this_month': 'Bu oy',
      'current_shift': 'Joriy smena', 'start_timer': 'Boshlash', 'stop_timer': "To'xtatish",
      'break': 'Tanaffus', 'not_working': 'Hozir ishda emassiz', 'workplaces': 'Ish joylari',
      'no_workplaces': "Hali ish joyi yo'q", 'pick_workplace': 'Ish joyini tanlang',
      'salary': 'Maosh', 'add_note': 'Izoh', 'goals': 'Maqsadlar', 'income': 'Daromad',
      'expenses': 'Chiqim', 'debts': 'Qarzlar', 'remaining': 'Qoladi', 'this_month_earned': 'Bu oy topilgan',
      'add_money': 'Pul', 'new_goal': 'Yangi maqsad', 'goal_name': 'Nomi', 'goal_target': 'Summa',
      'save': 'Saqlash', 'cancel': 'Bekor', 'add': "Qo'shish", 'delete': "O'chirish", 'edit': 'Tahrirlash',
      'account': 'Akkaunt', 'currency': 'Valyuta', 'appearance': 'Ko\'rinish', 'language': 'Til',
      'notifications': 'Bildirishnomalar', 'server': 'Server manzili', 'about': 'Ilova haqida',
      'logout': 'Chiqish', 'premium_active': 'Premium faol', 'premium_title': 'AlbaFit Premium',
      'premium_sub': 'AI yordamchi, grafiklar, eksport', 'days_left': 'kun qoldi',
      'theme': 'Mavzu', 'theme_dark': 'Qorong\'i', 'theme_light': 'Yorug\'', 'save_server': 'Saqlash',
      'server_hint': 'Masalan: https://sizning-serveringiz.up.railway.app',
      'ai_assistant': 'AI yordamchi', 'ai_ask': 'Savol yozing...', 'ai_daily': 'Kunlik maslahat bildirishnomasi',
      'ai_tips': 'Maslahatlar', 'login': 'Kirish', 'signup': "Ro'yxatdan o'tish",
      'name': 'Ismingiz', 'birthdate': "Tug'ilgan kun", 'have_account': 'Akkauntim bor — kirish',
      'no_account': "Akkauntim yo'q — ro'yxatdan o'tish", 'connection_error': 'Ulanish xatosi. Server manzilini tekshiring.',
      'tagline': 'Ish vaqti va maoshingiz — bir joyda',
    },
    'en': {
      'home': 'Home', 'calendar': 'Calendar', 'finance': 'Finance', 'ai': 'AI', 'profile': 'Profile',
      'good_morning': 'Good morning', 'good_afternoon': 'Good afternoon', 'good_evening': 'Good evening',
      'todays_earnings': "Today's earnings", 'worked': 'Worked', 'this_month': 'This month',
      'current_shift': 'Current shift', 'start_timer': 'Start timer', 'stop_timer': 'Stop timer',
      'break': 'Break', 'not_working': 'Not working now', 'workplaces': 'Workplaces',
      'no_workplaces': 'No workplaces yet', 'pick_workplace': 'Pick a workplace',
      'salary': 'Salary', 'add_note': 'Note', 'goals': 'Goals', 'income': 'Income',
      'expenses': 'Expenses', 'debts': 'Debts', 'remaining': 'Remaining', 'this_month_earned': 'Earned this month',
      'add_money': 'Money', 'new_goal': 'New goal', 'goal_name': 'Name', 'goal_target': 'Target',
      'save': 'Save', 'cancel': 'Cancel', 'add': 'Add', 'delete': 'Delete', 'edit': 'Edit',
      'account': 'Account', 'currency': 'Currency', 'appearance': 'Appearance', 'language': 'Language',
      'notifications': 'Notifications', 'server': 'Server URL', 'about': 'About',
      'logout': 'Log out', 'premium_active': 'Premium active', 'premium_title': 'AlbaFit Premium',
      'premium_sub': 'AI assistant, charts, export', 'days_left': 'days left',
      'theme': 'Theme', 'theme_dark': 'Dark', 'theme_light': 'Light', 'save_server': 'Save',
      'server_hint': 'e.g. https://your-server.up.railway.app',
      'ai_assistant': 'AI assistant', 'ai_ask': 'Ask a question...', 'ai_daily': 'Daily tip notification',
      'ai_tips': 'Tips', 'login': 'Log in', 'signup': 'Sign up',
      'name': 'Your name', 'birthdate': 'Birthdate', 'have_account': 'I have an account — log in',
      'no_account': "No account — sign up", 'connection_error': 'Connection error. Check the server URL.',
      'tagline': 'Your work time & salary — in one place',
    },
    'ko': {
      'home': '홈', 'calendar': '캘린더', 'finance': '재무', 'ai': 'AI', 'profile': '프로필',
      'good_morning': '좋은 아침', 'good_afternoon': '좋은 오후', 'good_evening': '좋은 저녁',
      'todays_earnings': '오늘의 수입', 'worked': '근무', 'this_month': '이번 달',
      'current_shift': '현재 근무', 'start_timer': '시작', 'stop_timer': '정지',
      'break': '휴게', 'not_working': '근무 중 아님', 'workplaces': '근무지',
      'no_workplaces': '근무지가 없습니다', 'pick_workplace': '근무지 선택',
      'salary': '급여', 'add_note': '메모', 'goals': '목표', 'income': '수입',
      'expenses': '지출', 'debts': '부채', 'remaining': '남음', 'this_month_earned': '이번 달 수입',
      'add_money': '금액', 'new_goal': '새 목표', 'goal_name': '이름', 'goal_target': '목표액',
      'save': '저장', 'cancel': '취소', 'add': '추가', 'delete': '삭제', 'edit': '수정',
      'account': '계정', 'currency': '통화', 'appearance': '화면', 'language': '언어',
      'notifications': '알림', 'server': '서버 주소', 'about': '앱 정보',
      'logout': '로그아웃', 'premium_active': '프리미엄 활성', 'premium_title': 'AlbaFit 프리미엄',
      'premium_sub': 'AI 도우미, 차트, 내보내기', 'days_left': '일 남음',
      'theme': '테마', 'theme_dark': '다크', 'theme_light': '라이트', 'save_server': '저장',
      'server_hint': '예: https://your-server.up.railway.app',
      'ai_assistant': 'AI 도우미', 'ai_ask': '질문하기...', 'ai_daily': '일일 조언 알림',
      'ai_tips': '조언', 'login': '로그인', 'signup': '회원가입',
      'name': '이름', 'birthdate': '생년월일', 'have_account': '계정이 있습니다 — 로그인',
      'no_account': '계정이 없습니다 — 회원가입', 'connection_error': '연결 오류. 서버 주소를 확인하세요.',
      'tagline': '근무 시간과 급여를 한곳에서',
    },
  };
}

/// Qisqa global yordamchi.
String tr(String key) => I18n.t(key);
