import PostHog from 'posthog-react-native'

export const posthog = new PostHog(process.env.EXPO_PUBLIC_POSTHOG_KEY!, {
  host: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  disableRemoteConfig: true,
})

if (__DEV__) {
  posthog.register({ is_test: true })
}

posthog.debug()   // 임시
