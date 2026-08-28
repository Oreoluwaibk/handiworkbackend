import Quotes from "../schema/quoteSchema";
import ArtisanRequest from "../schema/artisanRequest";

export const ACTIVE_ESCROW_STATUSES = ["accepted", "in_progress", "completed"] as const;
export const PLATFORM_COMMISSION_RATE = 0.05;

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
