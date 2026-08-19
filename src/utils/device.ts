export function applyDeviceUpdate(user: any, device: any) {
  if (!device || typeof device !== "object") return;

  user.last_device = {
    platform: device.platform || user.last_device?.platform || null,
    model: device.model || user.last_device?.model || null,
    os_version: device.os_version || user.last_device?.os_version || null,
    app_version: device.app_version || user.last_device?.app_version || null,
    brand: device.brand || user.last_device?.brand || null,
  };
}
