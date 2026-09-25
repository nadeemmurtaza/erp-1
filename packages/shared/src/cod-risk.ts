import { normalizePhone } from './phone';
import type { CodRiskAction } from './enums';

export interface CodRiskAddress {
  line1: string;
  line2?: string | null;
  postalCode?: string | null;
  phone: string;
}

export interface CodRiskCityStats {
  /** 0-100. */
  rtoRatePercent: number;
  /** paisa. */
  avgOrderValue: number;
}

export interface CodRiskCustomerHistory {
  orderCount: number;
  rtoCount: number;
}

export interface CodRiskThresholds {
  /** score >= this (and below advancePayment) -> CONFIRMATION_CALL. */
  confirmationCall: number;
  /** score >= this -> REQUIRE_ADVANCE_PAYMENT. */
  advancePayment: number;
}

export interface CodRiskInput {
  address: CodRiskAddress;
  /** paisa. */
  orderValue: number;
  hasAccount: boolean;
  /** 0-23, already resolved to the shop's own timezone by the caller — never the server's or UTC hour. */
  localHour: number;
  /** Null when this city has too little COD shipment history to trust (below the shop's own minimum-sample setting) — treated as "no signal", never as "zero risk". */
  cityStats: CodRiskCityStats | null;
  /** Null for a phone number with no prior order at all. */
  customerHistory: CodRiskCustomerHistory | null;
  thresholds: CodRiskThresholds;
}

export interface CodRiskResult {
  /** 0-100. Higher is riskier. */
  score: number;
  action: CodRiskAction;
  /** The single dominant contributing reason, for staff — never shown to the customer. */
  reasonEn: string;
}

const LATE_NIGHT_HOURS = new Set([0, 1, 2, 3, 4, 5]);
const MIN_ADDRESS_DETAIL_LENGTH = 8;
const NO_SIGNAL_REASON = 'No notable risk signals.';

/**
 * WO-9.4 (09-ai-layer.md) — "start with a transparent rule-based score...
 * It is explainable to staff, it is tunable... Move to a model only once you
 * have enough labelled RTO outcomes to validate one." Every signal below is
 * a plain, named, additive point value, never a learned weight nobody can
 * explain; `thresholds` (read from Settings by the caller) is the tunable
 * part. Pure and side-effect-free so it can be unit tested directly — the
 * caller resolves every input (city stats, customer history, local hour)
 * before calling this.
 *
 * This never returns null and never throws: a checkout that scores nothing
 * (no city data yet, no history) is exactly the "no signal, no risk" case,
 * not an error.
 */
export function computeCodRiskScore(input: CodRiskInput): CodRiskResult {
  const reasons: Array<{ points: number; reasonEn: string }> = [];

  // 1. This phone's own order/RTO history — "Phase 6's RTO data is the
  // training signal", the doc's own framing for why this feature comes
  // after returns tracking exists at all.
  if (input.customerHistory === null) {
    reasons.push({ points: 12, reasonEn: 'New customer — no prior order history on this phone number.' });
  } else {
    const { orderCount, rtoCount } = input.customerHistory;
    const rtoRate = rtoCount / orderCount;
    if (rtoRate >= 0.5) {
      reasons.push({
        points: 50,
        reasonEn: `This phone has returned ${rtoCount} of its last ${orderCount} orders (${Math.round(rtoRate * 100)}%).`,
      });
    } else if (rtoRate >= 0.25) {
      reasons.push({
        points: 30,
        reasonEn: `This phone has returned ${rtoCount} of its last ${orderCount} orders (${Math.round(rtoRate * 100)}%).`,
      });
    } else if (rtoRate > 0) {
      reasons.push({
        points: 10,
        reasonEn: `This phone has returned ${rtoCount} of its last ${orderCount} orders (${Math.round(rtoRate * 100)}%).`,
      });
    } else if (orderCount >= 2) {
      reasons.push({ points: -20, reasonEn: `Reliable repeat customer — ${orderCount} past orders, none returned.` });
    }
  }

  // 2. City RTO rate.
  if (input.cityStats !== null) {
    const { rtoRatePercent } = input.cityStats;
    if (rtoRatePercent >= 30) {
      reasons.push({ points: 20, reasonEn: `This city's COD return rate is ${Math.round(rtoRatePercent)}%.` });
    } else if (rtoRatePercent >= 15) {
      reasons.push({ points: 10, reasonEn: `This city's COD return rate is ${Math.round(rtoRatePercent)}%.` });
    } else if (rtoRatePercent < 5) {
      reasons.push({ points: -5, reasonEn: `This city has a low COD return rate (${Math.round(rtoRatePercent)}%).` });
    }
  }

  // 3. Order value vs this city's own average.
  if (input.cityStats !== null && input.cityStats.avgOrderValue > 0) {
    const ratio = input.orderValue / input.cityStats.avgOrderValue;
    if (ratio >= 3) {
      reasons.push({ points: 15, reasonEn: `Order value is ${ratio.toFixed(1)}x this city's average.` });
    } else if (ratio >= 2) {
      reasons.push({ points: 8, reasonEn: `Order value is ${ratio.toFixed(1)}x this city's average.` });
    }
  }

  // 4. Address plausibility — stands in for a live "is the phone reachable"
  // check, which nothing in this codebase performs yet (WO-9.7's WhatsApp
  // assistant is the future source of a real one).
  const phone = normalizePhone(input.address.phone);
  if (phone.e164 === null) {
    reasons.push({ points: 25, reasonEn: 'The delivery phone number does not look valid.' });
  } else if (!phone.isMobile) {
    reasons.push({ points: 10, reasonEn: 'The delivery phone number is not a mobile number.' });
  }
  if (input.address.line1.trim().length < MIN_ADDRESS_DETAIL_LENGTH) {
    reasons.push({ points: 10, reasonEn: 'The street address is very short.' });
  } else if (!input.address.line2 && !input.address.postalCode) {
    reasons.push({ points: 5, reasonEn: 'The address has no landmark or postal code.' });
  }

  // 5. Time of day — a late-night order correlates with an impulsive or
  // prank COD order in this market; a small bump, never a dominant factor
  // on its own.
  if (LATE_NIGHT_HOURS.has(input.localHour)) {
    reasons.push({ points: 8, reasonEn: 'Placed late at night.' });
  }

  // 6. Guest checkout — an account holder has given more verifiable info.
  if (!input.hasAccount) {
    reasons.push({ points: 5, reasonEn: 'Guest checkout — no account.' });
  }

  const rawScore = reasons.reduce((sum, reason) => sum + reason.points, 0);
  const score = Math.max(0, Math.min(100, rawScore));

  const action: CodRiskAction =
    score >= input.thresholds.advancePayment
      ? 'REQUIRE_ADVANCE_PAYMENT'
      : score >= input.thresholds.confirmationCall
        ? 'CONFIRMATION_CALL'
        : 'AUTO_CONFIRM';

  const dominant = reasons.reduce(
    (max, reason) => (Math.abs(reason.points) > Math.abs(max.points) ? reason : max),
    { points: 0, reasonEn: NO_SIGNAL_REASON },
  );

  return { score, action, reasonEn: dominant.reasonEn };
}
