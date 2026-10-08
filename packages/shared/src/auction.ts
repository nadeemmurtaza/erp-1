/**
 * Constants the Auction app's API and web app must agree on
 * (launchpad-apps/234-auction-app.md). One value read by both, so the number the
 * admin screen prints and the number the server enforces cannot drift.
 */

/**
 * Photographs one lot may have (WO-234.12, doc 234 §12). A vehicle or plot
 * listing carries 8 to 12 and a lot of furniture 3 to 5, so ten covers the real
 * range; it also bounds what a public lot page lists and what a lot can take in
 * storage. Enforced by the API under the auction's row lock; the admin sheet
 * uses it only to say so before the upload.
 */
export const MAX_LOT_PHOTOS = 10;
