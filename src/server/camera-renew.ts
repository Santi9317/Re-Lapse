export type CameraRenewal = "keep" | "hold" | "mint";

/**
 * A cookie that already proves this phone keeps that camera.
 * A token left in local storage, with no cookie, is not a new phone: minting
 * would replace the person. Only a request with neither gets a new id.
 */
export function cameraRenewal(input: { cookie: boolean; headerToken: boolean }): CameraRenewal {
  if (input.cookie) return "keep";
  if (input.headerToken) return "hold";
  return "mint";
}
