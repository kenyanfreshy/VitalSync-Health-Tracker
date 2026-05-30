/**
 * DetailScreenErrorBoundary
 *
 * A lightweight React error boundary designed specifically for detail screens
 * (blood-pressure, pulse, sleep, body-composition, spo2, temperature, etc.).
 *
 * When a detail screen crashes during render, this boundary:
 *  1. Catches the error before it propagates to the GlobalErrorBoundary.
 *  2. Shows a friendly inline fallback with the screen name and a "Go Back" button.
 *  3. Logs the error to the local crash store (AsyncStorage) via logCrash().
 *  4. Offers a "Try Again" button that resets the boundary state.
 *
 * Usage — wrap each detail screen's default export:
 *
 *   export default function BloodPressureDetail() {
 *     return (
 *       <DetailScreenErrorBoundary screenName="Blood Pressure">
 *         <BloodPressureDetailContent />
 *       </DetailScreenErrorBoundary>
 *     );
 *   }
 *
 * Or use the HOC helper:
 *
 *   export default withDetailErrorBoundary(BloodPressureDetailContent, 'Blood Pressure');
 */
import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { logCrash } from '@/lib/crash-logger';

// ─── Props / State ────────────────────────────────────────────────────────────
interface Props {
  children: React.ReactNode;
  /** Human-readable screen name shown in the fallback UI, e.g. "Blood Pressure" */
  screenName?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  errorId: string;
}

// ─── Class component ─────────────────────────────────────────────────────────
export class DetailScreenErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '', errorId: '' };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      errorMessage: error?.message ?? 'An unexpected error occurred.',
      errorId: `ERR-${Date.now().toString(36).toUpperCase()}`,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const { screenName = 'Detail' } = this.props;
    console.error(`[VitalSync] DetailScreenErrorBoundary caught error on "${screenName}" screen:`, error);
    logCrash({
      type: 'RenderError',
      message: `[${screenName}] ${error?.message ?? 'Unknown render error'}`,
      stack: error?.stack,
      componentStack: info?.componentStack ?? undefined,
    }).catch(() => {/* swallow */});
  }

  handleTryAgain = () => {
    this.setState({ hasError: false, errorMessage: '', errorId: '' });
  };

  handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { screenName = 'this screen' } = this.props;
    const { errorMessage, errorId } = this.state;

    return (
      <View style={styles.root}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>Unable to load {screenName}</Text>
          <Text style={styles.subtitle}>
            Something went wrong while rendering this screen. Your health data is safe on this
            device. Tap <Text style={styles.bold}>Try Again</Text> to reload, or{' '}
            <Text style={styles.bold}>Go Back</Text> to return to the dashboard.
          </Text>

          {/* Error ID */}
          <View style={styles.idBadge}>
            <Text style={styles.idText}>{errorId}</Text>
          </View>

          {/* Error message (collapsed, monospace) */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ERROR</Text>
            <View style={styles.codeBox}>
              <Text style={styles.codeText} numberOfLines={4}>
                {errorMessage}
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}
              onPress={this.handleTryAgain}
            >
              <Text style={styles.btnPrimaryText}>Try Again</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.btnSecondary, pressed && styles.pressed]}
              onPress={this.handleGoBack}
            >
              <Text style={styles.btnSecondaryText}>Go Back</Text>
            </Pressable>
          </View>

          <Text style={styles.hint}>
            Error details are saved to Settings → Diagnostics.
          </Text>
        </ScrollView>
      </View>
    );
  }
}

// ─── HOC helper ──────────────────────────────────────────────────────────────
/**
 * Wraps a screen component with DetailScreenErrorBoundary.
 *
 * @example
 *   export default withDetailErrorBoundary(BloodPressureDetailContent, 'Blood Pressure');
 */
export function withDetailErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  screenName: string,
): React.FC<P> {
  const Wrapped: React.FC<P> = (props) => (
    <DetailScreenErrorBoundary screenName={screenName}>
      <WrappedComponent {...props} />
    </DetailScreenErrorBoundary>
  );
  Wrapped.displayName = `withDetailErrorBoundary(${screenName})`;
  return Wrapped;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D1117',
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 24,
    paddingTop: 80,
    paddingBottom: 48,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
    textAlign: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#9BA1A6',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 16,
    maxWidth: 340,
  },
  bold: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  idBadge: {
    backgroundColor: '#1A2640',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  idText: {
    fontSize: 11,
    color: '#64748B',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.5,
  },
  section: {
    width: '100%',
    maxWidth: 360,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 1,
    marginBottom: 6,
  },
  codeBox: {
    backgroundColor: '#060D1A',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E2D45',
  },
  codeText: {
    fontSize: 11,
    color: '#F87171',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    width: '100%',
    maxWidth: 340,
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: '#22C55E',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: '#1A2640',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2D3F5C',
  },
  btnSecondaryText: {
    color: '#9BA1A6',
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
  hint: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 300,
  },
});
