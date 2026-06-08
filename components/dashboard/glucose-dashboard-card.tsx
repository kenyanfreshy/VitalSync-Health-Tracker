/**
 * GlucoseDashboardCard
 *
 * Premium 3D glass collapsible dashboard card showing:
 *   - Latest blood glucose (mg/dL) — color-coded by user thresholds
 *   - Projected A1C via ADAG formula: (avg + 46.7) / 28.7
 *   - 7-day, 30-day, 90-day glucose averages
 *   - 7-day sparkline trend
 *   - Time-in-Range (TIR) bar using computeTIR()
 *   - Dexcom / CGM source note (same language as Records screen)
 *   - CTA to navigate to Records → Blood Sugar tab
 *
 * Data source: state.data.bloodSugar from useHealth() — same store
 * used by the Blood Sugar tab in Records. No duplicate state.
 *
 * Color coding uses user-configured thresholds from @vsht:glucose_thresholds.
 * Language matches Records screen vocabulary (Blood Sugar, Fasting, Post-Meal,
 * Normal / Pre-Diabetes / High / Low, Dexcom / CGM Data).
 *
 * Compliance: "Projected A1C" / "Estimated A1C" only. Disclaimer shown.
 * No diagnosis language.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useDataSources } from '@/lib/data-sources/data-sources-context';

import { GlassCard } from '@/components/glass-card';
import { SparklineChart } from '@/components/dashboard/sparkline-chart';
import { useHealth } from '@/lib/health/health-context';
import { useColorScheme, useColors, useLang } from '@/hooks';
import { useUnitPreferences, mgDlToMmol, type GlucoseUnit } from '@/hooks/use-unit-preferences';
import Svg, { Polyline } from 'react-native-svg';
import { safeGetItem, safeSetItem } from '@/lib/safe-async-storage';
import {
  computeTIR,
  classifyGlucose,
  loadGlucoseThresholds,
  DEFAULT_GLUCOSE_THRESHOLDS,
  type GlucoseThresholdConfig,
} from '@/lib/health/glucose-thresholds';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Accent color for the card chrome (border, glow, chevron) */
const ACCENT_LIGHT = '#DC2626';
const ACCENT_DARK  = '#F87171';

/** Glucose range colors — matches Records screen palette */
const GLUCOSE_COLORS = {
  normal:      { light: '#10B981', dark: '#34D399' },   // green — Normal
  prediabetes: { light: '#F59E0B', dark: '#FBBF24' },   // amber — Pre-Diabetes
  high:        { light: '#EF4444', dark: '#F87171' },   // red   — High
  low:         { light: '#3B82F6', dark: '#60A5FA' },   // blue  — Low
  fa: {
    title:             'قند خون',
    noData:            'بدون خوانش',
    lastUpdated:       'آخرین بروزرسانی',
    projectedA1C:      'A1C پیش‌بینی‌شده',
    notEnoughData:     'داده کافی نیست',
    avg7:              'میانگین ۷ روزه',
    avg30:             'میانگین ۳۰ روزه',
    avg90:             'میانگین ۹۰ روزه',
    trend7:            'روند ۷ روزه',
    timeInRange:       'زمان در محدوده',
    inRange:           'در محدوده',
    above:             'بالا',
    below:             'پایین',
    readings:          'خوانش',
    dexcomTitle:       'داده Dexcom / CGM',
    dexcomSub:         'VitalSync می‌تواند خوانش‌های Dexcom و CGM شما را از طریق Apple Health وارد کند.',
    viewRecords:       'مشاهده سوابق قند خون →',
    addReading:        'افزودن خوانش →',
    noDataTitle:       'هنوز خوانشی ثبت نشده',
    noDataSub:         'یک خوانش در بخش سوابق اضافه کنید یا از منبع متصل همگام‌سازی کنید.',
    disclaimer:        'فقط برای اهداف اطلاعاتی. مشاوره پزشکی نیست.',
    statusNormal:      'طبیعی',
    statusPrediabetes: 'پیش‌دیابت',
    statusHigh:        'بالا',
    statusLow:         'پایین',
    fastingAvg:        'میانگین ناشتا',
    postMealAvg:       'میانگین بعد از غذا',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'محدوده هدف',
    editTargetRange:   'ویرایش محدوده',
    lastSyncedDexcom:  'آخرین همگام‌سازی',
    noDexcomSync:      'هنوز همگام‌سازی نشده',
    noReadingsWindow:    'هیچ خوانشی در این بازه زمانی وجود ندارد',
    },
  ur: {
    title:             'بلڈ شوگر',
    noData:            'کوئی ریڈنگ نہیں',
    lastUpdated:       'آخری اپ ڈیٹ',
    projectedA1C:      'متوقع A1C',
    notEnoughData:     'کافی ڈیٹا نہیں',
    avg7:              '7 دن کا اوسط',
    avg30:             '30 دن کا اوسط',
    avg90:             '90 دن کا اوسط',
    trend7:            '7 دن کا رجحان',
    timeInRange:       'رینج میں وقت',
    inRange:           'رینج میں',
    above:             'اوپر',
    below:             'نیچے',
    readings:          'ریڈنگز',
    dexcomTitle:       'Dexcom / CGM ڈیٹا',
    dexcomSub:         'VitalSync آپ کی Dexcom اور CGM ریڈنگز Apple Health کے ذریعے درآمد کر سکتا ہے۔',
    viewRecords:       'بلڈ شوگر ریکارڈز دیکھیں →',
    addReading:        'ریڈنگ شامل کریں →',
    noDataTitle:       'ابھی تک کوئی گلوکوز ریڈنگ نہیں',
    noDataSub:         'ریکارڈز میں ریڈنگ شامل کریں یا منسلک ذریعہ سے ہم آہنگ کریں۔',
    disclaimer:        'صرف معلوماتی مقاصد کے لیے۔ طبی مشورہ نہیں۔',
    statusNormal:      'نارمل',
    statusPrediabetes: 'پری ڈائبیٹیز',
    statusHigh:        'زیادہ',
    statusLow:         'کم',
    fastingAvg:        'روزہ اوسط',
    postMealAvg:       'کھانے کے بعد اوسط',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'ہدف رینج',
    editTargetRange:   'رینج ترمیم کریں',
    lastSyncedDexcom:  'آخری ہم آہنگی',
    noDexcomSync:      'ابھی تک ہم آہنگ نہیں',
    noReadingsWindow:    'اس ونڈو میں کوئی ریڈنگ نہیں',
    },
  he: {
    title:             'סוכר בדם',
    noData:            'אין קריאות',
    lastUpdated:       'עדכון אחרון',
    projectedA1C:      'A1C צפוי',
    notEnoughData:     'אין מספיק נתונים',
    avg7:              'ממוצע 7 ימים',
    avg30:             'ממוצע 30 ימים',
    avg90:             'ממוצע 90 ימים',
    trend7:            'מגמת 7 ימים',
    timeInRange:       'זמן בטווח',
    inRange:           'בטווח',
    above:             'מעל',
    below:             'מתחת',
    readings:          'קריאות',
    dexcomTitle:       'נתוני Dexcom / CGM',
    dexcomSub:         'VitalSync יכול לייבא אוטומטית את קריאות Dexcom ו-CGM שלך דרך Apple Health.',
    viewRecords:       'הצג רשומות סוכר בדם →',
    addReading:        'הוסף קריאה →',
    noDataTitle:       'עדיין אין קריאות גלוקוז',
    noDataSub:         'הוסף קריאה ברשומות או סנכרן ממקור מחובר.',
    disclaimer:        'למטרות מידע בלבד. אינו ייעוץ רפואי.',
    statusNormal:      'תקין',
    statusPrediabetes: 'טרום-סוכרת',
    statusHigh:        'גבוה',
    statusLow:         'נמוך',
    fastingAvg:        'ממוצע בצום',
    postMealAvg:       'ממוצע אחרי ארוחה',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'טווח יעד',
    editTargetRange:   'ערוך טווח',
    lastSyncedDexcom:  'סנכרון אחרון',
    noDexcomSync:      'טרם סונכרן',
    noReadingsWindow:    'אין קריאות בחלון זה',
    },
  id: {
    title:             'Gula Darah',
    noData:            'Tidak ada pembacaan',
    lastUpdated:       'Terakhir diperbarui',
    projectedA1C:      'A1C yang Diproyeksikan',
    notEnoughData:     'Data belum cukup',
    avg7:              'Rata-rata 7 hari',
    avg30:             'Rata-rata 30 hari',
    avg90:             'Rata-rata 90 hari',
    trend7:            'Tren 7 hari',
    timeInRange:       'Waktu dalam Rentang',
    inRange:           'Dalam Rentang',
    above:             'Di atas',
    below:             'Di bawah',
    readings:          'pembacaan',
    dexcomTitle:       'Data Dexcom / CGM',
    dexcomSub:         'VitalSync dapat mengimpor pembacaan Dexcom dan CGM Anda secara otomatis melalui Apple Health.',
    viewRecords:       'Lihat Catatan Gula Darah →',
    addReading:        'Tambah Pembacaan →',
    noDataTitle:       'Belum ada pembacaan glukosa',
    noDataSub:         'Tambahkan pembacaan di Catatan atau sinkronkan dari sumber yang terhubung.',
    disclaimer:        'Hanya untuk tujuan informasi. Bukan saran medis.',
    statusNormal:      'Normal',
    statusPrediabetes: 'Pra-Diabetes',
    statusHigh:        'Tinggi',
    statusLow:         'Rendah',
    fastingAvg:        'Rata-rata puasa',
    postMealAvg:       'Rata-rata setelah makan',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'Rentang Target',
    editTargetRange:   'Edit Rentang',
    lastSyncedDexcom:  'Terakhir disinkronkan',
    noDexcomSync:      'Belum disinkronkan',
    noReadingsWindow:    'Tidak ada pembacaan dalam jangka waktu ini',
    },
  vi: {
    title:             'Đường Huyết',
    noData:            'Không có chỉ số',
    lastUpdated:       'Cập nhật lần cuối',
    projectedA1C:      'A1C Dự Kiến',
    notEnoughData:     'Chưa đủ dữ liệu',
    avg7:              'TB 7 ngày',
    avg30:             'TB 30 ngày',
    avg90:             'TB 90 ngày',
    trend7:            'Xu hướng 7 ngày',
    timeInRange:       'Thời Gian Trong Phạm Vi',
    inRange:           'Trong Phạm Vi',
    above:             'Trên',
    below:             'Dưới',
    readings:          'chỉ số',
    dexcomTitle:       'Dữ liệu Dexcom / CGM',
    dexcomSub:         'VitalSync có thể tự động nhập chỉ số Dexcom và CGM của bạn qua Apple Health.',
    viewRecords:       'Xem Hồ Sơ Đường Huyết →',
    addReading:        'Thêm Chỉ Số →',
    noDataTitle:       'Chưa có chỉ số glucose',
    noDataSub:         'Thêm chỉ số trong Hồ Sơ hoặc đồng bộ từ nguồn đã kết nối.',
    disclaimer:        'Chỉ dành cho mục đích thông tin. Không phải lời khuyên y tế.',
    statusNormal:      'Bình thường',
    statusPrediabetes: 'Tiền Đái Tháo Đường',
    statusHigh:        'Cao',
    statusLow:         'Thấp',
    fastingAvg:        'TB khi đói',
    postMealAvg:       'TB sau ăn',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'Phạm Vi Mục Tiêu',
    editTargetRange:   'Chỉnh Sửa Phạm Vi',
    lastSyncedDexcom:  'Đồng bộ lần cuối',
    noDexcomSync:      'Chưa đồng bộ',
    noReadingsWindow:    'Không có chỉ số trong khoảng thời gian này',
    },
  sv: {
    title:             'Blodsocker',
    noData:            'Inga avläsningar',
    lastUpdated:       'Senast uppdaterad',
    projectedA1C:      'Beräknat A1C',
    notEnoughData:     'Inte tillräckligt med data',
    avg7:              'Snitt 7 dagar',
    avg30:             'Snitt 30 dagar',
    avg90:             'Snitt 90 dagar',
    trend7:            'Trend 7 dagar',
    timeInRange:       'Tid i Intervall',
    inRange:           'I Intervall',
    above:             'Över',
    below:             'Under',
    readings:          'avläsningar',
    dexcomTitle:       'Dexcom / CGM-data',
    dexcomSub:         'VitalSync kan automatiskt importera dina Dexcom- och CGM-avläsningar via Apple Hälsa.',
    viewRecords:       'Visa Blodsockerposter →',
    addReading:        'Lägg till Avläsning →',
    noDataTitle:       'Inga glukosavläsningar ännu',
    noDataSub:         'Lägg till en avläsning i Poster eller synkronisera från en ansluten källa.',
    disclaimer:        'Endast för informationsändamål. Inte medicinsk rådgivning.',
    statusNormal:      'Normal',
    statusPrediabetes: 'Prediabetes',
    statusHigh:        'Hög',
    statusLow:         'Låg',
    fastingAvg:        'Fastande snitt',
    postMealAvg:       'Snitt efter måltid',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'Målintervall',
    editTargetRange:   'Redigera Intervall',
    lastSyncedDexcom:  'Senast synkroniserad',
    noDexcomSync:      'Inte synkroniserad ännu',
    noReadingsWindow:    'Inga avläsningar i detta fönster',
    },
  tr: {
    title:             'Kan Şekeri',
    noData:            'Okuma yok',
    lastUpdated:       'Son güncelleme',
    projectedA1C:      'Tahmini A1C',
    notEnoughData:     'Yeterli veri yok',
    avg7:              '7 günlük ort.',
    avg30:             '30 günlük ort.',
    avg90:             '90 günlük ort.',
    trend7:            '7 günlük trend',
    timeInRange:       'Aralıkta Geçen Süre',
    inRange:           'Aralıkta',
    above:             'Üzerinde',
    below:             'Altında',
    readings:          'okuma',
    dexcomTitle:       'Dexcom / CGM Verileri',
    dexcomSub:         'VitalSync, Dexcom ve CGM okumalarınızı Apple Sağlık aracılığıyla otomatik olarak içe aktarabilir.',
    viewRecords:       'Kan Şekeri Kayıtlarını Gör →',
    addReading:        'Okuma Ekle →',
    noDataTitle:       'Henüz glukoz okuması yok',
    noDataSub:         'Kayıtlara bir okuma ekleyin veya bağlı bir kaynaktan senkronize edin.',
    disclaimer:        'Yalnızca bilgi amaçlıdır. Tıbbi tavsiye değildir.',
    statusNormal:      'Normal',
    statusPrediabetes: 'Prediyabet',
    statusHigh:        'Yüksek',
    statusLow:         'Düşük',
    fastingAvg:        'Açlık ort.',
    postMealAvg:       'Yemek sonrası ort.',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'Hedef Aralık',
    editTargetRange:   'Aralığı Düzenle',
    lastSyncedDexcom:  'Son senkronizasyon',
    noDexcomSync:      'Henüz senkronize edilmedi',
    noReadingsWindow:    'Bu pencerede okuma yok',
    },
  nl: {
    title:             'Bloedsuiker',
    noData:            'Geen metingen',
    lastUpdated:       'Laatste update',
    projectedA1C:      'Geschatte A1C',
    notEnoughData:     'Onvoldoende gegevens',
    avg7:              'Gem. 7 dagen',
    avg30:             'Gem. 30 dagen',
    avg90:             'Gem. 90 dagen',
    trend7:            'Trend 7 dagen',
    timeInRange:       'Tijd in Bereik',
    inRange:           'In Bereik',
    above:             'Boven',
    below:             'Onder',
    readings:          'metingen',
    dexcomTitle:       'Dexcom / CGM-gegevens',
    dexcomSub:         'VitalSync kan uw Dexcom- en CGM-metingen automatisch importeren via Apple Gezondheid.',
    viewRecords:       'Bloedsuikerrecords bekijken →',
    addReading:        'Meting toevoegen →',
    noDataTitle:       'Nog geen glucosemetingen',
    noDataSub:         'Voeg een meting toe in Records of synchronizeer vanuit een verbonden bron.',
    disclaimer:        'Alleen voor informatieve doeleinden. Geen medisch advies.',
    statusNormal:      'Normaal',
    statusPrediabetes: 'Prediabetes',
    statusHigh:        'Hoog',
    statusLow:         'Laag',
    fastingAvg:        'Nuchter gem.',
    postMealAvg:       'Na maaltijd gem.',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'Doelbereik',
    editTargetRange:   'Bereik bewerken',
    lastSyncedDexcom:  'Laatste synchronisatie',
    noDexcomSync:      'Nog niet gesynchronizeerd',
    noReadingsWindow:    'Geen metingen in dit venster',
    },
} as const;

const STORAGE_KEY   = '@vsht:glucose_card_collapsed';
const ANIM_DURATION = 280;
const ANIM_EASING   = Easing.bezier(0.4, 0, 0.2, 1);

// ─── i18n strings ─────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    title:             'Blood Sugar',
    noData:            'No readings',
    lastUpdated:       'Last updated',
    projectedA1C:      'Projected A1C',
    notEnoughData:     'Not enough data yet',
    avg7:              '7-day avg',
    avg30:             '30-day avg',
    avg90:             '90-day avg',
    trend7:            '7-day trend',
    timeInRange:       'Time in Range',
    inRange:           'In Range',
    above:             'Above',
    below:             'Below',
    readings:          'readings',
    dexcomTitle:       'Dexcom / CGM Data',
    dexcomSub:         'VitalSync can automatically import your Dexcom and CGM glucose readings via Apple Health. Open the Health app, connect your Dexcom device, and your readings will sync here automatically.',
    viewRecords:       'View Blood Sugar Records →',
    addReading:        'Add Blood Sugar Reading →',
    noDataTitle:       'No glucose readings yet',
    noDataSub:         'Add a reading in Records or sync from a connected source.',
    disclaimer:        'For informational purposes only. Not medical advice.',
    statusNormal:      'Normal',
    statusPrediabetes: 'Pre-Diabetes',
    statusHigh:        'High',
    statusLow:         'Low',
    fastingAvg:        'Fasting avg',
    postMealAvg:       'Post-Meal avg',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'Target Range',
    editTargetRange:   'Edit Target Range',
    lastSyncedDexcom:  'Last synced',
    noDexcomSync:      'Not yet synced',
    noReadingsWindow:    'No readings in this window',
    },
  es: {
    title:             'Glucosa',
    noData:            'Sin lecturas',
    lastUpdated:       'Última actualización',
    projectedA1C:      'A1C Proyectada',
    notEnoughData:     'Datos insuficientes',
    avg7:              'Prom. 7 días',
    avg30:             'Prom. 30 días',
    avg90:             'Prom. 90 días',
    trend7:            'Tendencia 7 días',
    timeInRange:       'Tiempo en Rango',
    inRange:           'En Rango',
    above:             'Alto',
    below:             'Bajo',
    readings:          'lecturas',
    dexcomTitle:       'Datos Dexcom / CGM',
    dexcomSub:         'VitalSync puede importar automáticamente tus lecturas de Dexcom y CGM a través de Apple Health.',
    viewRecords:       'Ver Registros de Glucosa →',
    addReading:        'Agregar Lectura →',
    noDataTitle:       'Sin lecturas de glucosa',
    noDataSub:         'Agrega una lectura en Registros o sincroniza desde una fuente conectada.',
    disclaimer:        'Solo con fines informativos. No es consejo médico.',
    statusNormal:      'Normal',
    statusPrediabetes: 'Pre-Diabetes',
    statusHigh:        'Alto',
    statusLow:         'Bajo',
    fastingAvg:        'Prom. en ayunas',
    postMealAvg:       'Prom. postprandial',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'Rango objetivo',
    editTargetRange:   'Editar rango',
    lastSyncedDexcom:  'Última sincronización',
    noDexcomSync:      'Sin sincronización',
    noReadingsWindow:    'Sin lecturas en este período',
    },
  fr: {
    title:             'Glycémie',
    noData:            'Aucune lecture',
    lastUpdated:       'Dernière mise à jour',
    projectedA1C:      'A1C Projetée',
    notEnoughData:     'Données insuffisantes',
    avg7:              'Moy. 7 j',
    avg30:             'Moy. 30 j',
    avg90:             'Moy. 90 j',
    trend7:            'Tendance 7 j',
    timeInRange:       'Temps dans la Plage',
    inRange:           'Dans la Plage',
    above:             'Au-dessus',
    below:             'En-dessous',
    readings:          'lectures',
    dexcomTitle:       'Données Dexcom / CGM',
    dexcomSub:         'VitalSync peut importer automatiquement vos lectures Dexcom et CGM via Apple Santé.',
    viewRecords:       'Voir les Enregistrements →',
    addReading:        'Ajouter une Lecture →',
    noDataTitle:       'Aucune lecture de glycémie',
    noDataSub:         'Ajoutez une lecture dans Enregistrements ou synchronizez depuis une source connectée.',
    disclaimer:        'À titre informatif uniquement. Pas de conseil médical.',
    statusNormal:      'Normal',
    statusPrediabetes: 'Pré-Diabète',
    statusHigh:        'Élevé',
    statusLow:         'Bas',
    fastingAvg:        'Moy. à jeun',
    postMealAvg:       'Moy. postprandiale',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'Plage cible',
    editTargetRange:   'Modifier la plage',
    lastSyncedDexcom:  'Dernière synchro',
    noDexcomSync:      'Pas encore synchronisé',
    noReadingsWindow:    'Aucune lecture dans cette période',
    },
  zh: {
    title:             '血糖',
    noData:            '暂无读数',
    lastUpdated:       '最后更新',
    projectedA1C:      '预测 A1C',
    notEnoughData:     '数据不足',
    avg7:              '7天均值',
    avg30:             '30天均值',
    avg90:             '90天均值',
    trend7:            '7天趋势',
    timeInRange:       '目标范围时间',
    inRange:           '在范围内',
    above:             '偏高',
    below:             '偏低',
    readings:          '次读数',
    dexcomTitle:       'Dexcom / CGM 数据',
    dexcomSub:         'VitalSync 可通过 Apple 健康自动导入您的 Dexcom 和 CGM 血糖读数。',
    viewRecords:       '查看血糖记录 →',
    addReading:        '添加读数 →',
    noDataTitle:       '暂无血糖读数',
    noDataSub:         '在记录中添加读数，或从已连接的来源同步。',
    disclaimer:        '仅供参考，不构成医疗建议。',
    statusNormal:      '正常',
    statusPrediabetes: '糖尿病前期',
    statusHigh:        '偏高',
    statusLow:         '偏低',
    fastingAvg:        '空腹均值',
    postMealAvg:       '餐后均值',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       '目标范围',
    editTargetRange:   '编辑目标范围',
    lastSyncedDexcom:  '最后同步',
    noDexcomSync:      '尚未同步',
    noReadingsWindow:    '此时间段内无读数',
    },
  pt: {
    title:             'Glicemia',
    noData:            'Sem leituras',
    lastUpdated:       'Última atualização',
    projectedA1C:      'A1C estimado',
    notEnoughData:     'Dados insuficientes',
    avg7:              'Méd. 7 dias',
    avg30:             'Méd. 30 dias',
    avg90:             'Méd. 90 dias',
    trend7:            'Tendência 7 dias',
    timeInRange:       'Tempo no alvo',
    inRange:           'No alvo',
    above:             'Acima',
    below:             'Abaixo',
    readings:          'leituras',
    dexcomTitle:       'Dados Dexcom / CGM',
    dexcomSub:         'O VitalSync pode importar automaticamente suas leituras Dexcom e CGM via Apple Saúde.',
    viewRecords:       'Ver registros de glicemia →',
    addReading:        'Adicionar leitura →',
    noDataTitle:       'Sem leituras de glicemia',
    noDataSub:         'Adicione leituras nos registros ou sincronize de uma fonte conectada.',
    disclaimer:        'Apenas informativo, não constitui conselho médico.',
    statusNormal:      'Normal',
    statusPrediabetes: 'Pré-diabetes',
    statusHigh:        'Alto',
    statusLow:         'Baixo',
    fastingAvg:        'Méd. jejum',
    postMealAvg:       'Méd. pós-refeição',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'Faixa-alvo',
    editTargetRange:   'Editar faixa-alvo',
    lastSyncedDexcom:  'Última sincronização',
    noDexcomSync:      'Não sincronizado',
    noReadingsWindow:    'Nenhuma leitura neste período',
    },
  ar: {
    title:             'سكر الدم',
    noData:            'لا قراءات',
    lastUpdated:       'آخر تحديث',
    projectedA1C:      'A1C المتوقع',
    notEnoughData:     'بيانات غير كافية',
    avg7:              'متوسط 7 أيام',
    avg30:             'متوسط 30 يومًا',
    avg90:             'متوسط 90 يومًا',
    trend7:            'اتجاه 7 أيام',
    timeInRange:       'الوقت في النطاق',
    inRange:           'ضمن النطاق',
    above:             'مرتفع',
    below:             'منخفض',
    readings:          'قراءات',
    dexcomTitle:       'بيانات Dexcom / CGM',
    dexcomSub:         'يمكن لـ VitalSync استيراد قراءات Dexcom و CGM تلقائيًا عبر Apple Health.',
    viewRecords:       'عرض سجلات السكر →',
    addReading:        'إضافة قراءة →',
    noDataTitle:       'لا توجد قراءات لسكر الدم',
    noDataSub:         'أضف قراءات في السجلات أو زامن من مصدر متصل.',
    disclaimer:        'للمعلومات فقط، لا يُعدّ نصيحة طبية.',
    statusNormal:      'طبيعي',
    statusPrediabetes: 'ما قبل السكري',
    statusHigh:        'مرتفع',
    statusLow:         'منخفض',
    fastingAvg:        'متوسط الصيام',
    postMealAvg:       'متوسط ما بعد الأكل',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'النطاق المستهدف',
    editTargetRange:   'تعديل النطاق',
    lastSyncedDexcom:  'آخر مزامنة',
    noDexcomSync:      'لم تتم المزامنة',
    noReadingsWindow:    'لا توجد قراءات في هذه الفترة',
    },
  sw: {
    title:             'Sukari ya Damu',
    noData:            'Hakuna vipimo',
    lastUpdated:       'Ilisasishwa mwisho',
    projectedA1C:      'A1C inayotarajiwa',
    notEnoughData:     'Data haitoshi',
    avg7:              'Wastani siku 7',
    avg30:             'Wastani siku 30',
    avg90:             'Wastani siku 90',
    trend7:            'Mwelekeo siku 7',
    timeInRange:       'Muda katika kiwango',
    inRange:           'Ndani ya kiwango',
    above:             'Juu',
    below:             'Chini',
    readings:          'vipimo',
    dexcomTitle:       'Data ya Dexcom / CGM',
    dexcomSub:         'VitalSync inaweza kuingiza vipimo vya Dexcom na CGM moja kwa moja kupitia Apple Health.',
    viewRecords:       'Angalia rekodi za sukari →',
    addReading:        'Ongeza kipimo →',
    noDataTitle:       'Hakuna vipimo vya sukari ya damu',
    noDataSub:         'Ongeza vipimo kwenye rekodi au sawazisha kutoka chanzo kilichounganishwa.',
    disclaimer:        'Kwa habari tu, si ushauri wa kimatibabu.',
    statusNormal:      'Kawaida',
    statusPrediabetes: 'Kabla ya kisukari',
    statusHigh:        'Juu',
    statusLow:         'Chini',
    fastingAvg:        'Wastani wa kufunga',
    postMealAvg:       'Wastani baada ya kula',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'Kiwango kinachohitajika',
    editTargetRange:   'Hariri kiwango',
    lastSyncedDexcom:  'Ilisawazishwa mwisho',
    noDexcomSync:      'Haijasawazishwa',
    noReadingsWindow:    'No readings in this window',
    },
  am: {
    title:             'የደም ስኳር',
    noData:            'ምንም ንባቦች የሉም',
    lastUpdated:       'የተዘመነበት ጊዜ',
    projectedA1C:      'የሚጠበቀው A1C',
    notEnoughData:     'በቂ ውሂብ የለም',
    avg7:              'የ7 ቀን አማካይ',
    avg30:             'የ30 ቀን አማካይ',
    avg90:             'የ90 ቀን አማካይ',
    trend7:            'የ7 ቀን አዝማሚያ',
    timeInRange:       'ጊዜ በወሰን ውስጥ',
    inRange:           'በወሰን ውስጥ',
    above:             'ከፍ ያለ',
    below:             'ዝቅ ያለ',
    readings:          'ንባቦች',
    dexcomTitle:       'Dexcom / CGM ውሂብ',
    dexcomSub:         'VitalSync የ Dexcom እና CGM ንባቦችን በ Apple Health በኩል ማስገባት ይችላል።',
    viewRecords:       'የደም ስኳር መዝገቦችን ይመልከቱ →',
    addReading:        'ንባብ ያክሉ →',
    noDataTitle:       'ምንም የደም ስኳር ንባቦች የሉም',
    noDataSub:         'ንባቦችን ወደ መዝገቦቹ ያክሉ ወይም ከተገናኘ ምንጭ ያሳምሩ።',
    disclaimer:        'ለመረጃ ብቻ፣ የህክምና ምክር አይደለም።',
    statusNormal:      'መደበኛ',
    statusPrediabetes: 'ቅድመ-ስኳር',
    statusHigh:        'ከፍ ያለ',
    statusLow:         'ዝቅ ያለ',
    fastingAvg:        'የጾም አማካይ',
    postMealAvg:       'ከምግብ በኋላ አማካይ',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'ዒላማ ወሰን',
    editTargetRange:   'ወሰን ያርትዑ',
    lastSyncedDexcom:  'የመጨረሻ ማሳመር',
    noDexcomSync:      'አልተሳመረም',
    noReadingsWindow:    'No readings in this window',
    },
  hi: {
    title:             'रक्त शर्करा',
    noData:            'कोई रीडिंग नहीं',
    lastUpdated:       'अंतिम अपडेट',
    projectedA1C:      'अनुमानित A1C',
    notEnoughData:     'पर्याप्त डेटा नहीं',
    avg7:              '7-दिन औसत',
    avg30:             '30-दिन औसत',
    avg90:             '90-दिन औसत',
    trend7:            '7-दिन रुझान',
    timeInRange:       'लक्ष्य सीमा में समय',
    inRange:           'सीमा में',
    above:             'अधिक',
    below:             'कम',
    readings:          'रीडिंग',
    dexcomTitle:       'Dexcom / CGM डेटा',
    dexcomSub:         'VitalSync Apple Health के माध्यम से Dexcom और CGM रीडिंग स्वचालित रूप से आयात कर सकता है।',
    viewRecords:       'रक्त शर्करा रिकॉर्ड देखें →',
    addReading:        'रीडिंग जोड़ें →',
    noDataTitle:       'कोई रक्त शर्करा रीडिंग नहीं',
    noDataSub:         'रिकॉर्ड में रीडिंग जोड़ें या किसी कनेक्टेड स्रोत से सिंक करें।',
    disclaimer:        'केवल जानकारी के लिए, चिकित्सा सलाह नहीं।',
    statusNormal:      'सामान्य',
    statusPrediabetes: 'प्री-डायबिटीज',
    statusHigh:        'अधिक',
    statusLow:         'कम',
    fastingAvg:        'उपवास औसत',
    postMealAvg:       'भोजन के बाद औसत',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'लक्ष्य सीमा',
    editTargetRange:   'लक्ष्य सीमा संपादित करें',
    lastSyncedDexcom:  'अंतिम सिंक',
    noDexcomSync:      'सिंक नहीं हुआ',
    noReadingsWindow:    'इस अवधि में कोई रीडिंग नहीं',
    },
  de: {
    title:             'Blutzucker',
    noData:            'Keine Messwerte',
    lastUpdated:       'Zuletzt aktualisiert',
    projectedA1C:      'Geschätzter A1C',
    notEnoughData:     'Nicht genug Daten',
    avg7:              '7-Tage-Mittel',
    avg30:             '30-Tage-Mittel',
    avg90:             '90-Tage-Mittel',
    trend7:            '7-Tage-Trend',
    timeInRange:       'Zeit im Zielbereich',
    inRange:           'Im Zielbereich',
    above:             'Zu hoch',
    below:             'Zu niedrig',
    readings:          'Messwerte',
    dexcomTitle:       'Dexcom / CGM-Daten',
    dexcomSub:         'VitalSync kann Dexcom- und CGM-Messwerte automatisch über Apple Health importieren.',
    viewRecords:       'Blutzuckeraufzeichnungen anzeigen →',
    addReading:        'Messwert hinzufügen →',
    noDataTitle:       'Keine Blutzuckermesswerte',
    noDataSub:         'Fügen Sie Messwerte in den Aufzeichnungen hinzu oder synchronisieren Sie von einer verbundenen Quelle.',
    disclaimer:        'Nur zur Information, kein medizinischer Rat.',
    statusNormal:      'Normal',
    statusPrediabetes: 'Prädiabetes',
    statusHigh:        'Erhöht',
    statusLow:         'Niedrig',
    fastingAvg:        'Nüchternmittel',
    postMealAvg:       'Postprandiales Mittel',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'Zielbereich',
    editTargetRange:   'Zielbereich bearbeiten',
    lastSyncedDexcom:  'Zuletzt synchronisiert',
    noDexcomSync:      'Nicht synchronisiert',
    noReadingsWindow:    'Keine Messwerte in diesem Zeitraum',
    },
  it: {
    title:             'Glicemia',
    noData:            'Nessuna lettura',
    lastUpdated:       'Ultimo aggiornamento',
    projectedA1C:      'A1C stimato',
    notEnoughData:     'Dati insufficienti',
    avg7:              'Media 7 giorni',
    avg30:             'Media 30 giorni',
    avg90:             'Media 90 giorni',
    trend7:            'Tendenza 7 giorni',
    timeInRange:       'Tempo nel target',
    inRange:           'Nel target',
    above:             'Alto',
    below:             'Basso',
    readings:          'letture',
    dexcomTitle:       'Dati Dexcom / CGM',
    dexcomSub:         'VitalSync può importare automaticamente le letture Dexcom e CGM tramite Apple Salute.',
    viewRecords:       'Visualizza registrazioni glicemia →',
    addReading:        'Aggiungi lettura →',
    noDataTitle:       'Nessuna lettura della glicemia',
    noDataSub:         'Aggiungi letture nei registri o sincronizza da una fonte connessa.',
    disclaimer:        'Solo a scopo informativo, non costituisce consiglio medico.',
    statusNormal:      'Normale',
    statusPrediabetes: 'Prediabete',
    statusHigh:        'Alto',
    statusLow:         'Basso',
    fastingAvg:        'Media a digiuno',
    postMealAvg:       'Media post-pasto',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'Intervallo target',
    editTargetRange:   'Modifica intervallo',
    lastSyncedDexcom:  'Ultima sincronizzazione',
    noDexcomSync:      'Non sincronizzato',
    noReadingsWindow:    'Nessuna lettura in questo periodo',
    },
  ko: {
    title:             '혈당',
    noData:            '측정값 없음',
    lastUpdated:       '마지막 업데이트',
    projectedA1C:      '예상 A1C',
    notEnoughData:     '데이터 부족',
    avg7:              '7일 평균',
    avg30:             '30일 평균',
    avg90:             '90일 평균',
    trend7:            '7일 추세',
    timeInRange:       '목표 범위 시간',
    inRange:           '범위 내',
    above:             '높음',
    below:             '낮음',
    readings:          '측정값',
    dexcomTitle:       'Dexcom / CGM 데이터',
    dexcomSub:         'VitalSync는 Apple 건강을 통해 Dexcom 및 CGM 측정값을 자동으로 가져올 수 있습니다.',
    viewRecords:       '혈당 기록 보기 →',
    addReading:        '측정값 추가 →',
    noDataTitle:       '혈당 측정값 없음',
    noDataSub:         '기록에 측정값을 추가하거나 연결된 소스에서 동기화하세요.',
    disclaimer:        '정보 제공 목적이며 의학적 조언이 아닙니다.',
    statusNormal:      '정상',
    statusPrediabetes: '당뇨 전단계',
    statusHigh:        '높음',
    statusLow:         '낮음',
    fastingAvg:        '공복 평균',
    postMealAvg:       '식후 평균',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       '목표 범위',
    editTargetRange:   '목표 범위 편집',
    lastSyncedDexcom:  '마지막 동기화',
    noDexcomSync:      '동기화 안 됨',
    noReadingsWindow:    '이 기간에 측정값 없음',
    },
  ja: {
    title:             '血糖値',
    noData:            '測定値なし',
    lastUpdated:       '最終更新',
    projectedA1C:      '予測 A1C',
    notEnoughData:     'データ不足',
    avg7:              '7日間平均',
    avg30:             '30日間平均',
    avg90:             '90日間平均',
    trend7:            '7日間トレンド',
    timeInRange:       '目標範囲内の時間',
    inRange:           '範囲内',
    above:             '高め',
    below:             '低め',
    readings:          '測定値',
    dexcomTitle:       'Dexcom / CGM データ',
    dexcomSub:         'VitalSync は Apple ヘルスを通じて Dexcom および CGM の測定値を自動的に取り込めます。',
    viewRecords:       '血糖値の記録を表示 →',
    addReading:        '測定値を追加 →',
    noDataTitle:       '血糖値の測定値なし',
    noDataSub:         '記録に測定値を追加するか、接続されたソースから同期してください。',
    disclaimer:        '情報提供のみを目的としており、医療アドバイスではありません。',
    statusNormal:      '正常',
    statusPrediabetes: '糖尿病予備群',
    statusHigh:        '高め',
    statusLow:         '低め',
    fastingAvg:        '空腹時平均',
    postMealAvg:       '食後平均',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       '目標範囲',
    editTargetRange:   '目標範囲を編集',
    lastSyncedDexcom:  '最終同期',
    noDexcomSync:      '未同期',
    noReadingsWindow:    'この期間に読み取りなし',
    },
  tl: {
    title:             'Asukal sa Dugo',
    noData:            'Walang mga pagbabasa',
    lastUpdated:       'Huling na-update',
    projectedA1C:      'Inaasahang A1C',
    notEnoughData:     'Hindi sapat na data',
    avg7:              'Avg 7 araw',
    avg30:             'Avg 30 araw',
    avg90:             'Avg 90 araw',
    trend7:            'Trend 7 araw',
    timeInRange:       'Oras sa target',
    inRange:           'Sa target',
    above:             'Mataas',
    below:             'Mababa',
    readings:          'mga pagbabasa',
    dexcomTitle:       'Data ng Dexcom / CGM',
    dexcomSub:         'Maaaring awtomatikong mag-import ang VitalSync ng mga pagbabasa ng Dexcom at CGM sa pamamagitan ng Apple Health.',
    viewRecords:       'Tingnan ang mga rekord ng asukal sa dugo →',
    addReading:        'Magdagdag ng pagbabasa →',
    noDataTitle:       'Walang mga pagbabasa ng asukal sa dugo',
    noDataSub:         'Magdagdag ng mga pagbabasa sa mga rekord o mag-sync mula sa isang konektadong pinagkukunan.',
    disclaimer:        'Para sa impormasyon lamang, hindi medikal na payo.',
    statusNormal:      'Normal',
    statusPrediabetes: 'Pre-diabetes',
    statusHigh:        'Mataas',
    statusLow:         'Mababa',
    fastingAvg:        'Avg sa pag-aayuno',
    postMealAvg:       'Avg pagkatapos kumain',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'Target na hanay',
    editTargetRange:   'I-edit ang target',
    lastSyncedDexcom:  'Huling na-sync',
    noDexcomSync:      'Hindi na-sync',
    noReadingsWindow:    'No readings in this window',
    },
  so: {
    title:             'Sonkorta Dhiigga',
    noData:            "Cabbir la'aanta",
    lastUpdated:       'Cusbooneysiinta ugu dambeysay',
    projectedA1C:      'A1C la filayo',
    notEnoughData:     'Xog ku filan ma jirto',
    avg7:              'Celceliska 7 maalmood',
    avg30:             'Celceliska 30 maalmood',
    avg90:             'Celceliska 90 maalmood',
    trend7:            'Jihada 7 maalmood',
    timeInRange:       'Waqtiga heerka',
    inRange:           'Heerka gudihiisa',
    above:             'Sareeya',
    below:             'Hooseeysa',
    readings:          'cabbiraadyo',
    dexcomTitle:       'Xogta Dexcom / CGM',
    dexcomSub:         'VitalSync waxay si toos ah u keeni kartaa cabbiraadyada Dexcom iyo CGM iyada oo loo marayo Apple Health.',
    viewRecords:       'Arag diiwaanada sonkorta dhiigga →',
    addReading:        'Kudar cabbiraad →',
    noDataTitle:       'Cabbiraad sonkor dhiig ah ma jirto',
    noDataSub:         'Kudar cabbiraadyo diiwaanada ama la waafaji isha xidta.',
    disclaimer:        'Macluumaad kaliya, kuma aha talo caafimaad.',
    statusNormal:      'Caadi',
    statusPrediabetes: 'Kahor sonkorta',
    statusHigh:        'Sareeya',
    statusLow:         'Hooseeysa',
    fastingAvg:        'Celceliska soomista',
    postMealAvg:       'Celceliska ka dib cuntada',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'Heerka la doonayo',
    editTargetRange:   'Wax ka beddel heerka',
    lastSyncedDexcom:  'La waafajiyay ugu dambeyn',
    noDexcomSync:      'Lama waafajin',
    noReadingsWindow:    'No readings in this window',
    },
  hy: {
    title:             'Արյան շաքար',
    noData:            'Ոչ մի ցուցում',
    lastUpdated:       'Վերջին թարմացում',
    projectedA1C:      'Կանխատեսված A1C',
    notEnoughData:     'Անբավարար տվյալ',
    avg7:              '7-օրյա միջին',
    avg30:             '30-օրյա միջին',
    avg90:             '90-օրյա միջին',
    trend7:            '7-օրյա միտում',
    timeInRange:       'Ժամանակ թիրախ սահմաններում',
    inRange:           'Թիրախ սահմաններում',
    above:             'Բարձր',
    below:             'Ցածր',
    readings:          'ցուցումներ',
    dexcomTitle:       'Dexcom / CGM տվյալներ',
    dexcomSub:         'VitalSync-ը կարող է ավտոմատ կերպով ներմուծել Dexcom-ի և CGM-ի ցուցումները Apple Health-ի միջոցով։',
    viewRecords:       'Տեսնել արյան շաքարի գրառումները →',
    addReading:        'Ավելացնել ցուցում →',
    noDataTitle:       'Արյան շաքարի ցուցումներ չկան',
    noDataSub:         'Ավելացրեք ցուցումներ գրառումներում կամ համաժամեցրեք կապված աղբյուրից։',
    disclaimer:        'Միայն տեղեկատվական, ոչ բժշկական խորհուրդ։',
    statusNormal:      'Նորմալ',
    statusPrediabetes: 'Նախաշաքարախտ',
    statusHigh:        'Բարձր',
    statusLow:         'Ցածր',
    fastingAvg:        'Ծոմ պահելու միջին',
    postMealAvg:       'Ուտելուց հետո միջին',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'Թիրախ սահման',
    editTargetRange:   'Խմբագրել թիրախ սահմանը',
    lastSyncedDexcom:  'Վերջին համաժամեցում',
    noDexcomSync:      'Չի համաժամեցվել',
    noReadingsWindow:    'No readings in this window',
    },
  ru: {
    title:             'Сахар в крови',
    noData:            'Нет показаний',
    lastUpdated:       'Последнее обновление',
    projectedA1C:      'Прогнозируемый A1C',
    notEnoughData:     'Недостаточно данных',
    avg7:              'Ср. за 7 дней',
    avg30:             'Ср. за 30 дней',
    avg90:             'Ср. за 90 дней',
    trend7:            'Тренд за 7 дней',
    timeInRange:       'Время в норме',
    inRange:           'В норме',
    above:             'Выше нормы',
    below:             'Ниже нормы',
    readings:          'показаний',
    dexcomTitle:       'Данные Dexcom / CGM',
    dexcomSub:         'VitalSync может автоматически импортировать показания Dexcom и CGM через Apple Здоровье.',
    viewRecords:       'Просмотр записей →',
    addReading:        'Добавить показание →',
    noDataTitle:       'Нет показаний глюкозы',
    noDataSub:         'Добавьте показание в Записях или синхронизируйте из подключённого источника.',
    disclaimer:        'Только в информационных целях. Не является медицинской рекомендацией.',
    statusNormal:      'Норма',
    statusPrediabetes: 'Предиабет',
    statusHigh:        'Высокий',
    statusLow:         'Низкий',
    fastingAvg:        'Ср. натощак',
    postMealAvg:       'Ср. после еды',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'Целевой диапазон',
    editTargetRange:   'Изменить диапазон',
    lastSyncedDexcom:  'Последняя синхронизация',
    noDexcomSync:      'Не синхронизировано',
    noReadingsWindow:    'Нет показаний в этом периоде',
    },
  pl: {
    title:             'Cukier we krwi',
    noData:            'Brak odczytów',
    lastUpdated:       'Ostatnia aktualizacja',
    projectedA1C:      'Szacowany A1C',
    notEnoughData:     'Niewystarczające dane',
    avg7:              'Śr. 7 dni',
    avg30:             'Śr. 30 dni',
    avg90:             'Śr. 90 dni',
    trend7:            'Trend 7 dni',
    timeInRange:       'Czas w normie',
    inRange:           'W normie',
    above:             'Powyżej normy',
    below:             'Poniżej normy',
    readings:          'odczytów',
    dexcomTitle:       'Dane Dexcom / CGM',
    dexcomSub:         'VitalSync może automatycznie importować odczyty Dexcom i CGM przez Apple Zdrowie.',
    viewRecords:       'Zobacz zapisy glukozy →',
    addReading:        'Dodaj odczyt →',
    noDataTitle:       'Brak odczytów glukozy',
    noDataSub:         'Dodaj odczyt w Zapisach lub zsynchronizuj z podłączonego źródła.',
    disclaimer:        'Wyłącznie informacyjnie. Nie stanowi porady medycznej.',
    statusNormal:      'Norma',
    statusPrediabetes: 'Stan przedcukrzycowy',
    statusHigh:        'Wysoki',
    statusLow:         'Niski',
    fastingAvg:        'Śr. na czczo',
    postMealAvg:       'Śr. po posiłku',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'Zakres docelowy',
    editTargetRange:   'Edytuj zakres',
    lastSyncedDexcom:  'Ostatnia synchronizacja',
    noDexcomSync:      'Nie zsynchronizowano',
    noReadingsWindow:    'Brak odczytów w tym oknie',
    },
  no: {
    title:             'Blodsukker',
    noData:            'Ingen avlesninger',
    lastUpdated:       'Sist oppdatert',
    projectedA1C:      'Estimert A1C',
    notEnoughData:     'Ikke nok data',
    avg7:              'Snitt 7 dager',
    avg30:             'Snitt 30 dager',
    avg90:             'Snitt 90 dager',
    trend7:            'Trend 7 dager',
    timeInRange:       'Tid i målområde',
    inRange:           'I målområde',
    above:             'Over mål',
    below:             'Under mål',
    readings:          'avlesninger',
    dexcomTitle:       'Dexcom / CGM-data',
    dexcomSub:         'VitalSync kan automatisk importere Dexcom- og CGM-avlesninger via Apple Helse.',
    viewRecords:       'Se blodsukkerposter →',
    addReading:        'Legg til avlesning →',
    noDataTitle:       'Ingen glukoseavlesninger',
    noDataSub:         'Legg til en avlesning i Poster eller synkroniser fra en tilkoblet kilde.',
    disclaimer:        'Kun til informasjonsformål. Ikke medisinsk råd.',
    statusNormal:      'Normal',
    statusPrediabetes: 'Prediabetes',
    statusHigh:        'Høy',
    statusLow:         'Lav',
    fastingAvg:        'Snitt fastende',
    postMealAvg:       'Snitt etter måltid',
    noFastingData:     '—',
    noPostMealData:    '—',
    targetRange:       'Målområde',
    editTargetRange:   'Rediger målområde',
    lastSyncedDexcom:  'Sist synkronisert',
    noDexcomSync:      'Ikke synkronisert',
    noReadingsWindow:    'Ingen avlesninger i dette vinduet',
    },
} as const;

type LangKey = keyof typeof STRINGS;
function getStrings(lang: string) {
  return STRINGS[(lang as LangKey) in STRINGS ? (lang as LangKey) : 'en'];
}

// ─── ADAG formula ─────────────────────────────────────────────────────────────
// Nathan DM et al. (2008) — Translating the A1C assay into estimated average glucose values
// A1C (%) = (eAG mg/dL + 46.7) / 28.7
function projectA1C(avgGlucoseMgDl: number): number {
  return (avgGlucoseMgDl + 46.7) / 28.7;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Average glucose over a rolling window.
 * @param days   Window length in days (e.g. 7)
 * @param offset Days to shift the window back from now (default 0 = most recent window)
 *               Pass `days` to get the prior window: e.g. days=7, offset=7 → days 8–14
 */
function windowAvg(
  records: { glucoseMgDl: number; timestamp: string }[],
  days: number,
  offset = 0,
): number | null {
  const now = Date.now();
  const MS  = 24 * 60 * 60 * 1000;
  const end   = now - offset * MS;
  const start = end  - days   * MS;
  const vals = records
    .filter(r => { const t = new Date(r.timestamp).getTime(); return t >= start && t < end; })
    .map(r => r.glucoseMgDl)
    .filter(v => v > 0);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function last7DaySparkline(
  records: { glucoseMgDl: number; timestamp: string }[],
): number[] {
  const days: Record<string, number[]> = {};
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days[d.toISOString().slice(0, 10)] = [];
  }
  records.forEach(r => {
    const key = (r.timestamp ?? '').slice(0, 10);
    if (days[key]) days[key].push(r.glucoseMgDl);
  });
  return Object.values(days).map(arr =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0,
  );
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Map classifyGlucose result → color token */
function glucoseColor(
  classification: 'above' | 'in-range' | 'below',
  isDark: boolean,
): string {
  if (classification === 'in-range') return isDark ? GLUCOSE_COLORS.normal.dark      : GLUCOSE_COLORS.normal.light;
  if (classification === 'above')    return isDark ? GLUCOSE_COLORS.high.dark         : GLUCOSE_COLORS.high.light;
  return                                    isDark ? GLUCOSE_COLORS.low.dark          : GLUCOSE_COLORS.low.light;
}

/** Map classifyGlucose result → status label key */
function glucoseStatusLabel(
  classification: 'above' | 'in-range' | 'below',
  mgDl: number,
  thresholds: GlucoseThresholdConfig,
  s: ReturnType<typeof getStrings>,
): string {
  if (classification === 'in-range') return s.statusNormal;
  if (classification === 'below')    return s.statusLow;
  // above: distinguish High vs Pre-Diabetes range (ADA: 140–180 = pre-diabetes zone)
  if (mgDl >= 140 && mgDl <= thresholds.highMgDl) return s.statusPrediabetes;
  return s.statusHigh;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GlucoseDashboardCard() {
  const { state } = useHealth();
  const colors    = useColors();
  const scheme    = useColorScheme();
  const isDark    = scheme === 'dark';
  const router    = useRouter();
   const lang      = useLang();
  const s         = getStrings(lang);
  const accent = isDark ? ACCENT_DARK : ACCENT_LIGHT;
  const { glucoseUnit } = useUnitPreferences();

  // ── Glucose thresholds (user-configured) ─────────────────────────────────
  const [thresholds, setThresholds] = useState<GlucoseThresholdConfig>(DEFAULT_GLUCOSE_THRESHOLDS);
  useEffect(() => {
    loadGlucoseThresholds().then(setThresholds).catch(() => {});
  }, []);

  // ── Collapsed state (persisted) ───────────────────────────────────────────
  const [collapsed, setCollapsed] = useState(true);
  const [hydrated, setHydrated]   = useState(false);

  useEffect(() => {
    safeGetItem(STORAGE_KEY)
      .then(raw => { if (raw !== null) setCollapsed(raw === 'true'); })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    safeSetItem(STORAGE_KEY, String(collapsed)).catch(() => {});
  }, [collapsed, hydrated]);

  // ── Derive glucose data from shared health context ────────────────────────
  const records = (state.data?.bloodSugar ?? []).slice().sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const latest = records.length ? records[0] : null;
  const avg7      = windowAvg(records, 7);
  const avg7Prior = windowAvg(records, 14, 7);  // prior 7-day window (days 8–14)
  const avg30  = windowAvg(records, 30);
  const avg90  = windowAvg(records, 90);

  // Prefer 90-day for A1C; fall back to 30-day, then 7-day
  const a1cBase       = avg90 ?? avg30 ?? avg7;
  const projectedA1C  = a1cBase != null ? projectA1C(a1cBase) : null;

  const sparklineData = last7DaySparkline(records);
  const hasData       = records.length > 0;

  // Classify latest reading
  const latestClass = latest
    ? classifyGlucose(latest.glucoseMgDl, thresholds)
    : 'in-range';
  const latestColor = latest ? glucoseColor(latestClass, isDark) : accent;
  const latestStatusLabel = latest
    ? glucoseStatusLabel(latestClass, latest.glucoseMgDl, thresholds, s)
    : '';

  // TIR for the collapsed tab label only (14-day default).
  // The expanded card computes its own TIR per the selected window.
  const collapsedTir = React.useMemo(() => {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const vals = records
      .filter(r => new Date(r.timestamp).getTime() >= cutoff)
      .map(r => r.glucoseMgDl);
    return computeTIR(vals, thresholds);
  }, [records, thresholds]);

  // ── Animation ─────────────────────────────────────────────────────────────
  const naturalHeight = useSharedValue(0);
  const isCollapsedSV = useSharedValue(collapsed ? 1 : 0);

  useEffect(() => {
    isCollapsedSV.value = collapsed ? 1 : 0;
  }, [collapsed, isCollapsedSV]);

  const derivedHeight = useDerivedValue(() =>
    withTiming(
      naturalHeight.value * (1 - isCollapsedSV.value),
      { duration: ANIM_DURATION, easing: ANIM_EASING },
    ),
  );

  const animatedContentStyle = useAnimatedStyle(() => ({
    height: derivedHeight.value,
    overflow: 'hidden' as const,
  }));

  // When naturalHeight changes while expanded (content added/removed), smoothly
  // re-animate to the new height using useAnimatedReaction on the UI thread.
  useAnimatedReaction(
    () => naturalHeight.value,
    (current, previous) => {
      if (previous !== null && current !== previous && isCollapsedSV.value === 0) {
        isCollapsedSV.value = withTiming(0, { duration: ANIM_DURATION, easing: ANIM_EASING });
      }
    },
  );

  const chevronAnim = useRef(new Animated.Value(collapsed ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(chevronAnim, {
      toValue: collapsed ? 1 : 0,
      duration: ANIM_DURATION,
      useNativeDriver: true,
    }).start();
  }, [collapsed, chevronAnim]);

  const chevronRotate = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-90deg'],
  });

  const handleToggle = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCollapsed(prev => !prev);
  }, []);

  // ── Fasting / Post-Meal averages (30-day window) ─────────────────────────
  const fastingRecords   = records.filter(r => (r.context === 'fasting'));
  const postMealRecords  = records.filter(r => (r.context === 'post-meal'));
  const avgFasting  = fastingRecords.length  ? Math.round(fastingRecords.slice(0, 30).reduce((s, r) => s + r.glucoseMgDl, 0) / Math.min(fastingRecords.length, 30))  : null;
  const avgPostMeal = postMealRecords.length ? Math.round(postMealRecords.slice(0, 30).reduce((s, r) => s + r.glucoseMgDl, 0) / Math.min(postMealRecords.length, 30)) : null;

  // ── Last Dexcom / CGM sync timestamp ─────────────────────────────────────
  const lastDexcomSync = (() => {
    const dexcomRecord = records.find(r =>
      r.source === 'device' &&
      r.deviceName != null &&
      /dexcom|cgm|libre|sensor/i.test(r.deviceName)
    );
    return dexcomRecord?.timestamp ?? null;
  })();

  // ── HealthKit / Health Connect sync state (for non-Dexcom users) ──────────
  const { store: dsStore } = useDataSources();
  const nativeHealthSync = (() => {
    if (Platform.OS === 'ios') {
      const hk = dsStore.sources['healthkit'];
      if (hk?.status === 'connected' && hk.lastSyncedAt) {
        return { label: 'Apple Health', lastSyncedAt: hk.lastSyncedAt };
      }
    }
    if (Platform.OS === 'android') {
      const hc = dsStore.sources['health_connect'];
      if (hc?.status === 'connected' && hc.lastSyncedAt) {
        return { label: 'Health Connect', lastSyncedAt: hc.lastSyncedAt };
      }
    }
    return null;
  })();

  const handleViewRecords = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/log/blood-sugar' as any);
  }, [router]);

  const handleAddReading = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/log/blood-sugar' as any);
  }, [router]);

  const handleQuickEntry = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Pre-fill the last-used meal context so the log screen pre-selects it
    const ctx = latest?.context ?? 'fasting';
    router.push((`/log/blood-sugar?context=${ctx}`) as any);
  }, [router, latest]);

  const handleEditTargetRange = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/settings/glucose-thresholds' as any);
  }, [router]);

  // ── Low-glucose pulse animation ────────────────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isLow = latest != null && latestClass === 'below';
  useEffect(() => {
    if (!isLow) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isLow, pulseAnim]);

  if (!hydrated) return null;

  const headerBorderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const titleColor = collapsed ? colors.muted : colors.foreground;

  return (
    <GlassCard
      accentColor={accent}
      noPadding
      style={styles.cardShell}
    >
      {/* ── Header row ── */}
      <Pressable
        onPress={handleToggle}
        style={({ pressed }) => [
          styles.header,
          { borderBottomColor: headerBorderColor },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${s.title} card, ${collapsed ? 'collapsed' : 'expanded'}. Tap to ${collapsed ? 'expand' : 'collapse'}.`}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>🩸</Text>
          <Text style={[styles.headerTitle, { color: titleColor }]}>
            {s.title}
          </Text>
          {/* Collapsed summary */}
          {collapsed && latest && (
            <View style={styles.collapsedSummary}>
              <Text style={[styles.collapsedValue, { color: latestColor }]}>
                {glucoseUnit === 'mmol/L'
                  ? mgDlToMmol(latest.glucoseMgDl).toFixed(1)
                  : String(latest.glucoseMgDl)}
              </Text>
              <Text style={[styles.collapsedUnit, { color: colors.muted }]}>
                {' '}{glucoseUnit}
              </Text>
              {/* 3-point micro-sparkline replacing static A1C text */}
              <MicroSparkline
                data={sparklineData}
                color={latestColor}
              />
            </View>
          )}
          {collapsed && !hasData && (
            <Text style={[styles.collapsedUnit, { color: colors.muted, marginLeft: 8 }]}>
              {s.noData}
            </Text>
          )}
        </View>
        {/* Low-glucose pulse badge (collapsed only) */}
        {collapsed && isLow && (
          <Animated.View
            style={[
              styles.lowBadge,
              { backgroundColor: isDark ? GLUCOSE_COLORS.low.dark : GLUCOSE_COLORS.low.light, opacity: pulseAnim },
            ]}
            accessibilityLabel="Low glucose alert"
          />
        )}
        {/* Quick-entry + button */}
        <TouchableOpacity
          onPress={handleQuickEntry}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 4 }}
          style={styles.quickEntryBtn}
          accessibilityRole="button"
          accessibilityLabel="Add blood sugar reading"
        >
          <Text style={[styles.quickEntryIcon, { color: accent }]}>＋</Text>
        </TouchableOpacity>
        <Animated.Text
          style={[
            styles.chevron,
            { color: accent + 'CC', transform: [{ rotate: chevronRotate }] },
          ]}
        >
          ▾
        </Animated.Text>
      </Pressable>

      {/* ── Collapsed tab row: always visible, tapping a tab expands the card ── */}
      {collapsed && (
        <View style={[
          styles.collapsedTabRow,
          { backgroundColor: isDark ? '#0F172A' : '#F1F5F9', borderColor: isDark ? '#1E293B' : '#E2E8F0' },
        ]}>
          <TouchableOpacity
            style={styles.collapsedTab}
            onPress={handleToggle}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="View 7-day average"
          >
            <Text style={[styles.collapsedTabText, { color: isDark ? '#64748B' : '#94A3B8' }]}>
              📊 {avg7 != null
                ? `${glucoseUnit === 'mmol/L' ? mgDlToMmol(avg7).toFixed(1) : Math.round(avg7)} ${glucoseUnit} avg`
                : s.avg7 ?? '7-Day Avg'}
            </Text>
          </TouchableOpacity>
          <View style={[styles.collapsedTabDivider, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]} />
          <TouchableOpacity
            style={styles.collapsedTab}
            onPress={handleToggle}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="View time in range"
          >
            <Text style={[styles.collapsedTabText, { color: isDark ? '#64748B' : '#94A3B8' }]}>
              🎯 {collapsedTir.count > 0 ? `${collapsedTir.inRangePct}${s.pctInRange ?? '% in range'}` : (s.timeInRange ?? 'Time in Range')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Ghost measurement view: absolutely positioned off-screen so onLayout
           fires even when the animated container has height=0 / overflow=hidden.
           top: -9999 ensures it never overlaps visible content even if overflow
           clipping fails on web. ── */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', opacity: 0, left: 0, right: 0, top: -9999 }}
        onLayout={e => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && naturalHeight.value !== h) naturalHeight.value = h;
        }}
      >
        {hasData ? (
          <ExpandedContent
            latest={latest!}
            avg7={avg7}
            avg7Prior={avg7Prior}
            avg30={avg30}
            avg90={avg90}
            projectedA1C={projectedA1C}
            sparklineData={sparklineData}
            records={records}
            latestColor={latestColor}
            latestStatusLabel={latestStatusLabel}
            accent={accent}
            isDark={isDark}
            colors={colors}
            strings={s}
            onViewRecords={handleViewRecords}
            avgFasting={avgFasting}
            avgPostMeal={avgPostMeal}
            lastDexcomSync={lastDexcomSync}
            nativeHealthSync={nativeHealthSync}
            thresholds={thresholds}
            onEditTargetRange={handleEditTargetRange}
            glucoseUnit={glucoseUnit}
          />
        ) : (
          <EmptyState
            accent={accent}
            colors={colors}
            strings={s}
            onAddReading={handleAddReading}
          />
        )}
      </View>
      {/* ── Animated expanded content ── */}
      {/* The outer View with overflow:hidden ensures clipping on web where
          Reanimated's useAnimatedStyle overflow may not apply correctly. */}
      <View style={styles.animatedClip}>
      <Reanimated.View style={animatedContentStyle}>
        {hasData ? (
          <ExpandedContent
            latest={latest!}
            avg7={avg7}
            avg7Prior={avg7Prior}
            avg30={avg30}
            avg90={avg90}
            projectedA1C={projectedA1C}
            sparklineData={sparklineData}
            records={records}
            latestColor={latestColor}
            latestStatusLabel={latestStatusLabel}
            accent={accent}
            isDark={isDark}
            colors={colors}
            strings={s}
            onViewRecords={handleViewRecords}
            avgFasting={avgFasting}
            avgPostMeal={avgPostMeal}
            lastDexcomSync={lastDexcomSync}
            nativeHealthSync={nativeHealthSync}
            thresholds={thresholds}
            onEditTargetRange={handleEditTargetRange}
            glucoseUnit={glucoseUnit}
          />
        ) : (
          <EmptyState
            accent={accent}
            colors={colors}
            strings={s}
            onAddReading={handleAddReading}
          />
        )}
      </Reanimated.View>
      </View>
    </GlassCard>
  );
}

// ─── Expanded content ─────────────────────────────────────────────────────────

type TirWindow = '7d' | '14d' | '30d';

interface ExpandedContentProps {
  latest: { glucoseMgDl: number; timestamp: string; context?: string };
  avg7: number | null;
  avg7Prior: number | null;  // prior 7-day window for week-over-week arrow
  avg30: number | null;
  avg90: number | null;
  projectedA1C: number | null;
  sparklineData: number[];
  records: { glucoseMgDl: number; timestamp: string }[];
  thresholds: GlucoseThresholdConfig;
  latestColor: string;
  latestStatusLabel: string;
  accent: string;
  isDark: boolean;
  colors: ReturnType<typeof useColors>;
  strings: ReturnType<typeof getStrings>;
  onViewRecords: () => void;
  // New: fasting/post-meal averages
  avgFasting: number | null;
  avgPostMeal: number | null;
  // New: last Dexcom/CGM sync timestamp
  lastDexcomSync: string | null;
  // New: HealthKit / Health Connect sync info (for non-Dexcom users)
  nativeHealthSync: { label: string; lastSyncedAt: string } | null;
  // New: target range display + navigation
  onEditTargetRange: () => void;
  // Unit preference
  glucoseUnit: GlucoseUnit;
}

const TIR_WINDOWS: { key: TirWindow; label: string; days: number }[] = [
  { key: '7d',  label: '7d',  days: 7  },
  { key: '14d', label: '14d', days: 14 },
  { key: '30d', label: '30d', days: 30 },
];

function ExpandedContent({
  latest,
  avg7,
  avg7Prior,
  avg30,
  avg90,
  projectedA1C,
  sparklineData,
  records,
  latestColor,
  latestStatusLabel,
  accent,
  isDark,
  colors,
  strings: s,
  onViewRecords,
  avgFasting,
  avgPostMeal,
  lastDexcomSync,
  nativeHealthSync,
  thresholds,
  onEditTargetRange,
  glucoseUnit,
}: ExpandedContentProps) {
  const [tirWindow, setTirWindow] = React.useState<TirWindow>('14d');
  const dividerColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const inRangeColor = isDark ? GLUCOSE_COLORS.normal.dark  : GLUCOSE_COLORS.normal.light;
  const aboveColor   = isDark ? GLUCOSE_COLORS.high.dark    : GLUCOSE_COLORS.high.light;
  const belowColor   = isDark ? GLUCOSE_COLORS.low.dark     : GLUCOSE_COLORS.low.light;

  // Compute TIR for the selected window
  const tirDays = TIR_WINDOWS.find(w => w.key === tirWindow)?.days ?? 14;
  const tirReadings = React.useMemo(() => {
    const cutoff = Date.now() - tirDays * 24 * 60 * 60 * 1000;
    return records
      .filter(r => new Date(r.timestamp).getTime() >= cutoff)
      .map(r => r.glucoseMgDl);
  }, [records, tirDays]);
  const tir = React.useMemo(() => computeTIR(tirReadings, thresholds), [tirReadings, thresholds]);

  return (
    <View style={styles.expandedBody}>
      {/* ── Primary reading row ── */}
      <View style={[styles.primaryRow, { borderBottomColor: dividerColor }]}>
        <View>
          <View style={styles.primaryValueRow}>
            <Text style={[styles.primaryValue, { color: latestColor }]}>
              {glucoseUnit === 'mmol/L'
                ? mgDlToMmol(latest.glucoseMgDl).toFixed(1)
                : String(latest.glucoseMgDl)}
            </Text>
            <Text style={[styles.primaryUnit, { color: colors.muted }]}> {glucoseUnit}</Text>
          </View>
          {/* Status badge + meal context chip row */}
          <View style={styles.badgeRow}>
            <View style={[styles.statusBadge, { backgroundColor: latestColor + '20', borderColor: latestColor + '50' }]}>
              <Text style={[styles.statusBadgeText, { color: latestColor }]}>
                {latestStatusLabel}
              </Text>
            </View>
            {latest.context && latest.context !== 'random' && (
              <View style={[styles.contextChip, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }]}>
                <Text style={[styles.contextChipText, { color: colors.muted }]}>
                  {latest.context === 'fasting' ? '🌙 Fasting'
                    : latest.context === 'post-meal' ? '🍽 Post-Meal'
                    : latest.context === 'bedtime' ? '🛏 Bedtime'
                    : latest.context}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.primaryRight}>
          <Text style={[styles.updatedLabel, { color: colors.muted }]}>
            {s.lastUpdated}
          </Text>
          <Text style={[styles.updatedTime, { color: colors.foreground }]}>
            {formatRelativeTime(latest.timestamp)}
          </Text>
        </View>
      </View>

      {/* ── A1C + sparkline row ── */}
      <View style={[styles.a1cSparkRow, { borderBottomColor: dividerColor }]}>
        <View style={styles.a1cBlock}>
          <Text style={[styles.a1cLabel, { color: colors.muted }]}>
            {s.projectedA1C}
          </Text>
          {projectedA1C != null ? (
            <Text style={[styles.a1cValue, { color: colors.foreground }]}>
              ~{projectedA1C.toFixed(1)}
              <Text style={[styles.a1cPercent, { color: colors.muted }]}>%</Text>
            </Text>
          ) : (
            <Text style={[styles.a1cInsufficient, { color: colors.muted }]}>
              {s.notEnoughData}
            </Text>
          )}
        </View>
        <View style={styles.sparklineBlock}>
          <Text style={[styles.sparklineLabel, { color: colors.muted }]}>{s.trend7}</Text>
          <SparklineChart
            data={sparklineData.filter(v => v > 0).length >= 2 ? sparklineData : [0, 0]}
            width={90}
            height={36}
            strokeColor={isDark ? 'rgba(248,113,113,0.4)' : 'rgba(220,38,38,0.3)'}
            accentColor={accent}
            strokeWidth={1.8}
          />
        </View>
      </View>

      {/* ── Averages grid ── */}
      <View style={[styles.avgGrid, { borderBottomColor: dividerColor }]}>
        <AvgCell label={s.avg7}  value={avg7}  prior={avg7Prior ?? null} colors={colors} glucoseUnit={glucoseUnit} />
        <View style={[styles.avgDivider, { backgroundColor: dividerColor }]} />
        <AvgCell label={s.avg30} value={avg30} colors={colors} glucoseUnit={glucoseUnit} />
        {avg90 != null && (
          <>
            <View style={[styles.avgDivider, { backgroundColor: dividerColor }]} />
            <AvgCell label={s.avg90} value={avg90} colors={colors} glucoseUnit={glucoseUnit} />
          </>
        )}
      </View>

      {/* ── Time-in-Range bar ── */}
      <View style={[styles.tirSection, { borderBottomColor: dividerColor }]}>
        {/* Header: title + reading count */}
        <View style={styles.tirHeader}>
          <Text style={[styles.tirTitle, { color: colors.muted }]}>{s.timeInRange}</Text>
          <Text style={[styles.tirCount, { color: colors.muted }]}>
            {tir.count > 0 ? `${tir.count} ${s.readings}` : '—'}
          </Text>
        </View>
        {/* Window selector chips: 7d / 14d / 30d */}
        <View style={styles.tirWindowRow}>
          {TIR_WINDOWS.map(w => {
            const isActive = w.key === tirWindow;
            return (
              <TouchableOpacity
                key={w.key}
                onPress={() => setTirWindow(w.key)}
                activeOpacity={0.7}
                style={[
                  styles.tirWindowChip,
                  isActive
                    ? { backgroundColor: inRangeColor + '28', borderColor: inRangeColor + '70' }
                    : { backgroundColor: 'transparent', borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)' },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`TIR ${w.label}`}
              >
                <Text style={[
                  styles.tirWindowChipText,
                  { color: isActive ? inRangeColor : colors.muted },
                ]}>
                  {w.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {tir.count > 0 ? (
          <>
            {/* Segmented bar with inline % labels */}
            <View style={styles.tirBarLabeled}>
              {tir.belowPct > 0 && (
                <View style={[styles.tirSegmentLabeled, { flex: tir.belowPct, backgroundColor: belowColor + 'CC' }]}>
                  {tir.belowPct >= 8 && (
                    <Text style={styles.tirSegmentPct}>{tir.belowPct}%</Text>
                  )}
                </View>
              )}
              {tir.inRangePct > 0 && (
                <View style={[styles.tirSegmentLabeled, { flex: tir.inRangePct, backgroundColor: inRangeColor + 'CC' }]}>
                  {tir.inRangePct >= 8 && (
                    <Text style={styles.tirSegmentPct}>{tir.inRangePct}%</Text>
                  )}
                </View>
              )}
              {tir.abovePct > 0 && (
                <View style={[styles.tirSegmentLabeled, { flex: tir.abovePct, backgroundColor: aboveColor + 'CC' }]}>
                  {tir.abovePct >= 8 && (
                    <Text style={styles.tirSegmentPct}>{tir.abovePct}%</Text>
                  )}
                </View>
              )}
            </View>
            {/* Legend */}
            <View style={styles.tirLegend}>
              {tir.belowPct > 0 && (
                <TirLegendItem color={belowColor} label={s.below} pct={tir.belowPct} colors={colors} />
              )}
              <TirLegendItem color={inRangeColor} label={s.inRange} pct={tir.inRangePct} colors={colors} />
              {tir.abovePct > 0 && (
                <TirLegendItem color={aboveColor} label={s.above} pct={tir.abovePct} colors={colors} />
              )}
            </View>
          </>
        ) : (
          <Text style={[styles.tirNoData, { color: colors.muted }]}>{s.noReadingsWindow ?? 'No readings in this window'}</Text>
        )}
      </View>

      {/* ── Fasting / Post-Meal breakdown ── */}
      {(avgFasting != null || avgPostMeal != null) && (
        <View style={[styles.contextBreakdown, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }]}>
          <ContextRow
            label={s.fastingAvg}
            value={avgFasting}
            fallback={s.noFastingData}
            colors={colors}
            glucoseUnit={glucoseUnit}
          />
          <ContextRow
            label={s.postMealAvg}
            value={avgPostMeal}
            fallback={s.noPostMealData}
            colors={colors}
            glucoseUnit={glucoseUnit}
          />
        </View>
      )}

      {/* ── Target range row with edit shortcut ── */}
      <TouchableOpacity
        onPress={onEditTargetRange}
        activeOpacity={0.7}
        style={[styles.targetRangeRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }]}
        accessibilityRole="button"
        accessibilityLabel={s.editTargetRange}
      >
        <Text style={[styles.targetRangeLabel, { color: colors.muted }]}>{s.targetRange}</Text>
        <View style={styles.targetRangeRight}>
          <Text style={[styles.targetRangeValue, { color: colors.foreground }]}>
            {glucoseUnit === 'mmol/L'
              ? `${mgDlToMmol(thresholds.lowMgDl).toFixed(1)}–${mgDlToMmol(thresholds.highMgDl).toFixed(1)} mmol/L`
              : `${thresholds.lowMgDl}–${thresholds.highMgDl} mg/dL`}
          </Text>
          <Text style={[styles.targetRangeEdit, { color: accent }]}>{s.editTargetRange} ›</Text>
        </View>
      </TouchableOpacity>

      {/* ── Dexcom / CGM info banner (matches Records screen language) ── */}
      <View style={[styles.dexcomBanner, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }]}>
        <Text style={styles.dexcomIcon}>📲</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.dexcomTitle, { color: colors.foreground }]}>{s.dexcomTitle}</Text>
          <Text style={[styles.dexcomSub, { color: colors.muted }]}>{s.dexcomSub}</Text>
          {/* Last synced timestamp — Dexcom/CGM */}
          <Text style={[styles.dexcomSyncTime, { color: colors.muted }]}>
            {s.lastSyncedDexcom}: {lastDexcomSync ? formatRelativeTime(lastDexcomSync) : s.noDexcomSync}
          </Text>
        </View>
      </View>

      {/* ── HealthKit / Health Connect sync badge (non-Dexcom users) ── */}
      {!lastDexcomSync && nativeHealthSync && (
        <View style={[styles.nativeHealthBanner, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }]}>
          <Text style={styles.nativeHealthIcon}>
            {nativeHealthSync.label === 'Apple Health' ? '🍎' : '🤖'}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.nativeHealthLabel, { color: colors.foreground }]}>
              {nativeHealthSync.label}
            </Text>
            <Text style={[styles.dexcomSyncTime, { color: colors.muted }]}>
              {s.lastSyncedDexcom}: {formatRelativeTime(nativeHealthSync.lastSyncedAt)}
            </Text>
          </View>
        </View>
      )}

      {/* ── Disclaimer ── */}
      <Text style={[styles.disclaimer, { color: colors.muted }]}>
        {s.disclaimer}
      </Text>

      {/* ── CTA ── */}
      <TouchableOpacity
        onPress={onViewRecords}
        activeOpacity={0.75}
        style={[styles.ctaButton, { backgroundColor: accent + '18', borderColor: accent + '40' }]}
        accessibilityRole="button"
        accessibilityLabel={s.viewRecords}
      >
        <Text style={[styles.ctaText, { color: accent }]}>{s.viewRecords}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Average cell ─────────────────────────────────────────────────────────────

function AvgCell({ label, value, prior, colors, glucoseUnit }: {
  label: string;
  value: number | null;
  prior?: number | null;
  colors: ReturnType<typeof useColors>;
  glucoseUnit: GlucoseUnit;
}) {
  const displayValue = value != null
    ? (glucoseUnit === 'mmol/L' ? mgDlToMmol(value).toFixed(1) : String(value))
    : null;
  // Week-over-week trend arrow (threshold: 3 mg/dL to avoid noise)
  const trendArrow = (value != null && prior != null)
    ? (value > prior + 3 ? '↑' : value < prior - 3 ? '↓' : '→')
    : null;
  const trendColor = trendArrow === '↑'
    ? GLUCOSE_COLORS.high.light
    : trendArrow === '↓'
    ? GLUCOSE_COLORS.low.light
    : GLUCOSE_COLORS.normal.light;
  return (
    <View style={styles.avgCell}>
      <Text style={[styles.avgLabel, { color: colors.muted }]}>{label}</Text>
      {displayValue != null ? (
        <View style={styles.avgValueRow}>
          <Text style={[styles.avgValue, { color: colors.foreground }]}>{displayValue}</Text>
          <Text style={[styles.avgUnit, { color: colors.muted }]}> {glucoseUnit}</Text>
          {trendArrow && (
            <Text style={[styles.trendArrow, { color: trendColor }]}>{trendArrow}</Text>
          )}
        </View>
      ) : (
        <Text style={[styles.avgNoData, { color: colors.muted }]}>—</Text>
      )}
    </View>
  );
}

// ─── Micro-sparkline (3 representative points from 7-day data) ────────────────

function MicroSparkline({ data, color }: { data: number[]; color: string }) {
  // Pick 3 evenly-spaced points from the 7-day array
  const nonZero = data.filter(v => v > 0);
  if (nonZero.length < 2) return null;
  const pts = nonZero.length >= 3
    ? [nonZero[0], nonZero[Math.floor(nonZero.length / 2)], nonZero[nonZero.length - 1]]
    : nonZero;
  const W = 36, H = 16;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const points = pts
    .map((v, i) => {
      const x = (i / (pts.length - 1)) * (W - 4) + 2;
      const y = H - 2 - ((v - min) / range) * (H - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <View style={{ marginLeft: 8, justifyContent: 'center' }}>
      <Svg width={W} height={H}>
        <Polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
        />
      </Svg>
    </View>
  );
}

// ─── Context row (fasting / post-meal) ──────────────────────────────────────

function ContextRow({ label, value, fallback, colors, glucoseUnit }: {
  label: string;
  value: number | null;
  fallback: string;
  colors: ReturnType<typeof useColors>;
  glucoseUnit: GlucoseUnit;
}) {
  const displayValue = value != null
    ? (glucoseUnit === 'mmol/L' ? mgDlToMmol(value).toFixed(1) : String(value))
    : null;
  return (
    <View style={styles.contextRow}>
      <Text style={[styles.contextLabel, { color: colors.muted }]}>{label}</Text>
      {displayValue != null ? (
        <View style={styles.contextValueRow}>
          <Text style={[styles.contextValue, { color: colors.foreground }]}>{displayValue}</Text>
          <Text style={[styles.contextUnit, { color: colors.muted }]}> {glucoseUnit}</Text>
        </View>
      ) : (
        <Text style={[styles.contextValue, { color: colors.muted }]}>{fallback}</Text>
      )}
    </View>
  );
}

// ─── TIR legend item ──────────────────────────────────────────────────────────

function TirLegendItem({ color, label, pct, colors }: {
  color: string;
  label: string;
  pct: number;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.tirLegendItem}>
      <View style={[styles.tirDot, { backgroundColor: color }]} />
      <Text style={[styles.tirLegendLabel, { color: colors.muted }]}>
        {label} {pct}%
      </Text>
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ accent, colors, strings: s, onAddReading }: {
  accent: string;
  colors: ReturnType<typeof useColors>;
  strings: ReturnType<typeof getStrings>;
  onAddReading: () => void;
}) {
  return (
    <View style={styles.emptyBody}>
      <Text style={styles.emptyIcon}>📊</Text>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
        {s.noDataTitle}
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
        {s.noDataSub}
      </Text>
      <TouchableOpacity
        onPress={onAddReading}
        activeOpacity={0.75}
        style={[styles.ctaButton, { backgroundColor: accent + '18', borderColor: accent + '40', marginTop: 12 }]}
        accessibilityRole="button"
        accessibilityLabel={s.addReading}
      >
        <Text style={[styles.ctaText, { color: accent }]}>{s.addReading}</Text>
      </TouchableOpacity>
      <Text style={[styles.disclaimer, { color: colors.muted, marginTop: 10 }]}>
        {s.disclaimer}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  animatedClip: {
    overflow: 'hidden',
  },
  cardShell: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
  },
  // Collapsed tab row (matches OnDeviceInsightsCard collapsed height)
  collapsedTabRow: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 10,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  collapsedTab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  collapsedTabText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  collapsedTabDivider: {
    width: 1,
    marginVertical: 8,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  headerIcon: {
    fontSize: 13,
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  collapsedSummary: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginLeft: 4,
    flex: 1,
  },
  collapsedValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  collapsedUnit: {
    fontSize: 11,
    fontWeight: '500',
  },
  collapsedA1C: {
    fontSize: 11,
    fontWeight: '500',
  },
  quickEntryBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginRight: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lowBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  trendArrow: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 2,
    lineHeight: 15,
  },
  quickEntryIcon: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  chevron: {
    fontSize: 12,
    flexShrink: 0,
    marginLeft: 6,
  },
  // Expanded body
  expandedBody: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 2,
  },
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  primaryValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  primaryValue: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  primaryUnit: {
    fontSize: 14,
    fontWeight: '500',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  contextChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  contextChipText: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  primaryRight: {
    alignItems: 'flex-end',
  },
  updatedLabel: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  updatedTime: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  // A1C + sparkline row
  a1cSparkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  a1cBlock: {
    flex: 1,
  },
  a1cLabel: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  a1cValue: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  a1cPercent: {
    fontSize: 14,
    fontWeight: '500',
  },
  a1cInsufficient: {
    fontSize: 12,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  sparklineBlock: {
    alignItems: 'flex-end',
  },
  sparklineLabel: {
    fontSize: 9,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  // Averages grid
  avgGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avgCell: {
    flex: 1,
    alignItems: 'center',
  },
  avgDivider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
  },
  avgLabel: {
    fontSize: 9,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  avgValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  avgValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  avgUnit: {
    fontSize: 9,
    fontWeight: '500',
  },
  avgNoData: {
    fontSize: 15,
    fontWeight: '700',
  },
  // TIR
  tirSection: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tirHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  tirTitle: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tirCount: {
    fontSize: 10,
    fontWeight: '500',
  },
  tirBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    gap: 1,
  },
  tirSegment: {
    height: 8,
    borderRadius: 2,
    minWidth: 4,
  },
  tirLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 5,
  },
  tirLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tirDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  tirLegendLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  // TIR window selector
  tirWindowRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  tirWindowChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  tirWindowChipText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  // Labeled TIR bar (taller to fit % text)
  tirBarLabeled: {
    flexDirection: 'row',
    height: 22,
    borderRadius: 4,
    overflow: 'hidden',
    gap: 1,
  },
  tirSegmentLabeled: {
    height: 22,
    borderRadius: 2,
    minWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tirSegmentPct: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  tirNoData: {
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 6,
  },
  // Context breakdown (fasting / post-meal)
  contextBreakdown: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  contextLabel: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  contextValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  contextValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  contextUnit: {
    fontSize: 10,
    fontWeight: '500',
  },
  // Target range row
  targetRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  targetRangeLabel: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  targetRangeRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  targetRangeValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  targetRangeEdit: {
    fontSize: 11,
    fontWeight: '600',
  },
  // Dexcom sync time
  dexcomSyncTime: {
    fontSize: 10,
    fontWeight: '400',
    marginTop: 4,
    fontStyle: 'italic',
  },
  // HealthKit / Health Connect badge
  nativeHealthBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  nativeHealthIcon: {
    fontSize: 16,
    flexShrink: 0,
    marginTop: 1,
  },
  nativeHealthLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  // Dexcom banner
  dexcomBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dexcomIcon: {
    fontSize: 18,
    flexShrink: 0,
    marginTop: 1,
  },
  dexcomTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  dexcomSub: {
    fontSize: 11,
    lineHeight: 15,
  },
  // Disclaimer
  disclaimer: {
    fontSize: 9,
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 2,
    fontStyle: 'italic',
    letterSpacing: 0.1,
  },
  // CTA
  ctaButton: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 9,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  // Empty state
  emptyBody: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 17,
  },
});
