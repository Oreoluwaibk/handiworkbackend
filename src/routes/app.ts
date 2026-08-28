import { Request, Response, Router } from "express";
import AppVersion from "../schema/appVersionSchema";

const appRouter = Router();

function parseVersionParts(version = "") {
  return String(version)
    .trim()
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .filter(Boolean)
    .map((part) => {
      const num = Number(part);
      return Number.isFinite(num) ? num : 0;
    });
}

export function compareVersions(current = "0.0.0", target = "0.0.0") {
  const left = parseVersionParts(current);
  const right = parseVersionParts(target);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i += 1) {
    const a = left[i] || 0;
    const b = right[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }

  return 0;
}

export async function getOrCreateAppVersionConfig() {
  let config = await AppVersion.findOne({ key: "mobile" });
  if (!config) {
    config = await AppVersion.create({ key: "mobile" });
  }
  return config;
}

appRouter.get("/version", async (req: Request, res: Response) => {
  try {
    const currentVersion = String(req.query.current_version || "0.0.0");
    const platform = String(req.query.platform || "").toLowerCase();
    const config = await getOrCreateAppVersionConfig();

    if (!config.enabled) {
      return res.status(200).json({
        update_required: false,
        force_update: false,
        current_version: currentVersion,
        latest_version: config.latest_version,
        min_version: config.min_version,
        enabled: false,
      });
    }

    const belowMin = compareVersions(currentVersion, config.min_version) < 0;
    const behindLatest = compareVersions(currentVersion, config.latest_version) < 0;
    const forceUpdate = belowMin || (behindLatest && config.force_update);
    const updateRequired = behindLatest || belowMin;

    return res.status(200).json({
      update_required: updateRequired,
      force_update: forceUpdate,
      current_version: currentVersion,
      latest_version: config.latest_version,
      min_version: config.min_version,
      title: config.title,
      message: config.message,
      store_url:
        platform === "ios"
          ? config.ios_store_url || config.android_store_url
          : config.android_store_url || config.ios_store_url,
      android_store_url: config.android_store_url,
      ios_store_url: config.ios_store_url,
      enabled: config.enabled,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: `Unable to check app version: ${error.message}`,
    });
  }
});

export default appRouter;
