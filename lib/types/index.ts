export type BodyType = "slim" | "regular" | "athletic" | "curvy";

export type WardrobeCategory =
  | "tops"
  | "bottoms"
  | "dresses"
  | "shoes"
  | "jackets"
  | "accessories";

export type PoseEnvironment = "urban" | "studio" | "outdoor" | "cafe";

export type PoseAngle = "full_body" | "mid_shot" | "close_up";

export type TryOnStatus = "pending" | "processing" | "completed" | "failed";

export type StyleTag = "casual" | "formal" | "sportswear" | "streetwear" | "elegant";

export interface UserProfile {
  id: string;
  neutral_ref_url: string | null;
  height_cm: number | null;
  body_type: BodyType | null;
  created_at: string;
}

export interface WardrobeItem {
  id: string;
  user_id: string;
  image_url: string;
  clean_image_url: string | null;
  category: WardrobeCategory;
  color_primary: string | null;
  is_neutral: boolean;
  name: string | null;
  style_tags: StyleTag[] | null;
  created_at: string;
}

export interface PoseCategory {
  id: string;
  slug: WardrobeCategory;
  name: string;
  complementary_category: string | null;
}

export interface PoseReference {
  id: string;
  category_id: string;
  environment: PoseEnvironment;
  environment_label: string;
  is_default: boolean;
  order_index: number;
}

export interface PoseSubReference {
  id: string;
  reference_id: string;
  angle: PoseAngle;
  angle_label: string;
  image_url: string;
  order_index: number;
}

export interface TryOnSession {
  id: string;
  user_id: string;
  product_name: string | null;
  product_url: string | null;
  product_image_url: string;
  product_category: WardrobeCategory;
  product_color: string | null;
  wardrobe_item_id: string | null;
  pose_reference_id: string | null;
  status: TryOnStatus;
  error_message: string | null;
  created_at: string;
}

export interface GeneratedImage {
  id: string;
  session_id: string;
  image_url: string;
  angle: PoseAngle;
  order_index: number;
  created_at: string;
}

export interface ExtractedProduct {
  name: string;
  image_url_clean: string;
  category: WardrobeCategory;
  color: string | null;
}

export interface WardrobeClassification {
  category: WardrobeCategory;
  name: string;
  color_primary: string;
  is_neutral: boolean;
  style_tags: StyleTag[];
}
