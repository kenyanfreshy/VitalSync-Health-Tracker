/**
 * withVitalSyncBackgroundModule.js
 *
 * Expo Config Plugin that:
 *  A) Writes VitalSyncBackgroundModule.swift into ios/<AppName>/
 *  B) Registers it in the .pbxproj Compile Sources build phase using
 *     xcodeProject.findPBXGroupKey({ name: appName }) — the safe API
 *     that returns a UUID, avoiding the getPBXVariantGroupByKey crash.
 *  C) Injects VitalSyncBackgroundModule.shared.startHealthObservers()
 *     into AppDelegate.swift via withAppDelegate.
 */

const {
  withDangerousMod,
  withXcodeProject,
  withAppDelegate,
} = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const SWIFT_FILENAME = "VitalSyncBackgroundModule.swift";

const SWIFT_SOURCE = `import Foundation
import HealthKit
import BackgroundTasks

/// Singleton that registers HKObserverQuery observers for 13 vital types
/// and schedules BGAppRefreshTask + BGProcessingTask on each observer fire.
@objc public class VitalSyncBackgroundModule: NSObject {

  @objc public static let shared = VitalSyncBackgroundModule()

  private let healthStore = HKHealthStore()
  private let refreshTaskID    = "com.vitalsync.data.refresh"
  private let processingTaskID = "com.vitalsync.data.processing"

  private override init() { super.init() }

  // MARK: - Public entry point (called from AppDelegate)

  @objc public func startHealthObservers() {
    guard HKHealthStore.isHealthDataAvailable() else { return }

    let quantityTypes: [HKQuantityTypeIdentifier] = [
      .heartRate,
      .bloodPressureSystolic,
      .bloodPressureDiastolic,
      .oxygenSaturation,
      .bodyMass,
      .bodyFatPercentage,
      .leanBodyMass,
      .stepCount,
      .activeEnergyBurned,
      .basalEnergyBurned,
      .respiratoryRate,
      .bodyTemperature,
      .bloodGlucose,
    ]

    for identifier in quantityTypes {
      guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { continue }
      registerObserver(for: type)
    }

    let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!
    registerObserver(for: sleepType)
  }

  // MARK: - Private helpers

  private func registerObserver(for sampleType: HKSampleType) {
    healthStore.enableBackgroundDelivery(for: sampleType, frequency: .immediate) { _, _ in }

    let query = HKObserverQuery(sampleType: sampleType, predicate: nil) {
      [weak self] _, completionHandler, error in
      guard error == nil else { completionHandler(); return }
      self?.scheduleSyncTask()
      completionHandler()
    }
    healthStore.execute(query)
  }

  private func scheduleSyncTask() {
    let refreshRequest = BGAppRefreshTaskRequest(identifier: refreshTaskID)
    refreshRequest.earliestBeginDate = Date(timeIntervalSinceNow: 5)
    try? BGTaskScheduler.shared.submit(refreshRequest)

    let processingRequest = BGProcessingTaskRequest(identifier: processingTaskID)
    processingRequest.requiresNetworkConnectivity = false
    processingRequest.requiresExternalPower = false
    processingRequest.earliestBeginDate = Date(timeIntervalSinceNow: 5)
    try? BGTaskScheduler.shared.submit(processingRequest)
  }
}
`;

// Step A: Write Swift file to ios/<AppName>/
function withSwiftFile(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const appName = cfg.modRequest.projectName;
      const iosDir = cfg.modRequest.platformProjectRoot;
      const destDir = path.join(iosDir, appName);
      const destFile = path.join(destDir, SWIFT_FILENAME);

      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(destFile, SWIFT_SOURCE, "utf8");
      console.log(`[withVitalSyncBackgroundModule] Wrote ${destFile}`);
      return cfg;
    },
  ]);
}

// Step B: Register in .pbxproj Compile Sources using findPBXGroupKey (safe UUID lookup)
function withSwiftFileInXcodeProject(config) {
  return withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    const appName = cfg.modRequest.projectName;

    // findPBXGroupKey returns a UUID string — safe, does not call getPBXVariantGroupByKey
    const groupKey = xcodeProject.findPBXGroupKey({ name: appName });

    // Get the first native target UUID
    const target = xcodeProject.getFirstTarget().uuid;

    const filePath = `${appName}/${SWIFT_FILENAME}`;

    // Guard: skip if already registered
    const buildFileSection = xcodeProject.pbxBuildFileSection() || {};
    const alreadyAdded = Object.values(buildFileSection).some(
      (entry) =>
        typeof entry === "object" &&
        entry.fileRef_comment === SWIFT_FILENAME
    );

    if (alreadyAdded) {
      console.log(
        `[withVitalSyncBackgroundModule] ${SWIFT_FILENAME} already in Compile Sources — skipping`
      );
      return cfg;
    }

    if (groupKey) {
      xcodeProject.addSourceFile(filePath, { target }, groupKey);
      console.log(
        `[withVitalSyncBackgroundModule] Added ${SWIFT_FILENAME} to target "${appName}" (group UUID: ${groupKey})`
      );
    } else {
      // Fallback: no group — file added to root, still compiles
      xcodeProject.addSourceFile(filePath, { target });
      console.log(
        `[withVitalSyncBackgroundModule] Added ${SWIFT_FILENAME} to target "${appName}" (root group fallback)`
      );
    }

    return cfg;
  });
}

// Step C: Inject singleton call into AppDelegate
function withAppDelegateInjection(config) {
  return withAppDelegate(config, (cfg) => {
    let src = cfg.modResults.contents;

    const marker =
      "return super.application(application, didFinishLaunchingWithOptions: launchOptions)";
    const injection =
      "    VitalSyncBackgroundModule.shared.startHealthObservers()";

    if (src.includes("VitalSyncBackgroundModule")) {
      console.log(
        "[withVitalSyncBackgroundModule] AppDelegate already patched — skipping"
      );
      return cfg;
    }

    if (src.includes(marker)) {
      src = src.replace(marker, `${injection}\n    ${marker}`);
      console.log(
        "[withVitalSyncBackgroundModule] Injected VitalSyncBackgroundModule.shared.startHealthObservers() into AppDelegate"
      );
    } else {
      console.warn(
        "[withVitalSyncBackgroundModule] Could not find AppDelegate injection marker — skipping AppDelegate patch"
      );
    }

    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = function withVitalSyncBackgroundModule(config) {
  config = withSwiftFile(config);
  config = withSwiftFileInXcodeProject(config);
  config = withAppDelegateInjection(config);
  return config;
};
