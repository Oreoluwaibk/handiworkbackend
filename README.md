# Handiwork API

API for the Handiwork (QuikWrk) marketplace. Clients hire artisans, artisans bid and get paid, and admins run users, jobs, and wallets. The mobile client is [handiwork](https://github.com/Oreoluwaibk/handiwork). The admin UI is [quikwrkadmin](https://github.com/Oreoluwaibk/quikwrkadmin).

## Stack

Node.js, Express, and TypeScript. MongoDB via Mongoose. Auth uses JSON Web Tokens. Files go to Cloudinary. Payments use Paystack. Live chat and job updates use Socket.IO. Email goes out through Nodemailer, Resend, and the Gmail API. Push notifications use Expo.

## HTTP surface

Everything below is mounted at `/api`, except the Paystack webhook, which is `POST /api/transactions/paystack/webhook`.

| Prefix | Area |
| --- | --- |
| `/api/auth` | Sign-up and sign-in |
| `/api/user` | Profiles |
| `/api/category`, `/api/skill` | Service catalog |
| `/api/vendor` | Artisan flow |
| `/api/quotes` | Job quotes and escrow |
| `/api/reviews` | Ratings |
| `/api/messages`, `/api/support` | Chat and support |
| `/api/notification` | In-app notifications |
| `/api/upload` | File uploads |
| `/api/wallet`, `/api/transactions`, `/api/bank` | Balances and payouts |
| `/api/admin` | Admin operations |
| `/api/app` | App version |

`GET /` returns a small health response. A Postman collection is in `postman/`.

## Run locally

```bash
npm install
npm run dev
```

Set the environment variables the server reads in `src/index.ts` and `src/dbconfig` (MongoDB, JWT, Cloudinary, Paystack, CORS, and mail). Do not commit those values.

`npm run build` compiles TypeScript. `npm start` runs the compiled server. `npm run gmail-token` is the helper in `src/scripts/getGmailRefreshToken.ts`.
