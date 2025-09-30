// services/paystack.ts
import axios from "axios";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY as string;
const BASE_URL = "https://api.paystack.co";

export async function initializePayment({ email, amount }: { email: string; amount: number }) {
  const response = await axios.post(
    `${BASE_URL}/transaction/initialize`,
    {
      email,
      amount: amount * 100, // Paystack expects kobo (NGN * 100)
    },
    {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.data;
}

export async function verifyPayment(reference: string) {
  const response = await axios.get(`${BASE_URL}/transaction/verify/${reference}`, {
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
    },
  });
  return response.data;
}
