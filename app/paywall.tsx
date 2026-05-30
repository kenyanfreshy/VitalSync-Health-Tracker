/**
 * Paywall Route — app/paywall.tsx
 * Accessible via router.push('/paywall') or shown automatically when
 * accessState === 'expired'.
 */
import { useEffect } from "react";
import { router } from "expo-router";
import { PaywallScreen } from "@/components/paywall-screen";
import { paywallGuard } from "@/lib/subscription/paywall-guard";

export default function PaywallRoute() {
  // Release the paywallGuard singleton when this screen unmounts
  useEffect(() => {
    return () => { paywallGuard.release(); };
  }, []);
  return (
    <PaywallScreen
      showFreeTier={true}
      onDismiss={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/(tabs)");
        }
      }}
      onSuccess={(planId) => {
        // Navigate to the post-purchase celebration screen, passing the plan ID
        router.replace({
          pathname: "/purchase-success",
          params: { planId: planId ?? "" },
        });
      }}
    />
  );
}
