import { Schema, model } from "mongoose";

export interface IAppVersion {
  key: string;
  latest_version: string;
  min_version: string;
  force_update: boolean;
  title: string;
  message: string;
  android_store_url: string;
  ios_store_url: string;
  enabled: boolean;
}

const appVersionSchema = new Schema<IAppVersion>(
  {
    key: { type: String, required: true, unique: true, default: "mobile" },
    latest_version: { type: String, required: true, default: "2.2.1" },
    min_version: { type: String, required: true, default: "2.2.1" },
    force_update: { type: Boolean, default: false },
    title: { type: String, default: "Update available" },
    message: {
      type: String,
      default: "A new version of QuikWrk is available. Update now for the latest features and fixes.",
    },
    android_store_url: {
      type: String,
      default: "https://play.google.com/store/apps/details?id=com.oreoluwaibk.handiwork",
    },
    ios_store_url: { type: String, default: "" },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const AppVersion = model<IAppVersion>("AppVersion", appVersionSchema);
export default AppVersion;
