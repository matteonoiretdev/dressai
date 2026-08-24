// Types Supabase générés à la main pour démarrer le projet.
// Une fois le projet Supabase créé et les migrations appliquées, régénère ce fichier avec :
//   npx supabase gen types typescript --project-id <project-id> > lib/types/database.ts
import type {
  BodyType,
  PoseAngle,
  PoseEnvironment,
  StyleTag,
  TryOnStatus,
  WardrobeCategory,
} from "./index";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          neutral_ref_url: string | null;
          height_cm: number | null;
          body_type: BodyType | null;
          created_at: string;
        };
        Insert: {
          id: string;
          neutral_ref_url?: string | null;
          height_cm?: number | null;
          body_type?: BodyType | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          neutral_ref_url?: string | null;
          height_cm?: number | null;
          body_type?: BodyType | null;
          created_at?: string;
        };
        Relationships: [];
      };
      wardrobe_items: {
        Row: {
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
        };
        Insert: {
          id?: string;
          user_id: string;
          image_url: string;
          clean_image_url?: string | null;
          category: WardrobeCategory;
          color_primary?: string | null;
          is_neutral?: boolean;
          name?: string | null;
          style_tags?: StyleTag[] | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          image_url?: string;
          clean_image_url?: string | null;
          category?: WardrobeCategory;
          color_primary?: string | null;
          is_neutral?: boolean;
          name?: string | null;
          style_tags?: StyleTag[] | null;
          created_at?: string;
        };
        Relationships: [];
      };
      pose_categories: {
        Row: {
          id: string;
          slug: string;
          name: string;
          complementary_category: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          complementary_category?: string | null;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          complementary_category?: string | null;
        };
        Relationships: [];
      };
      pose_references: {
        Row: {
          id: string;
          category_id: string;
          environment: PoseEnvironment;
          environment_label: string;
          is_default: boolean;
          order_index: number;
        };
        Insert: {
          id?: string;
          category_id: string;
          environment: PoseEnvironment;
          environment_label: string;
          is_default?: boolean;
          order_index?: number;
        };
        Update: {
          id?: string;
          category_id?: string;
          environment?: PoseEnvironment;
          environment_label?: string;
          is_default?: boolean;
          order_index?: number;
        };
        Relationships: [];
      };
      pose_sub_references: {
        Row: {
          id: string;
          reference_id: string;
          angle: PoseAngle;
          angle_label: string;
          image_url: string;
          order_index: number;
        };
        Insert: {
          id?: string;
          reference_id: string;
          angle: PoseAngle;
          angle_label: string;
          image_url: string;
          order_index?: number;
        };
        Update: {
          id?: string;
          reference_id?: string;
          angle?: PoseAngle;
          angle_label?: string;
          image_url?: string;
          order_index?: number;
        };
        Relationships: [];
      };
      try_on_sessions: {
        Row: {
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
        };
        Insert: {
          id?: string;
          user_id: string;
          product_name?: string | null;
          product_url?: string | null;
          product_image_url: string;
          product_category: WardrobeCategory;
          product_color?: string | null;
          wardrobe_item_id?: string | null;
          pose_reference_id?: string | null;
          status?: TryOnStatus;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          product_name?: string | null;
          product_url?: string | null;
          product_image_url?: string;
          product_category?: WardrobeCategory;
          product_color?: string | null;
          wardrobe_item_id?: string | null;
          pose_reference_id?: string | null;
          status?: TryOnStatus;
          error_message?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      generated_images: {
        Row: {
          id: string;
          session_id: string;
          image_url: string;
          angle: PoseAngle;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          image_url: string;
          angle: PoseAngle;
          order_index?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          image_url?: string;
          angle?: PoseAngle;
          order_index?: number;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    // Requis par le type `GenericSchema` de @supabase/supabase-js même si le
    // projet n'utilise ni vues ni fonctions RPC.
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
