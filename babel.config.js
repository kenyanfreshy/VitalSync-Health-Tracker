module.exports = function (api) {
  api.cache(true);
  let plugins = [];

  // react-native-worklets/plugin handles worklet transformation for
  // both react-native-worklets and react-native-reanimated v4.
  // Do NOT add react-native-reanimated/plugin — it conflicts with worklets/plugin.
  plugins.push("react-native-worklets/plugin");

  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    plugins,
  };
};
