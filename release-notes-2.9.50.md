# VitalSync 2.9.50 — App Store Connect Release Notes

## What's New in Version 2.9.50

### EKG & AFib Monitoring
- **AFib Alerts** — A new "AFib Alerts" toggle has been added to Health Alerts settings, letting you enable or disable AFib notifications independently with a configurable cooldown period (1–24 hours).
- **EKG permission guidance** — The Health Permissions screen now includes a dedicated Electrocardiogram row with step-by-step instructions for enabling EKG access in the Apple Health app.
- **AFib in Correlation Engine** — AFib episode count per day is now a selectable metric in the Analytics screen, enabling correlation with HRV, sleep efficiency, sleep duration, and heart rate.

### Nutrition & Diet
- **DASH Diet label** — The compliance ring, diet profile card, and all diet-related labels now consistently display "DASH Diet" throughout the app.
- **Food scan retake** — Tapping "Retake Photo" on a low- or medium-confidence food scan now immediately reopens the camera. The same fix applies to the barcode scan path.
- **Scan another item** — After logging a meal, a new "Scan another item →" shortcut appears so you can log multi-item meals without closing and reopening the scanner.
- **Meal tray counter** — A session badge in the food scan header shows how many items you have logged in the current session.
- **Translated labels** — Macro range labels (Carbs, Protein, Fat), smart glucose reminder text, and diet adherence labels are now fully translated across all 19 supported languages.

### Activity & Readiness
- **Card header** — The dashboard card now correctly reads "Activity & Daily Readiness" in all languages.

### Bug Fixes
- Fixed "Retake Photo" button not opening the camera after a food scan.
- Fixed `prevEstimate` chip not persisting across sheet open/close (now stored with a 30-minute TTL).
- Fixed medium-confidence scans not showing the retake option.
- Fixed hardcoded English strings in glucose smart reminders.

---

## App Store Connect Submission Checklist

- [ ] Version: **2.9.50**
- [ ] iOS Build Number: **20950**
- [ ] Android Version Code: **30**
- [ ] Release notes added in App Store Connect (English + any localised versions)
- [ ] EAS build triggered with `--clear-provisioning-profile` to include EKG entitlement
- [ ] TestFlight internal testing group notified

---

## EAS Build Command

```bash
eas build --platform ios --profile production --clear-provisioning-profile
```

> **Why `--clear-provisioning-profile`?**
> The existing AppStore provisioning profile was created on 2026-04-14, before the
> `com.apple.developer.healthkit.access: ["electrocardiogram"]` entitlement was added.
> This flag forces EAS to delete the old profile and generate a new one that includes
> the entitlement, resolving the Xcode archive error from the previous build.

---

## Localised Release Notes (Short Version — 170 characters max for App Store)

**English (en-US)**
```
AFib alert toggle with configurable cooldown, DASH Diet label fix, food scan retake improvements, meal tray counter, and full translation of nutrition labels.
```

**Spanish (es)**
```
Alerta de fibrilación auricular con tiempo de espera configurable, etiqueta Dieta DASH corregida, mejoras en el escaneo de alimentos y contador de bandeja de comidas.
```

**French (fr)**
```
Alerte FA avec délai configurable, correction de l'étiquette Régime DASH, amélioration du scan alimentaire et compteur de plateau repas.
```

**German (de)**
```
VHF-Alarm mit konfigurierbarer Abklingzeit, DASH-Diät-Bezeichnung korrigiert, Verbesserungen beim Lebensmittelscan und Mahlzeiten-Tablett-Zähler.
```

**Portuguese (pt)**
```
Alerta de fibrilação atrial com tempo de espera configurável, correção do rótulo Dieta DASH, melhorias no scan de alimentos e contador de bandeja de refeições.
```

**Japanese (ja)**
```
心房細動アラートのクールダウン設定、DASHダイエットラベルの修正、食品スキャンの再撮影改善、食事トレイカウンターを追加。
```

**Korean (ko)**
```
심방세동 알림 쿨다운 설정, DASH 다이어트 레이블 수정, 음식 스캔 재촬영 개선, 식사 트레이 카운터 추가.
```

**Simplified Chinese (zh)**
```
新增房颤提醒冷却时间设置，修正DASH饮食标签，改进食物扫描重拍功能，添加餐盘计数器。
```

**Arabic (ar)**
```
تنبيه الرجفان الأذيني مع فترة تهدئة قابلة للتخصيص، تصحيح تسمية حمية DASH، تحسينات مسح الطعام وعداد صينية الوجبات.
```

**Hindi (hi)**
```
AFib अलर्ट कूलडाउन सेटिंग, DASH डाइट लेबल सुधार, फूड स्कैन रीटेक सुधार और मील ट्रे काउंटर जोड़ा गया।
```
