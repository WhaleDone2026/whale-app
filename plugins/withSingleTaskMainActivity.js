const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * expo-router의 딥링크 리스너가 두 앱 인스턴스에 동시에 등록되지 않도록 한다.
 * Android에서 launcher/deep link로 앱을 다시 열 때 기존 MainActivity로 전달한다.
 */
module.exports = function withSingleTaskMainActivity(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    const mainActivity = application?.activity?.find((activity) =>
      activity.$?.['android:name']?.endsWith('.MainActivity'),
    );

    if (!mainActivity) {
      throw new Error('MainActivity를 AndroidManifest에서 찾지 못했습니다.');
    }

    mainActivity.$['android:launchMode'] = 'singleTask';
    return config;
  });
};
