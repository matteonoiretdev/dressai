import type { PoseAngle, PoseEnvironment } from "@/lib/types";

export const ANGLE_LABELS: Record<PoseAngle, string> = {
  full_body: "Plein pied",
  mid_shot: "Mi-corps",
  close_up: "Gros plan",
};

export const ENVIRONMENT_LABELS: Record<PoseEnvironment, string> = {
  urban: "Rue",
  studio: "Studio",
  outdoor: "Extérieur",
  cafe: "Café",
};

export const ANGLES: PoseAngle[] = ["full_body", "mid_shot", "close_up"];
export const ENVIRONMENTS: PoseEnvironment[] = ["urban", "studio", "outdoor", "cafe"];
