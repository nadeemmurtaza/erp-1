import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { Loading, Screen } from '../src/components/ui';
import { theme } from '../src/theme';

/**
 * Hands the customer to JazzCash/Easypaisa's hosted checkout inside a
 * WebView — the same auto-submitted-form redirect the web storefront uses
 * (`redirectToGateway()` in apps/web's checkout page) — and watches for the
 * gateway's return landing back on the order page. The API's own
 * checkout/callback/[provider] web route has already settled the payment by
 * then (that request is a real network round trip the WebView must be left
 * to complete), so this only needs to notice the *final* destination and
 * hand the customer back to the native order screen instead of rendering
 * that web page.
 */
export default function PaymentScreen() {
  const { redirectUrl, fields, orderNumber } = useLocalSearchParams<{
    redirectUrl: string;
    fields: string;
    orderNumber: string;
  }>();
  const [loading, setLoading] = useState(true);
  const settled = useRef(false);

  const html = useMemo(
    () => buildAutoSubmitForm(redirectUrl, JSON.parse(fields) as Record<string, string>),
    [redirectUrl, fields],
  );

  function handleShouldStart(request: ShouldStartLoadRequest): boolean {
    const destination = parseOrderRedirect(request.url);
    if (!destination || settled.current) return true;

    // Cancel this navigation rather than letting the WebView render the web
    // order page — the native order screen (below) is the real destination.
    settled.current = true;
    router.replace(`/orders/${destination.number}?payment=${destination.outcome}`);
    return false;
  }

  return (
    <Screen>
      <WebView
        source={{ html }}
        onShouldStartLoadWithRequest={handleShouldStart}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        style={styles.webview}
      />
      {loading ? (
        <View style={styles.overlay}>
          <Loading />
        </View>
      ) : null}
    </Screen>
  );
}

/** Matches the final `/orders/{number}?payment=success|failed` the callback route redirects to, regardless of host. */
function parseOrderRedirect(url: string): { number: string; outcome: string } | null {
  const match = /\/orders\/([^/?]+)\?[^#]*\bpayment=(success|failed)\b/.exec(url);
  if (!match) return null;
  return { number: decodeURIComponent(match[1]!), outcome: match[2]! };
}

function buildAutoSubmitForm(actionUrl: string, fields: Record<string, string>): string {
  const inputs = Object.entries(fields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
    )
    .join('');

  return `<!doctype html><html><body onload="document.forms[0].submit()"><form method="POST" action="${escapeHtml(actionUrl)}">${inputs}</form></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: theme.color.sand },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.sand,
  },
});
