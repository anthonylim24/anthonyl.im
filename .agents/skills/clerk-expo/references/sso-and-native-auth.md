# Social auth: browser SSO and native Google/Apple

> Canonical docs (fetch to re-verify if the installed SDK is newer than 3.6.x):
> - OAuth custom flow: https://clerk.com/docs/guides/development/custom-flows/authentication/oauth-connections
> - `useSSO`: https://clerk.com/docs/reference/expo/native-hooks/use-sso
> - Native Google/Apple: https://clerk.com/docs/reference/expo/native-hooks/use-sign-in-with-google and `use-sign-in-with-apple`

Three ways to do social auth in Expo. Pick by platform and build type:

| Approach | UX | Works in Expo Go | Platforms |
|----------|-----|------------------|-----------|
| `AuthView` (prebuilt) | Native, renders all enabled providers | No (dev build) | iOS, Android |
| `useSSO()` browser flow | Opens a browser session | Yes | iOS, Android, web |
| `useSignInWithGoogle()` / `useSignInWithApple()` | Fully native sheet, no browser | No (dev build) | Google: iOS+Android; Apple: iOS only |

If the app already uses `AuthView`, stop — it handles social providers itself; configure providers in the dashboard instead. Whatever the approach, the provider must be enabled in Clerk Dashboard → **User & authentication → Social connections** (Gate 3).

## Browser SSO — `useSSO()`

Never `useOAuth()` (deprecated). Prerequisites: `npx expo install expo-auth-session expo-web-browser`, and a deep-link `"scheme"` in `app.json`.

```tsx
import { useSSO } from '@clerk/expo'

const { startSSOFlow } = useSSO()

const onPress = async () => {
  try {
    const { createdSessionId, setActive, signUp } = await startSSOFlow({
      strategy: 'oauth_google', // oauth_apple, oauth_github, oauth_microsoft, ...
    })
    if (createdSessionId) {
      await setActive!({ session: createdSessionId })
      router.replace('/')
    } else if (signUp?.status === 'missing_requirements') {
      // Instance requires fields the provider didn't supply (e.g. username) —
      // collect them and signUp.update(...), or relax requirements in the dashboard
    }
    // No createdSessionId and no missing requirements → user cancelled; do nothing.
  } catch (err) {
    console.error(JSON.stringify(err, null, 2))
  }
}
```

Behavior that is handled for you — do not reimplement:
- `redirectUrl` defaults to `AuthSession.makeRedirectUri({ path: 'sso-callback' })`; only override for a custom callback route.
- `ClerkProvider` calls `WebBrowser.maybeCompleteAuthSession()` — never add it manually.
- The transfer flow (account exists → sign-in, new account → sign-up with `transfer: true`) runs inside `startSSOFlow`.
- User cancellation is not an error: it resolves with `createdSessionId: null`. Don't show error UI for it.

Enterprise SSO/SAML: `startSSOFlow({ strategy: 'enterprise_sso', identifier: email })`.

Note: SSO is the one flow that still uses `setActive({ session: createdSessionId })` — the `finalize()` method from custom-flows.md does not apply here.

## Native Google sign-in — `useSignInWithGoogle()`

Fully native Google sheet (Credential Manager on Android). Dev build only.

**SDK-version gate:** current `@clerk/expo` (v3.6+ / any install that lists `@clerk/expo-google-signin` as a peer) requires the separate native module. Older v3 installs that still ship Google sign-in inside `@clerk/expo` keep the legacy path below.

Current setup:
1. `npx expo install @clerk/expo-google-signin expo-crypto` (alongside `@clerk/expo`)
2. Register both config plugins, then rebuild:
   ```json
   { "expo": { "plugins": ["@clerk/expo", "@clerk/expo-google-signin"] } }
   ```
3. Env vars in `.env` (values from the Google Cloud OAuth clients configured for the Clerk instance):
   - `EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID` (always required)
   - `EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID` (iOS)
   - `EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME` (iOS — the config plugin writes it into the iOS URL types at prebuild; prebuild fails without it)
   - `EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID` (Android — required for the Android OAuth client)

Legacy v3 (Google still bundled in `@clerk/expo`; no `@clerk/expo-google-signin` peer):
1. `npx expo install expo-crypto`
2. Same env vars as above (including the Android client ID when targeting Android)
3. `@clerk/expo` config plugin only, then rebuild.

Full provider-side setup lives at https://clerk.com/docs/guides/configure/auth-strategies/sign-in-with-google — fetch it if the Google Cloud side isn't already configured.

```tsx
import { useSignInWithGoogle } from '@clerk/expo/google'
import { Platform } from 'react-native'

const { startGoogleAuthenticationFlow } = useSignInWithGoogle()

const onPress = async () => {
  try {
    const { createdSessionId, setActive } = await startGoogleAuthenticationFlow()
    if (createdSessionId && setActive) {
      await setActive({ session: createdSessionId })
      router.replace('/')
    }
  } catch (err: any) {
    if (err.code === 'SIGN_IN_CANCELLED' || err.code === '-5') return // user cancelled
    console.error('Sign in with Google error:', JSON.stringify(err, null, 2))
  }
}

// Render the button only where supported:
if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null
```

Always wrap in try/catch and swallow the cancellation codes. On unsupported platforms (web), fall back to `useSSO({ strategy: 'oauth_google' })` or hide the button.

The hook import stays `@clerk/expo/google` on both paths. The current package supplies the native module and config plugin; the hook still comes from `@clerk/expo`.

## Native Apple sign-in — `useSignInWithApple()`

iOS only; dev build only. Requires `npx expo install expo-apple-authentication` and the Sign in with Apple capability (the `expo-apple-authentication` plugin handles the entitlement — add it to `app.json` plugins). Full setup: https://clerk.com/docs/guides/configure/auth-strategies/sign-in-with-apple

```tsx
import { useSignInWithApple } from '@clerk/expo/apple'

const { startAppleAuthenticationFlow } = useSignInWithApple()
// identical result handling to the Google hook: setActive on createdSessionId, swallow cancellation
```

On Android/web, fall back to `useSSO({ strategy: 'oauth_apple' })` or hide the button. App Store policy: apps offering third-party sign-in on iOS generally must also offer Sign in with Apple — mention this when adding Google-only auth to an iOS app.

## Verification checklist

- Provider enabled in the dashboard before writing code.
- `useSSO` path: scheme configured, no manual `maybeCompleteAuthSession`, cancellation silent, `setActive` called on `createdSessionId`.
- Native hooks: dev build stated, platform-gated rendering, cancellation codes swallowed, browser-SSO or hidden-button fallback for unsupported platforms.
- Not paired with `AuthView`.
- One real provider round-trip tested on a device or simulator.
