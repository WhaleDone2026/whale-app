import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="edit" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="friend" />
      <Stack.Screen name="friend-list" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="settings/notifications" />
      <Stack.Screen name="settings/blocked" />
      <Stack.Screen name="settings/privacy" />
      <Stack.Screen name="settings/notices" />
      <Stack.Screen name="settings/reports" />
      <Stack.Screen name="settings/notice" />
      <Stack.Screen name="settings/term" />
    </Stack>
  );
}
