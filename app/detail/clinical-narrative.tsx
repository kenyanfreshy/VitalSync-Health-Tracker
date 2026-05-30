/**
 * Personal Narrative Detail Screen
 *
 * Full-screen view of the ClinicalNarrativeCard with all time-window options
 * (Last 1 hr, Last 6 hrs, Today, 7d, 30d) and the Golden Trio filter tabs.
 */
import React from 'react';
import { withDetailErrorBoundary } from '@/components/detail-screen-error-boundary';

import { ScrollView, StyleSheet } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { DetailHeader } from '@/components/detail-header';
import { ClinicalNarrativeCard } from '@/components/clinical-narrative-card';
import { useHealth } from '@/lib/health/health-context';
import { useColors } from '@/hooks';

function ClinicalNarrativeDetailInner() {
  const { state } = useHealth();
  const _colors = useColors();

  return (
    <ScreenContainer>
      <DetailHeader title="Personal Narrative" accentColor="#0891B2" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {state.data ? (
          <ClinicalNarrativeCard
            data={state.data}
            defaultExpanded
            overrideExpanded
          />
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingTop: 8 },
});

export default withDetailErrorBoundary(ClinicalNarrativeDetailInner, 'Personal Health Narrative');
