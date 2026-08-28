import Quotes from "../schema/quoteSchema";
import ArtisanRequest from "../schema/artisanRequest";
import Transaction from "../schema/transactionSchema";
import { processTransaction } from "./ledger";

export const ACTIVE_ESCROW_STATUSES = ["accepted", "in_progress", "completed"] as const;
export const CANCELLABLE_ESCROW_STATUSES = ["accepted"] as const;
export const PLATFORM_COMMISSION_RATE = 0.05;

export function escrowReference(quoteId: string) {
  return `quote-escrow-${quoteId}`;
}

export function escrowRefundReference(quoteId: string) {
  return `quote-refund-${quoteId}`;
}

export async function requesterHasActiveEscrow(userId: string): Promise<boolean> {
  const activeQuote = await Quotes.findOne({
    "requester.id": userId.toString(),
    status: { $in: ACTIVE_ESCROW_STATUSES },
  }).select("_id");

  return Boolean(activeQuote);
}

export function vendorPayoutAmount(amount: number): number {
  return Math.round(amount * (1 - PLATFORM_COMMISSION_RATE) * 100) / 100;
}

export function platformCommissionAmount(amount: number): number {
  return Math.round(amount * PLATFORM_COMMISSION_RATE * 100) / 100;
}

export async function syncArtisanRequestFromQuote(quote: any, status: string) {
  if (!quote?.artisan_request_id) return;

  await ArtisanRequest.findByIdAndUpdate(quote.artisan_request_id, { status });
}

export async function refundQuoteEscrow(quoteId: string, requesterId: string, amount: number) {
  const escrowHold = await Transaction.findOne({
    reference: escrowReference(quoteId),
    type: "debit",
  });

  if (!escrowHold) {
    throw new Error("No escrow hold found for this quote");
  }

  const existingRefund = await Transaction.findOne({
    reference: escrowRefundReference(quoteId),
  });
  if (existingRefund) {
    return existingRefund;
  }

  return processTransaction({
    user_id: requesterId,
    type: "reverse",
    amount,
    description: `Escrow refund for cancelled quote`,
    reference: escrowRefundReference(quoteId),
  });
}
