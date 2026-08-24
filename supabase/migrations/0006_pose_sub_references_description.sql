-- Description textuelle de la pose (générée par Gemini Vision à l'upload,
-- voir app/api/admin/poses/route.ts) — donnée en complément de l'image de
-- référence au moment de la génération try-on, pour guider explicitement la
-- pose/le cadrage en mots plutôt que de laisser le modèle uniquement
-- s'appuyer sur l'image (qui montre aussi un mannequin habillé, que le
-- modèle a tendance à recopier sans cette description).
alter table public.pose_sub_references
  add column if not exists pose_description text;
