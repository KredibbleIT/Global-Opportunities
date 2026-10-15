import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="manage" />
      <Stack.Screen name="edit" />
      <Stack.Screen name="saved" />
      <Stack.Screen name="applications" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="security" />
      <Stack.Screen name="people" />
    </Stack>
  );
}
