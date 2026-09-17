import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { clearTokens, getAccessToken, setSignOutHandler } from '../api/client';
import * as resources from '../api/resources';
import type { AuthUser } from '../api/types';
import { registerForPush, unregisterPush } from '../push';

const USER_KEY = 'newax.user';

interface Auth {
  user: AuthUser | null;
  ready: boolean;
  signIn: (identifier: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

/**
 * Who is signed in.
 *
 * The stored user is a cache for the first paint — the tokens are what actually
 * authorise anything, and the API decides. If a refresh fails mid-session the
 * client calls back here so the UI drops to guest rather than showing a signed-in
 * shell over a stream of 401s.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const [stored, token] = await Promise.all([
        AsyncStorage.getItem(USER_KEY),
        getAccessToken(),
      ]);

      if (stored && token) {
        try {
          setUser(JSON.parse(stored) as AuthUser);
        } catch {
          await AsyncStorage.removeItem(USER_KEY);
        }
      }

      setReady(true);
    })();
  }, []);

  useEffect(() => {
    setSignOutHandler(() => {
      setUser(null);
      void AsyncStorage.removeItem(USER_KEY);
    });
    return () => setSignOutHandler(null);
  }, []);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const result = await resources.login(identifier, password);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(result.user));
    setUser(result.user);

    // Now that there is an account to attach it to, offer to send this phone
    // updates about its garments.
    void registerForPush();

    return result.user;
  }, []);

  const signOut = useCallback(async () => {
    // Take this handset off the push list first — while the token still works.
    await unregisterPush().catch(() => undefined);
    await clearTokens();
    await AsyncStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const value = useMemo<Auth>(
    () => ({ user, ready, signIn, signOut }),
    [user, ready, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
