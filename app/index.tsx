/**
 * Root index route — explicit redirect to the (tabs) group.
 *
 * This file is required for EAS production iOS builds. Without it, some
 * versions of the Expo Router native runtime cannot resolve the default route
 * before the JS bundle is fully evaluated, causing a blank-screen crash on
 * cold launch in TestFlight.
 *
 * The redirect is instant (no flash) because Expo Router processes it before
 * the first render frame is committed to the screen.
 */
import { Redirect } from "expo-router";

export default function RootIndex() {
  return <Redirect href="/(tabs)" />;
}
