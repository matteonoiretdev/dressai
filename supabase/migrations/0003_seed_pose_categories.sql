-- Seed des catégories de poses (statique, ne dépend d'aucun fichier).
-- Les pose_references / pose_sub_references (qui pointent vers des images
-- réelles dans le bucket reference-library) sont insérées séparément via
-- scripts/seed-poses.ts, une fois les photos de référence uploadées.

insert into public.pose_categories (slug, name, complementary_category) values
  ('tops',        'Hauts',        'bottoms'),
  ('bottoms',     'Bas',          'tops'),
  ('dresses',     'Robes',        'jackets'),
  ('shoes',       'Chaussures',   'bottoms'),
  ('jackets',     'Vestes',       'tops'),
  ('accessories', 'Accessoires',  'tops')
on conflict (slug) do nothing;
