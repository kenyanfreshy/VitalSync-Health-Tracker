# VitalSync Readiness Widget — Activation Guide

The readiness widget scaffold is located at `widgets/readiness-widget.tsx`. It is fully written and ready to activate once the project upgrades to **Expo SDK 55**.

## Why SDK 55?

`expo-widgets` is in alpha and was released with SDK 55. It is not available for SDK 54 managed workflow. The widget code is written and tested; only the package install and plugin wiring are needed.

## Activation Steps

### 1. Upgrade to SDK 55

```bash
pnpm add expo@^55.0.0
npx expo install --fix
```

### 2. Install expo-widgets

```bash
npx expo install expo-widgets
```

### 3. Add the plugin to `app.config.ts`

Add the following entry to the `plugins` array in `app.config.ts`:

```ts
[
  "expo-widgets",
  {
    "bundleIdentifier": `${env.iosBundleId}.ReadinessWidget`,
    "groupIdentifier": `group.${env.iosBundleId}`,
    "widgets": [
      { "name": "ReadinessWidget", "file": "./widgets/readiness-widget" }
    ]
  }
]
```

### 4. Uncomment the widget code

In `widgets/readiness-widget.tsx`:

- Uncomment the `import` lines at the top.
- Uncomment the `ReadinessWidgetComponent` function and `createWidget` export.
- Remove or comment out the `ReadinessWidgetStub` section at the bottom.

### 5. Wire snapshot updates in `app/(tabs)/index.tsx`

Add after the existing `saveReadinessSnapshot` call:

```ts
import ReadinessWidget from '@/widgets/readiness-widget';

// Inside the sync completion useEffect:
ReadinessWidget.updateSnapshot({
  score: readiness.total,
  trend: readinessTrend ?? 'stable',
  updatedAt: new Date().toISOString(),
});
```

### 6. Build with EAS

Widgets require a custom native build — they cannot be tested in Expo Go.

```bash
eas build --platform ios --profile preview
```

## Widget Sizes Supported

| Size | Description |
|------|-------------|
| `systemSmall` | Score + label + trend arrow |
| `systemMedium` | Score + label + trend in a wider layout |
| `systemLarge` | Full score, label, trend, and branding |

## Color Coding

| Score Range | Color | Label |
|-------------|-------|-------|
| 80–100 | Emerald `#10B981` | Optimal |
| 60–79 | Blue `#3B82F6` | Good |
| 40–59 | Amber `#F59E0B` | Fair |
| 0–39 | Red `#EF4444` | Low |
