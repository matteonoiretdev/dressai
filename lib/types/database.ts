// Types Supabase — générés depuis le vrai schéma du projet "DressAI" via le
// connecteur MCP Supabase (mcp__Supabase__generate_typescript_types), puis
// affinés à la main : les colonnes contraintes par un CHECK (category, status,
// angle, environment, body_type) utilisent les unions strictes de ./index
// plutôt que `string` (le générateur ne connaît pas les CHECK constraints).
//
// Pour regénérer après une migration de schéma :
//   npx supabase gen types typescript --project-id fxcdbqmpdvrslawdrajo > /tmp/db.ts
// puis reporter les `Relationships` à jour ici (le reste peut rester tel quel).
import type {
  BodyType,
  PoseAngle,
  PoseEnvironment,
  StyleTag,
  TryOnStatus,
  WardrobeCategory,
} from "./index";

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          neutral_ref_url: string | null;
          height_cm: number | null;
          body_type: BodyType | null;
          created_at: string | null;
        };
        Insert: {
          id: string;
          neutral_ref_url?: string | null;
          height_cm?: number | null;
          body_type?: BodyType | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          neutral_ref_url?: string | null;
          height_cm?: number | null;
          body_type?: BodyType | null;
          created_at?: string | null;
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
          is_neutral: boolean | null;
          name: string | null;
          style_tags: StyleTag[] | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          image_url: string;
          clean_image_url?: string | null;
          category: WardrobeCategory;
          color_primary?: string | null;
          is_neutral?: boolean | null;
          name?: string | null;
          style_tags?: StyleTag[] | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          image_url?: string;
          clean_image_url?: string | null;
          category?: WardrobeCategory;
          color_primary?: string | null;
          is_neutral?: boolean | null;
          name?: string | null;
          style_tags?: StyleTag[] | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "wardrobe_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
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
          category_id: string | null;
          environment: PoseEnvironment;
          environment_label: string;
          is_default: boolean | null;
          order_index: number | null;
        };
        Insert: {
          id?: string;
          category_id?: string | null;
          environment: PoseEnvironment;
          environment_label: string;
          is_default?: boolean | null;
          order_index?: number | null;
        };
        Update: {
          id?: string;
          category_id?: string | null;
          environment?: PoseEnvironment;
          environment_label?: string;
          is_default?: boolean | null;
          order_index?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "pose_references_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "pose_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      pose_sub_references: {
        Row: {
          id: string;
          reference_id: string | null;
          angle: PoseAngle;
          angle_label: string;
          image_url: string;
          order_index: number | null;
          pose_description: string | null;
        };
        Insert: {
          id?: string;
          reference_id?: string | null;
          angle: PoseAngle;
          angle_label: string;
          image_url: string;
          order_index?: number | null;
          pose_description?: string | null;
        };
        Update: {
          id?: string;
          reference_id?: string | null;
          angle?: PoseAngle;
          angle_label?: string;
          image_url?: string;
          order_index?: number | null;
          pose_description?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pose_sub_references_reference_id_fkey";
            columns: ["reference_id"];
            isOneToOne: false;
            referencedRelation: "pose_references";
            referencedColumns: ["id"];
          },
        ];
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
          status: TryOnStatus | null;
          error_message: string | null;
          created_at: string | null;
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
          status?: TryOnStatus | null;
          error_message?: string | null;
          created_at?: string | null;
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
          status?: TryOnStatus | null;
          error_message?: string | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "try_on_sessions_pose_reference_id_fkey";
            columns: ["pose_reference_id"];
            isOneToOne: false;
            referencedRelation: "pose_references";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "try_on_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "try_on_sessions_wardrobe_item_id_fkey";
            columns: ["wardrobe_item_id"];
            isOneToOne: false;
            referencedRelation: "wardrobe_items";
            referencedColumns: ["id"];
          },
        ];
      };
      generated_images: {
        Row: {
          id: string;
          session_id: string | null;
          image_url: string;
          angle: PoseAngle;
          order_index: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          session_id?: string | null;
          image_url: string;
          angle: PoseAngle;
          order_index?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          session_id?: string | null;
          image_url?: string;
          angle?: PoseAngle;
          order_index?: number | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "generated_images_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "try_on_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    // Requis par le type `GenericSchema` de @supabase/supabase-js même si le
    // projet n'utilise ni vues ni fonctions RPC.
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
